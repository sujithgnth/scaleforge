import { Body, Controller, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-request.js';
import { CompletePaymentDto } from './dto/complete-payment.dto.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('orders/:orderId/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique key for safe client retries.',
  })
  @ApiOperation({ summary: 'Record a simulated provider payment completion idempotently' })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CompletePaymentDto,
  ) {
    return this.payments.complete(user, orderId, idempotencyKey, dto);
  }
}
