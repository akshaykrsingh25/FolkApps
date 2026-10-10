import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { AssetsService } from './assets.service';
import { CreateAssetDto, ListAssetsDto, UpdateAssetDto } from './asset.dto';

@Controller('assets')
@UseGuards(OidcAuthGuard, TenantMembershipGuard, PermissionsGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermission('asset:read')
  list(@Req() request: AuthenticatedRequest, @Query() query: ListAssetsDto) {
    return this.assets.list(request.actor!, query);
  }

  @Post()
  @RequirePermission('asset:write')
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateAssetDto) {
    return this.assets.create(request.actor!, body);
  }

  @Patch(':id')
  @RequirePermission('asset:write')
  update(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAssetDto) {
    return this.assets.update(request.actor!, id, body);
  }

  @Get('qr/:qrPublicId')
  @RequirePermission('asset:read')
  getByQr(@Req() request: AuthenticatedRequest, @Param('qrPublicId', ParseUUIDPipe) qrPublicId: string) {
    return this.assets.getByQr(request.actor!, qrPublicId);
  }

  @Get('rfid/:epc')
  @RequirePermission('asset:read')
  getByRfidEpc(@Req() request: AuthenticatedRequest, @Param('epc') epc: string) {
    return this.assets.getByRfidEpc(request.actor!, epc);
  }

  @Get(':id')
  @RequirePermission('asset:read')
  getById(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.getById(request.actor!, id);
  }
}
