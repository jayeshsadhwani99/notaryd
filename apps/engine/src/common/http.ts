import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal error';
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else if (body && typeof body === 'object' && 'message' in body) {
        const raw = (body as { message: string | string[] | object }).message;
        message = Array.isArray(raw) ? raw.join('; ') : typeof raw === 'string' ? raw : JSON.stringify(raw);
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }
    if (status >= 500) Sentry.captureException(exception);
    response.status(status).json({ error: message });
  }
}
