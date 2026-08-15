import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { AuditService } from './audit.service.js';

@ApiTags('audit')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List recent audit records' })
  list() {
    return this.audit.list();
  }
}
