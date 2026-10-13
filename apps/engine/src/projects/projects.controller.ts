import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { parseBody } from '../common/parse';
import { assertRepoUrl } from '../domain';
import { DbService } from '../db/db.service';
import { QueueService } from '../pipeline/queue.service';

const projectIcons = [
  'layers',
  'box',
  'shopping-cart',
  'credit-card',
  'rocket',
  'database',
  'globe',
  'shield',
  'zap',
  'package',
  'app-window',
  'building-2',
  'workflow',
  'flask',
  'store',
  'wallet',
] as const;

const projectSchema = z.object({
  name: z.string().min(1).max(120),
  mode: z.enum(['sandbox', 'url']),
  repoUrl: z.string().optional(),
  localPath: z.string().optional(),
  appPath: z.string().optional(),
  targetUrl: z.string().optional(),
  defaultBranch: z.string().optional(),
  focusPrompt: z.string().max(2000).optional(),
  icon: z.enum(projectIcons).optional(),
});

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
  ) {}

  @Get()
  async list(@Req() request: Request & { user: AuthUser }) {
    const rows = await this.db.sql<
      { id: string; name: string; mode: string; status: string; framework: string; icon: string; updated_at: Date; target_url: string | null }[]
    >`
      select p.id, p.name, p.mode, p.status, p.framework, p.icon, p.updated_at, p.target_url
      from projects p
      join memberships m on m.org_id = p.org_id
      where m.user_id = ${request.user.id}
      order by p.updated_at desc
    `;
    return {
      projects: rows.map((row) => ({
        id: row.id,
        name: row.name,
        mode: row.mode,
        status: row.status,
        framework: row.framework,
        icon: row.icon,
        updatedAt: row.updated_at,
        targetUrl: row.target_url,
      })),
    };
  }

  @Post()
  async create(@Req() request: Request & { user: AuthUser }, @Body() body: unknown) {
    const input = parseBody(projectSchema, body);
    this.validateSource(input);
    const project = await this.db.sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into projects (
          org_id, name, repo_url, local_path, app_path, default_branch, focus_prompt, mode, target_url, icon, created_by
        ) values (
          ${request.user.orgId}, ${input.name.trim()}, ${blank(input.repoUrl)}, ${blank(input.localPath)},
          ${input.appPath?.trim() ?? ''}, ${input.defaultBranch?.trim() || 'main'}, ${blank(input.focusPrompt)},
          ${input.mode}, ${blank(input.targetUrl)}, ${input.icon ?? 'layers'}, ${request.user.id}
        ) returning id
      `;
      await tx`
        insert into environments (project_id, name, read_only) values
          (${rows[0].id}, 'sandbox', false),
          (${rows[0].id}, 'staging', false),
          (${rows[0].id}, 'production', true)
      `;
      return rows[0];
    });
    return { id: project.id };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    const project = await this.access.project(request.user, id);
    const [review] = await this.db.sql<{ analysis: unknown; created_at: Date }[]>`
      select analysis, created_at from reviews where project_id = ${id} order by created_at desc limit 1
    `;
    const [plan] = await this.db.sql<{ id: string; detected: unknown; suggestion: unknown; status: string; created_at: Date }[]>`
      select id, detected, suggestion, status, created_at from auth_plans
      where project_id = ${id} order by created_at desc limit 1
    `;
    const [deletePlan] = await this.db.sql<{ id: string; plan: unknown; status: string }[]>`
      select id, plan, status from delete_plans where project_id = ${id} order by created_at desc limit 1
    `;
    const [latestRun] = await this.db.sql<Record<string, unknown>[]>`
      select id, kind, status, summary, error, progress, created_at from runs
      where project_id = ${id} order by created_at desc limit 1
    `;
    const counts = await this.db.sql<{ flows: number; accounts: number }[]>`
      select
        (select count(*)::int from flows where project_id = ${id}) as flows,
        (select count(*)::int from test_accounts where project_id = ${id}) as accounts
    `;
    return {
      project: {
        id: project.id,
        name: project.name,
        mode: project.mode,
        status: project.status,
        framework: project.framework,
        repoUrl: project.repo_url,
        localPath: project.local_path,
        appPath: project.app_path,
        defaultBranch: project.default_branch,
        focusPrompt: project.focus_prompt,
        targetUrl: project.target_url,
        icon: project.icon,
        role: project.role,
      },
      review: review ? { analysis: review.analysis, createdAt: review.created_at } : null,
      authPlan: plan ?? null,
      deletePlan: deletePlan ?? null,
      latestRun: latestRun ?? null,
      counts: counts[0] ?? { flows: 0, accounts: 0 },
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Req() request: Request & { user: AuthUser }, @Body() body: unknown) {
    await this.access.project(request.user, id);
    const input = parseBody(projectSchema.partial(), body);
    if (input.repoUrl || input.localPath || input.mode || input.targetUrl) this.validateSource({ ...input, mode: input.mode ?? 'sandbox' });
    await this.db.sql`
      update projects set
        name = coalesce(${input.name ?? null}, name),
        repo_url = coalesce(${input.repoUrl === undefined ? null : blank(input.repoUrl)}, repo_url),
        local_path = coalesce(${input.localPath === undefined ? null : blank(input.localPath)}, local_path),
        app_path = coalesce(${input.appPath ?? null}, app_path),
        default_branch = coalesce(${input.defaultBranch ?? null}, default_branch),
        focus_prompt = coalesce(${input.focusPrompt === undefined ? null : blank(input.focusPrompt)}, focus_prompt),
        mode = coalesce(${input.mode ?? null}, mode),
        target_url = coalesce(${input.targetUrl === undefined ? null : blank(input.targetUrl)}, target_url),
        icon = coalesce(${input.icon ?? null}, icon),
        updated_at = now()
      where id = ${id}
    `;
    return { ok: true };
  }

  @Post(':id/review')
  review(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    return this.enqueue(request.user, id, 'review', {});
  }

  @Post(':id/explore')
  explore(@Param('id') id: string, @Req() request: Request & { user: AuthUser }, @Body() body: unknown) {
    const input = parseBody(
      z.object({ branch: z.string().optional(), commit: z.string().optional(), focusPrompt: z.string().optional() }),
      body ?? {},
    );
    return this.enqueue(request.user, id, 'explore', input);
  }

  @Post(':id/verify')
  verify(@Param('id') id: string, @Req() request: Request & { user: AuthUser }, @Body() body: unknown) {
    const input = parseBody(
      z.object({
        branch: z.string().optional(),
        commit: z.string().optional(),
        flowIds: z.array(z.string().uuid()).optional(),
        affectedOnly: z.boolean().optional(),
        focusPrompt: z.string().max(2000).optional(),
      }),
      body ?? {},
    );
    return this.enqueue(request.user, id, 'verify', input);
  }

  @Post(':id/auth-plan/approve')
  async approvePlan(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    const project = await this.access.project(request.user, id);
    const [plan] = await this.db.sql<{ id: string }[]>`
      select id from auth_plans where project_id = ${id} and status = 'proposed' order by created_at desc limit 1
    `;
    if (!plan) throw new BadRequestException('No proposed auth plan');
    await this.db.sql`
      update auth_plans set status = 'approved', approved_by = ${request.user.id}, approved_at = now() where id = ${plan.id}
    `;
    await this.audit.record({
      orgId: project.org_id,
      projectId: project.id,
      action: 'auth_plan.approve',
      actorUserId: request.user.id,
      actorLabel: request.user.name,
    });
    return { ok: true };
  }

  @Post(':id/delete-plan/approve')
  async approveDelete(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    const project = await this.access.project(request.user, id, true);
    const [plan] = await this.db.sql<{ id: string }[]>`
      select id from delete_plans where project_id = ${id} and status = 'proposed' order by created_at desc limit 1
    `;
    if (!plan) throw new BadRequestException('No proposed delete plan');
    await this.db.sql`
      update delete_plans set status = 'approved', approved_by = ${request.user.id}, approved_at = now() where id = ${plan.id}
    `;
    await this.audit.record({
      orgId: project.org_id,
      projectId: project.id,
      action: 'delete_plan.approve',
      actorUserId: request.user.id,
      actorLabel: request.user.name,
      payload: { note: 'Wipes run only in the sandbox, and only when NOTARYD_ALLOW_DATA_RESET=true' },
    });
    return { ok: true };
  }

  private async enqueue(
    user: AuthUser,
    projectId: string,
    kind: 'review' | 'explore' | 'verify',
    input: { branch?: string; commit?: string; focusPrompt?: string; flowIds?: string[]; affectedOnly?: boolean },
  ) {
    const project = await this.access.project(user, projectId);
    if (kind === 'review') {
      await this.db.sql`update projects set status = 'reviewing', updated_at = now() where id = ${projectId}`;
    }
    const focusPrompt = input.focusPrompt === undefined ? project.focus_prompt : input.focusPrompt.trim() || null;
    const rows = await this.db.sql<{ id: string }[]>`
      insert into runs (
        project_id, kind, trigger, branch, commit_sha, focus_prompt, flow_ids, affected_only, started_by, actor_label, environment_name
      ) values (
        ${projectId}, ${kind}, 'manual', ${input.branch ?? project.default_branch}, ${input.commit ?? null},
        ${focusPrompt}, ${input.flowIds ? this.db.sql.json(input.flowIds) : null},
        ${input.affectedOnly ?? kind === 'verify'}, ${user.id}, ${user.name}, ${project.mode === 'url' ? 'staging' : 'sandbox'}
      ) returning id
    `;
    try {
      await this.queue.enqueue(kind, rows[0].id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Queue unavailable';
      await this.db.sql`update runs set status = 'failed', error = ${message}, finished_at = now() where id = ${rows[0].id}`;
      throw error;
    }
    return { runId: rows[0].id };
  }

  private validateSource(input: { mode?: string; repoUrl?: string; localPath?: string; targetUrl?: string }) {
    if (input.repoUrl) assertRepoUrl(input.repoUrl);
    if (!blank(input.repoUrl) && !blank(input.localPath)) {
      throw new BadRequestException('Add a repo URL or a local path');
    }
    if (input.mode === 'url' && !blank(input.targetUrl)) {
      throw new BadRequestException('Point-at-URL mode needs a target URL');
    }
    if (input.targetUrl) {
      try {
        const url = new URL(input.targetUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad');
      } catch {
        throw new BadRequestException('Target URL must be http(s)');
      }
    }
  }
}

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
