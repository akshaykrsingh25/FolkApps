import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { EvidenceController } from '../evidence/evidence.controller';
import { EvidenceService } from '../evidence/evidence.service';
import { ObjectStorageService } from '../evidence/object-storage.service';
import { SignedQrService } from './signed-qr.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AssetsController, EvidenceController],
  providers: [AssetsService, EvidenceService, ObjectStorageService, SignedQrService],
})
export class AssetsModule {}
