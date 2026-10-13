import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { analyzeDirectory, analyzeFiles } from '../src/analyze/analyze-directory';
import {
  buildDeletePlan,
  buildFlowsFromCode,
  decryptString,
  detectFrameworks,
  discoverRoutes,
  encryptString,
  nextFlowState,
  nodeStartCommand,
  parsePrismaSchema,
  redact,
  scoreConfidence,
  selectAffectedFlows,
  suggestAuthPlan,
  vaultKey,
} from '../src/domain';

const fixture = path.resolve(__dirname, '../../../fixtures/acme-checkout');

test('acme fixture review finds auth, routes, env keys, and a safe delete order', async () => {
  const analysis = await analyzeDirectory(fixture);
  assert.equal(analysis.auth.provider, 'next-auth');
  assert.ok(analysis.auth.loginMethods.includes('password'));
  assert.ok(analysis.auth.loginMethods.includes('google'));
  assert.deepEqual(analysis.auth.roles, ['admin', 'member', 'viewer']);
  assert.ok(analysis.routes.some((route) => route.url === '/checkout' && route.kind === 'page'));
  assert.ok(analysis.routes.some((route) => route.url === '/api/refunds' && route.methods.includes('POST')));
  assert.ok(analysis.envKeys.some((item) => item.key === 'STRIPE_SECRET_KEY'));
  const plan = buildDeletePlan(analysis.models);
  assert.ok(plan);
  assert.deepEqual(
    plan?.steps.map((step) => step.table),
    ['Refund', 'Order'],
  );
  const suggestion = suggestAuthPlan(analysis.auth, analysis.seededAccounts);
  const viewer = suggestion.suggestions.find((item) => item.role === 'viewer');
  assert.match(viewer?.why ?? '', /Viewer role/i);
  const controls = new Map(analysis.controlsByFile);
  const tables = new Map(analysis.tablesByFile);
  const flows = buildFlowsFromCode({ routes: analysis.routes, controlsByFile: controls, tablesByFile: tables });
  const checkout = flows.find((flow) => flow.slug === 'checkout');
  assert.ok(checkout);
  assert.equal(checkout?.name, 'Checkout');
  assert.ok(checkout?.steps.some((step) => step.action === 'click' && step.selector?.includes('Pay now')));
  const refunds = flows.find((flow) => flow.slug === 'api-refunds');
  assert.equal(refunds?.steps[0]?.action, 'request');
  assert.equal(refunds?.steps[0]?.value, 'POST');
  assert.equal(refunds?.steps[0]?.url, '/api/refunds');
  assert.equal(refunds?.steps.some((step) => step.action === 'goto'), false);
  assert.equal(analysis.framework, 'next');
  const admin = flows.find((flow) => flow.slug === 'admin');
  assert.ok(admin);
  assert.equal(
    admin?.steps.some((step) => /delete account/i.test(step.selector ?? '')),
    false,
  );
});

test('affected flows include uncertain links and skip untouched high-confidence flows', () => {
  const picked = selectAffectedFlows(
    ['app/checkout/page.tsx'],
    [
      { id: 'checkout', links: [{ file: 'app/checkout/page.tsx', confidence: 'high' }] },
      { id: 'admin', links: [{ file: 'app/admin/page.tsx', confidence: 'high' }] },
      { id: 'mystery', links: [] },
      { id: 'soft', links: [{ file: 'app/orders/page.tsx', confidence: 'low' }] },
    ],
  );
  assert.deepEqual(
    picked.map((item) => item.flowId),
    ['checkout', 'mystery', 'soft'],
  );
});

test('confidence and baseline state stay honest', () => {
  assert.equal(
    scoreConfidence({
      passed: true,
      healed: false,
      retried: false,
      assertionChecked: true,
      recent: ['passed', 'failed', 'passed'],
    }),
    'flaky',
  );
  assert.equal(
    scoreConfidence({
      passed: true,
      healed: false,
      retried: false,
      assertionChecked: true,
      recent: ['passed', 'passed', 'passed', 'passed', 'passed'],
    }),
    'high',
  );
  assert.deepEqual(nextFlowState({ approved: false, result: 'passed', confidence: 'medium' }), {
    status: 'unverified',
    confidence: 'medium',
  });
  assert.deepEqual(nextFlowState({ approved: true, result: 'failed', confidence: 'low' }), {
    status: 'failing',
    confidence: 'low',
  });
  assert.deepEqual(nextFlowState({ approved: true, result: 'blocked', confidence: 'high' }), {
    status: 'blocked',
    confidence: 'low',
  });
});

