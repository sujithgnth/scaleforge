import { Module } from '@nestjs/common';
import { OutboxPublisherService } from './outbox-publisher.service.js';
import { RabbitPublisherService } from './rabbit-publisher.service.js';

@Module({
  providers: [RabbitPublisherService, OutboxPublisherService],
  exports: [RabbitPublisherService],
})
export class QueueModule {}
