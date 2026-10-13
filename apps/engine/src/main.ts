import 'reflect-metadata';
import './instrument';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http';
import { config } from './config';
import { migrate } from './db/migrate';
import { QueueService } from './pipeline/queue.service';

async function bootstrap() {
  try {
    await migrate(config.databaseUrl);
  } catch (error) {
    Logger.error(error instanceof Error ? error.message : 'Migration failed', 'bootstrap');
  }
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: '2mb' }));
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin.split(','), credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  const queue = app.get(QueueService);
  await queue.start();
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`Engine listening on 0.0.0.0:${config.port}`, 'bootstrap');
}

void bootstrap();
