import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { TenantMembershipGuard } from '../auth/tenant-membership.guard';
import { CentreCsvDto, CreateLocationDto, ListLocationsDto, PatchCoordinatesDto } from './location.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(OidcAuthGuard, TenantMembershipGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: ListLocationsDto) {
    return this.locations.list(request.actor!, query);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateLocationDto) {
    return this.locations.create(request.actor!, body);
  }

  @Post('import/preview') previewCentreImport(@Req() request: AuthenticatedRequest, @Body() body: CentreCsvDto) {
    return this.locations.previewCentreImport(request.actor!, body.csv);
  }

  @Post('import') importCentres(@Req() request: AuthenticatedRequest, @Body() body: CentreCsvDto) {
    return this.locations.importCentres(request.actor!, body.csv);
  }

  @Patch(':id/coordinates') confirmCoordinates(@Req() request:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:PatchCoordinatesDto) {
    return this.locations.confirmCoordinates(request.actor!,id,body);
  }
}
