import * as Sentry from '@sentry/nestjs';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { RequestContextService } from '../request-context/request-context.service.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly requestContext: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const status = this.statusOf(exception);
    const details = this.detailsOf(exception);
    const correlationId = this.requestContext.getCorrelationId();

    if (status >= 500) {
      this.logger.error(
        { exception, correlationId, path: request.url },
        'Unhandled request failure',
      );
      Sentry.captureException(exception, { tags: { correlationId: correlationId ?? 'unknown' } });
    } else {
      this.logger.warn({ status, correlationId, path: request.url, details }, 'Request rejected');
    }

    httpAdapter.reply(
      context.getResponse(),
      {
        error: {
          code: this.codeOf(exception, status),
          message: this.messageOf(exception, status),
          ...(details ? { details } : {}),
          correlationId,
          timestamp: new Date().toISOString(),
          path: request.url,
        },
      },
      status,
    );
  }

  private statusOf(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return HttpStatus.CONFLICT;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private codeOf(exception: unknown, status: number): string {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) return exception.code;
    return HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR';
  }

  private messageOf(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response && 'message' in response) {
        const message = (response as { message: unknown }).message;
        return Array.isArray(message) ? 'Request validation failed' : String(message);
      }
      return typeof response === 'string' ? response : 'Request failed';
    }
    if (status === 409) return 'A resource with the same unique value already exists';
    return 'An unexpected error occurred';
  }

  private detailsOf(exception: unknown): unknown {
    if (!(exception instanceof HttpException)) return undefined;
    const response = exception.getResponse();
    if (typeof response === 'object' && response && 'message' in response) {
      const message = (response as { message: unknown }).message;
      return Array.isArray(message) ? message : undefined;
    }
    return undefined;
  }
}
