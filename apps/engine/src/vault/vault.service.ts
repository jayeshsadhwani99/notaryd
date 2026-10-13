import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth';
import { config } from '../config';
import { decryptString, encryptString, vaultKey } from '../domain';
import { DbService } from '../db/db.service';

export type SecretMap = Record<string, string>;

@Injectable()
export class VaultService {
  private readonly key = vaultKey(config.vaultKey);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(environmentId: string): Promise<{ key: string; updatedAt: string }[]> {
    const rows = await this.db.sql<{ key: string; updated_at: Date }[]>`
      select key, updated_at from secrets where environment_id = ${environmentId} order by key
    `;
    return rows.map((row) => ({ key: row.key, updatedAt: row.updated_at.toISOString() }));
  }

  async decryptAll(environmentId: string): Promise<SecretMap> {
    const rows = await this.db.sql<{ key: string; ciphertext: string; iv: string; auth_tag: string }[]>`
      select key, ciphertext, iv, auth_tag from secrets where environment_id = ${environmentId}
    `;
    const secrets: SecretMap = {};
    for (const row of rows) {
      secrets[row.key] = decryptString({ ciphertext: row.ciphertext, iv: row.iv, tag: row.auth_tag }, this.key);
    }
    return secrets;
  }

  async reveal(user: AuthUser, project: { id: string; org_id: string }, environmentId: string, key: string): Promise<string> {
    const rows = await this.db.sql<{ ciphertext: string; iv: string; auth_tag: string }[]>`
      select ciphertext, iv, auth_tag from secrets
      where environment_id = ${environmentId} and key = ${key}
    `;
    if (!rows[0]) throw new Error('Secret not found');
    await this.audit.record({
      orgId: project.org_id,
      projectId: project.id,
      action: 'secret.view',
      actorUserId: user.id,
      actorLabel: user.name,
      payload: { key },
    });
    return decryptString({ ciphertext: rows[0].ciphertext, iv: rows[0].iv, tag: rows[0].auth_tag }, this.key);
  }

  async upsert(
    user: AuthUser,
    project: { id: string; org_id: string },
    environmentId: string,
    environmentName: string,
    entries: { key: string; value: string }[],
  ): Promise<void> {
    for (const entry of entries) {
      const sealed = encryptString(entry.value, this.key);
      await this.db.sql`
        insert into secrets (environment_id, key, ciphertext, iv, auth_tag, updated_by)
        values (${environmentId}, ${entry.key}, ${sealed.ciphertext}, ${sealed.iv}, ${sealed.tag}, ${user.id})
        on conflict (environment_id, key) do update set
          ciphertext = excluded.ciphertext,
          iv = excluded.iv,
          auth_tag = excluded.auth_tag,
          updated_by = excluded.updated_by,
          updated_at = now()
      `;
    }
    await this.audit.record({
      orgId: project.org_id,
      projectId: project.id,
      action: 'secret.change',
      actorUserId: user.id,
      actorLabel: user.name,
      environmentName,
      payload: { keys: entries.map((entry) => entry.key) },
    });
  }

  encrypt(value: string) {
    return encryptString(value, this.key);
  }

  decrypt(payload: { ciphertext: string; iv: string; tag: string }): string {
    return decryptString(payload, this.key);
  }
}

export function parseDotenv(text: string): { key: string; value: string }[] {
  const entries: { key: string; value: string }[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.push({ key: match[1], value });
  }
  return entries;
}
