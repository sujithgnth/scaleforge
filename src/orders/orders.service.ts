import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-request.js';
import { RequestContextService } from '../common/request-context/request-context.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { OrdersRepository } from './orders.repository.js';

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  create(user: AuthenticatedUser, dto: CreateOrderDto) {
    const ids = dto.items.map((item) => item.menuItemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Each menu item may appear only once; increase quantity instead',
      );
    }
    return this.orders.create(user.id, dto, this.requestContext.getCorrelationId());
  }

  list(user: AuthenticatedUser, query: ListOrdersQueryDto) {
    const userScope = user.role === Role.USER ? user.id : undefined;
    return this.orders.list(query, userScope);
  }

  async updateStatus(user: AuthenticatedUser, id: string, dto: UpdateOrderStatusDto) {
    const current = await this.orders.findById(id);
    if (!current) throw new NotFoundException('Order not found');

    if (user.role === Role.USER) {
      if (current.userId !== user.id || dto.status !== OrderStatus.CANCELLED) {
        throw new ForbiddenException('Users may only cancel their own eligible orders');
      }
    }
    if (!transitions[current.status].includes(dto.status)) {
      throw new BadRequestException(
        `Order cannot transition from ${current.status} to ${dto.status}`,
      );
    }
    return this.orders.updateStatus(
      id,
      dto.version,
      dto.status,
      user.id,
      this.requestContext.getCorrelationId(),
    );
  }
}
