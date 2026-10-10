import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { CreateCycleDto, CreatePolicyDto, RecordScanDto } from './verification.dto';
import { VerificationService } from './verification.service';

@Controller('verification')
@UseGuards(OidcAuthGuard,TenantMembershipGuard)
export class VerificationController {
  constructor(private readonly verification:VerificationService) {}
  @Get('policies') policies(@Req() req:AuthenticatedRequest) { return this.verification.policies(req.actor!); }
  @Post('policies') createPolicy(@Req() req:AuthenticatedRequest,@Body() body:CreatePolicyDto) { return this.verification.createPolicy(req.actor!,body); }
  @Get('cycles') cycles(@Req() req:AuthenticatedRequest) { return this.verification.cycles(req.actor!); }
  @Post('cycles') createCycle(@Req() req:AuthenticatedRequest,@Body() body:CreateCycleDto) { return this.verification.createCycle(req.actor!,body); }
  @Get('cycles/:id/progress') progress(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string) { return this.verification.progress(req.actor!,id); }
  @Post('cycles/:id/scans') recordScan(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:RecordScanDto) { return this.verification.recordScan(req.actor!,id,body); }
}
