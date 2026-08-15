import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/enums.js';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiProperty({ description: 'Optimistic-lock version returned by the last read.', minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}
