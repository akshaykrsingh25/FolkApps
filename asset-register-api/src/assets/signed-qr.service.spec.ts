import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { SignedQrService } from './signed-qr.service';

const previousEnv = {
  id: process.env.ASSET_QR_SIGNING_KEY_ID,
  privateKey: process.env.ASSET_QR_SIGNING_PRIVATE_KEY,
  publicKeys: process.env.ASSET_QR_VERIFY_PUBLIC_KEYS_JSON,
};
const organizationId = '10000000-0000-4000-8000-000000000001';
const qrPublicId = '20000000-0000-4000-8000-000000000001';

afterEach(() => {
  restore('ASSET_QR_SIGNING_KEY_ID', previousEnv.id);
  restore('ASSET_QR_SIGNING_PRIVATE_KEY', previousEnv.privateKey);
  restore('ASSET_QR_VERIFY_PUBLIC_KEYS_JSON', previousEnv.publicKeys);
});

describe('SignedQrService', () => {
  it('issues an Ed25519-signed, tenant-bound QR identity and verifies it', () => {
    const key = generateKeyPairSync('ed25519');
    setActiveKey('key-current', key.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    process.env.ASSET_QR_VERIFY_PUBLIC_KEYS_JSON = JSON.stringify({ 'key-current': key.publicKey.export({ type: 'spki', format: 'pem' }).toString() });
    const service = new SignedQrService();

    const result = service.issue(organizationId, qrPublicId);
    expect(result).toMatchObject({ keyId: 'key-current', version: 1 });
    expect(result.value).toMatch(/^INCU1\./);
    expect(service.resolve(result.value, organizationId)).toBe(qrPublicId);
  });

  it('rejects tampered signatures and cross-organization labels', () => {
    const key = generateKeyPairSync('ed25519');
    setActiveKey('key-current', key.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    const service = new SignedQrService();
    const value = service.issue(organizationId, qrPublicId).value;
    const parts = value.split('.');
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;

    expect(() => service.resolve(parts.join('.'), organizationId)).toThrow('Signed QR signature is invalid');
    expect(() => service.resolve(value, '30000000-0000-4000-8000-000000000001')).toThrow('different organization');
  });

  it('continues verifying existing labels when the active signing key rotates', () => {
    const prior = generateKeyPairSync('ed25519');
    const active = generateKeyPairSync('ed25519');
    setActiveKey('key-old', prior.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    const oldLabel = new SignedQrService().issue(organizationId, qrPublicId).value;

    setActiveKey('key-new', active.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    process.env.ASSET_QR_VERIFY_PUBLIC_KEYS_JSON = JSON.stringify({
      'key-old': prior.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      'key-new': active.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    });
    expect(new SignedQrService().resolve(oldLabel, organizationId)).toBe(qrPublicId);
  });

  it('fails closed when signing has not been configured', () => {
    delete process.env.ASSET_QR_SIGNING_KEY_ID;
    delete process.env.ASSET_QR_SIGNING_PRIVATE_KEY;
    expect(() => new SignedQrService().issue(organizationId, qrPublicId)).toThrow('not configured');
  });
});

function setActiveKey(kid: string, privateKeyPem: string) {
  process.env.ASSET_QR_SIGNING_KEY_ID = kid;
  process.env.ASSET_QR_SIGNING_PRIVATE_KEY = privateKeyPem;
  delete process.env.ASSET_QR_VERIFY_PUBLIC_KEYS_JSON;
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
