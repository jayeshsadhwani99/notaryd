import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { parseBody } from '../common/parse';
import { DbService } from '../db/db.service';
import { parseDotenv, VaultService } from './vault.service';

@Controller()
export class VaultController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly vault: VaultService,
    private readonly audit: AuditService,
  ) {}

  @Get('projects/:id/vault')
  async list(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    const project = await this.access.project(request.user, id);
    const environments = await this.environments(id);
    const latest = await this.db.sql<{ analysis: { envKeys?: { key: string; source: string }[] } }[]>`
      select analysis from reviews where project_id = ${id} order by created_at desc limit 1
    `;
    const detected = latest[0]?.analysis?.envKeys ?? [];
    const result = [];
    for (const environment of environments) {
      const saved = await this.vault.list(environment.id);
      const savedKeys = new Set(saved.map((item) => item.key));
      result.push({
        name: environment.name,
        readOnly: environment.read_only,
        productionConfirmedAt: environment.production_confirmed_at,
        flagPins: environment.flag_pins,
        allowHosts: environment.allow_hosts,
        secrets: mergeKeys(detected, savedKeys, saved),
      });
    }
    return { environments: result, canEdit: project.role === 'admin' };
  }

  @Put('projects/:id/vault')
  async save(@Param('id') id: string, @Req() request: Request & { user: AuthUser }, @Body() body: unknown) {
    const project = await this.access.project(request.user, id, true);
    const input = parseBody(
      z.object({
        environment: z.enum(['sandbox', 'staging', 'production']),
        entries: z.array(z.object({ key: z.string().min(1), value: z.string() })).optional(),
        dotenv: z.string().optional(),
      }),
      body,
    );
    const environment = await this.environment(id, input.environment);
    if (input.environment === 'production' && !environment.production_confirmed_at) {
      throw new BadRequestException('Confirm production secrets before saving them');
    }
    const entries = [...(input.entries ?? []), ...(input.dotenv ? parseDotenv(input.dotenv) : [])].filter(
      (entry) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.key),
    );
    if (entries.length === 0) throw new BadRequestException('No secrets to save');
    await this.vault.upsert(request.user, project, environment.id, environment.name, entries);
    return { saved: entries.map((entry) => entry.key) };
  }

  @Post('projects/:id/vault/reveal')
  async reveal(@Param('id') id: string, @Req() request: Request & { user: AuthUser }, @Body() body: unknown) {
    const project = await this.access.project(request.user, id, true);
    const input = parseBody(
      z.object({ environment: z.enum(['sandbox', 'staging', 'production']), key: z.string().min(1) }),
      body,
    );
    const environment = await this.environment(id, input.environment);
    const value = await this.vault.reveal(request.user, project, environment.id, input.key);
    return { key: input.key, value };
  }

  @Put('projects/:id/environments/:name')
  async updateEnv(
    @Param('id') id: string,
    @Param('name') name: 'sandbox' | 'staging' | 'production',
    @Req() request: Request & { user: AuthUser },
    @Body() body: unknown,
  ) {
    await this.access.project(request.user, id, true);
    const input = parseBody(
      z.object({
        allowHosts: z.array(z.string()).optional(),
        flagPins: z.record(z.string()).optional(),
        readOnly: z.boolean().optional(),
      }),
      body,
    );
    const environment = await this.environment(id, name);
    await this.db.sql`
      update environments set
        allow_hosts = ${this.db.sql.json(input.allowHosts ?? environment.allow_hosts)},
        flag_pins = ${this.db.sql.json(input.flagPins ?? environment.flag_pins)},
        read_only = ${input.readOnly ?? environment.read_only}
      where id = ${environment.id}
    `;
    return { ok: true };
  }

  @Post('projects/:id/environments/production/confirm')
  async confirm(@Param('id') id: string, @Req() request: Request & { user: AuthUser }) {
    const project = await this.access.project(request.user, id, true);
    await this.db.sql`
      update environments set production_confirmed_at = now(), production_confirmed_by = ${request.user.id}, read_only = true
      where project_id = ${id} and name = 'production'
    `;
    await this.audit.record({
      orgId: project.org_id,
      projectId: project.id,
      action: 'production.confirm',
      actorUserId: request.user.id,
      actorLabel: request.user.name,
      environmentName: 'production',
      payload: { readOnly: true },
    });
    return { ok: true };
  }

  private async environments(projectId: string) {
    return this.db.sql<
      {
        id: string;
        name: string;
        read_only: boolean;
        production_confirmed_at: Date | null;
        flag_pins: Record<string, string>;
        allow_hosts: string[];
      }[]
    >`select id, name, read_only, production_confirmed_at, flag_pins, allow_hosts from environments where project_id = ${projectId} order by name`;
  }

  private async environment(projectId: string, name: string) {
    const rows = await this.environments(projectId);
    const environment = rows.find((item) => item.name === name);
    if (!environment) throw new BadRequestException('Unknown environment');
    return environment;
  }
}

function mergeKeys(
  detected: { key: string; source: string }[],
  savedKeys: Set<string>,
  saved: { key: string; updatedAt: string }[],
) {
  const map = new Map<string, { key: string; configured: boolean; source?: string; updatedAt?: string }>();
  for (const item of detected) map.set(item.key, { key: item.key, configured: savedKeys.has(item.key), source: item.source });
  for (const item of saved) {
    const current = map.get(item.key);
    map.set(item.key, { key: item.key, configured: true, source: current?.source, updatedAt: item.updatedAt });
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}
