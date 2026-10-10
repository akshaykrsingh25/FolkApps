import { parseWebOrigins } from './web-origin-config';

export type RuntimeEnvironment = Record<string, string | undefined>;

export interface RuntimeConfiguration {
  webOrigins: string[];
}

export function validateRuntimeConfiguration(environment: RuntimeEnvironment = process.env): RuntimeConfiguration {
  const production = environment.NODE_ENV === 'production';
  const webOrigins = parseWebOrigins(environment.WEB_ORIGIN, production);
  validatePort(environment.PORT);
  if (!production) return { webOrigins };

  const missing = [
    'DATABASE_URL',
    'OIDC_ISSUER_URL',
    'OIDC_AUDIENCE',
    'OIDC_JWKS_URL',
    'OBJECT_STORAGE_BUCKET',
    'OBJECT_STORAGE_KMS_KEY_ID',
  ].filter((name) => !environment[name]?.trim());
  if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(', ')}.`);

  validateHttpsUrl('OIDC_ISSUER_URL', environment.OIDC_ISSUER_URL);
  validateHttpsUrl('OIDC_JWKS_URL', environment.OIDC_JWKS_URL);
  validateDatabaseUrl(environment.DATABASE_URL);

  if (environment.OBJECT_STORAGE_ENDPOINT?.trim()) {
    validateHttpsUrl('OBJECT_STORAGE_ENDPOINT', environment.OBJECT_STORAGE_ENDPOINT);
  }
  if (Boolean(environment.OBJECT_STORAGE_ACCESS_KEY_ID?.trim()) !== Boolean(environment.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim())) {
    throw new Error('Production object storage credentials must be supplied as a complete access-key pair or omitted to use workload identity.');
  }
  if (Boolean(environment.ASSET_QR_SIGNING_KEY_ID?.trim()) !== Boolean(environment.ASSET_QR_SIGNING_PRIVATE_KEY?.trim())) {
    throw new Error('ASSET_QR_SIGNING_KEY_ID and ASSET_QR_SIGNING_PRIVATE_KEY must be configured together.');
  }

  return { webOrigins };
}

function validatePort(value: string | undefined): void {
  if (value === undefined || value.trim() === '') return;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer between 1 and 65535.');
}

function validateHttpsUrl(name: string, value: string | undefined): void {
  let parsed: URL;
  try {
    parsed = new URL(value ?? '');
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${name} must be a valid HTTPS URL without credentials or a fragment.`);
  }
}

function validateDatabaseUrl(value: string | undefined): void {
  let parsed: URL;
  try {
    parsed = new URL(value ?? '');
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2) {
    throw new Error('DATABASE_URL must identify a PostgreSQL host and database.');
  }
  if (parsed.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('Production DATABASE_URL must set sslmode=verify-full to encrypt the connection and verify the server certificate.');
  }
}
