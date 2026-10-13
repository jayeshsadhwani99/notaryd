import type { Control } from './routes';
import type { DiscoveredRoute } from './routes';

export type DraftStep = {
  action: 'goto' | 'fill' | 'click' | 'assert_visible' | 'switch_account' | 'request';
  selector?: string;
  value?: string;
  url?: string;
  accountRole?: string;
  assertion?: { type: 'visible' | 'text' | 'url'; pattern?: string; selector?: string };
  route?: string;
  component?: string;
  handler?: string;
  tables: string[];
  files: string[];
  linkConfidence: 'high' | 'medium' | 'low';
  thirdParty: boolean;
  notes?: string;
};

export type DraftFlow = {
  feature: string;
  slug: string;
  name: string;
  goal: string;
  steps: DraftStep[];
};

const TITLES: Record<string, { name: string; goal: string }> = {
  checkout: { name: 'Checkout', goal: 'Pay for an order and reach a confirmation' },
  refund: { name: 'Request a refund', goal: 'Submit a refund and see it recorded' },
  refunds: { name: 'Request a refund', goal: 'Submit a refund and see it recorded' },
  login: { name: 'Sign in', goal: 'Sign in with a test account and leave the login screen' },
  admin: { name: 'Open admin', goal: 'An admin opens the admin area' },
  orders: { name: 'Review orders', goal: 'Open the order list' },
  signup: { name: 'Sign up', goal: 'Create an account and land in the app' },
  home: { name: 'Open the app', goal: 'Load the home page' },
};

function featureOf(url: string): string {
  const parts = url.split('/').filter(Boolean);
  if (parts[0] === 'api') return parts[1] || 'api';
  return parts[0] || 'home';
}

function titleCase(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function roleFor(url: string): string {
  if (url.includes('/admin')) return 'admin';
  if (url.includes('/login') || url.includes('/signup') || url === '/') return 'logged_out';
  return 'member';
}

const METHOD_ORDER = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];

function orderedMethods(methods: string[]): string[] {
  return [...new Set(methods.map((method) => method.toUpperCase()))].sort(
    (left, right) => METHOD_ORDER.indexOf(left) - METHOD_ORDER.indexOf(right),
  );
}

export function buildFlowsFromCode(input: {
  routes: DiscoveredRoute[];
  controlsByFile: Map<string, Control[]>;
  tablesByFile: Map<string, string[]>;
}): DraftFlow[] {
  const groups = new Map<string, DiscoveredRoute[]>();
  for (const route of input.routes) {
    const feature = featureOf(route.url);
    const list = groups.get(feature) ?? [];
    list.push(route);
    groups.set(feature, list);
  }
  const flows: DraftFlow[] = [];
  for (const [feature, routes] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const pages = routes.filter((route) => route.kind === 'page').sort((a, b) => a.url.length - b.url.length);
    const handlers = routes.filter((route) => route.kind === 'handler');
    const known = TITLES[feature];
    const name = known?.name ?? `Use ${titleCase(feature)}`;
    const goal = known?.goal ?? `Complete the ${titleCase(feature).toLowerCase()} goal and confirm the result`;
    if (pages.length === 0) continue;
    const primary = pages[0];
    const files = [...new Set(routes.map((route) => route.file))];
    const tables = [...new Set(files.flatMap((file) => input.tablesByFile.get(file) ?? []))];
    const handler = handlers[0];
    const steps: DraftStep[] = [];
    const accountRole = roleFor(primary.url);
    for (const page of pages) {
      steps.push({
        action: 'goto',
        url: page.url,
        accountRole: roleFor(page.url),
        route: page.url,
        component: page.file,
        handler: handler?.file,
        tables: input.tablesByFile.get(page.file) ?? tables,
        files,
        linkConfidence: page.dynamic ? 'medium' : 'high',
        thirdParty: false,
        notes: page.dynamic ? 'Dynamic segment. One sample of this pattern is enough.' : undefined,
      });
      const controls = input.controlsByFile.get(page.file) ?? [];
      for (const control of controls) {
        if (control.kind === 'fill') {
          steps.push({
            action: 'fill',
            selector: control.selector,
            value: '',
            accountRole: roleFor(page.url),
            route: page.url,
            component: page.file,
            tables: [],
            files: [page.file],
            linkConfidence: 'high',
            thirdParty: false,
          });
        } else if (!control.destructive) {
          steps.push({
            action: 'click',
            selector: control.selector,
            accountRole: roleFor(page.url),
            route: page.url,
            component: page.file,
            tables: [],
            files: [page.file],
            linkConfidence: 'high',
            thirdParty: false,
            notes: control.payment ? 'Payment control. Replay it only in the sandbox with test keys.' : undefined,
          });
        }
      }
    }
    const assertionTarget = [...steps].reverse().find((step) => step.selector)?.selector;
    steps.push({
      action: 'assert_visible',
      selector: assertionTarget,
      assertion: assertionTarget
        ? { type: 'visible', selector: assertionTarget }
        : { type: 'visible', selector: 'body' },
      accountRole,
      route: primary.url,
      tables: [],
      files,
      linkConfidence: assertionTarget ? 'high' : 'low',
      thirdParty: false,
      notes: assertionTarget ? undefined : 'No checkable control was found in source. Confidence stays low until a person edits the assertion.',
    });
    flows.push({ feature, slug: feature, name, goal, steps });
  }
  const used = new Set(flows.map((flow) => flow.slug));
  for (const route of input.routes.filter((item) => item.kind === 'handler')) {
    const flow = requestFlow(route, input.tablesByFile.get(route.file) ?? []);
    let slug = flow.slug;
    if (used.has(slug)) slug = slugify(`${route.methods[0] || 'call'}-${route.url}`) || `${flow.slug}-api`;
    used.add(slug);
    flows.push({ ...flow, slug });
  }
  return flows;
}

function requestFlow(route: DiscoveredRoute, tables: string[]): DraftFlow {
  const feature = featureOf(route.url);
  const known = TITLES[feature];
  const methods = orderedMethods(route.methods.length > 0 ? route.methods : ['GET']);
  const accountRole = route.url.includes('/admin') ? 'admin' : 'logged_out';
  const steps: DraftStep[] = methods.map((method) => ({
    action: 'request',
    url: route.url,
    value: method,
    accountRole,
    route: route.url,
    handler: route.file,
    tables,
    files: [route.file],
    linkConfidence: route.dynamic ? 'medium' : 'high',
    thirdParty: false,
    notes: route.dynamic
      ? `${method} ${route.url}. Dynamic segment. Replace the sample before replay.`
      : `${method} ${route.url}`,
  }));
  return {
    feature,
    slug: slugify(route.url),
    name: known ? `${known.name} API` : `${methods.join('/')} ${route.url}`,
    goal: known?.goal ?? `Call ${route.url} and receive a successful response`,
    steps,
  };
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || 'flow';
}
