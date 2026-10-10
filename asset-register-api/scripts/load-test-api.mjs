import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGING_ACKNOWLEDGEMENT = 'I_ACKNOWLEDGE_STAGING_READ_ONLY_LOAD';
const ORGANIZATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENDPOINTS = [
  { name: 'assets', path: 'assets?limit=50' },
  { name: 'overview', path: 'insights/overview' },
  { name: 'map', path: 'insights/map' },
  { name: 'watch', path: 'insights/alerts?limit=50' },
  { name: 'audit', path: 'audit/events?limit=50' },
];

export function createLoadTestConfig(environment = process.env) {
  const rawBaseUrl = environment.ASSET_REGISTER_LOAD_API_URL?.trim();
  const token = environment.ASSET_REGISTER_LOAD_TOKEN?.trim();
  const organizationId = environment.ASSET_REGISTER_LOAD_ORGANIZATION_ID?.trim();
  if (!rawBaseUrl || !token || !organizationId) {
    throw new Error('Set ASSET_REGISTER_LOAD_API_URL, ASSET_REGISTER_LOAD_TOKEN, and ASSET_REGISTER_LOAD_ORGANIZATION_ID.');
  }
  if (/\s/.test(token)) throw new Error('ASSET_REGISTER_LOAD_TOKEN must contain the raw bearer token without whitespace.');
  if (!ORGANIZATION_ID_PATTERN.test(organizationId)) throw new Error('ASSET_REGISTER_LOAD_ORGANIZATION_ID must be a UUID.');

  let apiUrl;
  try {
    apiUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error('ASSET_REGISTER_LOAD_API_URL must be a valid API URL.');
  }
  if (apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash || !apiUrl.pathname.replace(/\/+$/, '').endsWith('/api/v1')) {
    throw new Error('ASSET_REGISTER_LOAD_API_URL must end in /api/v1 and cannot contain credentials, a query, or a fragment.');
  }

  const hostname = apiUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const localTarget = hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
  if (localTarget) {
    if (!['http:', 'https:'].includes(apiUrl.protocol)) throw new Error('Local load-test targets must use HTTP or HTTPS.');
  } else {
    if (apiUrl.protocol !== 'https:') throw new Error('Remote load-test targets must use HTTPS.');
    if (/(^|[.-])(prod|production|live)([.-]|$)/i.test(hostname)) throw new Error('Production-looking hosts are not allowed for this load test.');
    if (environment.ASSET_REGISTER_LOAD_TARGET !== 'staging' || environment.ASSET_REGISTER_LOAD_STAGING_ACK !== STAGING_ACKNOWLEDGEMENT) {
      throw new Error('Remote load is allowed only for approved staging with ASSET_REGISTER_LOAD_TARGET=staging and the documented acknowledgement.');
    }
  }

  const apiBaseUrl = apiUrl.toString().replace(/\/+$/, '');
  return {
    apiBaseUrl,
    token,
    organizationId,
    concurrency: readBoundedInteger(environment.ASSET_REGISTER_LOAD_CONCURRENCY, 10, 1, 100, 'ASSET_REGISTER_LOAD_CONCURRENCY'),
    durationMs: readBoundedInteger(environment.ASSET_REGISTER_LOAD_DURATION_SECONDS, 30, 1, 900, 'ASSET_REGISTER_LOAD_DURATION_SECONDS') * 1000,
    warmupMs: readBoundedInteger(environment.ASSET_REGISTER_LOAD_WARMUP_SECONDS, 5, 0, 300, 'ASSET_REGISTER_LOAD_WARMUP_SECONDS') * 1000,
    requestTimeoutMs: readBoundedInteger(environment.ASSET_REGISTER_LOAD_REQUEST_TIMEOUT_MS, 10_000, 100, 60_000, 'ASSET_REGISTER_LOAD_REQUEST_TIMEOUT_MS'),
  };
}

export function summarizeLatencies(samples) {
  if (!samples.length) return { requests: 0, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null };
  const ordered = [...samples].sort((left, right) => left - right);
  const percentile = (fraction) => ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
  return {
    requests: ordered.length,
    p50Ms: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    p99Ms: round(percentile(0.99)),
    maxMs: round(ordered[ordered.length - 1]),
  };
}

export async function runLoadTest(config, { fetchImpl = fetch, now = () => performance.now() } = {}) {
  const startedAt = now();
  const measurementStartsAt = startedAt + config.warmupMs;
  const endsAt = measurementStartsAt + config.durationMs;
  const results = new Map(ENDPOINTS.map(({ name }) => [name, { latencies: [], statusCounts: {}, failureCount: 0 }]));
  let endpointSequence = 0;

  async function worker() {
    while (now() < endsAt) {
      const requestStartedAt = now();
      const endpoint = ENDPOINTS[endpointSequence++ % ENDPOINTS.length];
      let status = 'network_error';
      try {
        const response = await fetchImpl(`${config.apiBaseUrl}/${endpoint.path}`, {
          method: 'GET',
          headers: {
            authorization: `Bearer ${config.token}`,
            'x-organization-id': config.organizationId,
            accept: 'application/json',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(config.requestTimeoutMs),
        });
        status = String(response.status);
        if (response.body) await response.arrayBuffer();
      } catch (error) {
        status = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network_error';
      }

      const finishedAt = now();
      if (requestStartedAt < measurementStartsAt) continue;
      const stats = results.get(endpoint.name);
      const elapsed = Math.max(0, finishedAt - requestStartedAt);
      stats.latencies.push(elapsed);
      stats.statusCounts[status] = (stats.statusCounts[status] ?? 0) + 1;
      if (!/^2\d\d$/.test(status)) stats.failureCount += 1;
    }
  }

  await Promise.all(Array.from({ length: config.concurrency }, () => worker()));
  const measuredMs = Math.max(1, endsAt - measurementStartsAt);
  const byEndpoint = Object.fromEntries([...results].map(([name, stats]) => [name, {
    ...summarizeLatencies(stats.latencies),
    statusCounts: stats.statusCounts,
    failureCount: stats.failureCount,
  }]));
  const allLatencies = [...results.values()].flatMap((stats) => stats.latencies);
  const failureCount = [...results.values()].reduce((sum, stats) => sum + stats.failureCount, 0);
  const totalRequests = allLatencies.length;

  return {
    target: new URL(config.apiBaseUrl).host,
    concurrency: config.concurrency,
    warmupMs: config.warmupMs,
    measuredMs,
    total: {
      ...summarizeLatencies(allLatencies),
      requestsPerSecond: round((totalRequests * 1000) / measuredMs),
      failureCount,
    },
    endpoints: byEndpoint,
  };
}

function readBoundedInteger(value, fallback, minimum, maximum, name) {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function main() {
  try {
    const config = createLoadTestConfig();
    const result = await runLoadTest(config);
    console.log(JSON.stringify(result, null, 2));
    if (result.total.failureCount > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Load test could not run.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
