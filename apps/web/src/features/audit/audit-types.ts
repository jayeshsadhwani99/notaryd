export type AuditEntry = {
  id: string;
  action: string;
  flow_id: string | null;
  flow_version: number | null;
  result: string | null;
  confidence: string | null;
  commit_sha: string | null;
  pr_number: number | null;
  trigger: string | null;
  actor_label: string | null;
  environment_name: string | null;
  run_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};
