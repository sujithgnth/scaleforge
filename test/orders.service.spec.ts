import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { OrderStatus, Role } from '../src/generated/prisma/enums.js';
import { OrdersService } from '../src/orders/orders.service.js';
import type { OrdersRepository } from '../src/orders/orders.repository.js';
import type { RequestContextService } from '../src/common/request-context/request-context.service.js';

describe('OrdersService', () => {
  const repository = {
    create: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };
  const context = { getCorrelationId: jest.fn(() => 'correlation-1') };
  const service = new OrdersService(
    repository as unknown as OrdersRepository,
    context as unknown as RequestContextService,
  );
  const user = { id: 'user-1', email: 'user@example.com', role: Role.USER };

  beforeEach(() => jest.clearAllMocks());

  it('rejects duplicate menu items rather than trusting ambiguous quantities', async () => {
    const command = {
      restaurantId: 'restaurant-1',
      items: [
        { menuItemId: 'menu-1', quantity: 1 },
        { menuItemId: 'menu-1', quantity: 2 },
      ],
    };

    expect(() => service.create(user, command)).toThrow(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('scopes ordinary users to their own order list', async () => {
    repository.list.mockResolvedValue({ data: [], meta: {} });
    await service.list(user, { page: 1, limit: 20 });
    expect(repository.list).toHaveBeenCalledWith({ page: 1, limit: 20 }, user.id);
  });

  it('allows managers to query the operational order view', async () => {
    repository.list.mockResolvedValue({ data: [], meta: {} });
    await service.list({ ...user, role: Role.MANAGER }, { page: 1, limit: 20 });
    expect(repository.list).toHaveBeenCalledWith({ page: 1, limit: 20 }, undefined);
  });

  it('prevents a user from progressing an order state', async () => {
    repository.findById.mockResolvedValue({
      id: 'order-1',
      userId: user.id,
      status: OrderStatus.PENDING,
      version: 1,
    });

    await expect(
      service.updateStatus(user, 'order-1', { status: OrderStatus.CONFIRMED, version: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes the expected version and correlation ID for an allowed transition', async () => {
    repository.findById.mockResolvedValue({
      id: 'order-1',
      userId: user.id,
      status: OrderStatus.PENDING,
      version: 1,
    });
    repository.updateStatus.mockResolvedValue({ id: 'order-1', status: OrderStatus.CANCELLED });

    await service.updateStatus(user, 'order-1', { status: OrderStatus.CANCELLED, version: 1 });

    expect(repository.updateStatus).toHaveBeenCalledWith(
      'order-1',
      1,
      OrderStatus.CANCELLED,
      user.id,
      'correlation-1',
    );
  });
});
