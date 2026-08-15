import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { AuditEventHandler } from '../audit/audit-event.handler.js';
import { NotificationEventHandler } from '../notifications/notification-event.handler.js';
import { NotificationQueueService } from '../notifications/notification-queue.service.js';
import { MetricsService } from '../observability/metrics.service.js';
import type { DomainEvent } from './domain-event.js';
import {
  assertRabbitTopology,
  consumerDefinitions,
  DEAD_LETTER_EXCHANGE,
  RETRY_EXCHANGE,
  type ConsumerName,
} from './rabbit-topology.js';

const MAX_RETRIES = 3;

@Injectable()
export class RabbitConsumersService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RabbitConsumersService.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditEventHandler,
    private readonly notifications: NotificationEventHandler,
    private readonly notificationQueue: NotificationQueueService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.SKIP_EXTERNAL_CONNECTIONS === 'true') return;
    this.connection = await amqp.connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    this.channel = await this.connection.createConfirmChannel();
    await assertRabbitTopology(this.channel);
    await this.channel.prefetch(10);

    for (const [name, definition] of Object.entries(consumerDefinitions)) {
      await this.channel.consume(
        definition.queue,
        (message) => {
          if (message) void this.consume(name as ConsumerName, message);
        },
        { noAck: false },
      );
    }
    this.logger.log('RabbitMQ notification and audit consumers are active');
  }

  private async consume(consumer: ConsumerName, message: ConsumeMessage): Promise<void> {
    const channel = this.channel!;
    let event: DomainEvent | undefined;
    try {
      event = JSON.parse(message.content.toString('utf8')) as DomainEvent;
      if (!event.id || !event.type || !event.payload) throw new Error('Malformed domain event');

      if (consumer === 'audit') {
        await this.audit.handle(event);
      } else {
        const deliveryId = await this.notifications.handle(event);
        if (deliveryId) await this.notificationQueue.enqueue(deliveryId);
      }
      channel.ack(message);
    } catch (error) {
      const eventType = event?.type ?? 'unknown';
      this.metrics.messagingFailures.inc({ consumer, eventType });
      await this.retryOrDeadLetter(consumer, message, error);
    }
  }

  private async retryOrDeadLetter(
    consumer: ConsumerName,
    message: ConsumeMessage,
    error: unknown,
  ): Promise<void> {
    const channel = this.channel!;
    const previousAttempts = Number(message.properties.headers?.['x-retry-count'] ?? 0);
    const nextAttempt = previousAttempts + 1;
    const routingKey = message.fields.routingKey;
    try {
      if (nextAttempt <= MAX_RETRIES) {
        channel.publish(RETRY_EXCHANGE, routingKey, message.content, {
          ...message.properties,
          headers: { ...message.properties.headers, 'x-retry-count': nextAttempt },
          expiration: String(Math.min(30_000, 1_000 * 2 ** (nextAttempt - 1))),
          deliveryMode: 2,
        });
        await channel.waitForConfirms();
        channel.ack(message);
        this.logger.warn({ consumer, routingKey, nextAttempt, error }, 'Event scheduled for retry');
        return;
      }

      channel.publish(DEAD_LETTER_EXCHANGE, `${consumer}.${routingKey}`, message.content, {
        ...message.properties,
        headers: {
          ...message.properties.headers,
          'x-retry-count': nextAttempt,
          'x-final-error': error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        },
        deliveryMode: 2,
      });
      await channel.waitForConfirms();
      channel.ack(message);
      this.logger.error({ consumer, routingKey, error }, 'Event moved to dead-letter queue');
    } catch (publishError) {
      this.logger.error(
        { publishError, consumer, routingKey },
        'Retry publish failed; requeueing original event',
      );
      channel.nack(message, false, true);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
