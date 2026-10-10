import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { AssetsService } from './assets.service';
import { CreateAssetDto, ListAssetsDto, UpdateAssetDto } from './asset.dto';

@Controller('assets')
@UseGuards(OidcAuthGuard, TenantMembershipGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: ListAssetsDto) {
    return this.assets.list(request.actor!, query);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateAssetDto) {
    return this.assets.create(request.actor!, body);
  }

  @Patch(':id')
  update(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAssetDto) {
    return this.assets.update(request.actor!, id, body);
  }

  @Get('qr/:qrPublicId')
  getByQr(@Req() request: AuthenticatedRequest, @Param('qrPublicId', ParseUUIDPipe) qrPublicId: string) {
    return this.assets.getByQr(request.actor!, qrPublicId);
  }

  @Get(':id')
  getById(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.getById(request.actor!, id);
  }
}
