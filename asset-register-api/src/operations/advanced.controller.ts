import { ErpSnapshotService } from './erp-snapshot.service';
import { Body,Controller,Get,Param,ParseUUIDPipe,Post,Query,Req,UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { AdvancedService } from './advanced.service';
import { CreditDto,DepreciationDto,FinanceActionDto,PlanDto,PlanQueryDto,TicketActionDto,TicketDto } from './advanced.dto';
@Controller('operations') @UseGuards(OidcAuthGuard,TenantMembershipGuard,PermissionsGuard)
export class AdvancedController {
 constructor(private s:AdvancedService,private erp:ErpSnapshotService){}
 @Post('erp/:id/retry') @RequirePermission('asset:write') retry(@Req() r:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string){return this.erp.retry(r.actor!,id);}
 @Get('erp') @RequirePermission('asset:read') erpStatus(@Req() r:AuthenticatedRequest){return this.erp.status(r.actor!);}
 @Post('finance/:id/sync') @RequirePermission('asset:write') sync(@Req() r:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string){return this.erp.enqueue(r.actor!,id);}
 @Get('tickets') @RequirePermission('asset:read') tickets(@Req() r:AuthenticatedRequest){return this.s.tickets(r.actor!);}
 @Post('tickets') @RequirePermission('asset:write') create(@Req() r:AuthenticatedRequest,@Body() d:TicketDto){return this.s.createTicket(r.actor!,d);}
 @Post('tickets/:id/action') @RequirePermission('asset:write') action(@Req() r:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:TicketActionDto){return this.s.ticketAction(r.actor!,id,d);}
 @Post('tickets/:id/credit') @RequirePermission('asset:write') credit(@Req() r:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:CreditDto){return this.s.ticketAction(r.actor!,id,d);}
 @Get('floorplans') @RequirePermission('asset:read') plan(@Req() r:AuthenticatedRequest,@Query() d:PlanQueryDto){return this.s.plan(r.actor!,d);}
 @Post('floorplans') @RequirePermission('asset:write') save(@Req() r:AuthenticatedRequest,@Body() d:PlanDto){return this.s.savePlan(r.actor!,d);}
 @Get('finance') @RequirePermission('asset:read') finance(@Req() r:AuthenticatedRequest){return this.s.financeBatches(r.actor!);}
 @Post('finance') @RequirePermission('asset:write') createFinance(@Req() r:AuthenticatedRequest,@Body() d:DepreciationDto){return this.s.createFinance(r.actor!,d);}
 @Post('finance/:id/action') @RequirePermission('asset:write') financeAction(@Req() r:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:FinanceActionDto){return this.s.financeAction(r.actor!,id,d);}
}
