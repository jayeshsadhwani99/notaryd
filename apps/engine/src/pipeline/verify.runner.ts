import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { launchBrowser, replayFlow, type BrowserAccount, type ScriptStep } from '../browser/playwright-run';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { assertSafeIdentifier, nextFlowState, scoreConfidence, selectAffectedFlows, type FlowResult } from '../domain';
import { EvidenceService } from '../evidence/evidence.service';
import { FAILURE_PROMPT, SELECTOR_REPAIR_PROMPT } from '../llm/prompts';
import { LlmService } from '../llm/llm.service';
import { VaultService } from '../vault/vault.service';
import { bootTarget } from './boot';
import { changedFiles, resolveSource } from './source';
import postgres from 'postgres';

type VerifyFlow = {
  id: string;
  name: string;
  slug: string;
  version: number;
  status: string;
  baseline_approved_at: Date | null;
  recent_results: FlowResult[];
  owners: { person: string; role: string }[];
};

@Injectable()
export class VerifyRunner {
  private readonly logger = new Logger(VerifyRunner.name);

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
      await this.progress(runId, { phase: 'select', message: 'Choosing flows' });
      const chosen = await this.chooseFlows(project, run);
      if (chosen.flows.length === 0) {
        await this.db.sql`
          update runs set status = 'succeeded', summary = ${chosen.reason}, finished_at = now(),
            progress = ${this.db.sql.json({ phase: 'done', message: chosen.reason })}
          where id = ${runId}
        `;
        return;
      }
      const envName = project.mode === 'url' ? 'staging' : 'sandbox';
      const env = await this.environment(project.id, envName);
      const secrets = env ? await this.vault.decryptAll(env.id) : {};
      const secretValues = Object.values(secrets);
      if (project.mode === 'sandbox') await this.resetCleanAccounts(project.id, secrets, runId);
      await this.progress(runId, { phase: 'boot', message: 'Starting the app' });
      const boot = await bootTarget({
        mode: project.mode,
        targetUrl: project.target_url,
        repoUrl: project.repo_url,
        localPath: project.local_path,
        branch: run.branch || project.default_branch || 'main',
        secrets,
        hasPrisma: false,
        hasSeedScript: false,
      });
      cleanup = boot.cleanup;
      if (!boot.baseUrl) {
        await this.db.sql`
          update runs set status = 'failed', error = ${boot.error ?? 'App did not boot'}, finished_at = now(),
            progress = ${this.db.sql.json({ phase: 'boot', message: boot.error, bootSteps: boot.steps })}
          where id = ${runId}
        `;
        return;
      }
      const accounts = await this.accounts(project.id);
      const browser = await launchBrowser();
      try {
        const queue = [...chosen.flows];
        const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
          while (queue.length > 0) {
            const flow = queue.shift();
            if (!flow) return;
            try {
              await this.verifyOne({
              run,
              project,
              flow,
              browser,
              baseUrl: boot.baseUrl as string,
              accounts,
              allowHosts: env?.allow_hosts ?? [],
              readOnly: Boolean(env?.read_only) || project.mode === 'url',
              secrets: secretValues,
              environmentName: env?.name ?? envName,
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Flow failed';
              this.logger.error(`${flow.name}: ${message}`);
              await this.db.sql`
                insert into run_flows (run_id, flow_id, result, confidence, blocked_reason, healed, explanation)
                values (${run.id}, ${flow.id}, 'failed', 'low', null, false, ${message})
                on conflict (run_id, flow_id) do nothing
              `;
            }
          }
        });
        await Promise.all(workers);
      } finally {
        await browser.close();
      }
      await this.db.sql`
        update runs set status = 'succeeded', finished_at = now(),
          summary = ${`Verified ${chosen.flows.length} flow${chosen.flows.length === 1 ? '' : 's'}`},
          progress = ${this.db.sql.json({ phase: 'done', message: 'Verification finished' })}
        where id = ${runId}
      `;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed';
      this.logger.error(message);
      await this.db.sql`update runs set status = 'failed', error = ${message}, finished_at = now() where id = ${runId}`;
    } finally {
      await cleanup();
    }
  }

  private async verifyOne(input: {
    run: { id: string; project_id: string; trigger: string; started_by: string | null; actor_label: string | null; commit_sha: string | null; focus_prompt: string | null };
    project: { id: string; org_id: string };
    flow: VerifyFlow;
    browser: Awaited<ReturnType<typeof launchBrowser>>;
    baseUrl: string;
    accounts: BrowserAccount[];
    allowHosts: string[];
    readOnly: boolean;
    secrets: string[];
    environmentName: string;
  }) {
    const steps = await this.db.sql<ScriptStep[]>`
      select id, action, selector, value, url, account_role as "accountRole", assertion, notes
      from flow_steps where flow_id = ${input.flow.id} order by position
    `;
    await this.progress(input.run.id, { phase: 'replay', message: input.flow.name, flowId: input.flow.id });
    const result = await replayFlow({
      browser: input.browser,
      baseUrl: input.baseUrl,
      steps,
      accounts: input.accounts,
      allowHosts: input.allowHosts,
      readOnly: input.readOnly,
      repair: async (step, error, visibleText) => {
        const repaired = await this.llm.json<{ selector?: string }>(
          SELECTOR_REPAIR_PROMPT,
          JSON.stringify({ action: step.action, selector: step.selector, error, visibleText, prompt: input.run.focus_prompt }),
          input.secrets,
        );
        return repaired?.selector || null;
      },
    });
    for (const shot of result.shots) {
      const step = steps[shot.index];
      await this.evidence.put({
        projectId: input.project.id,
        runId: input.run.id,
        flowId: input.flow.id,
        stepId: step?.id ?? null,
        kind: 'screenshot',
        bytes: shot.bytes,
        contentType: 'image/png',
      });
    }
    if (result.requests.length > 0) {
      await this.evidence.put({
        projectId: input.project.id,
        runId: input.run.id,
        flowId: input.flow.id,
        kind: 'network',
        bytes: Buffer.from(JSON.stringify(result.requests)),
        contentType: 'application/json',
      });
    }
    const outcome: FlowResult = result.blockedReason ? 'blocked' : result.passed ? 'passed' : 'failed';
    const recent = [...(input.flow.recent_results ?? []), outcome].slice(-5);
    const confidence = scoreConfidence({
      passed: result.passed,
      healed: result.healed,
      retried: result.retried,
      assertionChecked: result.assertionChecked,
      recent,
    });
    const next = nextFlowState({
      approved: Boolean(input.flow.baseline_approved_at),
      result: outcome,
      confidence,
    });
    let explanation: string | null = null;
    if (!result.passed && this.llm.enabled()) {
      explanation = await this.llm.complete(
        FAILURE_PROMPT,
        JSON.stringify({ flow: input.flow.name, error: result.error, blocked: result.blockedReason, prompt: input.run.focus_prompt, text: result.visibleText.slice(0, 1000) }),
        input.secrets,
      );
    }
    if (result.healed) {
      await this.db.sql`delete from flow_steps where flow_id = ${input.flow.id}`;
      let position = 0;
      for (const step of result.healedSteps) {
        await this.db.sql`
          insert into flow_steps (flow_id, position, action, selector, value, url, account_role, assertion, notes, tables, files)
          values (
            ${input.flow.id}, ${position}, ${step.action}, ${step.selector ?? null}, ${step.value ?? null},
            ${step.url ?? null}, ${step.accountRole ?? null}, ${step.assertion ? this.db.sql.json(step.assertion) : null},
            ${step.notes ?? null}, '[]'::jsonb, '[]'::jsonb
          )
        `;
        position += 1;
      }
    }
    await this.db.sql`
      update flows set status = ${next.status}, confidence = ${next.confidence}, last_result = ${outcome},
        last_run_at = now(), recent_results = ${this.db.sql.json(recent)},
        blocked_reason = ${result.blockedReason ?? null},
        version = ${result.healed ? input.flow.version + 1 : input.flow.version},
        updated_at = now()
      where id = ${input.flow.id}
    `;
    await this.db.sql`
      insert into run_flows (run_id, flow_id, result, confidence, blocked_reason, healed, explanation)
      values (
        ${input.run.id}, ${input.flow.id}, ${outcome}, ${next.confidence}, ${result.blockedReason ?? null},
        ${result.healed}, ${explanation}
      )
    `;
    await this.audit.record({
      orgId: input.project.org_id,
      projectId: input.project.id,
      action: 'verification',
      flowId: input.flow.id,
      flowVersion: result.healed ? input.flow.version + 1 : input.flow.version,
      result: outcome,
      confidence: next.confidence,
      commitSha: input.run.commit_sha,
      trigger: input.run.trigger,
      actorUserId: input.run.started_by,
      actorLabel: input.run.actor_label,
      environmentName: input.environmentName,
      runId: input.run.id,
      payload: { flow: input.flow.name, healed: result.healed, failedStep: result.failedStep ?? null },
    });
  }

  private async chooseFlows(
    project: { id: string; local_path: string | null; repo_url: string | null; default_branch: string; app_path: string },
    run: { flow_ids: string[] | null; affected_only: boolean; branch: string | null; commit_sha: string | null },
  ): Promise<{ flows: VerifyFlow[]; reason: string }> {
    const all = await this.db.sql<VerifyFlow[]>`
      select id, name, slug, version, status, baseline_approved_at, recent_results, owners
      from flows where project_id = ${project.id} order by name
    `;
    if (run.flow_ids && run.flow_ids.length > 0) {
      const wanted = new Set(run.flow_ids);
      return { flows: all.filter((flow) => wanted.has(flow.id)), reason: 'selected flows' };
    }
    if (!run.affected_only) return { flows: all, reason: 'all flows' };
    const source = await resolveSource(project);
    const base = project.default_branch || 'main';
    const target = run.commit_sha || run.branch || 'HEAD';
    let files: string[] = [];
    try {
      files = await changedFiles(source.root, base, target);
    } catch (error) {
      throw new Error(
        `Could not diff ${base}...${target}. Pick flows directly, or run this against a git checkout. ${error instanceof Error ? error.message : ''}`,
      );
    }
    const links = await this.db.sql<{ flow_id: string; files: string[]; link_confidence: 'high' | 'medium' | 'low' }[]>`
      select flow_id, files, link_confidence from flow_steps where flow_id in (select id from flows where project_id = ${project.id})
    `;
    const grouped = new Map<string, { file: string; confidence: 'high' | 'medium' | 'low' }[]>();
    for (const link of links) {
      const list = grouped.get(link.flow_id) ?? [];
      const filesOnStep = Array.isArray(link.files) ? link.files : [];
      for (const file of filesOnStep) list.push({ file, confidence: link.link_confidence });
      grouped.set(link.flow_id, list);
    }
    const affected = selectAffectedFlows(
      files,
      all.map((flow) => ({ id: flow.id, links: grouped.get(flow.id) ?? [] })),
    );
    const ids = new Set(affected.map((item) => item.flowId));
    return {
      flows: all.filter((flow) => ids.has(flow.id)),
      reason: affected.length === 0 ? 'No mapped flow is affected by this diff' : 'affected flows',
    };
  }

  private async resetCleanAccounts(projectId: string, secrets: Record<string, string>, runId: string) {
    if (!config.allowDataReset || !secrets.DATABASE_URL) return;
    const planRows = await this.db.sql<{ plan: { userModel: string; steps: { table: string; column: string; via: string }[] } }[]>`
      select plan from delete_plans where project_id = ${projectId} and status = 'approved'
      order by approved_at desc nulls last limit 1
    `;
    const accounts = await this.db.sql<{ email: string | null; data_mode: string }[]>`
      select email, data_mode from test_accounts where project_id = ${projectId} and data_mode = 'clean_slate'
    `;
    if (!planRows[0] || accounts.length === 0) return;
    const target = postgres(secrets.DATABASE_URL, { max: 1 });
    try {
      for (const account of accounts) {
        if (!account.email) continue;
        const userTable = assertSafeIdentifier(planRows[0].plan.userModel);
        const users = await target.unsafe(`select id from ${userTable} where email = $1 limit 1`, [account.email]);
        const userId = (users as unknown as { id: string }[])[0]?.id;
        if (!userId) continue;
        for (const step of planRows[0].plan.steps) {
          if (step.via !== 'direct') continue;
          const table = assertSafeIdentifier(step.table);
          const column = assertSafeIdentifier(step.column);
          await target.unsafe(`delete from ${table} where ${column} = $1`, [userId]);
        }
      }
    } finally {
      await target.end({ timeout: 5 });
    }
    await this.db.sql`
      update runs set progress = ${this.db.sql.json({ phase: 'reset', message: 'Restored clean-slate accounts' })}
      where id = ${runId}
    `;
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

  private async environment(projectId: string, name: string) {
    const rows = await this.db.sql<{ id: string; name: string; read_only: boolean; allow_hosts: string[] }[]>`
      select id, name, read_only, allow_hosts from environments where project_id = ${projectId} and name = ${name}
    `;
    return rows[0] ?? null;
  }

  private async loadRun(runId: string) {
    const rows = await this.db.sql<
      {
        id: string;
        project_id: string;
        trigger: string;
        started_by: string | null;
        actor_label: string | null;
        commit_sha: string | null;
        branch: string | null;
        focus_prompt: string | null;
        flow_ids: string[] | null;
        affected_only: boolean;
      }[]
    >`
      select id, project_id, trigger, started_by, actor_label, commit_sha, branch, focus_prompt, flow_ids, affected_only
      from runs where id = ${runId}
    `;
    if (!rows[0]) throw new Error('Run not found');
    return rows[0];
  }

  private async loadProject(projectId: string) {
    const rows = await this.db.sql<
      {
        id: string;
        org_id: string;
        repo_url: string | null;
        local_path: string | null;
        default_branch: string;
        app_path: string;
        mode: 'sandbox' | 'url';
        target_url: string | null;
      }[]
    >`
      select id, org_id, repo_url, local_path, default_branch, app_path, mode, target_url
      from projects where id = ${projectId}
    `;
    if (!rows[0]) throw new Error('Project not found');
    return rows[0];
  }

  private async progress(runId: string, progress: Record<string, unknown>) {
    await this.db.sql`
      update runs set status = 'running', started_at = coalesce(started_at, now()), progress = ${this.db.sql.json(progress as never)}
      where id = ${runId}
    `;
  }
}
