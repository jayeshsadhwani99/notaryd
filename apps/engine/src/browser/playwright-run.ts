import { FROZEN_CLOCK } from '../config';
import type { Browser, BrowserContext, Page } from 'playwright';

export type BrowserAccount = {
  label: string;
  role: string;
  loginMethod: 'password' | 'saved_session' | 'logged_out';
  email?: string | null;
  password?: string | null;
  storageState?: string | null;
};

export type NetCall = { method: string; url: string; status: number };

export type Visit = {
  url: string;
  finalUrl: string;
  title: string;
  accountRole: string;
  screenshot: Buffer;
  requests: NetCall[];
  consoleErrors: string[];
  blocked: string | null;
};

const LOGIN_PATH = /\/(login|signin|sign-in)\/?$/i;

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true });
}

async function prepare(context: BrowserContext, baseUrl: string, allowHosts: string[], blocked: string[]): Promise<Page> {
  const appHost = new URL(baseUrl).host;
  await context.route('**/*', async (route) => {
    const target = route.request().url();
    if (target.startsWith('data:') || target.startsWith('blob:')) {
      await route.continue();
      return;
    }
    let host = '';
    try {
      host = new URL(target).host;
    } catch {
      await route.abort();
      return;
    }
    const allowed = host === appHost || allowHosts.includes(host);
    if (!allowed) {
      blocked.push(target);
      await route.abort();
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  await page.clock.install({ time: FROZEN_CLOCK }).catch(() => undefined);
  return page;
}

async function shot(page: Page): Promise<Buffer> {
  await page
    .evaluate(() => {
      document.querySelectorAll('input[type="password"]').forEach((node) => {
        (node as HTMLElement).style.filter = 'blur(8px)';
      });
    })
    .catch(() => undefined);
  return page.screenshot({ type: 'png', timeout: 15_000 });
}

function isLogin(url: string): boolean {
  try {
    return LOGIN_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

async function signIn(page: Page, baseUrl: string, account: BrowserAccount): Promise<void> {
  if (account.loginMethod !== 'password') return;
  await page.goto(new URL('/login', baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const email = page.locator('input[type="email"], input[name="email"]').first();
  if ((await email.count()) === 0) throw new Error('Login page has no email field');
  await email.fill(account.email ?? '');
  await page.locator('input[type="password"]').first().fill(account.password ?? '');
  const submit = page.locator('button[type="submit"]').first();
  if ((await submit.count()) > 0) await submit.click();
  else await page.locator('button').first().click();
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
}

export async function explorePages(options: {
  browser: Browser;
  baseUrl: string;
  routes: { url: string; dynamic: boolean; accountRole: string }[];
  accounts: BrowserAccount[];
  allowHosts: string[];
  onVisit: (visit: Visit) => Promise<void>;
}): Promise<{ blockers: { kind: string; message: string; pageUrl?: string }[] }> {
  const blockers: { kind: string; message: string; pageUrl?: string }[] = [];
  const accounts = options.accounts.length > 0 ? options.accounts : [loggedOut()];
  let budget = 30;
  const dynamic = options.routes.filter((route) => route.dynamic);
  for (const route of dynamic) {
    blockers.push({
      kind: 'dynamic_route',
      message: `${route.url} is a pattern. Notaryd maps it once and does not walk every id.`,
      pageUrl: route.url,
    });
  }
  const pages = options.routes.filter((route) => !route.dynamic);
  const roles = [...new Set(pages.map((route) => route.accountRole))];
  for (const role of roles) {
    const account = accounts.find((item) => item.role === role) ?? accounts.find((item) => item.loginMethod === 'logged_out') ?? loggedOut();
    const blockedHosts: string[] = [];
    const context = await options.browser.newContext(
      account.storageState ? { storageState: JSON.parse(account.storageState) as never } : undefined,
    );
    const requests: NetCall[] = [];
    const consoleErrors: string[] = [];
    const page = await prepare(context, options.baseUrl, options.allowHosts, blockedHosts);
    page.on('response', (response) => {
      const url = response.url();
      if (url.startsWith(options.baseUrl)) {
        requests.push({ method: response.request().method(), url, status: response.status() });
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
    });
    try {
      if (account.loginMethod === 'password') {
        await signIn(page, options.baseUrl, account);
        if (isLogin(page.url())) {
          blockers.push({
            kind: 'login',
            message: `Could not sign in as ${account.label}. That branch is blocked until the account works.`,
            pageUrl: '/login',
          });
          continue;
        }
      }
      for (const route of pages.filter((item) => item.accountRole === role)) {
        if (budget <= 0) break;
        budget -= 1;
        const target = new URL(route.url, options.baseUrl).toString();
        try {
          await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        } catch (error) {
          blockers.push({
            kind: 'navigation',
            message: error instanceof Error ? error.message : 'Navigation failed',
            pageUrl: route.url,
          });
          continue;
        }
        const bodyText = await page.locator('body').innerText().catch(() => '');
        let blocked: string | null = null;
        if (isLogin(page.url()) && !isLogin(target)) {
          blocked = 'auth';
          blockers.push({
            kind: 'login',
            message: `${route.url} redirected to login for ${account.label}.`,
            pageUrl: route.url,
          });
        } else if (/captcha|verify you are human/i.test(bodyText)) {
          blocked = 'captcha';
          blockers.push({ kind: 'captcha', message: `CAPTCHA blocked ${route.url}.`, pageUrl: route.url });
        }
        const visit: Visit = {
          url: route.url,
          finalUrl: page.url(),
          title: await page.title().catch(() => ''),
          accountRole: role,
          screenshot: await shot(page),
          requests: requests.splice(0, requests.length),
          consoleErrors: consoleErrors.splice(0, consoleErrors.length),
          blocked,
        };
        await options.onVisit(visit);
      }
    } finally {
      if (blockedHosts.length > 0) {
        blockers.push({
          kind: 'blocked_host',
          message: `Blocked ${blockedHosts.length} outgoing request${blockedHosts.length === 1 ? '' : 's'}. Add hosts on the vault page if the app needs them.`,
        });
      }
      await context.close();
    }
  }
  return { blockers };
}

export async function probeHandlers(options: {
  browser: Browser;
  baseUrl: string;
  routes: { url: string; dynamic: boolean; methods: string[] }[];
  allowHosts: string[];
  onProbe: (hit: { url: string; status: number; body: string }) => Promise<void>;
}): Promise<{ blockers: { kind: string; message: string; pageUrl?: string }[] }> {
  const blockers: { kind: string; message: string; pageUrl?: string }[] = [];
  const targets = options.routes.filter((route) => !route.dynamic && route.methods.includes('GET')).slice(0, 20);
  if (targets.length === 0) return { blockers };
  const blockedHosts: string[] = [];
  const context = await options.browser.newContext();
  const page = await prepare(context, options.baseUrl, options.allowHosts, blockedHosts);
  try {
    for (const route of targets) {
      const target = new URL(route.url, options.baseUrl).toString();
      try {
        const response = await page.request.get(target, { timeout: 15_000 });
        const body = (await response.text()).slice(0, 4000);
        await options.onProbe({ url: route.url, status: response.status(), body });
        if (response.status() === 401 || response.status() === 403) {
          blockers.push({
            kind: 'login',
            message: `${route.url} returned HTTP ${response.status()}.`,
            pageUrl: route.url,
          });
        }
      } catch (error) {
        blockers.push({
          kind: 'navigation',
          message: error instanceof Error ? error.message : 'Request failed',
          pageUrl: route.url,
        });
      }
    }
  } finally {
    if (blockedHosts.length > 0) {
      blockers.push({
        kind: 'blocked_host',
        message: `Blocked ${blockedHosts.length} outgoing request${blockedHosts.length === 1 ? '' : 's'} while probing handlers.`,
      });
    }
    await context.close();
  }
  return { blockers };
}

export type ScriptStep = {
  id?: string;
  action: string;
  selector?: string | null;
  value?: string | null;
  url?: string | null;
  accountRole?: string | null;
  assertion?: { type?: string; selector?: string; pattern?: string } | null;
  notes?: string | null;
};

export type ReplayResult = {
  passed: boolean;
  blockedReason?: string;
  error?: string;
  failedStep?: number;
  healed: boolean;
  retried: boolean;
  assertionChecked: boolean;
  shots: { index: number; bytes: Buffer }[];
  requests: NetCall[];
  consoleErrors: string[];
  visibleText: string;
  healedSteps: ScriptStep[];
};

export async function replayFlow(options: {
  browser: Browser;
  baseUrl: string;
  steps: ScriptStep[];
  accounts: BrowserAccount[];
  allowHosts: string[];
  readOnly: boolean;
  repair?: (step: ScriptStep, error: string, visibleText: string) => Promise<string | null>;
}): Promise<ReplayResult> {
  const shots: ReplayResult['shots'] = [];
  const requests: NetCall[] = [];
  const consoleErrors: string[] = [];
  const healedSteps = options.steps.map((step) => ({ ...step }));
  const mutating = options.steps.some((step) => {
    if (step.action === 'click') return true;
    if (step.action !== 'request') return false;
    const method = (step.value || 'GET').toUpperCase();
    return method !== 'GET' && method !== 'HEAD';
  });
  if (options.readOnly && mutating) {
    return {
      passed: false,
      blockedReason: 'read-only environment',
      healed: false,
      retried: false,
      assertionChecked: false,
      shots,
      requests,
      consoleErrors,
      visibleText: '',
      healedSteps,
    };
  }
  const blockedHosts: string[] = [];
  const pages = new Map<string, Page>();
  const contexts: BrowserContext[] = [];
  let healed = false;
  let retried = false;
  let assertionChecked = false;
  let currentRole = options.steps.find((step) => step.accountRole)?.accountRole || 'logged_out';

  const pageFor = async (role: string): Promise<Page> => {
    const existing = pages.get(role);
    if (existing) return existing;
    const account = options.accounts.find((item) => item.role === role) ?? loggedOut();
    const context = await options.browser.newContext(
      account.storageState ? { storageState: JSON.parse(account.storageState) as never } : undefined,
    );
    contexts.push(context);
    const page = await prepare(context, options.baseUrl, options.allowHosts, blockedHosts);
    page.on('response', (response) => {
      if (response.url().startsWith(options.baseUrl)) {
        requests.push({ method: response.request().method(), url: response.url(), status: response.status() });
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
    });
    if (account.loginMethod === 'password') await signIn(page, options.baseUrl, account);
    pages.set(role, page);
    return page;
  };

  try {
    let page = await pageFor(currentRole);
    for (let index = 0; index < healedSteps.length; index += 1) {
      const step = healedSteps[index];
      if (step.accountRole && step.accountRole !== currentRole) {
        currentRole = step.accountRole;
        page = await pageFor(currentRole);
      }
      const runStep = async () => {
        if (step.action === 'goto') {
          await page.goto(new URL(step.url || '/', options.baseUrl).toString(), {
            waitUntil: 'domcontentloaded',
            timeout: 20_000,
          });
        } else if (step.action === 'fill' && step.selector) {
          await page.locator(step.selector).fill(step.value ?? '', { timeout: 8_000 });
        } else if (step.action === 'click' && step.selector) {
          await page.locator(step.selector).click({ timeout: 8_000 });
        } else if (step.action === 'switch_account' && step.accountRole) {
          page = await pageFor(step.accountRole);
        } else if (step.action === 'request') {
          const method = (step.value || 'GET').toUpperCase();
          const response = await page.request.fetch(new URL(step.url || '/', options.baseUrl).toString(), {
            method,
            timeout: 20_000,
          });
          if (response.status() >= 400) throw new Error(`HTTP ${response.status()} for ${method} ${step.url || '/'}`);
          assertionChecked = true;
        } else if (step.action === 'assert_visible' || step.assertion) {
          const selector = step.assertion?.selector || step.selector || 'body';
          await page.locator(selector).first().waitFor({ state: 'visible', timeout: 8_000 });
          assertionChecked = selector !== 'body';
        }
      };
      try {
        await runStep();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'step failed';
        const visibleText = await page.locator('body').innerText().catch(() => '');
        if (isLogin(page.url()) && step.action !== 'goto') {
          return finish(false, 'auth', message, index, visibleText);
        }
        if (/captcha|verify you are human/i.test(visibleText)) {
          return finish(false, 'captcha', message, index, visibleText);
        }
        const repaired = options.repair ? await options.repair(step, message, visibleText.slice(0, 2000)) : null;
        if (repaired && step.selector) {
          healedSteps[index] = { ...step, selector: repaired };
          retried = true;
          healed = true;
          try {
            await runStep();
          } catch (retryError) {
            return finish(false, undefined, retryError instanceof Error ? retryError.message : message, index, visibleText);
          }
        } else {
          return finish(false, undefined, message, index, visibleText);
        }
      }
      shots.push({ index, bytes: await shot(page) });
    }
    const visibleText = await page.locator('body').innerText().catch(() => '');
    return finish(true, undefined, undefined, undefined, visibleText);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }

  function finish(
    passed: boolean,
    blockedReason: string | undefined,
    error: string | undefined,
    failedStep: number | undefined,
    visibleText: string,
  ): ReplayResult {
    return {
      passed,
      blockedReason,
      error,
      failedStep,
      healed,
      retried,
      assertionChecked,
      shots,
      requests,
      consoleErrors,
      visibleText,
      healedSteps,
    };
  }
}

function loggedOut(): BrowserAccount {
  return { label: 'logged-out', role: 'logged_out', loginMethod: 'logged_out' };
}
