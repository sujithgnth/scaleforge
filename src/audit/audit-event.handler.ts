import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../queue/domain-event.js';
import { AuditRepository } from './audit.repository.js';

@Injectable()
export class AuditEventHandler {
  constructor(private readonly audit: AuditRepository) {}

  handle(event: DomainEvent): Promise<boolean> {
    return this.audit.processEvent(event);
  }
}
