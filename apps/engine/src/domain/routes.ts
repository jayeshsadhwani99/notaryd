export type DiscoveredRoute = {
  url: string;
  kind: 'page' | 'handler';
  file: string;
  methods: string[];
  dynamic: boolean;
};

const SOURCE = /\.(tsx|jsx|ts|js|py|go)$/;
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function joinUrl(parts: string[]): string {
  const url = `/${parts.filter(Boolean).join('/')}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return url || '/';
}

function handlerMethods(text: string | undefined): string[] {
  if (!text) return ['GET'];
  const named = HTTP_METHODS.filter((method) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`).test(text),
  );
  const checked = [...text.matchAll(/\b(?:req|request)\.method\s*===?\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/g)].map(
    (match) => match[1],
  );
  const methods = [...new Set([...named, ...checked])];
  return methods.length > 0 ? methods : ['GET'];
}

function appRouterRoute(norm: string, text: string | undefined): DiscoveredRoute | null {
  const marker = norm.indexOf('/app/');
  const rel = marker >= 0 ? norm.slice(marker + 1) : norm.startsWith('app/') ? norm : null;
  if (!rel) return null;
  const isPage = /\/page\.(tsx|jsx|ts|js)$/.test(rel) || /^app\/page\.(tsx|jsx|ts|js)$/.test(rel);
  const isHandler = /\/route\.(tsx|jsx|ts|js)$/.test(rel);
  if (!isPage && !isHandler) return null;
  const dir = rel.replace(/\/(page|route)\.(tsx|jsx|ts|js)$/, '').replace(/^app\/?/, '');
  const segments = dir
    .split('/')
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));
  return {
    url: joinUrl(segments),
    kind: isPage ? 'page' : 'handler',
    file: norm,
    methods: isPage ? ['GET'] : handlerMethods(text),
    dynamic: segments.some((segment) => segment.includes('[')),
  };
}

