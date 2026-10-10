import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { CreateReportDto, CreateTransferDto, CreateWarrantyDto, TransferActionDto, UpdateReportDto } from './lifecycle.dto';
import { LifecycleService } from './lifecycle.service';

@Controller()
@UseGuards(OidcAuthGuard,TenantMembershipGuard)
export class LifecycleController {
  constructor(private readonly lifecycle:LifecycleService) {}
  @Get('reports') reports(@Req() req:AuthenticatedRequest) { return this.lifecycle.reports(req.actor!); }
  @Post('reports') createReport(@Req() req:AuthenticatedRequest,@Body() body:CreateReportDto) { return this.lifecycle.createReport(req.actor!,body); }
  @Patch('reports/:id') updateReport(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:UpdateReportDto) { return this.lifecycle.updateReport(req.actor!,id,body); }
  @Get('transfers') transfers(@Req() req:AuthenticatedRequest) { return this.lifecycle.transfers(req.actor!); }
  @Post('transfers') createTransfer(@Req() req:AuthenticatedRequest,@Body() body:CreateTransferDto) { return this.lifecycle.createTransfer(req.actor!,body); }
  @Patch('transfers/:id') actOnTransfer(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:TransferActionDto) { return this.lifecycle.actOnTransfer(req.actor!,id,body); }
  @Get('assets/:assetId/warranties') warranties(@Req() req:AuthenticatedRequest,@Param('assetId',ParseUUIDPipe) assetId:string) { return this.lifecycle.warranties(req.actor!,assetId); }
  @Post('assets/:assetId/warranties') createWarranty(@Req() req:AuthenticatedRequest,@Param('assetId',ParseUUIDPipe) assetId:string,@Body() body:CreateWarrantyDto) { return this.lifecycle.createWarranty(req.actor!,assetId,body); }
}
