import { execFile } from 'child_process';
import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { config } from '../config';
import { assertGitRef, assertRepoUrl } from '../domain';

const exec = promisify(execFile);

export async function runCommand(command: string, args: string[], cwd?: string, timeout = 180_000): Promise<string> {
  const { stdout } = await exec(command, args, { cwd, timeout, maxBuffer: 10_000_000 });
  return stdout.toString();
}

export type SourceProject = {
  id: string;
  repo_url: string | null;
  local_path: string | null;
  default_branch: string;
  app_path: string;
};

export async function resolveSource(project: SourceProject): Promise<{ root: string; writable: boolean }> {
  if (project.local_path) {
    const resolved = path.resolve(project.local_path);
    const info = await stat(resolved).catch(() => null);
    if (!info?.isDirectory()) throw new Error(`Local path does not exist: ${resolved}`);
    return { root: resolved, writable: false };
  }
  if (!project.repo_url) throw new Error('Add a repo URL or a local path before running this');
  assertRepoUrl(project.repo_url);
  assertGitRef(project.default_branch || 'main', 'branch');
  const dest = path.join(config.dataDir, 'work', project.id, 'repo');
  const cloned = await stat(path.join(dest, '.git'))
    .then(() => true)
    .catch(() => false);
  if (!cloned) {
    await mkdir(path.dirname(dest), { recursive: true });
    try {
      await runCommand('git', ['clone', '--depth', '1', '--branch', project.default_branch || 'main', project.repo_url, dest]);
    } catch {
      await runCommand('git', ['clone', '--depth', '1', project.repo_url, dest]);
    }
  }
  return { root: dest, writable: true };
}

export async function changedFiles(root: string, base: string, target: string): Promise<string[]> {
  assertGitRef(base, 'branch');
  if (/^[0-9a-f]{7,40}$/i.test(target)) assertGitRef(target, 'commit');
  else assertGitRef(target, 'branch');
  try {
    const out = await runCommand('git', ['diff', '--name-only', `${base}...${target}`], root);
    return out.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    const out = await runCommand('git', ['diff', '--name-only', base, target], root);
    return out.split('\n').map((line) => line.trim()).filter(Boolean);
  }
}

export async function recentAuthors(root: string, file: string): Promise<string[]> {
  try {
    const out = await runCommand('git', ['log', '-5', '--format=%an', '--', file], root, 20_000);
    return [...new Set(out.split('\n').map((line) => line.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}
