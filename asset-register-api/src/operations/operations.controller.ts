import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermission } from '../authorization/permissions.decorator';
import { OperationsService } from './operations.service';
import { AssignCompletionDto, ReuseQueryDto, TaskActionDto } from './operations.dto';
@Controller('operations')
@UseGuards(OidcAuthGuard,TenantMembershipGuard,PermissionsGuard)
export class OperationsController {
 constructor(private service:OperationsService){}
 @Get('tasks') @RequirePermission('asset:read') tasks(@Req() r:AuthenticatedRequest){return this.service.tasks(r.actor!);}
 @Get('assignees/:assetId') @RequirePermission('asset:write') assignees(@Req() r:AuthenticatedRequest,@Param('assetId',ParseUUIDPipe) id:string){return this.service.assignees(r.actor!,id);}
 @Post('tasks') @RequirePermission('asset:write') assign(@Req() r:AuthenticatedRequest,@Body() dto:AssignCompletionDto){return this.service.assign(r.actor!,dto);}
 @Patch('tasks/:id') @RequirePermission('asset:write') update(@Req() r:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:TaskActionDto){return this.service.update(r.actor!,id,dto);}
 @Get('reuse') @RequirePermission('asset:read') reuse(@Req() r:AuthenticatedRequest,@Query() dto:ReuseQueryDto){return this.service.reuse(r.actor!,dto);}
}
