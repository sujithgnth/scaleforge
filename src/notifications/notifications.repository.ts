import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../queue/domain-event.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const CONSUMER = 'notification';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async processOrderCreated(event: DomainEvent): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.processedMessage.findUnique({
        where: { consumer_eventId: { consumer: CONSUMER, eventId: event.id } },
      });
      if (existing) {
        const delivery = await tx.notificationDelivery.findUnique({
          where: { eventId_channel: { eventId: event.id, channel: 'IN_APP' } },
        });
        return delivery?.id ?? null;
      }

      const userId = event.payload.userId;
      if (typeof userId !== 'string') throw new Error('OrderCreated event is missing userId');
      const delivery = await tx.notificationDelivery.create({
        data: {
          eventId: event.id,
          userId,
          template: 'ORDER_CREATED',
          payload: event.payload as Prisma.InputJsonValue,
        },
      });
      await tx.processedMessage.create({ data: { consumer: CONSUMER, eventId: event.id } });
      return delivery.id;
    });
  }

  findPending(limit: number) {
    return this.prisma.notificationDelivery.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: 5 } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }

  async deliver(id: string): Promise<void> {
    const claimed = await this.prisma.notificationDelivery.updateMany({
      where: { id, status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: 5 } },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, lastError: null },
    });
    if (claimed.count === 0) return;

    // This foundation intentionally records a local in-app delivery. Replace this boundary
    // with an email/push provider adapter; never place provider calls in the Rabbit consumer.
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: { status: 'DELIVERED' },
    });
  }

  async markFailed(id: string, error: unknown): Promise<void> {
    await this.prisma.notificationDelivery.updateMany({
      where: { id, status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        lastError:
          error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown delivery error',
      },
    });
  }
}
