export type Confidence = 'high' | 'medium' | 'low' | 'flaky';
export type FlowResult = 'passed' | 'failed' | 'blocked' | 'skipped';

export function scoreConfidence(input: {
  passed: boolean;
  healed: boolean;
  retried: boolean;
  assertionChecked: boolean;
  recent: FlowResult[];
}): Confidence {
  const recent = input.recent.filter((item) => item === 'passed' || item === 'failed').slice(-5);
  const hasPass = recent.includes('passed');
  const hasFail = recent.includes('failed');
  if (recent.length >= 3 && hasPass && hasFail) return 'flaky';
  if (!input.passed) return 'low';
  if (!input.assertionChecked || input.retried) return 'low';
  if (input.healed || recent.length < 5) return 'medium';
  if (recent.every((item) => item === 'passed')) return 'high';
  return 'medium';
}

export function nextFlowState(input: {
  approved: boolean;
  result: FlowResult;
  confidence: Confidence;
}): { status: 'unverified' | 'verified' | 'failing' | 'flaky' | 'blocked'; confidence: Confidence } {
  if (input.result === 'blocked') return { status: 'blocked', confidence: 'low' };
  if (input.confidence === 'flaky') return { status: 'flaky', confidence: 'flaky' };
  if (input.result === 'failed') return { status: 'failing', confidence: input.confidence };
  if (!input.approved) return { status: 'unverified', confidence: input.confidence };
  return { status: 'verified', confidence: input.confidence };
}

export type FlowLink = {
  id: string;
  links: { file: string; confidence: 'high' | 'medium' | 'low' }[];
};

export function selectAffectedFlows(
  changedFiles: string[],
  flows: FlowLink[],
): { flowId: string; reason: string }[] {
  const changed = changedFiles.map((file) => file.replace(/\\/g, '/').replace(/^\.\//, ''));
  const picked: { flowId: string; reason: string }[] = [];
  for (const flow of flows) {
    const files = flow.links.map((link) => link.file.replace(/\\/g, '/')).filter(Boolean);
    if (files.length === 0) {
      picked.push({ flowId: flow.id, reason: 'no code link yet, so the flow is included' });
      continue;
    }
    const hit = files.find((file) => changed.some((item) => item === file || item.endsWith(`/${file}`) || file.endsWith(item)));
    if (hit) {
      picked.push({ flowId: flow.id, reason: `change touches ${hit}` });
      continue;
    }
    if (flow.links.some((link) => link.confidence !== 'high')) {
      picked.push({ flowId: flow.id, reason: 'a code link is uncertain, so the flow is included' });
    }
  }
  return picked;
}

export function filterRoutesByFocus<T extends { url: string; file: string }>(routes: T[], prompt: string): { routes: T[]; narrowed: boolean } {
  const words = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !['only', 'map', 'with', 'from', 'that', 'this', 'flow', 'flows'].includes(word));
  if (words.length === 0) return { routes, narrowed: false };
  const matched = routes.filter((route) =>
    words.some((word) => route.url.toLowerCase().includes(word) || route.file.toLowerCase().includes(word)),
  );
  if (matched.length === 0) return { routes, narrowed: false };
  return { routes: matched, narrowed: true };
}
