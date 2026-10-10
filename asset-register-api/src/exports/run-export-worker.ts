import { NestFactory } from '@nestjs/core';
import { ExportsModule } from './exports.module';
import { ExportWorkerService } from './export-worker.service';

async function run() {
  const application = await NestFactory.createApplicationContext(ExportsModule, { logger: ['error', 'warn', 'log'] });
  const worker = application.get(ExportWorkerService);
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
  process.stderr.write(`Asset export worker failed to start: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
