import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({imports:[AuthModule,DatabaseModule,AuthorizationModule],controllers:[InsightsController],providers:[InsightsService]})
export class InsightsModule {}
