import * as Sentry from '@sentry/nestjs';
import { config } from './config';

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV || 'development',
  });
}
