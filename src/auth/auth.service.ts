import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import type { Role } from '../generated/prisma/enums.js';
import { UsersRepository } from '../users/users.repository.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

interface RefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

interface TokenUser {
  id: string;
  email: string;
  role: Role;
}

@Injectable()
export class AuthService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.accessTtl = config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    this.refreshTtl = config.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS');
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.findByEmailForAuth(email)) {
      throw new ConflictException('An account already exists for this email');
    }
    const user = await this.users.create({
      email,
      displayName: dto.displayName.trim(),
      passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
    });
    return this.issueTokenPair(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmailForAuth(dto.email.trim().toLowerCase());
    // Keep the same response for unknown accounts, bad passwords, and disabled users.
    if (!user || !user.active || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueTokenPair(user);
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const stored = await this.users.findRefreshToken(payload.jti);
    if (
      !stored ||
      stored.userId !== payload.sub ||
      stored.revokedAt ||
      stored.expiresAt <= new Date() ||
      !stored.user.active ||
      !(await argon2.verify(stored.tokenHash, refreshToken))
    ) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    return this.issueTokenPair(stored.user, stored.id);
  }

  async logout(refreshToken: string): Promise<{ revoked: boolean }> {
    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      const result = await this.users.revokeRefreshToken(payload.jti);
      return { revoked: result.count > 0 };
    } catch {
      return { revoked: false };
    }
  }

  private async issueTokenPair(user: TokenUser, rotatedTokenId?: string) {
    const id = randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, type: 'access' },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: this.accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: id, type: 'refresh' },
      { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: this.refreshTtl },
    );
    const record = {
      id,
      userId: user.id,
      tokenHash: await argon2.hash(refreshToken, { type: argon2.argon2id }),
      expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
    };

    if (rotatedTokenId) await this.users.rotateRefreshToken(rotatedTokenId, record);
    else await this.users.createRefreshToken(record);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtl,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  private async verifyRefreshToken(token: string): Promise<RefreshPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'refresh' || !payload.jti) throw new Error('Wrong token type');
      return payload;
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
  }
}
