import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('ScaleForge API')
    .setDescription('Modular-monolith API for scalable order and resilience experiments.')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('restaurants')
    .addTag('orders')
    .addTag('payments')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupApplication(app: INestApplication): void {
  app.use(helmet());
  app.enableShutdownHooks();
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    customSiteTitle: 'ScaleForge API Documentation',
  });
}
