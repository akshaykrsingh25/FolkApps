import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { CompleteEvidenceUploadDto, CreateEvidenceUploadDto } from './evidence.dto';
import { EvidenceService } from './evidence.service';

@Controller('assets/:assetId/evidence')
@UseGuards(OidcAuthGuard, TenantMembershipGuard)
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post('upload-url')
  createUpload(@Req() request: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: CreateEvidenceUploadDto) {
    return this.evidence.createUpload(request.actor!, assetId, body);
  }

  @Post('complete')
  completeUpload(@Req() request: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: CompleteEvidenceUploadDto) {
    return this.evidence.completeUpload(request.actor!, assetId, body.evidenceId);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) assetId: string) {
    return this.evidence.list(request.actor!, assetId);
  }

  @Get(':evidenceId/download')
  download(@Req() request: AuthenticatedRequest, @Param('assetId', ParseUUIDPipe) assetId: string, @Param('evidenceId', ParseUUIDPipe) evidenceId: string) {
    return this.evidence.download(request.actor!, assetId, evidenceId);
  }
}
