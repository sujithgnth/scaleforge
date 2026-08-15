import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../queue/domain-event.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const CONSUMER = 'audit';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async processEvent(event: DomainEvent): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const processed = await tx.processedMessage.findUnique({
        where: { consumer_eventId: { consumer: CONSUMER, eventId: event.id } },
      });
      if (processed) return false;

      const actorId = typeof event.payload.userId === 'string' ? event.payload.userId : undefined;
      await tx.auditLog.create({
        data: {
          actorId,
          action: `EVENT_${event.type.toUpperCase()}`,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          correlationId: event.correlationId,
          metadata: event.payload as Prisma.InputJsonValue,
        },
      });
      await tx.processedMessage.create({ data: { consumer: CONSUMER, eventId: event.id } });
      return true;
    });
  }

  list(limit = 100) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
