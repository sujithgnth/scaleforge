import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly requestsTotal: Counter<'method' | 'route' | 'status'>;
  readonly requestDuration: Histogram<'method' | 'route' | 'status'>;
  readonly outboxPublished: Counter<'type'>;
  readonly messagingFailures: Counter<'consumer' | 'eventType'>;

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'scaleforge_' });
    this.requestsTotal = new Counter({
      name: 'scaleforge_http_requests_total',
      help: 'HTTP requests completed by method, route, and status.',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    this.requestDuration = new Histogram({
      name: 'scaleforge_http_request_duration_seconds',
      help: 'HTTP request latency in seconds.',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    this.outboxPublished = new Counter({
      name: 'scaleforge_outbox_published_total',
      help: 'Outbox events published successfully.',
      labelNames: ['type'],
      registers: [this.registry],
    });
    this.messagingFailures = new Counter({
      name: 'scaleforge_messaging_failures_total',
      help: 'RabbitMQ consumer failures before retry or dead-lettering.',
      labelNames: ['consumer', 'eventType'],
      registers: [this.registry],
    });
  }

  contentType(): string {
    return this.registry.contentType;
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
