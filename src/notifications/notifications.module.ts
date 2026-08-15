import { Module } from '@nestjs/common';
import { NotificationEventHandler } from './notification-event.handler.js';
import { NotificationQueueService } from './notification-queue.service.js';
import { NotificationsRepository } from './notifications.repository.js';

@Module({
  providers: [NotificationsRepository, NotificationEventHandler, NotificationQueueService],
  exports: [NotificationEventHandler, NotificationQueueService],
})
export class NotificationsModule {}
