import { Injectable } from '@nestjs/common';
import { AuditRepository } from './audit.repository.js';

@Injectable()
export class AuditService {
  constructor(private readonly audit: AuditRepository) {}

  list() {
    return this.audit.list();
  }
}
