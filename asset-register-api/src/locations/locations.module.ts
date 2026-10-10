import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}
