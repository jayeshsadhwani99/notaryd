import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { parseBody } from '../common/parse';
import { DbService } from '../db/db.service';
import { VaultService } from '../vault/vault.service';

const accountSchema = z.object({
  label: z.string().min(1).max(60),
  role: z.string().min(1).max(40),
  loginMethod: z.enum(['password', 'saved_session', 'logged_out']),
  dataMode: z.enum(['clean_slate', 'persisted']),
  email: z.string().email().optional().or(z.literal('')),
  credential: z.string().optional(),
});

@Controller('projects/:projectId/accounts')
export class AccountsController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly vault: VaultService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Param('projectId') projectId: string, @Req() request: Request & { user: AuthUser }) {
    await this.access.project(request.user, projectId);
    const rows = await this.db.sql<
      {
        id: string;
        label: string;
        role: string;
        login_method: string;
        data_mode: string;
        email: string | null;
        credential_ciphertext: string | null;
      }[]
    >`
      select id, label, role, login_method, data_mode, email, credential_ciphertext
      from test_accounts where project_id = ${projectId} order by label
    `;
    return {
      accounts: rows.map((row) => ({
        id: row.id,
        label: row.label,
        role: row.role,
        loginMethod: row.login_method,
        dataMode: row.data_mode,
        email: row.email,
        hasCredential: Boolean(row.credential_ciphertext),
      })),
    };
  }

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Req() request: Request & { user: AuthUser },
    @Body() body: unknown,
  ) {
    await this.access.project(request.user, projectId, true);
    const input = parseBody(accountSchema, body);
    const sealed = input.credential ? this.vault.encrypt(input.credential) : null;
    try {
      const rows = await this.db.sql<{ id: string }[]>`
        insert into test_accounts (
          project_id, label, role, login_method, data_mode, email, credential_ciphertext, credential_iv, credential_tag
        ) values (
          ${projectId}, ${input.label}, ${input.role}, ${input.loginMethod}, ${input.dataMode},
          ${input.email || null}, ${sealed?.ciphertext ?? null}, ${sealed?.iv ?? null}, ${sealed?.tag ?? null}
        ) returning id
      `;
      return { id: rows[0].id };
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException('An account with that label already exists');
      throw error;
    }
  }

  @Patch(':accountId')
  async update(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
    @Req() request: Request & { user: AuthUser },
    @Body() body: unknown,
  ) {
    await this.access.project(request.user, projectId, true);
    const input = parseBody(accountSchema.partial(), body);
    const sealed = input.credential ? this.vault.encrypt(input.credential) : null;
    try {
      const rows = await this.db.sql<{ id: string }[]>`
        update test_accounts set
          label = coalesce(${input.label ?? null}, label),
          role = coalesce(${input.role ?? null}, role),
          login_method = coalesce(${input.loginMethod ?? null}, login_method),
          data_mode = coalesce(${input.dataMode ?? null}, data_mode),
          email = coalesce(${input.email === undefined ? null : input.email || null}, email),
          credential_ciphertext = coalesce(${sealed?.ciphertext ?? null}, credential_ciphertext),
          credential_iv = coalesce(${sealed?.iv ?? null}, credential_iv),
          credential_tag = coalesce(${sealed?.tag ?? null}, credential_tag)
        where id = ${accountId} and project_id = ${projectId}
        returning id
      `;
      if (!rows[0]) throw new BadRequestException('Account not found');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (isUniqueViolation(error)) throw new BadRequestException('An account with that label already exists');
      throw error;
    }
    return { ok: true };
  }

  @Post(':accountId/reveal')
  async reveal(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
    @Req() request: Request & { user: AuthUser },
  ) {
    const project = await this.access.project(request.user, projectId);
    const rows = await this.db.sql<{ label: string; credential_ciphertext: string | null; credential_iv: string | null; credential_tag: string | null }[]>`
      select label, credential_ciphertext, credential_iv, credential_tag
      from test_accounts where id = ${accountId} and project_id = ${projectId}
    `;
    const row = rows[0];
    if (!row?.credential_ciphertext || !row.credential_iv || !row.credential_tag) {
      throw new BadRequestException('No credential stored');
    }
    await this.audit.record({
      orgId: project.org_id,
      projectId: project.id,
      action: 'account.view',
      actorUserId: request.user.id,
      actorLabel: request.user.name,
      payload: { label: row.label },
    });
    return { value: this.vault.decrypt({ ciphertext: row.credential_ciphertext, iv: row.credential_iv, tag: row.credential_tag }) };
  }

  @Delete(':accountId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
    @Req() request: Request & { user: AuthUser },
  ) {
    await this.access.project(request.user, projectId, true);
    await this.db.sql`delete from test_accounts where id = ${accountId} and project_id = ${projectId}`;
    return { ok: true };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}
