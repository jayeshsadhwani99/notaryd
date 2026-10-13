import { Controller, Get, NotFoundException, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { DbService } from '../db/db.service';
import { EvidenceService } from './evidence.service';

@Controller('evidence')
export class EvidenceController {
  constructor(
    private readonly evidence: EvidenceService,
    private readonly db: DbService,
    private readonly access: AccessService,
  ) {}

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: Request & { user: AuthUser }, @Res() response: Response) {
    const rows = await this.db.sql<{ project_id: string }[]>`select project_id from evidence where id = ${id}`;
    if (!rows[0]) throw new NotFoundException('Evidence not found');
    await this.access.project(request.user, rows[0].project_id);
    const file = await this.evidence.read(id, rows[0].project_id);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Cache-Control', 'private, max-age=60');
    response.send(file.bytes);
  }
}
