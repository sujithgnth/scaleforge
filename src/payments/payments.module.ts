import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsRepository } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsRepository, PaymentsService],
})
export class PaymentsModule {}
