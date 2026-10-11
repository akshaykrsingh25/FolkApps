import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { CompleteEvidenceUploadDto, CreateEvidenceUploadDto, LinkInvoiceDto } from './evidence.dto';
import { EvidenceService } from './evidence.service';

@Controller('assets/:assetId/evidence')
@UseGuards(OidcAuthGuard, TenantMembershipGuard, PermissionsGuard)
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post('link-invoice')
  @RequirePermission('asset:write')
  linkInvoice(@Req() request: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: LinkInvoiceDto) {
    return this.evidence.linkInvoice(request.actor!, assetId, body);
  }

  @Post('upload-url')
  @RequirePermission('asset:write')
  createUpload(@Req() request: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: CreateEvidenceUploadDto) {
    return this.evidence.createUpload(request.actor!, assetId, body);
  }

  @Post('complete')
  @RequirePermission('asset:write')
  completeUpload(@Req() request: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: CompleteEvidenceUploadDto) {
    return this.evidence.completeUpload(request.actor!, assetId, body.evidenceId);
  }

  @Get()
  @RequirePermission('asset:read')
  list(@Req() request: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) assetId: string) {
    return this.evidence.list(request.actor!, assetId);
  }

  @Get(':evidenceId/download')
  @RequirePermission('asset:read')
  download(@Req() request: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) assetId: string, @Param('evidenceId', ParseUUIDPipe) evidenceId: string) {
    return this.evidence.download(request.actor!, assetId, evidenceId);
  }
}
