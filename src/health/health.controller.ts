import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { RedisCacheService } from '../common/cache/redis-cache.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { RabbitPublisherService } from '../queue/rabbit-publisher.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisCacheService,
    private readonly rabbit: RabbitPublisherService,
  ) {}

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe' })
  live(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Dependency readiness probe' })
  async ready(): Promise<{ status: string; dependencies: Record<string, string> }> {
    const dependencies: Record<string, string> = {};
    const checks = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
      this.rabbit.ping(),
    ]);
    for (const [index, name] of ['postgresql', 'redis', 'rabbitmq'].entries()) {
      dependencies[name] = checks[index]?.status === 'fulfilled' ? 'up' : 'down';
    }
    if (Object.values(dependencies).includes('down')) {
      throw new ServiceUnavailableException({
        message: 'One or more dependencies are unavailable',
        dependencies,
      });
    }
    return { status: 'ok', dependencies };
  }
}
