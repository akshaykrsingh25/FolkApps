import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/request-id.middleware';
import { parseWebOrigins } from './common/web-origin-config';

async function bootstrap() {
  const webOrigins = parseWebOrigins(process.env.WEB_ORIGIN);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(requestIdMiddleware);
  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '2mb' });
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: webOrigins, credentials: true, exposedHeaders: ['x-request-id'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}

void bootstrap();
