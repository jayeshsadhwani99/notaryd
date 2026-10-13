import { Logger } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import postgres from 'postgres';

function migrationsDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'supabase', 'migrations');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('Could not find supabase/migrations');
}

export async function migrate(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await sql.unsafe(`
      create table if not exists notaryd_schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `);
    const applied = await sql<{ id: string }[]>`select id from notaryd_schema_migrations`;
    const done = new Set(applied.map((row) => row.id));
    const files = readdirSync(migrationsDir())
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const body = readFileSync(path.join(migrationsDir(), file), 'utf8');
      await sql.unsafe(body);
      await sql`insert into notaryd_schema_migrations (id) values (${file})`;
      Logger.log(`Applied ${file}`, 'migrate');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/notaryd';
  migrate(url)
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
