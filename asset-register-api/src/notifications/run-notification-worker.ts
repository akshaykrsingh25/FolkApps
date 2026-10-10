import { NestFactory } from '@nestjs/core';
import { NotificationOutboxModule } from './notification-outbox.module';
import { NotificationOutboxWorkerService } from './notification-outbox-worker.service';

async function run() {
  const application = await NestFactory.createApplicationContext(NotificationOutboxModule, { logger: ['error', 'warn', 'log'] });
  const worker = application.get(NotificationOutboxWorkerService);
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await worker.run(shutdown.signal);
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await application.close();
  }
}

void run().catch((error: unknown) => {
  process.stderr.write(`Notification outbox worker failed to start: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
