import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSignedAssetQr, qrIdentityForOfflineLookup, verifySignedAssetQr } from './signedQr';

const organizationId = '10000000-0000-4000-8000-000000000001';
const qrPublicId = '20000000-0000-4000-8000-000000000001';
afterEach(() => vi.unstubAllEnvs());

describe('signed asset QR verification', () => {
  it('verifies an organization-bound QR before it can be used for offline lookup', async () => {
    const fixture = await makeQrFixture(organizationId, qrPublicId);
    vi.stubEnv('VITE_ASSET_QR_PUBLIC_KEYS_JSON', JSON.stringify({ 'test-key': fixture.publicKeyPem }));

    expect(isSignedAssetQr(fixture.value)).toBe(true);
    await expect(verifySignedAssetQr(fixture.value, organizationId)).resolves.toMatchObject({ v: 1, kid: 'test-key', organizationId, qrPublicId });
    await expect(qrIdentityForOfflineLookup(fixture.value, organizationId)).resolves.toBe(qrPublicId);
  });

  it('rejects a signature alteration and an organization mismatch', async () => {
    const fixture = await makeQrFixture(organizationId, qrPublicId);
    vi.stubEnv('VITE_ASSET_QR_PUBLIC_KEYS_JSON', JSON.stringify({ 'test-key': fixture.publicKeyPem }));
    const parts = fixture.value.split('.');
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;

    await expect(verifySignedAssetQr(parts.join('.'), organizationId)).rejects.toThrow('could not be verified');
    await expect(verifySignedAssetQr(fixture.value, '30000000-0000-4000-8000-000000000001')).rejects.toThrow('different organization');
  });

  it('requires a configured public key for offline use of signed labels', async () => {
    vi.stubEnv('VITE_ASSET_QR_PUBLIC_KEYS_JSON', '{}');
    const fixture = await makeQrFixture(organizationId, qrPublicId);
    await expect(verifySignedAssetQr(fixture.value, organizationId)).rejects.toThrow('does not have the QR verification key');
  });

  it('keeps legacy opaque QR identities usable for local lookup', async () => {
    await expect(qrIdentityForOfflineLookup(qrPublicId, organizationId)).resolves.toBe(qrPublicId);
    expect(isSignedAssetQr(qrPublicId)).toBe(false);
  });
});

async function makeQrFixture(org: string, qr: string) {
  const keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey));
  const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${toBase64(publicKeyBytes)}\n-----END PUBLIC KEY-----`;
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, kid: 'test-key', organizationId: org, qrPublicId: qr })));
  const signature = encodeBase64Url(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, keys.privateKey, new TextEncoder().encode(payload))));
  return { value: `INCU1.${payload}.${signature}`, publicKeyPem };
}

function encodeBase64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
