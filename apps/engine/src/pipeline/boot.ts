import { execFile } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { promisify } from 'util';
import { config } from '../config';
import { assertRepoUrl, nodeStartCommand, type PackageShape } from '../domain';

const exec = promisify(execFile);

export type BootStep = { name: string; status: 'ok' | 'failed'; detail?: string };

export type BootResult = {
  baseUrl?: string;
  sandboxId?: string;
  steps: BootStep[];
  error?: string;
  cleanup: () => Promise<void>;
};

type SandboxHandle = {
  sandboxId: string;
  commands: {
    run: (
      command: string,
      opts?: { cwd?: string; timeoutMs?: number; envs?: Record<string, string>; background?: boolean },
    ) => Promise<{ stdout?: string; stderr?: string; exitCode?: number }>;
  };
  files: { write: (file: string, data: string | Uint8Array) => Promise<unknown> };
  getHost: (port: number) => string;
  kill: () => Promise<void>;
};

const APP_DIR = '/home/user/app';

export async function bootTarget(input: {
  mode: 'sandbox' | 'url';
  targetUrl?: string | null;
  repoUrl?: string | null;
  localPath?: string | null;
  branch: string;
  secrets: Record<string, string>;
  hasPrisma: boolean;
  hasSeedScript: boolean;
}): Promise<BootResult> {
  if (input.mode === 'url') {
    if (!input.targetUrl) {
      return { steps: [], error: 'Point-at-URL mode needs a target URL', cleanup: async () => undefined };
    }
    return { baseUrl: input.targetUrl, steps: [{ name: 'use target URL', status: 'ok' }], cleanup: async () => undefined };
  }
  if (!config.e2bApiKey) {
    return {
      steps: [{ name: 'create sandbox', status: 'failed', detail: 'E2B_API_KEY is not set' }],
      error: 'Sandbox boot needs an E2B API key. Add one, or switch this project to point-at-URL mode.',
      cleanup: async () => undefined,
    };
  }
  const steps: BootStep[] = [];
  let sandbox: SandboxHandle | null = null;
  const cleanup = async () => {
    if (sandbox) await sandbox.kill().catch(() => undefined);
  };
  const record = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      steps.push({ name, status: 'ok' });
    } catch (error) {
      const detail = (error instanceof Error ? error.message : 'failed').slice(0, 1500);
      steps.push({ name, status: 'failed', detail });
      throw new Error(`${name}: ${detail}`);
    }
  };
  try {
    await record('create sandbox', async () => {
      const { Sandbox } = await import('e2b');
      sandbox = (await Sandbox.create({
        timeoutMs: 60 * 60 * 1000,
        apiKey: config.e2bApiKey,
      })) as unknown as SandboxHandle;
    });
    const box = sandbox as SandboxHandle | null;
    if (!box) throw new Error('create sandbox: sandbox was not created');
    await record('load source', async () => {
      if (input.repoUrl) {
        assertRepoUrl(input.repoUrl);
        await box.commands.run(`git clone --depth 1 --branch ${shellArg(input.branch)} ${shellArg(input.repoUrl)} ${APP_DIR}`, {
          timeoutMs: 180_000,
        });
        return;
      }
      if (!input.localPath) throw new Error('No repo URL or local path');
      const archive = await packDirectory(input.localPath);
      await box.files.write('/tmp/app.tgz', archive);
      await box.commands.run(`mkdir -p ${APP_DIR} && tar -xzf /tmp/app.tgz -C ${APP_DIR}`, { timeoutMs: 120_000 });
    });
    await record('write env', async () => {
      const body = Object.entries(input.secrets)
        .map(([key, val]) => dotenvLine(key, val))
        .join('\n');
      await box.files.write(`${APP_DIR}/.env`, body);
    });
    let pkg: PackageShape = {};
    await record('read package', async () => {
      pkg = await readPackage(box);
    });
    await record('install dependencies', async () => {
      await box.commands.run('npm install', { cwd: APP_DIR, timeoutMs: 8 * 60 * 1000, envs: input.secrets });
    });
    const runtimeEnv = { ...input.secrets, PORT: '3000', HOST: '0.0.0.0' };
    const prismaHere = input.hasPrisma || (await commandOut(box, 'test -f prisma/schema.prisma && echo yes || echo no')).includes('yes');
    if (prismaHere) {
      await record('prepare database', async () => {
        await box.commands.run('npx prisma generate && (npx prisma migrate deploy || npx prisma db push)', {
          cwd: APP_DIR,
          timeoutMs: 180_000,
          envs: runtimeEnv,
        });
      });
    }
    if (input.hasSeedScript) {
      const seedCommand = pkg.scripts?.seed ? 'npm run seed' : 'npx prisma db seed';
      await record('seed', async () => {
        await box.commands.run(seedCommand, { cwd: APP_DIR, timeoutMs: 180_000, envs: runtimeEnv });
      });
    }
    await record('start app', async () => {
      await box.commands.run(nodeStartCommand(pkg), {
        cwd: APP_DIR,
        timeoutMs: 0,
        background: true,
        envs: runtimeEnv,
      });
    });
    let baseUrl = '';
    await record('wait for http', async () => {
      const host = box.getHost(3000);
      baseUrl = `https://${host}`;
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          const response = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
          if (response.status < 500) {
            ready = true;
            break;
          }
        } catch {
          ready = false;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (!ready) throw new Error(`App did not respond at ${baseUrl}`);
    });
    return { baseUrl, sandboxId: box.sandboxId, steps, cleanup };
  } catch (error) {
    return {
      steps,
      sandboxId: (sandbox as SandboxHandle | null)?.sandboxId,
      error: error instanceof Error ? error.message : 'Boot failed',
      cleanup,
    };
  }
}

async function commandOut(box: SandboxHandle, command: string): Promise<string> {
  const result = await box.commands.run(command, { cwd: APP_DIR, timeoutMs: 20_000 });
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

async function readPackage(box: SandboxHandle): Promise<PackageShape> {
  const raw = await commandOut(box, 'cat package.json');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Sandbox boot runs Node apps. This repo has no package.json.');
  return JSON.parse(raw.slice(start, end + 1)) as PackageShape;
}

function shellArg(value: string): string {
  if (!/^[A-Za-z0-9._:/@+-]+$/.test(value)) throw new Error('Refusing to interpolate an unsafe shell value');
  return value;
}

function dotenvLine(key: string, value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error('Unsafe env key');
  return `${key}=${JSON.stringify(value)}`;
}

async function packDirectory(root: string): Promise<Uint8Array> {
  const dir = await mkdtemp(path.join(tmpdir(), 'notaryd-'));
  const archive = path.join(dir, 'app.tgz');
  try {
    await exec('tar', ['-czf', archive, '--exclude', 'node_modules', '--exclude', '.git', '--exclude', '.next', '-C', root, '.'], {
      timeout: 120_000,
    });
    return new Uint8Array(await readFile(archive));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
