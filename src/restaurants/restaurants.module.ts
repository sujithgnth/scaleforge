import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller.js';
import { RestaurantsRepository } from './restaurants.repository.js';
import { RestaurantsService } from './restaurants.service.js';

@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsRepository, RestaurantsService],
  exports: [RestaurantsRepository, RestaurantsService],
})
export class RestaurantsModule {}
