import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnApplicationShutdown {
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.SKIP_EXTERNAL_CONNECTIONS !== 'true') await this.client.connect();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async invalidatePrefix(prefix: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length) deleted += await this.client.del(...keys);
    } while (cursor !== '0');
    return deleted;
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  duplicate(): Redis {
    return this.client.duplicate();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status !== 'end') await this.client.quit();
  }
}
