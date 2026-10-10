import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { CreateUserDto, SetUserActiveDto } from './users.dto';
import { UsersService, type UserRow } from './users.service';

@Controller('users')
@UseGuards(OidcAuthGuard, TenantMembershipGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('user:manage')
  list(@Req() request: AuthenticatedRequest): Promise<UserRow[]> {
    return this.users.list(request.actor!);
  }

  @Post()
  @RequirePermission('user:manage')
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateUserDto) {
    return this.users.create(request.actor!, body);
  }

  @Patch(':id/active')
  @RequirePermission('user:manage')
  setActive(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: SetUserActiveDto) {
    return this.users.setActive(request.actor!, id, body.isActive);
  }
}
