# Notaryd

Notaryd reads a Next.js app, maps user flows to the code behind them, and re-verifies the flows a change touches. Every check lands in an append-only audit log with a screenshot of each step.

v1 is manual: you connect a project, approve the auth plan, explore, then verify from the dashboard. Pull-request triggers, the GitHub app, the CLI, and MCP come after this.

## Layout

- `apps/web` — Next.js dashboard
- `apps/engine` — NestJS API, BullMQ workers, Playwright, E2B, OpenRouter
- `supabase/migrations` — Postgres schema, including row-level security that keeps the Data API out
- `fixtures/acme-checkout` — a small Next.js + Prisma app you can point a project at

The dashboard talks only to the engine. The engine talks to Postgres with `DATABASE_URL`. Secrets are encrypted in the app before they are stored. The Supabase service role is used only for the private evidence bucket, and only when those env vars are set.

## Run it locally

```bash
pnpm docker:up
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm --filter @notaryd/engine exec playwright install chromium
pnpm dev
```

Dashboard: http://localhost:3000  
Engine: http://localhost:4000/health

Sign up, create a project, and set the local path to the absolute path of `fixtures/acme-checkout`. Run the code review. That path does not boot a server; it maps routes, the auth plan, env keys, and the clean-slate delete plan. Browser exploration needs a target URL or an E2B key.

## What needs a key

| Env | Used for |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres, or the local compose database |
| `REDIS_URL` | BullMQ |
| `VAULT_KEY` | AES-256-GCM for secrets and test-account credentials |
| `E2B_API_KEY` | Sandbox boot. Without it, use point-at-URL mode |
| `OPENROUTER_API_KEY` | Naming flows, a draft seed, repairing a broken step, explaining a failure |
| `SENTRY_DSN` | Engine and server monitoring. `NEXT_PUBLIC_SENTRY_DSN` is the browser DSN |
| `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` | Private `evidence` bucket. Otherwise screenshots stay in `DATA_DIR` |

`NOTARYD_ALLOW_DATA_RESET=true` is required before Notaryd will delete sandbox rows for a clean-slate account, and only after an admin approves the delete plan. Production is never wiped.

## Railway, when you want it

Do not deploy from this scaffold until the env vars above exist. Create a Railway project with two services and a Redis database. Point each service at its app directory (`apps/web`, `apps/engine`) so the Dockerfile there is the build. Set the engine `DATABASE_URL` to the Supabase connection string, not a Railway Postgres, unless you want to host the database there instead. The web service only needs `ENGINE_URL`.

Both processes bind `0.0.0.0` and read `PORT`.

## Out of scope here

GitHub checks, the CLI, MCP, daily cron, Vercel vault import, and connected Google accounts are in the product scope and not in this build. The audit log already has trigger values for `pr`, `cron`, and `agent` so those callers can append the same record later.
