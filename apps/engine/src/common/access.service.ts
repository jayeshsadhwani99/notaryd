import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import type { AuthUser } from './auth';

export type ProjectAccess = {
  id: string;
  org_id: string;
  name: string;
  repo_url: string | null;
  local_path: string | null;
  app_path: string;
  framework: string;
  default_branch: string;
  focus_prompt: string | null;
  mode: 'sandbox' | 'url';
  target_url: string | null;
  status: string;
  created_by: string;
  icon: string;
  role: 'admin' | 'member';
};

@Injectable()
export class AccessService {
  constructor(private readonly db: DbService) {}

  async project(user: AuthUser, projectId: string, admin = false): Promise<ProjectAccess> {
    const rows = await this.db.sql<ProjectAccess[]>`
      select p.id, p.org_id, p.name, p.repo_url, p.local_path, p.app_path, p.framework,
             p.default_branch, p.focus_prompt, p.mode, p.target_url, p.status, p.created_by, p.icon,
             m.role
      from projects p
      join memberships m on m.org_id = p.org_id
      where p.id = ${projectId} and m.user_id = ${user.id}
    `;
    const project = rows[0];
    if (!project) throw new NotFoundException('Project not found');
    if (admin && project.role !== 'admin') throw new ForbiddenException('Project admins only');
    return project;
  }
}
