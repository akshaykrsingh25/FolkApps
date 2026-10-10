import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { CloseCycleDto, CreateCycleDto, CreatePolicyDto, RecordRfidScansDto, RecordScanDto, UpdatePolicyDto } from './verification.dto';
import { VerificationService } from './verification.service';

@Controller('verification')
@UseGuards(OidcAuthGuard,TenantMembershipGuard,PermissionsGuard)
export class VerificationController {
  constructor(private readonly verification:VerificationService) {}
  @Get('policies') @RequirePermission('asset:read') policies(@Req() req:AuthenticatedRequest) { return this.verification.policies(req.actor!); }
  @Post('policies') @RequirePermission('audit:verify') createPolicy(@Req() req:AuthenticatedRequest,@Body() body:CreatePolicyDto) { return this.verification.createPolicy(req.actor!,body); }
  @Patch('policies/:id') @RequirePermission('audit:verify') updatePolicy(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:UpdatePolicyDto) { return this.verification.updatePolicy(req.actor!,id,body); }
  @Get('cycles') @RequirePermission('asset:read') cycles(@Req() req:AuthenticatedRequest) { return this.verification.cycles(req.actor!); }
  @Post('cycles') @RequirePermission('audit:verify') createCycle(@Req() req:AuthenticatedRequest,@Body() body:CreateCycleDto) { return this.verification.createCycle(req.actor!,body); }
  @Post('cycles/:id/close') @RequirePermission('audit:verify') closeCycle(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:CloseCycleDto) { return this.verification.closeCycle(req.actor!,id,body); }
  @Get('cycles/:id/progress') @RequirePermission('asset:read') progress(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string) { return this.verification.progress(req.actor!,id); }
  @Post('cycles/:id/scans') @RequirePermission('audit:verify') recordScan(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:RecordScanDto) { return this.verification.recordScan(req.actor!,id,body); }
  @Post('cycles/:id/rfid-scans') @RequirePermission('audit:verify') recordRfidScans(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:RecordRfidScansDto) { return this.verification.recordRfidScans(req.actor!,id,body); }
}
