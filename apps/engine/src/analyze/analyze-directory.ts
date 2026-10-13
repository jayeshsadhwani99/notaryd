import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import {
  detectAuth,
  detectEnvKeys,
  detectFrameworks,
  discoverRoutes,
  extractControls,
  findSeededAccounts,
  ownersForPath,
  parseCodeowners,
  parsePrismaSchema,
  tablesFromSource,
  type Control,
  type DiscoveredRoute,
} from '../domain';

const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.data', '__pycache__', '.venv', 'venv', 'vendor', 'target', '.turbo']);

export type RepoFile = { path: string; text: string };

export type RepoAnalysis = {
  framework: string;
  frameworks: string[];
  routes: DiscoveredRoute[];
  dependencies: string[];
  auth: ReturnType<typeof detectAuth>;
  envKeys: ReturnType<typeof detectEnvKeys>;
  seededAccounts: ReturnType<typeof findSeededAccounts>;
  models: ReturnType<typeof parsePrismaSchema>['models'];
  enums: ReturnType<typeof parsePrismaSchema>['enums'];
  codeowners: ReturnType<typeof parseCodeowners>;
  controlsByFile: [string, Control[]][];
  tablesByFile: [string, string[]][];
  hasSeedScript: boolean;
  packageManager: 'npm' | 'pnpm' | 'yarn';
  fileCount: number;
};

const LOCK = /(?:^|\/)(?:pnpm-lock\.yaml|yarn\.lock|package-lock\.json|go\.sum)$/;
const MANIFEST = /(?:^|\/)(?:package\.json|requirements\.txt|pyproject\.toml|go\.mod|Cargo\.toml|composer\.json|manage\.py)$/;
const SOURCE = /\.(tsx|jsx|ts|js|mjs|cjs|py|go)$/;

function keepFile(norm: string): boolean {
  if (LOCK.test(norm) || MANIFEST.test(norm)) return true;
  if (norm.endsWith('schema.prisma') || norm.endsWith('.env.example') || norm.endsWith('.env.sample')) return true;
  if (norm === 'CODEOWNERS' || norm.endsWith('/CODEOWNERS')) return true;
  if (/\.(test|spec)\.(tsx|jsx|ts|js|mjs|cjs)$/.test(norm)) return false;
  if (/seed|fixture/i.test(norm) && SOURCE.test(norm)) return true;
  return SOURCE.test(norm);
}

async function walk(dir: string, root: string, out: string[], depth: number): Promise<void> {
  if (depth > 16 || out.length > 8000) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, root, out, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(path.relative(root, full));
  }
}

export async function readRepoFiles(root: string): Promise<RepoFile[]> {
  const relative: string[] = [];
  await walk(root, root, relative, 0);
  const files: RepoFile[] = [];
  for (const file of relative) {
    const norm = file.split(path.sep).join('/');
    if (!keepFile(norm)) continue;
    if (LOCK.test(norm)) {
      files.push({ path: norm, text: '' });
      continue;
    }
    const full = path.join(root, file);
    const info = await stat(full);
    if (info.size > 500_000) continue;
    const text = await readFile(full, 'utf8');
    files.push({ path: norm, text });
  }
  return files;
}

export function analyzeFiles(files: RepoFile[]): RepoAnalysis {
  const packageJson = files
    .filter((file) => file.path === 'package.json' || file.path.endsWith('/package.json'))
    .sort((left, right) => left.path.length - right.path.length)[0];
  let dependencies: string[] = [];
  let hasSeedScript = false;
  if (packageJson) {
    const parsed = JSON.parse(packageJson.text) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      prisma?: { seed?: string };
      scripts?: Record<string, string>;
    };
    dependencies = [...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {})];
    hasSeedScript = Boolean(parsed.prisma?.seed || parsed.scripts?.seed);
  }
  const schemaFile = files.find((file) => file.path.endsWith('schema.prisma'));
  const schema = parsePrismaSchema(schemaFile?.text ?? '');
  const modelNames = schema.models.map((model) => model.name);
  const routes = discoverRoutes(files);
  const codeownerFile = files.find((file) => file.path === 'CODEOWNERS' || file.path.endsWith('/CODEOWNERS'));
  const codeowners = parseCodeowners(codeownerFile?.text ?? '');
  const controlsByFile: [string, Control[]][] = [];
  const tablesByFile: [string, string[]][] = [];
  for (const file of files) {
    if (/\.(tsx|jsx)$/.test(file.path)) controlsByFile.push([file.path, extractControls(file.text)]);
    const tables = tablesFromSource(file.text, modelNames);
    if (tables.length > 0) tablesByFile.push([file.path, tables]);
  }
  const fileText = files.map((file) => file.text).join('\n').slice(0, 2_000_000);
  const frameworks = detectFrameworks({ dependencies, files });
  const lock = files.some((file) => file.path.endsWith('pnpm-lock.yaml'))
    ? 'pnpm'
    : files.some((file) => file.path.endsWith('yarn.lock'))
      ? 'yarn'
      : 'npm';
  return {
    framework: frameworks.join(', '),
    frameworks,
    routes,
    dependencies,
    auth: detectAuth({ dependencies, fileText, models: schema.models, enums: schema.enums }),
    envKeys: detectEnvKeys(files),
    seededAccounts: findSeededAccounts(files),
    models: schema.models,
    enums: schema.enums,
    codeowners,
    controlsByFile,
    tablesByFile,
    hasSeedScript,
    packageManager: lock,
    fileCount: files.length,
  };
}

export async function analyzeDirectory(root: string): Promise<RepoAnalysis> {
  return analyzeFiles(await readRepoFiles(root));
}

export function ownersForAnalysis(analysis: RepoAnalysis, file: string): string[] {
  return ownersForPath(analysis.codeowners, file);
}
