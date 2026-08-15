import { Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '../generated/prisma/enums.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  list() {
    return this.users.list();
  }

  async updateRole(id: string, role: Role) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return this.users.updateRole(id, role);
  }
}
