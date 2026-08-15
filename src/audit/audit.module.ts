import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditEventHandler } from './audit-event.handler.js';
import { AuditRepository } from './audit.repository.js';
import { AuditService } from './audit.service.js';

@Module({
  controllers: [AuditController],
  providers: [AuditRepository, AuditEventHandler, AuditService],
  exports: [AuditEventHandler],
})
export class AuditModule {}
