import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RabbitConsumersService } from './rabbit-consumers.service.js';

@Module({
  imports: [AuditModule, NotificationsModule],
  providers: [RabbitConsumersService],
})
export class RabbitWorkerModule {}
