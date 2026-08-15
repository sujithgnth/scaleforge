import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { type ChannelModel, type ConfirmChannel } from 'amqplib';
import { DomainEvent, routingKeyFor } from './domain-event.js';
import { assertRabbitTopology, EVENT_EXCHANGE } from './rabbit-topology.js';

@Injectable()
export class RabbitPublisherService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RabbitPublisherService.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private connecting?: Promise<void>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.SKIP_EXTERNAL_CONNECTIONS === 'true') return;
    try {
      await this.ensureConnected();
    } catch (error) {
      this.logger.warn({ error }, 'RabbitMQ is unavailable at startup; outbox delivery will retry');
    }
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.ensureConnected();
    const channel = this.channel!;
    channel.publish(EVENT_EXCHANGE, routingKeyFor(event.type), Buffer.from(JSON.stringify(event)), {
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      deliveryMode: 2,
      messageId: event.id,
      correlationId: event.correlationId,
      timestamp: Date.now(),
      type: event.type,
    });
    await channel.waitForConfirms();
  }

  async ping(): Promise<void> {
    await this.ensureConnected();
    await this.channel!.checkExchange(EVENT_EXCHANGE);
  }

  private async ensureConnected(): Promise<void> {
    if (this.channel) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const connection = await amqp.connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    const channel = await connection.createConfirmChannel();
    await assertRabbitTopology(channel);
    connection.on('close', () => {
      this.channel = undefined;
      this.connection = undefined;
      this.logger.warn('RabbitMQ connection closed');
    });
    connection.on('error', (error: Error) =>
      this.logger.error({ error }, 'RabbitMQ connection error'),
    );
    this.connection = connection;
    this.channel = channel;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
