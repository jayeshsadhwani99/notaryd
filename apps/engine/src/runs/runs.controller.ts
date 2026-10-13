import { Controller, Get, NotFoundException, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { DbService } from '../db/db.service';

@Controller()
export class RunsController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
  ) {}

  @Get('projects/:id/runs')
  async list(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    await this.access.project(request.user, id);
    const runs = await this.db.sql`
      select id, kind, status, trigger, branch, commit_sha, summary, error, progress, started_at, finished_at, created_at
      from runs where project_id = ${id} order by created_at desc limit 50
    `;
    return { runs };
  }

  @Get('runs/:id')
  async get(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    const rows = await this.db.sql<{ project_id: string }[]>`select project_id from runs where id = ${id}`;
    if (!rows[0]) throw new NotFoundException('Run not found');
    await this.access.project(request.user, rows[0].project_id);
    const [run] = await this.db.sql`
      select id, project_id, kind, status, trigger, branch, commit_sha, focus_prompt, summary, error, progress,
             started_at, finished_at, created_at, actor_label
      from runs where id = ${id}
    `;
    const blockers = await this.db.sql`
      select id, kind, message, page_url, created_at from blockers where run_id = ${id} order by created_at
    `;
    const flows = await this.db.sql`
      select rf.flow_id, rf.result, rf.confidence, rf.blocked_reason, rf.healed, rf.explanation, f.name
      from run_flows rf join flows f on f.id = rf.flow_id
      where rf.run_id = ${id}
    `;
    const evidence = await this.db.sql`
      select id, flow_id, step_id, kind, created_at from evidence where run_id = ${id} order by created_at
    `;
    return { run, blockers, flows, evidence };
  }
}
