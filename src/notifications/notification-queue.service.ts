import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { NotificationsRepository } from './notifications.repository.js';

const QUEUE_NAME = 'notification-delivery';

function redisConnection(urlValue: string): ConnectionOptions {
  const url = new URL(urlValue);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class NotificationQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationQueueService.name);
  private queue?: Queue<{ deliveryId: string }>;
  private worker?: Worker<{ deliveryId: string }>;

  constructor(
    private readonly config: ConfigService,
    private readonly notifications: NotificationsRepository,
  ) {}

  onModuleInit(): void {
    if (process.env.SKIP_EXTERNAL_CONNECTIONS === 'true') return;
    const connection = redisConnection(this.config.getOrThrow<string>('REDIS_URL'));
    this.queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: { removeOnComplete: 1_000, removeOnFail: 5_000 },
    });
    this.worker = new Worker(QUEUE_NAME, (job) => this.process(job), {
      connection,
      concurrency: 10,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error({ error, jobId: job?.id }, 'Notification delivery job failed');
    });
  }

  async enqueue(deliveryId: string): Promise<void> {
    if (!this.queue) throw new Error('Notification queue is not initialized');
    await this.queue.add(
      'deliver',
      { deliveryId },
      {
        jobId: deliveryId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
      },
    );
  }

  @Interval(30_000)
  async recoverPending(): Promise<void> {
    if (!this.queue) return;
    const pending = await this.notifications.findPending(100);
    for (const delivery of pending) await this.enqueue(delivery.id);
  }

  private async process(job: Job<{ deliveryId: string }>): Promise<void> {
    try {
      await this.notifications.deliver(job.data.deliveryId);
    } catch (error) {
      await this.notifications.markFailed(job.data.deliveryId, error);
      throw error;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
