import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-request.js';
import { RequestContextService } from '../common/request-context/request-context.service.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { CompletePaymentDto } from './dto/complete-payment.dto.js';
import { PaymentsRepository } from './payments.repository.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly orders: OrdersRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async complete(
    user: AuthenticatedUser,
    orderId: string,
    idempotencyKey: string | undefined,
    dto: CompletePaymentDto,
  ) {
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 100) {
      throw new BadRequestException('Idempotency-Key header must contain 16 to 100 characters');
    }
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (user.role === Role.USER && order.userId !== user.id) {
      throw new ForbiddenException('Users may only pay for their own orders');
    }
    const existing = await this.payments.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.orderId !== orderId)
        throw new ConflictException('Idempotency key is already bound to another order');
      return existing;
    }
    return this.payments.complete({
      orderId,
      actorId: user.id,
      idempotencyKey,
      providerReference: dto.providerReference,
      correlationId: this.requestContext.getCorrelationId(),
    });
  }
}
