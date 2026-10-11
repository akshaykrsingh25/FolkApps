import { AdvancedService } from './advanced.service';
import { AdvancedController } from './advanced.controller';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
@Module({imports:[DatabaseModule,AuthorizationModule],controllers:[OperationsController,AdvancedController],providers:[OperationsService,AdvancedService]})
export class OperationsModule {}
