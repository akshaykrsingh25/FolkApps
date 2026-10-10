import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({imports:[AuthModule,AuthorizationModule],controllers:[VerificationController],providers:[VerificationService]})
export class VerificationModule {}
