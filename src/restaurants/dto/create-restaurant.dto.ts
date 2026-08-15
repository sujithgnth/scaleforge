import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateMenuItemDto {
  @ApiProperty({ example: 'Margherita Pizza' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiProperty({ example: 12.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price!: number;
}

export class CreateRestaurantDto {
  @ApiProperty({ example: 'Forge Kitchen' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiProperty({ type: [CreateMenuItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateMenuItemDto)
  menuItems!: CreateMenuItemDto[];
}
