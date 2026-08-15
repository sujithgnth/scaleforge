import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.payment.findUnique({ where: { idempotencyKey } });
  }

  async complete(input: {
    orderId: string;
    actorId: string;
    idempotencyKey: string;
    providerReference?: string;
    correlationId?: string;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
        const payment = await tx.payment.create({
          data: {
            orderId: input.orderId,
            amount: order.totalAmount,
            idempotencyKey: input.idempotencyKey,
            providerRef: input.providerReference,
            status: PaymentStatus.COMPLETED,
          },
        });
        if (order.status === OrderStatus.PENDING) {
          await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.CONFIRMED, version: { increment: 1 } },
          });
        }
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            action: 'PAYMENT_COMPLETED',
            aggregateType: 'Payment',
            aggregateId: payment.id,
            correlationId: input.correlationId,
            metadata: {
              orderId: order.id,
              amount: order.totalAmount.toString(),
              currency: payment.currency,
            },
          },
        });
        await tx.outboxEvent.create({
          data: {
            type: 'PaymentCompleted',
            aggregateType: 'Payment',
            aggregateId: payment.id,
            correlationId: input.correlationId,
            payload: {
              paymentId: payment.id,
              orderId: order.id,
              userId: order.userId,
              amount: order.totalAmount.toString(),
              currency: payment.currency,
            },
          },
        });
        return payment;
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
