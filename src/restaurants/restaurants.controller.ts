import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { CreateRestaurantDto } from './dto/create-restaurant.dto.js';
import { RestaurantsService } from './restaurants.service.js';

@ApiTags('restaurants')
@ApiBearerAuth()
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get()
  @ApiOperation({
    summary: 'List active restaurants and available menu items (Redis cached for 60 seconds)',
  })
  list() {
    return this.restaurants.listActive();
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  @ApiOperation({ summary: 'Create a restaurant with its initial menu' })
  create(@Body() dto: CreateRestaurantDto) {
    return this.restaurants.create(dto);
  }
}
