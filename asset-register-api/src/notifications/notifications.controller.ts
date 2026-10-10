import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferenceDto } from './notifications.dto';

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

  @Get('preferences')
  @RequirePermission('asset:read')
  preferences(@Req() request:AuthenticatedRequest) {
    return this.notifications.preferences(request.actor!);
  }

  @Patch('preferences')
  @RequirePermission('asset:read')
  updatePreference(@Req() request:AuthenticatedRequest,@Body() body:UpdateNotificationPreferenceDto) {
    return this.notifications.updatePreference(request.actor!,body);
  }
}
