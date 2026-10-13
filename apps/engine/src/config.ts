import path from 'path';

function value(name: string, devFallback: string): string {
  const set = process.env[name];
  if (set && set.length > 0) return set;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is required in production`);
  }
  return devFallback;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: value('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/notaryd'),
  redisUrl: value('REDIS_URL', 'redis://127.0.0.1:6379'),
  vaultKey: value('VAULT_KEY', 'dev-only-vault-key-change-me'),
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:3000',
  dataDir: path.resolve(process.cwd(), process.env.DATA_DIR || '.data'),
  e2bApiKey: process.env.E2B_API_KEY || '',
  openRouterKey: process.env.OPENROUTER_API_KEY || '',
  openRouterModel: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  sentryDsn: process.env.SENTRY_DSN || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  allowDataReset: process.env.NOTARYD_ALLOW_DATA_RESET === 'true',
  runWorker: process.env.RUN_WORKER !== 'false',
  workerRecover: process.env.WORKER_RECOVER !== 'false',
  isProd: process.env.NODE_ENV === 'production',
};

export const FROZEN_CLOCK = new Date('2026-06-15T15:00:00.000Z');
