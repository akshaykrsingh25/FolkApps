import { describe, expect, it } from 'vitest';
import { validateRuntimeConfiguration, type RuntimeEnvironment } from './runtime-config';

const validProductionEnvironment: RuntimeEnvironment = {
  NODE_ENV: 'production',
  PORT: '4000',
  WEB_ORIGIN: 'https://assets.incuspaze.example, https://admin.incuspaze.example',
  DATABASE_URL: 'postgresql://asset_app:secret-value@db.example:5432/incuspaze?sslmode=verify-full',
  OIDC_ISSUER_URL: 'https://identity.example.com/tenant',
  OIDC_AUDIENCE: 'incuspaze-asset-api',
  OIDC_JWKS_URL: 'https://identity.example.com/tenant/.well-known/jwks.json',
  OBJECT_STORAGE_BUCKET: 'incuspaze-private-assets',
  OBJECT_STORAGE_KMS_KEY_ID: 'arn:aws:kms:ap-south-1:123456789012:key/example',
};

describe('validateRuntimeConfiguration', () => {
  it('allows local development with optional infrastructure configuration', () => {
    expect(validateRuntimeConfiguration({ NODE_ENV: 'development', WEB_ORIGIN: 'http://localhost:5173' })).toEqual({
      webOrigins: ['http://localhost:5173'],
    });
  });

  it('accepts a complete production configuration and normalized web origins', () => {
    expect(validateRuntimeConfiguration(validProductionEnvironment).webOrigins).toEqual([
      'https://assets.incuspaze.example',
      'https://admin.incuspaze.example',
    ]);
  });

  it('reports missing production services without echoing environment values', () => {
    expect(() => validateRuntimeConfiguration({
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://assets.example.com',
      DATABASE_URL: 'postgres://secret-user:secret-password@db.example/assets',
    })).toThrow('Missing required production configuration: OIDC_ISSUER_URL, OIDC_AUDIENCE, OIDC_JWKS_URL, OBJECT_STORAGE_BUCKET, OBJECT_STORAGE_KMS_KEY_ID.');
    expect(() => validateRuntimeConfiguration({
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://assets.example.com',
      DATABASE_URL: 'postgres://secret-user:secret-password@db.example/assets',
    })).toThrowError(expect.not.stringContaining('secret-password'));
  });

  it('requires verified TLS for the production PostgreSQL connection', () => {
    expect(() => validateRuntimeConfiguration({ ...validProductionEnvironment, DATABASE_URL: 'postgres://user:pass@db.example/assets' }))
      .toThrow('Production DATABASE_URL must set sslmode=verify-full to encrypt the connection and verify the server certificate.');
    expect(() => validateRuntimeConfiguration({
      ...validProductionEnvironment,
      DATABASE_URL: 'postgres://user:secret-password@db.example/assets?sslmode=require',
    })).toThrowError(expect.not.stringContaining('secret-password'));
  });

  it.each(['http://identity.example.com', 'https://user:pass@identity.example.com', 'not-a-url'])('rejects an unsafe OIDC URL: %s', (issuer) => {
    expect(() => validateRuntimeConfiguration({ ...validProductionEnvironment, OIDC_ISSUER_URL: issuer })).toThrow('OIDC_ISSUER_URL must be a valid HTTPS URL');
  });

  it('requires secure object storage endpoints and complete optional credentials', () => {
    expect(() => validateRuntimeConfiguration({ ...validProductionEnvironment, OBJECT_STORAGE_ENDPOINT: 'http://minio.internal' }))
      .toThrow('OBJECT_STORAGE_ENDPOINT must be a valid HTTPS URL');
    expect(() => validateRuntimeConfiguration({ ...validProductionEnvironment, OBJECT_STORAGE_ACCESS_KEY_ID: 'only-half-a-pair' }))
      .toThrow('Production object storage credentials must be supplied as a complete access-key pair or omitted to use workload identity.');
  });

  it('rejects a partial QR signing-key configuration and invalid ports', () => {
    expect(() => validateRuntimeConfiguration({ ...validProductionEnvironment, ASSET_QR_SIGNING_KEY_ID: 'current-key' }))
      .toThrow('ASSET_QR_SIGNING_KEY_ID and ASSET_QR_SIGNING_PRIVATE_KEY must be configured together.');
    expect(() => validateRuntimeConfiguration({ ...validProductionEnvironment, PORT: '70000' }))
      .toThrow('PORT must be an integer between 1 and 65535.');
  });
});
