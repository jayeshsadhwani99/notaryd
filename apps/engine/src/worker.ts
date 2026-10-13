import 'reflect-metadata';
import './instrument';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { QueueService } from './pipeline/queue.service';

async function bootstrap() {
  process.env.RUN_WORKER = 'true';
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  const queue = app.get(QueueService);
  await queue.start();
  if (!queue.ready) {
    Logger.error('Worker could not connect to Redis', 'worker');
    process.exit(1);
  }
  Logger.log('Worker running', 'worker');
}

void bootstrap();
