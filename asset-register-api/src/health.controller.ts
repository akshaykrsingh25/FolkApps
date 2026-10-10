import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async getHealth() {
    return this.getReadiness();
  }

  @Get('live')
  getLiveness() {
    return { status: 'ok', service: 'asset-register-api', apiVersion: 'v1' };
  }

  @Get('ready')
  async getReadiness() {
    try {
      await this.database.check();
      return { status: 'ok', dependencies: { database: 'ok' }, service: 'asset-register-api', apiVersion: 'v1' };
    } catch {
      throw new ServiceUnavailableException({ status: 'degraded', dependencies: { database: 'unavailable' } });
    }
  }
}
