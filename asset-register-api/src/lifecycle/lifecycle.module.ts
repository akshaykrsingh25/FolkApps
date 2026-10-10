import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';

@Module({imports:[AuthModule,AuthorizationModule],controllers:[LifecycleController],providers:[LifecycleService]})
export class LifecycleModule {}
