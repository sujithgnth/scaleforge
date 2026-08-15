import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '../src/generated/prisma/enums.js';
import { OrdersController } from '../src/orders/orders.controller.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { buildOpenApiDocument } from '../src/bootstrap/setup-application.js';

describe('Orders HTTP contract', () => {
  let app: INestApplication;
  const orders = { create: jest.fn(), list: jest.fn(), updateStatus: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: orders }],
    }).compile();
    app = module.createNestApplication();
    app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
      request.user = {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'test@example.com',
        role: Role.USER,
      };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  it('rejects malformed order input before calling business logic', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .send({ restaurantId: 'not-a-uuid', items: [] })
      .expect(400);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('returns a paginated order contract', async () => {
    orders.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, pages: 0 } });
    const response = await request(app.getHttpServer()).get('/orders?page=1&limit=20').expect(200);
    expect(response.body.meta).toEqual({ page: 1, limit: 20, total: 0, pages: 0 });
  });

  it('publishes the documented order paths into OpenAPI', () => {
    const document = buildOpenApiDocument(app);
    expect(document.paths['/orders']).toBeDefined();
    expect(document.paths['/orders/{id}/status']).toBeDefined();
  });
});
