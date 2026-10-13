import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { parseBody } from '../common/parse';
import { DbService } from '../db/db.service';

@Controller()
export class FlowsController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  @Get('projects/:id/flows')
  async list(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    await this.access.project(request.user, id);
    const flows = await this.db.sql<
      {
        id: string;
        name: string;
        slug: string;
        goal: string | null;
        status: string;
        confidence: string;
        version: number;
        feature: string | null;
        last_result: string | null;
        last_run_at: Date | null;
        owners: unknown;
        blocked_reason: string | null;
      }[]
    >`
      select f.id, f.name, f.slug, f.goal, f.status, f.confidence, f.version, fe.name as feature,
             f.last_result, f.last_run_at, f.owners, f.blocked_reason
      from flows f
      left join features fe on fe.id = f.feature_id
      where f.project_id = ${id}
      order by fe.name nulls last, f.name
    `;
    return { flows };
  }

  @Get('flows/:id')
  async get(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    const flow = await this.flow(request.user, id);
    const steps = await this.db.sql`
      select id, position, action, selector, value, url, account_role, assertion, route, component,
             handler, tables, api_calls, files, link_confidence, third_party, notes
      from flow_steps where flow_id = ${id} order by position
    `;
    const history = await this.db.sql`
      select id, action, result, confidence, commit_sha, trigger, actor_label, created_at, run_id, payload
      from audit_log where flow_id = ${id} order by created_at desc limit 30
    `;
    const shots = await this.db.sql<{ id: string; step_id: string | null; kind: string; created_at: Date }[]>`
      select id, step_id, kind, created_at from evidence
      where flow_id = ${id} and kind = 'screenshot'
      order by created_at desc limit 40
    `;
    return { flow, steps, history, screenshots: shots };
  }

  @Patch('flows/:id')
  async update(@Param('id') id: string, @Req() request: Request & { user: AuthUser }, @Body() body: unknown) {
    const flow = await this.flow(request.user, id);
    const input = parseBody(
      z.object({
        name: z.string().min(1).optional(),
        goal: z.string().optional(),
        owners: z.array(z.object({ person: z.string().min(1), role: z.string().min(1) })).optional(),
      }),
      body,
    );
    await this.db.sql`
      update flows set
        name = coalesce(${input.name ?? null}, name),
        goal = coalesce(${input.goal ?? null}, goal),
        owners = coalesce(${input.owners ? this.db.sql.json(input.owners) : null}, owners),
        version = version + 1,
        updated_at = now()
      where id = ${id}
    `;
    await this.audit.record({
      orgId: flow.org_id,
      projectId: flow.project_id,
      action: 'flow.edit',
      flowId: id,
      flowVersion: flow.version + 1,
      actorUserId: request.user.id,
      actorLabel: request.user.name,
      payload: { fields: Object.keys(input) },
    });
    return { ok: true };
  }

  @Put('flows/:id/steps')
  async replaceSteps(@Param('id') id: string, @Req() request: Request & { user: AuthUser }, @Body() body: unknown) {
    const flow = await this.flow(request.user, id);
    const input = parseBody(
      z.object({
        steps: z.array(
          z.object({
            action: z.string().min(1),
            selector: z.string().nullable().optional(),
            value: z.string().nullable().optional(),
            url: z.string().nullable().optional(),
            accountRole: z.string().nullable().optional(),
            notes: z.string().nullable().optional(),
          }),
        ),
      }),
      body,
    );
    await this.db.sql.begin(async (tx) => {
      const existing = await tx<{ id: string }[]>`select id from flow_steps where flow_id = ${id} order by position`;
      for (let position = 0; position < input.steps.length; position += 1) {
        const step = input.steps[position];
        const current = existing[position];
        if (current) {
          await tx`
            update flow_steps set
              position = ${position},
              action = ${step.action},
              selector = ${step.selector ?? null},
              value = ${step.value ?? null},
              url = ${step.url ?? null},
              account_role = ${step.accountRole ?? null},
              notes = ${step.notes ?? null}
            where id = ${current.id}
          `;
        } else {
          await tx`
            insert into flow_steps (flow_id, position, action, selector, value, url, account_role, notes, tables, files)
            values (
              ${id}, ${position}, ${step.action}, ${step.selector ?? null}, ${step.value ?? null},
              ${step.url ?? null}, ${step.accountRole ?? null}, ${step.notes ?? null}, '[]'::jsonb, '[]'::jsonb
            )
          `;
        }
      }
      if (existing.length > input.steps.length) {
        const extra = existing.slice(input.steps.length).map((row) => row.id);
        await tx`delete from flow_steps where flow_id = ${id} and id in ${tx(extra)}`;
      }
      await tx`update flows set version = version + 1, updated_at = now() where id = ${id}`;
    });
    await this.audit.record({
      orgId: flow.org_id,
      projectId: flow.project_id,
      action: 'flow.edit',
      flowId: id,
      flowVersion: flow.version + 1,
      actorUserId: request.user.id,
      actorLabel: request.user.name,
      payload: { steps: input.steps.length },
    });
    return { ok: true };
  }

  @Post('flows/:id/baseline')
  async baseline(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    const flow = await this.flow(request.user, id);
    if (flow.last_result !== 'passed') {
      throw new BadRequestException('Approve a flow after a passing run. Edit the steps and re-run if the UI change was intentional.');
    }
    await this.db.sql`
      update flows set status = 'verified', baseline_approved_by = ${request.user.id}, baseline_approved_at = now(), updated_at = now()
      where id = ${id}
    `;
    await this.audit.record({
      orgId: flow.org_id,
      projectId: flow.project_id,
      action: 'baseline.accept',
      flowId: id,
      flowVersion: flow.version,
      result: 'passed',
      confidence: flow.confidence,
      actorUserId: request.user.id,
      actorLabel: request.user.name,
    });
    return { ok: true };
  }

  @Get('projects/:id/audit')
  async auditLog(
    @Param('id') id: string,
    @Req() request: Request & { user: AuthUser },
    @Query('result') result?: string,
    @Query('trigger') trigger?: string,
    @Query('flowId') flowId?: string,
  ) {
    await this.access.project(request.user, id);
    const rows = await this.db.sql`
      select id, action, flow_id, flow_version, result, confidence, commit_sha, pr_number, trigger,
             actor_label, environment_name, run_id, payload, created_at
      from audit_log
      where project_id = ${id}
        and (${result ?? null}::text is null or result = ${result ?? null})
        and (${trigger ?? null}::text is null or trigger = ${trigger ?? null})
        and (${flowId ?? null}::uuid is null or flow_id = ${flowId ?? null})
      order by created_at desc
      limit 200
    `;
    return { entries: rows };
  }

  private async flow(user: AuthUser, flowId: string) {
    const rows = await this.db.sql<
      {
        id: string;
        project_id: string;
        org_id: string;
        name: string;
        goal: string | null;
        status: string;
        confidence: string;
        version: number;
        owners: unknown;
        last_result: string | null;
        blocked_reason: string | null;
        baseline_approved_at: Date | null;
      }[]
    >`
      select f.id, f.project_id, p.org_id, f.name, f.goal, f.status, f.confidence, f.version, f.owners,
             f.last_result, f.blocked_reason, f.baseline_approved_at
      from flows f
      join projects p on p.id = f.project_id
      where f.id = ${flowId}
    `;
    if (!rows[0]) throw new BadRequestException('Flow not found');
    await this.access.project(user, rows[0].project_id);
    return rows[0];
  }
}
