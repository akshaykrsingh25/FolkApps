import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { AuthorizationService } from './authorization.service';

@Module({ imports: [DatabaseModule], providers: [AuthorizationService], exports: [AuthorizationService] })
export class AuthorizationModule {}
