import { Injectable, OnModuleDestroy } from '@nestjs/common';
import postgres from 'postgres';
import { config } from '../config';

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly sql = postgres(config.databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  async ping(): Promise<void> {
    await this.sql`select 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
