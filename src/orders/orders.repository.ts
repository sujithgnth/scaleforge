import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrderStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import type { ListOrdersQueryDto } from './dto/list-orders-query.dto.js';

const orderInclude = {
  restaurant: { select: { id: true, name: true } },
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const } },
} as const;

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto, correlationId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.findFirst({
        where: { id: dto.restaurantId, active: true },
        select: { id: true },
      });
      if (!restaurant) throw new NotFoundException('Active restaurant not found');

      const menuIds = dto.items.map((item) => item.menuItemId);
      const menuItems = await tx.menuItem.findMany({
        where: { id: { in: menuIds }, restaurantId: dto.restaurantId, available: true },
      });
      if (menuItems.length !== menuIds.length) {
        throw new ConflictException(
          'One or more menu items are invalid, duplicated, or unavailable',
        );
      }

      const byId = new Map(menuItems.map((item) => [item.id, item]));
      const lineItems = dto.items.map((requested) => {
        const menu = byId.get(requested.menuItemId)!;
        const lineTotal = menu.price.mul(requested.quantity);
        return {
          menuItemId: menu.id,
          name: menu.name,
          unitPrice: menu.price,
          quantity: requested.quantity,
          lineTotal,
        };
      });
      const totalAmount = lineItems.reduce(
        (sum, item) => sum.add(item.lineTotal),
        new Prisma.Decimal(0),
      );

      const order = await tx.order.create({
        data: {
          userId,
          restaurantId: dto.restaurantId,
          totalAmount,
          items: { create: lineItems },
        },
        include: orderInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'ORDER_CREATED',
          aggregateType: 'Order',
          aggregateId: order.id,
          correlationId,
          metadata: { status: order.status, totalAmount: totalAmount.toString() },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'OrderCreated',
          aggregateType: 'Order',
          aggregateId: order.id,
          correlationId,
          payload: {
            orderId: order.id,
            userId,
            restaurantId: dto.restaurantId,
            totalAmount: totalAmount.toString(),
          },
        },
      });
      return order;
    });
  }

  findById(id: string) {
    return this.prisma.order.findUnique({ where: { id }, include: orderInclude });
  }

  async list(query: ListOrdersQueryDto, userId?: string) {
    const where: Prisma.OrderWhereInput = {
      ...(userId ? { userId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data,
      meta: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    };
  }

  async updateStatus(
    id: string,
    currentVersion: number,
    status: OrderStatus,
    actorId: string,
    correlationId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id, version: currentVersion },
        data: { status, version: { increment: 1 } },
      });
      if (result.count !== 1) {
        throw new ConflictException('Order was updated by another request; reload and retry');
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ORDER_STATUS_UPDATED',
          aggregateType: 'Order',
          aggregateId: id,
          correlationId,
          metadata: { status, previousVersion: currentVersion },
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  }
}
