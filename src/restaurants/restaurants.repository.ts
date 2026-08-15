import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class RestaurantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listActive() {
    return this.prisma.restaurant.findMany({
      where: { active: true },
      include: { menuItems: { where: { available: true }, orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  create(name: string, menuItems: Array<{ name: string; price: number }>) {
    return this.prisma.restaurant.create({
      data: {
        name,
        menuItems: {
          create: menuItems.map((item) => ({
            name: item.name,
            price: new Prisma.Decimal(item.price),
          })),
        },
      },
      include: { menuItems: true },
    });
  }
}
