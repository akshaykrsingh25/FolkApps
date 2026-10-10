export interface SignedAssetQrClaims {
  v: 1;
  kid: string;
  organizationId: string;
  qrPublicId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNED_QR_PATTERN = /^INCU1\.([A-Za-z0-9_-]{1,1024})\.([A-Za-z0-9_-]{80,128})$/;

export function isSignedAssetQr(value: string): boolean {
  return value.startsWith('INCU1.');
}

export async function verifySignedAssetQr(value: string, expectedOrganizationId: string): Promise<SignedAssetQrClaims> {
  if (value.length > 2048) throw new Error('This signed QR label is too large to be valid.');
  const match = SIGNED_QR_PATTERN.exec(value);
  if (!match) throw new Error('This signed QR label is malformed.');

  let claims: unknown;
  let payloadBytes: Uint8Array;
  let signature: Uint8Array;
  try {
    payloadBytes = decodeBase64Url(match[1]);
    signature = decodeBase64Url(match[2]);
    if (encodeBase64Url(payloadBytes) !== match[1] || encodeBase64Url(signature) !== match[2]) throw new Error('Non-canonical encoding');
    claims = JSON.parse(new TextDecoder().decode(payloadBytes)) as unknown;
  } catch {
    throw new Error('This signed QR label is malformed.');
  }
  if (!isClaims(claims) || !UUID_PATTERN.test(claims.organizationId) || !UUID_PATTERN.test(claims.qrPublicId)) {
    throw new Error('This signed QR label has invalid identity details.');
  }
  if (claims.organizationId.toLowerCase() !== expectedOrganizationId.toLowerCase()) {
    throw new Error('This QR label belongs to a different organization.');
  }

  const keyMap = getVerificationKeys();
  const pem = keyMap[claims.kid];
  if (!pem) throw new Error('This device does not have the QR verification key. Connect to the network and ask an administrator to update the app configuration.');
  try {
    const publicKey = await crypto.subtle.importKey('spki', toArrayBuffer(pemToDer(pem)), { name: 'Ed25519' }, false, ['verify']);
    const valid = await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, toArrayBuffer(signature), toArrayBuffer(new TextEncoder().encode(match[1])));
    if (!valid) throw new Error('invalid signature');
  } catch {
    throw new Error('This QR signature could not be verified on this device. Connect to the network or update the app/browser.');
  }
  return claims;
}

export async function qrIdentityForOfflineLookup(value: string, organizationId: string): Promise<string> {
  if (isSignedAssetQr(value)) return (await verifySignedAssetQr(value, organizationId)).qrPublicId;
  return value;
}

function getVerificationKeys(): Record<string, string> {
  const raw = import.meta.env.VITE_ASSET_QR_PUBLIC_KEYS_JSON;
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

function isClaims(value: unknown): value is SignedAssetQrClaims {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  return claims.v === 1 && typeof claims.kid === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(claims.kid)
    && typeof claims.organizationId === 'string' && typeof claims.qrPublicId === 'string' && Object.keys(claims).length === 4;
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToDer(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const base64 = normalized.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  return decodeBase64(base64);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}
