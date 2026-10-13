import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './common/auth';
import { config } from './config';
import { DbService } from './db/db.service';
import { QueueService } from './pipeline/queue.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DbService,
    private readonly queue: QueueService,
  ) {}

  @Public()
  @Get()
  async health() {
    let db = 'down';
    try {
      await this.db.ping();
      db = 'up';
    } catch {
      db = 'down';
    }
    const body = {
      ok: db === 'up',
      db,
      redis: this.queue.ready ? 'up' : 'down',
      worker: config.runWorker,
      e2b: Boolean(config.e2bApiKey),
      openrouter: Boolean(config.openRouterKey),
      sentry: Boolean(config.sentryDsn),
      supabaseStorage: Boolean(config.supabaseUrl && config.supabaseServiceKey),
    };
    if (db !== 'up') throw new ServiceUnavailableException(body);
    return body;
  }
}
