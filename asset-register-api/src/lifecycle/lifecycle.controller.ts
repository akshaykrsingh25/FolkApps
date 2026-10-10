import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { CreateReportDto, CreateTransferBatchDto, CreateTransferDto, CreateWarrantyDto, IssueCustodyDto, ReturnCustodyDto, TransferActionDto, TransferBatchActionDto, UpdateReportDto } from './lifecycle.dto';
import { LifecycleService } from './lifecycle.service';
import { TransferBatchesService } from './transfer-batches.service';

@Controller()
@UseGuards(OidcAuthGuard,TenantMembershipGuard)
export class LifecycleController {
  constructor(private readonly lifecycle:LifecycleService,private readonly transferBatches:TransferBatchesService) {}
  @Get('reports') reports(@Req() req:AuthenticatedRequest) { return this.lifecycle.reports(req.actor!); }
  @Post('reports') createReport(@Req() req:AuthenticatedRequest,@Body() body:CreateReportDto) { return this.lifecycle.createReport(req.actor!,body); }
  @Patch('reports/:id') updateReport(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:UpdateReportDto) { return this.lifecycle.updateReport(req.actor!,id,body); }
  @Get('transfers') transfers(@Req() req:AuthenticatedRequest) { return this.lifecycle.transfers(req.actor!); }
  @Post('transfers') createTransfer(@Req() req:AuthenticatedRequest,@Body() body:CreateTransferDto) { return this.lifecycle.createTransfer(req.actor!,body); }
  @Patch('transfers/:id') actOnTransfer(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:TransferActionDto) { return this.lifecycle.actOnTransfer(req.actor!,id,body); }
  @Get('transfer-batches') transferBatchesList(@Req() req:AuthenticatedRequest) { return this.transferBatches.list(req.actor!); }
  @Post('transfer-batches') createTransferBatch(@Req() req:AuthenticatedRequest,@Body() body:CreateTransferBatchDto) { return this.transferBatches.create(req.actor!,body); }
  @Patch('transfer-batches/:id') actOnTransferBatch(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:TransferBatchActionDto) { return this.transferBatches.act(req.actor!,id,body); }
  @Get('assets/:assetId/warranties') warranties(@Req() req:AuthenticatedRequest,@Param('assetId',ParseUUIDPipe) assetId:string) { return this.lifecycle.warranties(req.actor!,assetId); }
  @Post('assets/:assetId/warranties') createWarranty(@Req() req:AuthenticatedRequest,@Param('assetId',ParseUUIDPipe) assetId:string,@Body() body:CreateWarrantyDto) { return this.lifecycle.createWarranty(req.actor!,assetId,body); }
  @Get('assets/:assetId/activity') assetActivity(@Req() req:AuthenticatedRequest,@Param('assetId',ParseUUIDPipe) assetId:string) { return this.lifecycle.assetActivity(req.actor!,assetId); }
  @Get('assets/:assetId/custody') custodyHistory(@Req() req:AuthenticatedRequest,@Param('assetId',ParseUUIDPipe) assetId:string) { return this.lifecycle.custodyHistory(req.actor!,assetId); }
  @Get('assets/:assetId/custodians') eligibleCustodians(@Req() req:AuthenticatedRequest,@Param('assetId',ParseUUIDPipe) assetId:string) { return this.lifecycle.eligibleCustodians(req.actor!,assetId); }
  @Post('assets/:assetId/custody') issueCustody(@Req() req:AuthenticatedRequest,@Param('assetId',ParseUUIDPipe) assetId:string,@Body() body:IssueCustodyDto) { return this.lifecycle.issueCustody(req.actor!,assetId,body); }
  @Post('assets/:assetId/custody/:custodyId/return') returnCustody(@Req() req:AuthenticatedRequest,@Param('assetId',ParseUUIDPipe) assetId:string,@Param('custodyId',ParseUUIDPipe) custodyId:string,@Body() body:ReturnCustodyDto) { return this.lifecycle.returnCustody(req.actor!,assetId,custodyId,body); }
}
