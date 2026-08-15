import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { JsonValue } from '../generated/prisma/internal/prismaNamespace.js';
import { PrismaService } from '../database/prisma.service.js';
import { MetricsService } from '../observability/metrics.service.js';
import type { DomainEvent } from './domain-event.js';
import { RabbitPublisherService } from './rabbit-publisher.service.js';

interface LeasedOutboxEvent {
  id: string;
  type: DomainEvent['type'];
  aggregateType: string;
  aggregateId: string;
  payload: JsonValue;
  correlationId: string | null;
  attempts: number;
  createdAt: Date;
}

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly instanceId = `${process.pid}-${randomUUID()}`;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitPublisherService,
    private readonly metrics: MetricsService,
  ) {}

  @Interval(1_000)
  async publishBatch(): Promise<void> {
    if (this.running || process.env.SKIP_EXTERNAL_CONNECTIONS === 'true') return;
    this.running = true;
    try {
      const events = await this.lease(25);
      for (const record of events) await this.publishOne(record);
    } catch (error) {
      this.logger.error({ error }, 'Outbox polling failed');
    } finally {
      this.running = false;
    }
  }

  private lease(limit: number): Promise<LeasedOutboxEvent[]> {
    return this.prisma.$queryRaw<LeasedOutboxEvent[]>`
      WITH picked AS (
        SELECT id
        FROM outbox_events
        WHERE published_at IS NULL
          AND next_attempt_at <= NOW()
          AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '30 seconds')
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE outbox_events AS event
      SET locked_at = NOW(), locked_by = ${this.instanceId}
      FROM picked
      WHERE event.id = picked.id
      RETURNING event.id, event.type,
        event.aggregate_type AS "aggregateType",
        event.aggregate_id AS "aggregateId",
        event.payload,
        event.correlation_id AS "correlationId",
        event.attempts,
        event.created_at AS "createdAt"
    `;
  }

  private async publishOne(record: LeasedOutboxEvent): Promise<void> {
    try {
      await this.rabbit.publish({
        id: record.id,
        type: record.type,
        occurredAt: record.createdAt.toISOString(),
        aggregateType: record.aggregateType,
        aggregateId: record.aggregateId,
        ...(record.correlationId ? { correlationId: record.correlationId } : {}),
        payload: record.payload as Record<string, unknown>,
      });
      await this.prisma.outboxEvent.updateMany({
        where: { id: record.id, lockedBy: this.instanceId },
        data: { publishedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
      });
      this.metrics.outboxPublished.inc({ type: record.type });
    } catch (error) {
      const attempts = record.attempts + 1;
      const delaySeconds = Math.min(60, 2 ** Math.min(attempts, 6));
      await this.prisma.outboxEvent.updateMany({
        where: { id: record.id, lockedBy: this.instanceId },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
          lockedAt: null,
          lockedBy: null,
          lastError:
            error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown publish error',
        },
      });
      this.logger.warn({ error, eventId: record.id, attempts }, 'Outbox publish deferred');
    }
  }
}
