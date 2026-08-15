import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { INestApplicationContext, INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import request from 'supertest';
import { setupApplication } from '../src/bootstrap/setup-application.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/enums.js';

describe('ScaleForge containerized integration', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let rabbit: StartedRabbitMQContainer;
  let app: INestApplication;
  let worker: INestApplicationContext;

  beforeAll(async () => {
    [postgres, redis, rabbit] = await Promise.all([
      new PostgreSqlContainer('postgres:17.4-alpine')
        .withDatabase('scaleforge')
        .withUsername('scaleforge')
        .withPassword('scaleforge')
        .start(),
      new RedisContainer('redis:7.4.2-alpine').start(),
      new RabbitMQContainer('rabbitmq:4.0.7-management-alpine').start(),
    ]);

    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.DATABASE_URL = postgres.getConnectionUri();
    process.env.REDIS_URL = redis.getConnectionUrl();
    process.env.RABBITMQ_URL = rabbit.getAmqpUrl();
    process.env.JWT_ACCESS_SECRET = 'integration-access-secret-at-least-32-chars';
    process.env.JWT_REFRESH_SECRET = 'integration-refresh-secret-at-least-32-chars';
    process.env.JWT_ACCESS_TTL_SECONDS = '900';
    process.env.JWT_REFRESH_TTL_SECONDS = '3600';

    execFileSync(join(process.cwd(), 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'pipe',
    });

    const [{ AppModule }, { WorkerModule }] = await Promise.all([
      import('../src/app.module.js'),
      import('../src/worker.module.js'),
    ]);
    app = await NestFactory.create(AppModule, { logger: false });
    setupApplication(app);
    await app.init();
    worker = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
  });

  afterAll(async () => {
    await worker?.close();
    await app?.close();
    await Promise.all([rabbit?.stop(), redis?.stop(), postgres?.stop()]);
  });

  it('runs auth, cached restaurant lookup, order, payment, outbox, and worker flow', async () => {
    const http = app.getHttpServer();
    await request(http)
      .post('/v1/auth/register')
      .send({
        email: 'admin@example.com',
        password: 'correct-horse-battery-staple',
        displayName: 'Admin',
      })
      .expect(201);

    const prisma = app.get(PrismaService);
    await prisma.user.update({ where: { email: 'admin@example.com' }, data: { role: Role.ADMIN } });
    const adminLogin = await request(http)
      .post('/v1/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'correct-horse-battery-staple',
      })
      .expect(200);
    const adminToken = adminLogin.body.accessToken as string;

    const restaurantResponse = await request(http)
      .post('/v1/restaurants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Forge Kitchen', menuItems: [{ name: 'Resilience Bowl', price: 12.5 }] })
      .expect(201);
    const restaurant = restaurantResponse.body as { id: string; menuItems: Array<{ id: string }> };

    const registration = await request(http)
      .post('/v1/auth/register')
      .send({
        email: 'user@example.com',
        password: 'another-correct-horse-password',
        displayName: 'User',
      })
      .expect(201);
    const userToken = registration.body.accessToken as string;

    const firstList = await request(http)
      .get('/v1/restaurants')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const secondList = await request(http)
      .get('/v1/restaurants')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(firstList.body.cache).toBe('miss');
    expect(secondList.body.cache).toBe('hit');

    const orderResponse = await request(http)
      .post('/v1/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Correlation-ID', 'integration-order')
      .send({
        restaurantId: restaurant.id,
        items: [{ menuItemId: restaurant.menuItems[0].id, quantity: 2 }],
      })
      .expect(201);
    const order = orderResponse.body as { id: string; totalAmount: string };
    expect(order.totalAmount).toBe('25');

    await request(http)
      .post(`/v1/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', 'integration-payment-0001')
      .send({ providerReference: 'sandbox-provider-1' })
      .expect(201);
    await request(http)
      .post(`/v1/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', 'integration-payment-0001')
      .send({ providerReference: 'sandbox-provider-1' })
      .expect(201);

    let delivered = 0;
    const deadline = Date.now() + 15_000;
    while (delivered === 0 && Date.now() < deadline) {
      delivered = await prisma.notificationDelivery.count({ where: { status: 'DELIVERED' } });
      if (delivered === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(delivered).toBeGreaterThan(0);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.processedMessage.count()).toBeGreaterThanOrEqual(2);

    await request(http).get('/v1/health/ready').expect(200);
    await request(http)
      .get('/v1/metrics')
      .expect(200)
      .expect('Content-Type', /text\/plain/);
  });
});
