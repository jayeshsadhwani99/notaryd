import { Injectable, Logger } from '@nestjs/common';
import { analyzeDirectory, ownersForAnalysis } from '../analyze/analyze-directory';
import { AuditService } from '../audit/audit.service';
import { explorePages, launchBrowser, probeHandlers, type BrowserAccount } from '../browser/playwright-run';
import { EvidenceService } from '../evidence/evidence.service';
import { DbService } from '../db/db.service';
import {
  buildFlowsFromCode,
  filterRoutesByFocus,
  type DraftFlow,
} from '../domain';
import { FLOW_NAME_PROMPT, SEED_PROMPT } from '../llm/prompts';
import { LlmService } from '../llm/llm.service';
import { VaultService } from '../vault/vault.service';
import { bootTarget } from './boot';
import { recentAuthors, resolveSource, type SourceProject } from './source';

type FlowRow = {
  id: string;
  slug: string;
  status: string;
  owners: { person: string; role: string }[];
};

@Injectable()
export class ExploreRunner {
  private readonly logger = new Logger(ExploreRunner.name);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly llm: LlmService,
    private readonly vault: VaultService,
    private readonly evidence: EvidenceService,
  ) {}

  async run(runId: string): Promise<void> {
    const run = await this.loadRun(runId);
    const project = await this.loadProject(run.project_id);
    let cleanup: () => Promise<void> = async () => undefined;
    try {
      await this.touch(runId, project.id, 'exploring', { phase: 'resolve', message: 'Reading the repository' });
      const source = await resolveSource(project);
      const analysis = await analyzeDirectory(source.root);
      if (project.app_path) {
        const prefix = project.app_path.replace(/^\/|\/$/g, '');
        analysis.routes = analysis.routes.filter((route) => route.file.startsWith(`${prefix}/`));
      }
      const focus = run.focus_prompt || project.focus_prompt || '';
      const filtered = focus ? filterRoutesByFocus(analysis.routes, focus) : { routes: analysis.routes, narrowed: false };
      const controls = new Map(analysis.controlsByFile);
      const tables = new Map(analysis.tablesByFile);
      let drafts = buildFlowsFromCode({ routes: filtered.routes, controlsByFile: controls, tablesByFile: tables });
      if (this.llm.enabled() && drafts.length > 0) {
        await this.touch(runId, project.id, 'exploring', { phase: 'name', message: 'Naming flows' });
        const named = await this.llm.json<{ flows?: { slug: string; name: string; goal: string }[] }>(
          FLOW_NAME_PROMPT,
          JSON.stringify({ flows: drafts.map((flow) => ({ slug: flow.slug, name: flow.name, goal: flow.goal, feature: flow.feature })) }),
        );
        if (named?.flows) {
          drafts = drafts.map((flow) => {
            const match = named.flows?.find((item) => item.slug === flow.slug);
            return match ? { ...flow, name: match.name || flow.name, goal: match.goal || flow.goal } : flow;
          });
        }
      }
      await this.touch(runId, project.id, 'exploring', {
        phase: 'save',
        message: `Saving ${drafts.length} flows`,
        flowsFound: drafts.length,
      });
      const stepIds = await this.persistFlows(project.id, source.root, analysis, drafts);
      const env = await this.environment(project.id, 'sandbox');
      const secrets = env ? await this.vault.decryptAll(env.id) : {};
      await this.touch(runId, project.id, 'exploring', { phase: 'boot', message: 'Starting the app' });
      const boot = await bootTarget({
        mode: project.mode,
        targetUrl: project.target_url,
        repoUrl: project.repo_url,
        localPath: project.local_path,
        branch: project.default_branch || 'main',
        secrets,
        hasPrisma: analysis.models.length > 0,
        hasSeedScript: analysis.hasSeedScript,
      });
      cleanup = boot.cleanup;
      await this.db.sql`
        insert into boot_recipes (project_id, steps, last_status, last_error)
        values (${project.id}, ${this.db.sql.json(boot.steps)}, ${boot.baseUrl ? 'ok' : 'failed'}, ${boot.error ?? null})
        on conflict (project_id) do update set
          steps = excluded.steps,
          last_status = excluded.last_status,
          last_error = excluded.last_error,
          updated_at = now()
      `;
      if (!boot.baseUrl) {
        await this.blocker(runId, project.id, 'boot', boot.error || 'The app did not boot. Switch to point-at-URL mode or fix the failing boot step.');
      } else {
        await this.browse(runId, project.id, boot.baseUrl, filtered.routes, env?.allow_hosts ?? [], stepIds);
      }
      if (!analysis.hasSeedScript) {
        const schema = analysis.models.map((model) => model.name).join(', ');
        const generated = this.llm.enabled()
          ? await this.llm.complete(SEED_PROMPT, `Models: ${schema}`)
          : `// Draft seed for ${schema}. Replace this with the app's own seed.`;
        if (generated) {
          await this.db.sql`
            insert into artifacts (project_id, kind, path, body)
            values (${project.id}, 'seed', 'notaryd/seed.draft.ts', ${generated})
          `;
        }
      }
      await this.db.sql`
        update runs set status = 'succeeded', finished_at = now(),
          summary = ${`Mapped ${drafts.length} flows${boot.baseUrl ? ' and visited the running app' : ' from code'}`}
        where id = ${runId}
      `;
      await this.db.sql`update projects set status = 'ready', updated_at = now() where id = ${project.id}`;
      await this.audit.record({
        orgId: project.org_id,
        projectId: project.id,
        action: 'explore.complete',
        runId,
        trigger: run.trigger,
        actorUserId: run.started_by,
        actorLabel: run.actor_label,
        result: 'passed',
        payload: { flows: drafts.length, booted: Boolean(boot.baseUrl), focusNarrowed: filtered.narrowed },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Exploration failed';
      this.logger.error(message);
      await this.db.sql`update runs set status = 'failed', error = ${message}, finished_at = now() where id = ${runId}`;
      await this.db.sql`update projects set status = 'failed', updated_at = now() where id = ${project.id}`;
    } finally {
      await cleanup();
    }
  }

  private async browse(
    runId: string,
    projectId: string,
    baseUrl: string,
    routes: { url: string; dynamic: boolean; file: string; kind: string; methods: string[] }[],
    allowHosts: string[],
    stepIds: Map<string, string>,
  ) {
    const accounts = await this.accounts(projectId);
    let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
    try {
      browser = await launchBrowser();
    } catch (error) {
      await this.blocker(
        runId,
        projectId,
        'browser',
        `Playwright could not start (${error instanceof Error ? error.message : 'unknown'}). Install browsers with pnpm --filter @notaryd/engine exec playwright install chromium.`,
      );
      return;
    }
    try {
      const pageRoutes = routes
        .filter((route) => route.kind === 'page')
        .map((route) => ({
          url: route.url,
          dynamic: route.dynamic,
          accountRole: route.url.includes('/admin') ? 'admin' : route.url.includes('/login') ? 'logged_out' : 'member',
        }));
      await explorePages({
        browser,
        baseUrl,
        routes: pageRoutes,
        accounts,
        allowHosts,
        onVisit: async (visit) => {
          const evidenceId = await this.evidence.put({
            projectId,
            runId,
            stepId: stepIds.get(`${visit.url}:goto`) ?? null,
            kind: 'screenshot',
            bytes: visit.screenshot,
            contentType: 'image/png',
            meta: { url: visit.url, finalUrl: visit.finalUrl },
          });
          if (visit.requests.length > 0) {
            await this.evidence.put({
              projectId,
              runId,
              stepId: stepIds.get(`${visit.url}:goto`) ?? null,
              kind: 'network',
              bytes: Buffer.from(JSON.stringify(visit.requests)),
              contentType: 'application/json',
              meta: { url: visit.url },
            });
          }
          await this.db.sql`
            update runs set progress = ${this.db.sql.json({
              phase: 'explore',
              message: `Visited ${visit.url}`,
              screenshotId: evidenceId,
            })}
            where id = ${runId}
          `;
          if (visit.blocked === 'auth') {
            await this.blocker(runId, projectId, 'login', `${visit.url} redirected to login.`, visit.url);
          }
        },
      }).then(async (result) => {
        for (const blocker of result.blockers) {
          await this.blocker(runId, projectId, blocker.kind, blocker.message, blocker.pageUrl);
        }
      });
      const probed = await probeHandlers({
        browser,
        baseUrl,
        routes: routes.filter((route) => route.kind === 'handler'),
        allowHosts,
        onProbe: async (hit) => {
          await this.evidence.put({
            projectId,
            runId,
            stepId: stepIds.get(`GET:${hit.url}:request`) ?? null,
            kind: 'network',
            bytes: Buffer.from(JSON.stringify(hit)),
            contentType: 'application/json',
            meta: { url: hit.url, status: hit.status },
          });
        },
      });
      for (const blocker of probed.blockers) {
        await this.blocker(runId, projectId, blocker.kind, blocker.message, blocker.pageUrl);
      }
    } finally {
      await browser.close();
    }
  }

  private async accounts(projectId: string): Promise<BrowserAccount[]> {
    const rows = await this.db.sql<
      {
        label: string;
        role: string;
        login_method: BrowserAccount['loginMethod'];
        email: string | null;
        credential_ciphertext: string | null;
        credential_iv: string | null;
        credential_tag: string | null;
      }[]
    >`select label, role, login_method, email, credential_ciphertext, credential_iv, credential_tag from test_accounts where project_id = ${projectId}`;
    return rows.map((row) => {
      let secret = '';
      if (row.credential_ciphertext && row.credential_iv && row.credential_tag) {
        secret = this.vault.decrypt({ ciphertext: row.credential_ciphertext, iv: row.credential_iv, tag: row.credential_tag });
      }
      return {
        label: row.label,
        role: row.role,
        loginMethod: row.login_method,
        email: row.email,
        password: row.login_method === 'password' ? secret : null,
        storageState: row.login_method === 'saved_session' ? secret : null,
      };
    });
  }

  private async persistFlows(
    projectId: string,
    root: string,
    analysis: Awaited<ReturnType<typeof analyzeDirectory>>,
    drafts: DraftFlow[],
  ): Promise<Map<string, string>> {
    const existing = await this.db.sql<FlowRow[]>`
      select id, slug, status, owners from flows where project_id = ${projectId}
    `;
    const bySlug = new Map(existing.map((flow) => [flow.slug, flow]));
    const stepIds = new Map<string, string>();
    const seen = new Set<string>();
    for (const draft of drafts) {
      seen.add(draft.slug);
      const featureRows = await this.db.sql<{ id: string }[]>`
        insert into features (project_id, name, slug)
        values (${projectId}, ${draft.name}, ${draft.slug})
        on conflict (project_id, slug) do update set name = excluded.name
        returning id
      `;
      const owners = await this.owners(root, analysis, draft);
      const current = bySlug.get(draft.slug);
      let flowId = current?.id;
      const locked = current && !['unverified', 'blocked'].includes(current.status);
      if (!current) {
        const inserted = await this.db.sql<{ id: string }[]>`
          insert into flows (project_id, feature_id, name, slug, goal, owners)
          values (${projectId}, ${featureRows[0].id}, ${draft.name}, ${draft.slug}, ${draft.goal}, ${this.db.sql.json(owners)})
          returning id
        `;
        flowId = inserted[0].id;
      } else if (!locked) {
        const kept = (current.owners ?? []).filter((owner) => owner.role !== 'engineering');
        await this.db.sql`
          update flows set name = ${draft.name}, goal = ${draft.goal}, feature_id = ${featureRows[0].id},
            owners = ${this.db.sql.json([...owners, ...kept])}, updated_at = now()
          where id = ${current.id}
        `;
        await this.db.sql`delete from flow_steps where flow_id = ${current.id}`;
      }
      if (!flowId || locked) continue;
      let position = 0;
      for (const step of draft.steps) {
        const rows = await this.db.sql<{ id: string }[]>`
          insert into flow_steps (
            flow_id, position, action, selector, value, url, account_role, assertion, route,
            component, handler, tables, files, link_confidence, third_party, notes
          ) values (
            ${flowId}, ${position}, ${step.action}, ${step.selector ?? null}, ${step.value ?? null},
            ${step.url ?? null}, ${step.accountRole ?? null}, ${step.assertion ? this.db.sql.json(step.assertion) : null},
            ${step.route ?? null}, ${step.component ?? null}, ${step.handler ?? null},
            ${this.db.sql.json(step.tables)}, ${this.db.sql.json(step.files)}, ${step.linkConfidence},
            ${step.thirdParty}, ${step.notes ?? null}
          ) returning id
        `;
        if (step.action === 'goto' && step.url) stepIds.set(`${step.url}:goto`, rows[0].id);
        if (step.action === 'request' && step.url && step.value) stepIds.set(`${step.value}:${step.url}:request`, rows[0].id);
        position += 1;
      }
    }
    for (const flow of existing) {
      if (!seen.has(flow.slug) && ['unverified', 'blocked'].includes(flow.status)) {
        await this.db.sql`delete from flows where id = ${flow.id}`;
      }
    }
    return stepIds;
  }

  private async owners(root: string, analysis: Awaited<ReturnType<typeof analyzeDirectory>>, draft: DraftFlow) {
    const files = [...new Set(draft.steps.flatMap((step) => step.files))];
    const people = new Set<string>();
    for (const file of files) {
      for (const owner of ownersForAnalysis(analysis, file)) people.add(owner);
      for (const author of await recentAuthors(root, file)) people.add(author);
    }
    return [...people].map((person) => ({ person, role: 'engineering' }));
  }

  private async environment(projectId: string, name: string) {
    const rows = await this.db.sql<{ id: string; allow_hosts: string[] }[]>`
      select id, allow_hosts from environments where project_id = ${projectId} and name = ${name}
    `;
    return rows[0] ?? null;
  }

  private async loadRun(runId: string) {
    const rows = await this.db.sql<{ project_id: string; trigger: string; started_by: string | null; actor_label: string | null; focus_prompt: string | null }[]>`
      select project_id, trigger, started_by, actor_label, focus_prompt from runs where id = ${runId}
    `;
    if (!rows[0]) throw new Error('Run not found');
    return rows[0];
  }

  private async loadProject(projectId: string) {
    const rows = await this.db.sql<(SourceProject & { id: string; org_id: string; mode: 'sandbox' | 'url'; target_url: string | null; focus_prompt: string | null })[]>`
      select id, org_id, repo_url, local_path, default_branch, app_path, mode, target_url, focus_prompt
      from projects where id = ${projectId}
    `;
    if (!rows[0]) throw new Error('Project not found');
    return rows[0];
  }

  private async touch(runId: string, projectId: string, status: string, progress: Record<string, unknown>) {
    await this.db.sql`
      update runs set status = 'running', started_at = coalesce(started_at, now()), progress = ${this.db.sql.json(progress as never)}
      where id = ${runId}
    `;
    await this.db.sql`update projects set status = ${status}, updated_at = now() where id = ${projectId}`;
  }

  private async blocker(runId: string, projectId: string, kind: string, message: string, pageUrl?: string) {
    await this.db.sql`
      insert into blockers (run_id, project_id, kind, message, page_url)
      values (${runId}, ${projectId}, ${kind}, ${message}, ${pageUrl ?? null})
    `;
  }
}
