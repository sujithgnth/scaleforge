import type { Request } from 'express';
import type { Role } from '../../generated/prisma/enums.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
