import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module.js';
import { CommonModule } from './common/common.module.js';
import { validateEnvironment } from './configuration/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { RabbitWorkerModule } from './queue/rabbit-worker.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: { level: config.get('LOG_LEVEL') ?? 'info' },
      }),
    }),
    ScheduleModule.forRoot(),
    CommonModule,
    DatabaseModule,
    ObservabilityModule,
    AuditModule,
    NotificationsModule,
    RabbitWorkerModule,
  ],
})
export class WorkerModule {}
