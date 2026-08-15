import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service.js';

const CORRELATION_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.header(CORRELATION_HEADER);
    const correlationId = supplied && supplied.length <= 100 ? supplied : randomUUID();
    response.setHeader(CORRELATION_HEADER, correlationId);
    this.context.run({ correlationId }, next);
  }
}
