import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { NotificationOutboxWorkerService } from './notification-outbox-worker.service';

@Module({ imports: [DatabaseModule], providers: [NotificationOutboxWorkerService] })
export class NotificationOutboxModule {}
