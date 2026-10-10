import { describe, expect, it, vi } from 'vitest';
import { createLoadTestConfig, runLoadTest, summarizeLatencies } from './load-test-api.mjs';

const localEnvironment = {
  ASSET_REGISTER_LOAD_API_URL: 'http://localhost:4000/api/v1/',
  ASSET_REGISTER_LOAD_TOKEN: 'synthetic-test-token',
  ASSET_REGISTER_LOAD_ORGANIZATION_ID: '10000000-0000-4000-8000-000000000001',
};

describe('read-only API load test', () => {
  it('normalizes a local target and applies bounded defaults', () => {
    const config = createLoadTestConfig(localEnvironment);
    expect(config).toMatchObject({
      apiBaseUrl: 'http://localhost:4000/api/v1',
      concurrency: 10,
      durationMs: 30_000,
      warmupMs: 5_000,
      requestTimeoutMs: 10_000,
    });
  });

  it('requires a staging acknowledgement for remote HTTPS targets', () => {
    const environment = {
      ...localEnvironment,
      ASSET_REGISTER_LOAD_API_URL: 'https://staging.example.com/api/v1',
    };
    expect(() => createLoadTestConfig(environment)).toThrow('Remote load is allowed only for approved staging');
    expect(createLoadTestConfig({
      ...environment,
      ASSET_REGISTER_LOAD_TARGET: 'staging',
      ASSET_REGISTER_LOAD_STAGING_ACK: 'I_ACKNOWLEDGE_STAGING_READ_ONLY_LOAD',
    }).apiBaseUrl).toBe('https://staging.example.com/api/v1');
  });

  it('blocks production-looking hosts, unsafe URL components, and invalid load limits', () => {
    expect(() => createLoadTestConfig({
      ...localEnvironment,
      ASSET_REGISTER_LOAD_API_URL: 'https://api-prod.example.com/api/v1',
      ASSET_REGISTER_LOAD_TARGET: 'staging',
      ASSET_REGISTER_LOAD_STAGING_ACK: 'I_ACKNOWLEDGE_STAGING_READ_ONLY_LOAD',
    })).toThrow('Production-looking hosts are not allowed');
    expect(() => createLoadTestConfig({ ...localEnvironment, ASSET_REGISTER_LOAD_API_URL: 'http://remote.example.com/api/v1' }))
      .toThrow('Remote load-test targets must use HTTPS.');
    expect(() => createLoadTestConfig({ ...localEnvironment, ASSET_REGISTER_LOAD_CONCURRENCY: '101' }))
      .toThrow('ASSET_REGISTER_LOAD_CONCURRENCY must be an integer between 1 and 100.');
  });

  it('summarizes latency percentiles with nearest-rank values', () => {
    expect(summarizeLatencies([9, 1, 5, 3])).toEqual({ requests: 4, p50Ms: 3, p95Ms: 9, p99Ms: 9, maxMs: 9 });
    expect(summarizeLatencies([])).toEqual({ requests: 0, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null });
  });

  it('exercises only authenticated GET endpoints and aggregates their results', async () => {
    const config = {
      ...createLoadTestConfig(localEnvironment),
      concurrency: 2,
      durationMs: 50,
      warmupMs: 0,
      requestTimeoutMs: 500,
    };
    let now = 0;
    const seen = [];
    const fetchImpl = vi.fn(async (url, options) => {
      seen.push({ url: String(url), options });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await runLoadTest(config, { fetchImpl, now: () => now++ });

    expect(result.total.requests).toBeGreaterThan(0);
    expect(result.total.failureCount).toBe(0);
    expect(result.total.requestsPerSecond).toBeGreaterThan(0);
    expect(Object.keys(result.endpoints)).toEqual(['assets', 'overview', 'map', 'watch', 'audit']);
    expect(seen.every(({ options }) => options.method === 'GET')).toBe(true);
    expect(seen.every(({ options }) => options.headers.authorization === 'Bearer synthetic-test-token')).toBe(true);
    expect(seen.every(({ options }) => options.headers['x-organization-id'] === localEnvironment.ASSET_REGISTER_LOAD_ORGANIZATION_ID)).toBe(true);
    expect(seen.some(({ url }) => url.includes('/audit/events?limit=50'))).toBe(true);
  });

  it('counts non-success responses without printing response bodies', async () => {
    const config = {
      ...createLoadTestConfig(localEnvironment),
      concurrency: 1,
      durationMs: 20,
      warmupMs: 0,
      requestTimeoutMs: 500,
    };
    let now = 0;
    const result = await runLoadTest(config, {
      fetchImpl: vi.fn(async () => new Response('private server detail', { status: 503 })),
      now: () => now++,
    });

    expect(result.total.failureCount).toBeGreaterThan(0);
    expect(Object.values(result.endpoints).some((endpoint) => endpoint.statusCounts['503'] > 0)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private server detail');
  });
});
