import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { ExploreRunner } from './explore.runner';
import { ReviewRunner } from './review.runner';
import { VerifyRunner } from './verify.runner';

const KINDS = ['review', 'explore', 'verify'] as const;
type Kind = (typeof KINDS)[number];

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection: IORedis | null = null;
  private workers: Worker[] = [];
  private queues = new Map<Kind, Queue>();
  ready = false;
  private starting = false;

  constructor(
    private readonly db: DbService,
    private readonly review: ReviewRunner,
    private readonly explore: ExploreRunner,
    private readonly verify: VerifyRunner,
  ) {}

  async start(): Promise<void> {
    if (this.starting || this.ready) return;
    this.starting = true;
    const connection = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    try {
      await connection.connect();
      await connection.ping();
    } catch (error) {
      this.logger.error(`Redis is not reachable at ${config.redisUrl}`);
      connection.disconnect();
      this.starting = false;
      return;
    }
    this.connection = connection;
    for (const kind of KINDS) {
      this.queues.set(kind, new Queue(`notaryd-${kind}`, { connection }));
    }
    if (config.runWorker) {
      if (config.workerRecover) {
        await this.db.sql`
          update runs set status = 'failed', error = 'Worker restarted before the run finished', finished_at = now()
          where status = 'running'
        `.catch((error: unknown) => this.logger.warn(error instanceof Error ? error.message : 'recover failed'));
      }
      for (const kind of KINDS) {
        const worker = new Worker(
          `notaryd-${kind}`,
          async (job) => {
            const runId = String(job.data.runId);
            if (kind === 'review') await this.review.run(runId);
            if (kind === 'explore') await this.explore.run(runId);
            if (kind === 'verify') await this.verify.run(runId);
          },
          { connection, concurrency: kind === 'verify' ? 2 : 1, lockDuration: 120_000 },
        );
        worker.on('failed', (job, error) => this.logger.error(`${kind} ${job?.id ?? ''} ${error.message}`));
        this.workers.push(worker);
      }
    }
    this.ready = true;
    this.starting = false;
    this.logger.log(`Queue connected${config.runWorker ? ' with workers' : ''}`);
  }

  async enqueue(kind: Kind, runId: string): Promise<void> {
    if (!this.ready) await this.start();
    const queue = this.queues.get(kind);
    if (!this.ready || !queue) {
      throw new ServiceUnavailableException('Redis is not connected. Start it with pnpm docker:up.');
    }
    await queue.add(kind, { runId }, { attempts: 1, removeOnComplete: 200, removeOnFail: 200 });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.connection?.disconnect();
  }
}
