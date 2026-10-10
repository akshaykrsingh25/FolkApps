import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DatabaseModule } from '../database.module';
import { OidcAuthGuard } from './oidc-auth.guard';
import { TenantMembershipGuard } from './tenant-membership.guard';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  providers: [OidcAuthGuard, TenantMembershipGuard],
  exports: [OidcAuthGuard, TenantMembershipGuard, AuthorizationModule],
})
export class AuthModule {}
