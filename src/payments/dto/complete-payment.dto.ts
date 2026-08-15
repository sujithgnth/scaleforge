import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompletePaymentDto {
  @ApiPropertyOptional({
    description: 'Reference from a PCI-compliant payment provider; no card data is accepted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerReference?: string;
}
