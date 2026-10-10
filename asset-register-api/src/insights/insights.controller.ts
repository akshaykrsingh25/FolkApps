import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { InsightsService } from './insights.service';

@Controller('insights')
@UseGuards(OidcAuthGuard,TenantMembershipGuard)
export class InsightsController {
  constructor(private readonly insights:InsightsService) {}
  @Get('overview') overview(@Req() request:AuthenticatedRequest) { return this.insights.overview(request.actor!); }
  @Get('map') map(@Req() request:AuthenticatedRequest) { return this.insights.map(request.actor!); }
  @Get('alerts') alerts(@Req() request:AuthenticatedRequest) { return this.insights.alerts(request.actor!); }
}
