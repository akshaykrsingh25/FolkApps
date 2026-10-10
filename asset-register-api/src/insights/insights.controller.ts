import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { InsightsService } from './insights.service';

@Controller('insights')
@UseGuards(OidcAuthGuard,TenantMembershipGuard,PermissionsGuard)
export class InsightsController {
  constructor(private readonly insights:InsightsService) {}
  @Get('overview') @RequirePermission('asset:read') overview(@Req() request:AuthenticatedRequest) { return this.insights.overview(request.actor!); }
  @Get('map') @RequirePermission('asset:read') map(@Req() request:AuthenticatedRequest) { return this.insights.map(request.actor!); }
  @Get('alerts') @RequirePermission('asset:read') alerts(@Req() request:AuthenticatedRequest) { return this.insights.alerts(request.actor!); }
}
