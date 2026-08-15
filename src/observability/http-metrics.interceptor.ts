import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, finalize } from 'rxjs';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const started = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const seconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
        const matchedRoute = request.route as { path?: string } | undefined;
        const route = matchedRoute?.path ? `${request.baseUrl}${matchedRoute.path}` : 'unmatched';
        const labels = { method: request.method, route, status: String(response.statusCode) };
        this.metrics.requestsTotal.inc(labels);
        this.metrics.requestDuration.observe(labels, seconds);
      }),
    );
  }
}
