import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(OidcAuthGuard, TenantMembershipGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermission('asset:read')
  list(@Req() request: AuthenticatedRequest, @Query('cursor') cursor?: string) {
    return this.notifications.list(request.actor!, cursor);
  }

  @Patch(':id/read')
  @RequirePermission('asset:read')
  markRead(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(request.actor!, id);
  }
}
