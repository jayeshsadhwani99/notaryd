import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type postgres from 'postgres';
import { randomToken, sha256, slugify } from '../domain';
import { DbService } from '../db/db.service';
import type { AuthUser } from '../common/auth';

const SESSION_DAYS = 14;

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService) {}

  async signup(input: { email: string; password: string; name: string; orgName: string }): Promise<{ user: AuthUser; token: string }> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.db.sql<{ id: string }[]>`select id from users where lower(email) = ${email}`;
    if (existing.length > 0) throw new ConflictException('An account with that email already exists');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const baseSlug = slugify(input.orgName);
    return this.db.sql.begin(async (tx) => {
      const users = await tx<{ id: string; email: string; name: string }[]>`
        insert into users (email, name, password_hash)
        values (${email}, ${input.name.trim()}, ${passwordHash})
        returning id, email, name
      `;
      const user = users[0];
      const orgs = await tx<{ id: string; name: string }[]>`
        insert into organizations (name, slug)
        values (${input.orgName.trim()}, ${`${baseSlug}-${user.id.slice(0, 8)}`})
        returning id, name
      `;
      await tx`
        insert into memberships (org_id, user_id, role)
        values (${orgs[0].id}, ${user.id}, 'admin')
      `;
      const token = await insertSession(tx, user.id);
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          orgId: orgs[0].id,
          orgName: orgs[0].name,
          role: 'admin' as const,
        },
      };
    });
  }

  async login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const rows = await this.db.sql<{ id: string; email: string; name: string; password_hash: string }[]>`
      select id, email, name, password_hash from users where lower(email) = ${email.trim().toLowerCase()}
    `;
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const membership = await this.db.sql<{ org_id: string; role: 'admin' | 'member'; org_name: string }[]>`
      select m.org_id, m.role, o.name as org_name
      from memberships m
      join organizations o on o.id = m.org_id
      where m.user_id = ${user.id}
      order by m.created_at asc
      limit 1
    `;
    if (!membership[0]) throw new UnauthorizedException('Invalid email or password');
    const token = await insertSession(this.db.sql, user.id);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        orgId: membership[0].org_id,
        orgName: membership[0].org_name,
        role: membership[0].role,
      },
    };
  }

  async logout(token: string | null): Promise<void> {
    if (!token) return;
    await this.db.sql`delete from sessions where token_hash = ${sha256(token)}`;
  }

  async userFromToken(token: string): Promise<AuthUser | null> {
    const rows = await this.db.sql<AuthUser[]>`
      select u.id, u.email, u.name, m.org_id as "orgId", o.name as "orgName", m.role
      from sessions s
      join users u on u.id = s.user_id
      join memberships m on m.user_id = u.id
      join organizations o on o.id = m.org_id
      where s.token_hash = ${sha256(token)} and s.expires_at > now()
      order by m.created_at asc
      limit 1
    `;
    return rows[0] ?? null;
  }
}

async function insertSession(sql: postgres.Sql | postgres.TransactionSql, userId: string): Promise<string> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql`
    insert into sessions (user_id, token_hash, expires_at)
    values (${userId}, ${sha256(token)}, ${expires})
  `;
  return token;
}
