import { Injectable } from '@nestjs/common';
import type { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../database/prisma.service.js';

export interface NewUserRecord {
  email: string;
  displayName: string;
  passwordHash: string;
}

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: NewUserRecord) {
    return this.prisma.user.create({ data, select: publicUserSelect });
  }

  findByEmailForAuth(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  }

  list() {
    return this.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  updateRole(id: string, role: Role) {
    return this.prisma.user.update({ where: { id }, data: { role }, select: publicUserSelect });
  }

  createRefreshToken(data: { id: string; userId: string; tokenHash: string; expiresAt: Date }) {
    return this.prisma.refreshToken.create({ data });
  }

  findRefreshToken(id: string) {
    return this.prisma.refreshToken.findUnique({ where: { id }, include: { user: true } });
  }

  rotateRefreshToken(
    oldId: string,
    next: { id: string; userId: string; tokenHash: string; expiresAt: Date },
  ) {
    return this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: oldId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({ data: next }),
    ]);
  }

  revokeRefreshToken(id: string) {
    return this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
