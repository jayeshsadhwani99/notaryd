export type EnvKey = { key: string; source: string };

export function detectEnvKeys(files: { path: string; text: string }[]): EnvKey[] {
  const keys = new Map<string, string>();
  for (const file of files) {
    const path = file.path.replace(/\\/g, '/');
    if (path.endsWith('.env.example') || path.endsWith('.env.sample')) {
      for (const line of file.text.split('\n')) {
        const match = line.match(/^\s*([A-Z][A-Z0-9_]{1,})\s*=/);
        if (match) keys.set(match[1], path);
      }
    }
    for (const match of file.text.matchAll(/process\.env\.([A-Z][A-Z0-9_]{1,})/g)) {
      if (!keys.has(match[1])) keys.set(match[1], path);
    }
  }
  return [...keys.entries()]
    .map(([key, source]) => ({ key, source }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export type SeededAccount = { email: string; role?: string; source: string };

export function findSeededAccounts(files: { path: string; text: string }[]): SeededAccount[] {
  const found: SeededAccount[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (!/seed|fixture|factory/i.test(file.path)) continue;
    for (const match of file.text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
      const email = match[0].toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      const window = file.text.slice(Math.max(0, match.index - 100), (match.index ?? 0) + 100);
      const role = window.match(/\b(admin|member|viewer|owner)\b/i)?.[1]?.toLowerCase();
      found.push({ email, role, source: file.path });
    }
  }
  return found;
}
