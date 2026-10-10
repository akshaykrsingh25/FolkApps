import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { AssetsModule } from './assets/assets.module';
import { DatabaseModule } from './database.module';
import { LocationsModule } from './locations/locations.module';
import { MeModule } from './me/me.module';
import { HealthController } from './health.controller';
import { VerificationModule } from './verification/verification.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { InsightsModule } from './insights/insights.module';
import { UsersModule } from './users/users.module';
import { ExportsModule } from './exports/exports.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthModule, AuthorizationModule, MeModule, LocationsModule, AssetsModule, VerificationModule, LifecycleModule, InsightsModule, UsersModule, ExportsModule, NotificationsModule],
  controllers: [HealthController],
})
export class AppModule {}
