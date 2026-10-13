import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { analyzeDirectory } from '../analyze/analyze-directory';
import { DbService } from '../db/db.service';
import { buildDeletePlan, suggestAuthPlan } from '../domain';
import { resolveSource, type SourceProject } from './source';

@Injectable()
export class ReviewRunner {
  private readonly logger = new Logger(ReviewRunner.name);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async run(runId: string): Promise<void> {
    const run = await this.loadRun(runId);
    const project = await this.loadProject(run.project_id);
    try {
      await this.progress(runId, { phase: 'resolve', message: 'Reading the repository' });
      const source = await resolveSource(project);
      await this.progress(runId, { phase: 'analyze', message: 'Reading routes, schema, and auth' });
      const analysis = await analyzeDirectory(source.root);
      if (project.app_path) {
        const prefix = project.app_path.replace(/^\/|\/$/g, '');
        analysis.routes = analysis.routes.filter((route) => route.file.startsWith(`${prefix}/`) || route.file === prefix);
      }
      const detected = {
        provider: analysis.auth.provider,
        loginMethods: analysis.auth.loginMethods,
        roles: analysis.auth.roles,
        roleSource: analysis.auth.roleSource,
        framework: analysis.framework,
        frameworks: analysis.frameworks,
        routeCount: analysis.routes.length,
        modelCount: analysis.models.length,
        envKeys: analysis.envKeys,
        seededAccounts: analysis.seededAccounts.map((account) => ({ email: account.email, role: account.role })),
        hasSeedScript: analysis.hasSeedScript,
        packageManager: analysis.packageManager,
        routes: analysis.routes.map((route) => ({ url: route.url, kind: route.kind, file: route.file, methods: route.methods })),
        models: analysis.models.map((model) => ({ name: model.name, table: model.table })),
      };
      await this.db.sql`
        insert into reviews (project_id, run_id, analysis)
        values (${project.id}, ${runId}, ${this.db.sql.json(detected)})
      `;
      const suggestion = suggestAuthPlan(analysis.auth, analysis.seededAccounts);
      const approved = await this.db.sql<{ id: string }[]>`
        select id from auth_plans where project_id = ${project.id} and status = 'approved' limit 1
      `;
      if (approved.length === 0) {
        await this.db.sql`
          insert into auth_plans (project_id, detected, suggestion, status)
          values (${project.id}, ${this.db.sql.json(detected)}, ${this.db.sql.json(suggestion)}, 'proposed')
        `;
      }
      const deletePlan = buildDeletePlan(analysis.models);
      if (deletePlan) {
        await this.db.sql`
          insert into delete_plans (project_id, plan, status)
          values (${project.id}, ${this.db.sql.json(deletePlan)}, 'proposed')
        `;
      }
      await this.db.sql`
        update projects set status = 'ready', framework = ${analysis.framework}, updated_at = now()
        where id = ${project.id}
      `;
      await this.finish(runId, `Found ${analysis.routes.length} routes and ${analysis.models.length} models`);
      await this.audit.record({
        orgId: project.org_id,
        projectId: project.id,
        action: 'review.complete',
        runId,
        trigger: run.trigger,
        actorUserId: run.started_by,
        actorLabel: run.actor_label,
        result: 'passed',
        payload: { routes: analysis.routes.length, models: analysis.models.length, provider: analysis.auth.provider },
      });
    } catch (error) {
      await this.fail(runId, project.id, error);
    }
  }

  private async loadRun(runId: string) {
    const rows = await this.db.sql<{ project_id: string; trigger: string; started_by: string | null; actor_label: string | null }[]>`
      select project_id, trigger, started_by, actor_label from runs where id = ${runId}
    `;
    if (!rows[0]) throw new Error('Run not found');
    return rows[0];
  }

  private async loadProject(projectId: string): Promise<SourceProject & { id: string; org_id: string }> {
    const rows = await this.db.sql<(SourceProject & { id: string; org_id: string })[]>`
      select id, org_id, repo_url, local_path, default_branch, app_path from projects where id = ${projectId}
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

  private async finish(runId: string, summary: string) {
    await this.db.sql`
      update runs set status = 'succeeded', summary = ${summary}, finished_at = now() where id = ${runId}
    `;
  }

  private async fail(runId: string, projectId: string, error: unknown) {
    const message = error instanceof Error ? error.message : 'Review failed';
    this.logger.error(message);
    await this.db.sql`
      update runs set status = 'failed', error = ${message}, finished_at = now() where id = ${runId}
    `;
    await this.db.sql`update projects set status = 'failed', updated_at = now() where id = ${projectId}`;
  }
}
