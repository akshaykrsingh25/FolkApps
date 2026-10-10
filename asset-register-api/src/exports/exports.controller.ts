import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { CreateAssetExportDto } from './export.dto';
import { ExportsService } from './exports.service';

@Controller('exports')
@UseGuards(OidcAuthGuard, TenantMembershipGuard, PermissionsGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post('assets')
  @RequirePermission('asset:export')
  createAssetExport(@Req() request: AuthenticatedRequest, @Body() body: CreateAssetExportDto) {
    return this.exportsService.createAssetExport(request.actor!, body);
  }

  @Get()
  @RequirePermission('asset:export')
  list(@Req() request: AuthenticatedRequest) {
    return this.exportsService.list(request.actor!);
  }

  @Get(':id')
  @RequirePermission('asset:export')
  get(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.exportsService.get(request.actor!, id);
  }

  @Post(':id/cancel')
  @RequirePermission('asset:export')
  cancel(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.exportsService.cancel(request.actor!, id);
  }

  @Get(':id/download')
  @RequirePermission('asset:export')
  download(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.exportsService.download(request.actor!, id);
  }
}
