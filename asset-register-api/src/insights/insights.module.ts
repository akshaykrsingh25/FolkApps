import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({imports:[AuthModule,DatabaseModule],controllers:[InsightsController],providers:[InsightsService]})
export class InsightsModule {}
