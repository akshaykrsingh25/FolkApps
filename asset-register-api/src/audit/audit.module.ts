import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DatabaseModule } from '../database.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({imports:[AuthModule,AuthorizationModule,DatabaseModule],controllers:[AuditController],providers:[AuditService]})
export class AuditModule {}
