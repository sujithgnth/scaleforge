import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../queue/domain-event.js';
import { NotificationsRepository } from './notifications.repository.js';

@Injectable()
export class NotificationEventHandler {
  constructor(private readonly notifications: NotificationsRepository) {}

  handle(event: DomainEvent): Promise<string | null> {
    if (event.type !== 'OrderCreated') return Promise.resolve(null);
    return this.notifications.processOrderCreated(event);
  }
}
