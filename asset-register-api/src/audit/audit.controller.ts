import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { AuditEventsQueryDto, type AuditEventPageDto } from './audit.dto';
import { AuditService } from './audit.service';

@Controller('audit/events')
@UseGuards(OidcAuthGuard,TenantMembershipGuard,PermissionsGuard)
export class AuditController {
  constructor(private readonly audit:AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  list(@Req() request:AuthenticatedRequest,@Query() query:AuditEventsQueryDto):Promise<AuditEventPageDto> {
    return this.audit.list(request.actor!,query);
  }
}
