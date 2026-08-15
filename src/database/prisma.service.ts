import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    super({
      adapter: new PrismaPg({ connectionString }),
      log: config.get('NODE_ENV') === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.SKIP_EXTERNAL_CONNECTIONS !== 'true') {
      await this.$connect();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
