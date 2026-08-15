import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';

async function generate(): Promise<void> {
  process.env.NODE_ENV ??= 'test';
  process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.RABBITMQ_URL ??= 'amqp://localhost:5672';
  process.env.JWT_ACCESS_SECRET ??= 'openapi-access-secret-with-at-least-32-chars';
  process.env.JWT_REFRESH_SECRET ??= 'openapi-refresh-secret-with-at-least-32-chars';
  process.env.JWT_ACCESS_TTL_SECONDS ??= '900';
  process.env.JWT_REFRESH_TTL_SECONDS ??= '3600';
  process.env.SKIP_EXTERNAL_CONNECTIONS = 'true';

  // Import compiled modules so Nest receives TypeScript's decorator metadata; tsx/esbuild
  // intentionally does not emit all metadata required for constructor injection.
  const [{ AppModule }, { buildOpenApiDocument, setupApplication }] = await Promise.all([
    import('../dist/app.module.js'),
    import('../dist/bootstrap/setup-application.js'),
  ]);
  const app = await NestFactory.create(AppModule, { logger: ['error'], abortOnError: false });
  setupApplication(app);
  await app.init();
  const document = buildOpenApiDocument(app);
  await writeFile('openapi.json', `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();
  console.info(`Generated openapi.json with ${Object.keys(document.paths).length} paths`);
}

await generate();
