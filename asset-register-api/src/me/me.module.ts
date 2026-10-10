import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database.module';
import { MeController } from './me.controller';

@Module({ imports: [AuthModule, DatabaseModule], controllers: [MeController] })
export class MeModule {}
