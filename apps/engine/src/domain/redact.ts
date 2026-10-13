export function redact(text: string, secrets: string[]): string {
  const usable = secrets.filter((secret) => secret.trim().length >= 8);
  const unique = [...new Set(usable)].sort((a, b) => b.length - a.length);
  let output = text;
  for (const secret of unique) {
    output = output.split(secret).join('••••');
  }
  return output;
}

export function assertSafeIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

export function assertRepoUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Repo URL must be an http(s) git URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Repo URL must be http(s)');
  }
}

export function assertGitRef(ref: string, kind: 'branch' | 'commit'): void {
  if (kind === 'commit') {
    if (!/^[0-9a-f]{7,40}$/i.test(ref)) throw new Error('Commit must be a hex sha');
    return;
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(ref) || ref.includes('..') || ref.startsWith('-')) {
    throw new Error('Branch name contains unsupported characters');
  }
}
