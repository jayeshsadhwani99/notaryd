export type CodeownerRule = { pattern: string; owners: string[] };

export function parseCodeowners(text: string): CodeownerRule[] {
  const rules: CodeownerRule[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    rules.push({ pattern: parts[0], owners: parts.slice(1) });
  }
  return rules;
}

function matches(pattern: string, file: string): boolean {
  const normalized = file.replace(/\\/g, '/').replace(/^\//, '');
  const pat = pattern.replace(/^\//, '');
  if (pat === '*') return true;
  if (pat.includes('*')) {
    const body = pat
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*\\\*/g, '.*')
      .replace(/\\\*/g, '[^/]*');
    return new RegExp(`(?:^|/)${body}(?:$|/)`).test(normalized) || new RegExp(`^${body}$`).test(normalized);
  }
  if (normalized === pat || normalized.startsWith(`${pat}/`) || normalized.endsWith(`/${pat}`)) return true;
  return normalized.includes(`/${pat}/`) || normalized.startsWith(`${pat}/`);
}

export function ownersForPath(rules: CodeownerRule[], file: string): string[] {
  let owners: string[] = [];
  for (const rule of rules) {
    if (matches(rule.pattern, file)) owners = rule.owners;
  }
  return owners;
}
