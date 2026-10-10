import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { AuthorizationService } from './authorization.service';
import { PermissionsGuard } from './permissions.guard';

@Module({ imports: [DatabaseModule], providers: [AuthorizationService, PermissionsGuard], exports: [AuthorizationService, PermissionsGuard] })
export class AuthorizationModule {}
