import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RedisCacheService } from './cache/redis-cache.service.js';
import { CorrelationIdMiddleware } from './request-context/correlation-id.middleware.js';
import { RequestContextService } from './request-context/request-context.service.js';

@Global()
@Module({
  providers: [RequestContextService, RedisCacheService],
  exports: [RequestContextService, RedisCacheService],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