function pagesRouterRoute(norm: string, text: string | undefined): DiscoveredRoute | null {
  const marker = norm.indexOf('/pages/');
  const rel = marker >= 0 ? norm.slice(marker + 1) : norm.startsWith('pages/') ? norm : null;
  if (!rel || !/\.(tsx|jsx|ts|js)$/.test(rel)) return null;
  const base = rel.replace(/^pages\//, '').replace(/\.(tsx|jsx|ts|js)$/, '');
  const fileName = base.split('/').pop() ?? '';
  if (fileName.startsWith('_') || base === 'api') return null;
  const isApi = base === 'api' || base.startsWith('api/');
  const segments = base.split('/').filter((segment) => segment && segment !== 'index');
  return {
    url: joinUrl(segments),
    kind: isApi ? 'handler' : 'page',
    file: norm,
    methods: isApi ? handlerMethods(text) : ['GET'],
    dynamic: segments.some((segment) => segment.startsWith('[') || segment.startsWith('...')),
  };
}

function nestRoutes(file: string, text: string): DiscoveredRoute[] {
  if (!/@Controller\(/.test(text)) return [];
  const routes: DiscoveredRoute[] = [];
  const blocks = text.split(/@Controller\(/).slice(1);
  for (const block of blocks) {
    const prefix = (block.match(/^\s*(?:['"`]([^'"`]*)['"`])?\s*\)/)?.[1] ?? '').replace(/^\//, '').replace(/\/$/, '');
    const body = block.split(/@Controller\(/)[0];
    for (const found of body.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g)) {
      const sub = (found[2] ?? '').replace(/^\//, '').replace(/\/$/, '');
      const segments = [...prefix.split('/'), ...sub.split('/')].filter(Boolean);
      routes.push({
        url: joinUrl(segments),
        kind: 'handler',
        file,
        methods: [found[1].toUpperCase()],
        dynamic: segments.some((segment) => segment.startsWith(':') || segment.includes('[')),
      });
    }
  }
  return routes;
}

function httpCallRoutes(file: string, text: string): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];
  const calls = text.matchAll(
    /@?\b(?:app|router|server|fastify)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]|\b(?:r|router|engine)\.(GET|POST|PUT|PATCH|DELETE)\(\s*['"`]([^'"`]+)['"`]/g,
  );
  for (const found of calls) {
    const method = found[1] || found[3];
    const path = found[2] || found[4];
    if (!method || !path) continue;
    const segments = path.split('/').filter(Boolean);
    routes.push({
      url: joinUrl(segments),
      kind: 'handler',
      file,
      methods: [method.toUpperCase()],
      dynamic: segments.some((segment) => segment.startsWith(':') || segment.startsWith('{') || segment.includes('[')),
    });
  }
  for (const found of text.matchAll(/@(?:app|bp)\.route\(\s*['"]([^'"]+)['"]([^)]*)\)/g)) {
    const methods = [...found[2].matchAll(/['"](GET|POST|PUT|PATCH|DELETE)['"]/g)].map((match) => match[1]);
    const segments = found[1].split('/').filter(Boolean);
    routes.push({
      url: joinUrl(segments),
      kind: 'handler',
      file,
      methods: methods.length > 0 ? methods : ['GET'],
      dynamic: segments.some((segment) => segment.startsWith('<') || segment.startsWith(':')),
    });
  }
  return routes;
}

function djangoRoutes(file: string, text: string): DiscoveredRoute[] {
  if (!file.endsWith('urls.py')) return [];
  const routes: DiscoveredRoute[] = [];
  for (const found of text.matchAll(/\b(?:path|re_path)\(\s*['"]([^'"]+)['"]/g)) {
    const segments = found[1].split('/').filter(Boolean);
    routes.push({
      url: joinUrl(segments),
      kind: 'handler',
      file,
      methods: ['GET'],
      dynamic: segments.some((segment) => segment.startsWith('<') || segment.includes('(?')),
    });
  }
  return routes;
}

function dedupe(routes: DiscoveredRoute[]): DiscoveredRoute[] {
  const seen = new Set<string>();
  const out: DiscoveredRoute[] = [];
  for (const route of routes) {
    const key = `${route.file}|${route.kind}|${route.url}|${route.methods.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(route);
  }
  return out;
}

export function discoverRoutes(files: { path: string; text?: string }[]): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];
  for (const file of files) {
    const norm = file.path.replace(/\\/g, '/');
    const app = appRouterRoute(norm, file.text);
    if (app) {
      routes.push(app);
      continue;
    }
    const pages = pagesRouterRoute(norm, file.text);
    if (pages) {
      routes.push(pages);
      continue;
    }
    if (!file.text || !SOURCE.test(norm)) continue;
    routes.push(...nestRoutes(norm, file.text));
    routes.push(...httpCallRoutes(norm, file.text));
    routes.push(...djangoRoutes(norm, file.text));
  }
  return dedupe(routes).sort((a, b) => a.url.localeCompare(b.url) || a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file));
}

export function isSourceFile(path: string): boolean {
  return SOURCE.test(path);
}

export type Control =
  | { kind: 'fill'; selector: string; label: string }
  | { kind: 'click'; selector: string; label: string; destructive: boolean; payment: boolean };

const DESTRUCTIVE = /\b(delete|destroy|unsubscribe|close account|cancel plan|remove account|wipe)\b/i;
const PAYMENT = /\b(pay|purchase|buy|charge|donate)\b/i;

export function extractControls(source: string): Control[] {
  const controls: Control[] = [];
  const inputs = source.matchAll(/<(input|textarea|select)\b([^>]*)>/gi);
  for (const found of inputs) {
    const attrs = found[2] ?? '';
    const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? 'text';
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].includes(type)) continue;
    const name = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!name && !id) continue;
    const selector = name ? `${found[1].toLowerCase()}[name="${name}"]` : `#${id}`;
    controls.push({ kind: 'fill', selector, label: name || id || 'field' });
  }
  const buttons = source.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi);
  for (const found of buttons) {
    const label = found[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!label) continue;
    controls.push({
      kind: 'click',
      selector: `button:has-text("${label.replace(/"/g, '\\"')}")`,
      label,
      destructive: DESTRUCTIVE.test(label),
      payment: PAYMENT.test(label),
    });
  }
  return controls;
}

export function tablesFromSource(source: string, modelNames: string[]): string[] {
  return modelNames.filter((name) => {
    const camel = name.charAt(0).toLowerCase() + name.slice(1);
    return new RegExp(`prisma\\.${camel}\\b`).test(source) || new RegExp(`prisma\\.${name}\\b`).test(source);
  });
}
