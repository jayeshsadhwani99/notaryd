export type Flow = {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  confidence: string;
  feature: string | null;
  last_result: string | null;
  owners: { person: string; role: string }[];
};

export type Step = {
  id: string;
  action: string;
  selector: string | null;
  value: string | null;
  url: string | null;
  account_role: string | null;
  component: string | null;
  handler: string | null;
  tables: string[];
  files: string[];
  link_confidence: string;
  notes: string | null;
};

export type FlowDetail = {
  flow: {
    name: string;
    goal: string | null;
    status: string;
    confidence: string;
    version: number;
    blocked_reason: string | null;
    owners: { person: string; role: string }[];
  };
  steps: Step[];
  history: { id: string; action: string; result: string | null; actor_label: string | null; created_at: string; commit_sha: string | null }[];
  screenshots: { id: string; step_id: string | null }[];
};

export function stepPayload(steps: Step[]) {
  return steps.map((step) => ({
    action: step.action,
    selector: step.selector,
    value: step.value,
    url: step.url,
    accountRole: step.account_role,
    notes: step.notes,
  }));
}