test('vault encryption round-trips and redaction hides secrets', () => {
  const key = vaultKey('dev-only-vault-key-change-me');
  const sealed = encryptString('sk_test_51_not_for_logs', key);
  assert.equal(decryptString(sealed, key), 'sk_test_51_not_for_logs');
  assert.equal(redact('using sk_test_51_not_for_logs now', ['sk_test_51_not_for_logs']), 'using •••• now');
  assert.equal(redact('short stays', ['abc']), 'short stays');
});

test('backend and pages-router sources become routes and request flows', () => {
  const files = [
    { path: 'pages/checkout.tsx', text: 'export default function Page() { return null }' },
    { path: 'pages/api/refunds.ts', text: "export default function handler(req) { if (req.method === 'POST') return null }" },
    {
      path: 'src/billing.controller.ts',
      text: "@Controller('billing')\nexport class BillingController {\n  @Get()\n  list() {}\n  @Post('refunds')\n  refund() {}\n}\n",
    },
    { path: 'src/server.ts', text: "app.get('/health', () => undefined)\nrouter.post('/refunds', () => undefined)\n" },
    { path: 'main.py', text: '@app.get("/health")\ndef health():\n    return {"ok": True}\n' },
    { path: 'main.go', text: 'r.GET("/ready", h)\n' },
    { path: 'app/urls.py', text: 'path("checkout/", views.checkout)\n' },
  ];
  const routes = discoverRoutes(files);
  assert.ok(routes.some((route) => route.url === '/checkout' && route.kind === 'page' && route.file === 'pages/checkout.tsx'));
  assert.ok(routes.some((route) => route.url === '/api/refunds' && route.methods.includes('POST')));
  assert.ok(routes.some((route) => route.url === '/billing' && route.methods.includes('GET')));
  assert.ok(routes.some((route) => route.url === '/billing/refunds' && route.methods.includes('POST')));
  assert.ok(routes.some((route) => route.url === '/health' && route.file === 'src/server.ts'));
  assert.ok(routes.some((route) => route.url === '/ready' && route.file === 'main.go'));
  assert.ok(routes.some((route) => route.url === '/checkout' && route.file === 'app/urls.py' && route.kind === 'handler'));
  const flows = buildFlowsFromCode({ routes, controlsByFile: new Map(), tablesByFile: new Map() });
  const billing = flows.find((flow) => flow.slug === 'billing');
  assert.equal(billing?.steps[0]?.action, 'request');
  assert.equal(billing?.steps[0]?.value, 'GET');
  assert.equal(flows.some((flow) => flow.steps.some((step) => step.action === 'goto' && step.url === '/billing')), false);
});

test('framework detection keeps the backend next to the frontend', () => {
  assert.deepEqual(
    detectFrameworks({ dependencies: ['next', 'react', '@nestjs/core', 'express'], files: [] }),
    ['next', 'nest', 'express'],
  );
  assert.deepEqual(
    detectFrameworks({ dependencies: [], files: [{ path: 'main.py', text: 'from fastapi import FastAPI' }] }),
    ['fastapi'],
  );
  const analysis = analyzeFiles([
    { path: 'package.json', text: JSON.stringify({ dependencies: { fastify: '4.0.0' } }) },
    { path: 'pnpm-lock.yaml', text: '' },
    { path: 'src/server.ts', text: "app.get('/health', () => undefined)\n" },
  ]);
  assert.equal(analysis.framework, 'fastify');
  assert.equal(analysis.packageManager, 'pnpm');
  assert.equal(analysis.routes.some((route) => route.url === '/health'), true);
  assert.equal(nodeStartCommand({ dependencies: { next: '15.0.0' }, scripts: { start: 'next start' } }).includes('next start'), true);
  assert.equal(nodeStartCommand({ dependencies: { express: '5.0.0' }, scripts: { start: 'node server.js' } }), 'npm start');
});

test('prisma parser reads the fixture schema', () => {
  const source = readFileSync(path.join(fixture, 'prisma/schema.prisma'), 'utf8');
  const parsed = parsePrismaSchema(source);
  assert.equal(parsed.enums[0]?.name, 'Role');
  assert.equal(parsed.models.find((model) => model.name === 'Order')?.fields.some((field) => field.name === 'userId'), true);
});
