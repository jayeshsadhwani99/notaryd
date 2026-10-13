-- Notaryd application schema.
-- The dashboard never queries this database. The Nest engine connects with
-- DATABASE_URL (the Postgres role, which bypasses RLS). RLS is enabled with
-- no policies so the Supabase Data API roles anon/authenticated cannot read
-- customer code metadata, vault rows, or evidence indexes.
-- Do not FORCE row level security: that would also block the engine role.

create extension if not exists pgcrypto;

create table if not exists notaryd_schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index users_email_lower on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_user_id on sessions (user_id);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index memberships_user_id on memberships (user_id);

create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  repo_url text,
  local_path text,
  app_path text not null default '',
  framework text not null default 'next',
  default_branch text not null default 'main',
  focus_prompt text,
  mode text not null check (mode in ('sandbox', 'url')),
  target_url text,
  status text not null default 'draft' check (status in ('draft', 'reviewing', 'ready', 'exploring', 'failed')),
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_org_id on projects (org_id);

create table environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null check (name in ('sandbox', 'staging', 'production')),
  read_only boolean not null default false,
  production_confirmed_at timestamptz,
  production_confirmed_by uuid references users (id),
  flag_pins jsonb not null default '{}'::jsonb,
  allow_hosts jsonb not null default '[]'::jsonb,
  unique (project_id, name)
);

create table secrets (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references environments (id) on delete cascade,
  key text not null,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  updated_by uuid references users (id),
  updated_at timestamptz not null default now(),
  unique (environment_id, key)
);

create table test_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  label text not null,
  role text not null,
  login_method text not null check (login_method in ('password', 'saved_session', 'logged_out')),
  data_mode text not null check (data_mode in ('clean_slate', 'persisted')),
  email text,
  credential_ciphertext text,
  credential_iv text,
  credential_tag text,
  created_at timestamptz not null default now(),
  unique (project_id, label)
);

create table auth_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  detected jsonb not null,
  suggestion jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'rejected', 'approved')),
  approved_by uuid references users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index auth_plans_project_id on auth_plans (project_id, created_at desc);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  run_id uuid,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

create index reviews_project_id on reviews (project_id, created_at desc);

create table delete_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  plan jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved')),
  approved_by uuid references users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table features (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  slug text not null,
  summary text,
  unique (project_id, slug)
);

create table flows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  feature_id uuid references features (id) on delete set null,
  name text not null,
  slug text not null,
  goal text,
  status text not null default 'unverified' check (status in ('unverified', 'verified', 'failing', 'flaky', 'blocked')),
  confidence text not null default 'low' check (confidence in ('high', 'medium', 'low', 'flaky')),
  version int not null default 1,
  blocked_reason text,
  last_result text,
  last_run_at timestamptz,
  recent_results jsonb not null default '[]'::jsonb,
  baseline_approved_by uuid references users (id),
  baseline_approved_at timestamptz,
  preconditions jsonb not null default '[]'::jsonb,
  owners jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

create index flows_project_id on flows (project_id);

create table flow_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows (id) on delete cascade,
  position int not null,
  action text not null,
  selector text,
  value text,
  url text,
  account_role text,
  assertion jsonb,
  route text,
  component text,
  handler text,
  tables jsonb not null default '[]'::jsonb,
  api_calls jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  link_confidence text not null default 'high' check (link_confidence in ('high', 'medium', 'low')),
  third_party boolean not null default false,
  notes text,
  unique (flow_id, position)
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  kind text not null check (kind in ('review', 'explore', 'verify')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  trigger text not null default 'manual' check (trigger in ('manual', 'pr', 'cron', 'agent')),
  branch text,
  commit_sha text,
  pr_number int,
  environment_name text not null default 'sandbox',
  snapshot_id uuid,
  focus_prompt text,
  flow_ids jsonb,
  affected_only boolean not null default false,
  started_by uuid references users (id),
  actor_label text,
  progress jsonb not null default '{}'::jsonb,
  summary text,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index runs_project_id on runs (project_id, created_at desc);

alter table reviews
  add constraint reviews_run_id_fkey foreign key (run_id) references runs (id) on delete set null;

create table run_flows (
  run_id uuid not null references runs (id) on delete cascade,
  flow_id uuid not null references flows (id) on delete cascade,
  result text check (result in ('passed', 'failed', 'blocked', 'skipped')),
  confidence text,
  blocked_reason text,
  healed boolean not null default false,
  explanation text,
  primary key (run_id, flow_id)
);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  flow_id uuid references flows (id) on delete set null,
  step_id uuid references flow_steps (id) on delete set null,
  kind text not null check (kind in ('screenshot', 'network', 'console')),
  storage text not null check (storage in ('local', 'supabase')),
  storage_path text not null,
  content_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index evidence_run_id on evidence (run_id);

create table blockers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  kind text not null,
  message text not null,
  page_url text,
  created_at timestamptz not null default now()
);

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  environment_name text not null,
  kind text not null,
  ref text not null,
  created_at timestamptz not null default now()
);

create table boot_recipes (
  project_id uuid primary key references projects (id) on delete cascade,
  steps jsonb not null default '[]'::jsonb,
  last_status text,
  last_error text,
  updated_at timestamptz not null default now()
);

create table artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  kind text not null,
  path text,
  body text not null,
  created_at timestamptz not null default now()
);

-- Append-only audit record. Application code never updates or deletes rows,
-- and the trigger rejects those statements even from the table owner.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  project_id uuid,
  action text not null,
  flow_id uuid,
  flow_version int,
  result text,
  confidence text,
  commit_sha text,
  pr_number int,
  trigger text,
  actor_user_id uuid,
  actor_label text,
  environment_name text,
  snapshot_id uuid,
  run_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_project_id on audit_log (project_id, created_at desc);

create or replace function notaryd_forbid_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update
  before update or delete on audit_log
  for each row execute function notaryd_forbid_audit_mutation();

-- Lock the Data API out. The engine uses the database owner role.
-- anon/authenticated exist on Supabase and not on a plain local Postgres.
do $$
declare
  tbl text;
  has_api_roles boolean;
begin
  select exists (select 1 from pg_roles where rolname = 'anon') into has_api_roles;
  foreach tbl in array array[
    'users', 'sessions', 'organizations', 'memberships', 'projects', 'environments',
    'secrets', 'test_accounts', 'auth_plans', 'reviews', 'delete_plans', 'features',
    'flows', 'flow_steps', 'runs', 'run_flows', 'evidence', 'blockers', 'snapshots',
    'boot_recipes', 'artifacts', 'audit_log'
  ]
  loop
    execute format('alter table %I enable row level security', tbl);
    if has_api_roles then
      execute format('revoke all on table %I from anon, authenticated', tbl);
    end if;
  end loop;
end $$;
