import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../common/cache/redis-cache.service.js';
import { CreateRestaurantDto } from './dto/create-restaurant.dto.js';
import { RestaurantsRepository } from './restaurants.repository.js';

const ACTIVE_RESTAURANTS_KEY = 'restaurants:active:v1';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly restaurants: RestaurantsRepository,
    private readonly cache: RedisCacheService,
  ) {}

  async listActive() {
    const cached = await this.cache.getJson<unknown[]>(ACTIVE_RESTAURANTS_KEY);
    if (cached) return { data: cached, cache: 'hit' as const };

    const data = await this.restaurants.listActive();
    await this.cache.setJson(ACTIVE_RESTAURANTS_KEY, data, 60);
    return { data, cache: 'miss' as const };
  }

  async create(dto: CreateRestaurantDto) {
    const restaurant = await this.restaurants.create(
      dto.name.trim(),
      dto.menuItems.map((item) => ({ ...item, name: item.name.trim() })),
    );
    await this.cache.invalidatePrefix('restaurants:active:');
    return restaurant;
  }
}
