import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

export type AuditInput = {
  orgId: string;
  projectId?: string | null;
  action: string;
  flowId?: string | null;
  flowVersion?: number | null;
  result?: string | null;
  confidence?: string | null;
  commitSha?: string | null;
  prNumber?: number | null;
  trigger?: string | null;
  actorUserId?: string | null;
  actorLabel?: string | null;
  environmentName?: string | null;
  snapshotId?: string | null;
  runId?: string | null;
  payload?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  async record(input: AuditInput): Promise<void> {
    const payload = sanitize(input.payload ?? {});
    await this.db.sql`
      insert into audit_log (
        org_id, project_id, action, flow_id, flow_version, result, confidence,
        commit_sha, pr_number, trigger, actor_user_id, actor_label,
        environment_name, snapshot_id, run_id, payload
      ) values (
        ${input.orgId}, ${input.projectId ?? null}, ${input.action}, ${input.flowId ?? null},
        ${input.flowVersion ?? null}, ${input.result ?? null}, ${input.confidence ?? null},
        ${input.commitSha ?? null}, ${input.prNumber ?? null}, ${input.trigger ?? null},
        ${input.actorUserId ?? null}, ${input.actorLabel ?? null}, ${input.environmentName ?? null},
        ${input.snapshotId ?? null}, ${input.runId ?? null}, ${this.db.sql.json(payload as never)}
      )
    `;
  }
}

function sanitize(payload: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/password|secret|ciphertext|token|credential|cookie/i.test(key)) continue;
    copy[key] = value;
  }
  return copy;
}
