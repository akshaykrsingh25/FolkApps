import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from './database.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const database = { check: vi.fn<() => Promise<void>>() };
  let controller: HealthController;

  beforeEach(() => {
    vi.clearAllMocks();
    database.check.mockResolvedValue(undefined);
    controller = new HealthController(database as unknown as DatabaseService);
  });

  it('keeps liveness independent of database availability', async () => {
    database.check.mockRejectedValue(new Error('database unavailable'));

    expect(controller.getLiveness()).toEqual({
      status: 'ok', service: 'asset-register-api', apiVersion: 'v1',
    });
    expect(database.check).not.toHaveBeenCalled();
  });

  it('reports readiness only when the database responds', async () => {
    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ok', dependencies: { database: 'ok' }, service: 'asset-register-api', apiVersion: 'v1',
    });
    expect(database.check).toHaveBeenCalledOnce();

    database.check.mockRejectedValue(new Error('database unavailable'));
    await expect(controller.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('keeps the existing health route as a readiness alias', async () => {
    await expect(controller.getHealth()).resolves.toEqual(await controller.getReadiness());
  });
});
