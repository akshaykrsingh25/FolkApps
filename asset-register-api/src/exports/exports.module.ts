import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DatabaseModule } from '../database.module';
import { ObjectStorageService } from '../evidence/object-storage.service';
import { ExportsController } from './exports.controller';
import { ExportWorkerService } from './export-worker.service';
import { ExportsService } from './exports.service';

@Module({
  imports: [AuthModule, AuthorizationModule, DatabaseModule],
  controllers: [ExportsController],
  providers: [ExportsService, ExportWorkerService, ObjectStorageService],
  exports: [ExportsService, ExportWorkerService],
})
export class ExportsModule {}
