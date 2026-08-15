import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh JWT returned by login or registration.' })
  @IsJWT()
  refreshToken!: string;
}
