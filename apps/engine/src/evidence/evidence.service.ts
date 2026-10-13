import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { DbService } from '../db/db.service';

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);
  private bucketReady = false;
  private client: SupabaseClient | null = null;

  constructor(private readonly db: DbService) {
    if (config.supabaseUrl && config.supabaseServiceKey) {
      this.client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  async put(input: {
    projectId: string;
    runId: string;
    flowId?: string | null;
    stepId?: string | null;
    kind: 'screenshot' | 'network' | 'console';
    bytes: Buffer;
    contentType: string;
    meta?: Record<string, unknown>;
  }): Promise<string> {
    const ext = input.contentType.includes('png') ? 'png' : input.contentType.includes('json') ? 'json' : 'bin';
    const idRow = await this.db.sql<{ id: string }[]>`select gen_random_uuid() as id`;
    const id = idRow[0].id;
    const storagePath = `${input.projectId}/${input.runId}/${id}.${ext}`;
    let storage: 'local' | 'supabase' = 'local';
    if (this.client && (await this.upload(storagePath, input.bytes, input.contentType))) {
      storage = 'supabase';
    } else {
      const full = path.join(config.dataDir, 'evidence', storagePath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, input.bytes);
    }
    await this.db.sql`
      insert into evidence (id, run_id, project_id, flow_id, step_id, kind, storage, storage_path, content_type, meta)
      values (
        ${id}, ${input.runId}, ${input.projectId}, ${input.flowId ?? null}, ${input.stepId ?? null},
        ${input.kind}, ${storage}, ${storagePath}, ${input.contentType}, ${this.db.sql.json((input.meta ?? {}) as never)}
      )
    `;
    return id;
  }

  async read(evidenceId: string, projectId: string): Promise<{ bytes: Buffer; contentType: string }> {
    const rows = await this.db.sql<{ storage: 'local' | 'supabase'; storage_path: string; content_type: string }[]>`
      select storage, storage_path, content_type from evidence
      where id = ${evidenceId} and project_id = ${projectId}
    `;
    const row = rows[0];
    if (!row) throw new NotFoundException('Evidence not found');
    if (row.storage === 'supabase' && this.client) {
      const downloaded = await this.client.storage.from('evidence').download(row.storage_path);
      if (downloaded.error || !downloaded.data) throw new NotFoundException('Evidence file missing');
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      return { bytes, contentType: row.content_type };
    }
    const bytes = await readFile(path.join(config.dataDir, 'evidence', row.storage_path));
    return { bytes, contentType: row.content_type };
  }

  private async upload(storagePath: string, bytes: Buffer, contentType: string): Promise<boolean> {
    if (!this.client) return false;
    if (!this.bucketReady) {
      const created = await this.client.storage.createBucket('evidence', { public: false });
      if (!created.error || /exists/i.test(created.error.message)) this.bucketReady = true;
    }
    const uploaded = await this.client.storage.from('evidence').upload(storagePath, bytes, {
      contentType,
      upsert: true,
    });
    if (uploaded.error) {
      this.logger.warn(`Supabase evidence upload failed: ${uploaded.error.message}`);
      return false;
    }
    return true;
  }
}
