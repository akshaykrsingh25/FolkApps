import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createPrivateKey, createPublicKey, sign as signBytes, verify as verifyBytes, type KeyObject } from 'node:crypto';

export interface SignedAssetQrClaims {
  v: 1;
  kid: string;
  organizationId: string;
  qrPublicId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QR_PATTERN = /^INCU1\.([A-Za-z0-9_-]{1,1024})\.([A-Za-z0-9_-]{80,128})$/;

@Injectable()
export class SignedQrService {
  issue(organizationId: string, qrPublicId: string) {
    const { kid, privateKey } = this.activeSigningKey();
    const claims: SignedAssetQrClaims = { v: 1, kid, organizationId, qrPublicId };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = signBytes(null, Buffer.from(payload, 'ascii'), privateKey).toString('base64url');
    return { value: `INCU1.${payload}.${signature}`, keyId: kid, version: 1 };
  }

  resolve(value: string, expectedOrganizationId: string): string | null {
    if (!value.startsWith('INCU1.')) return null;
    if (value.length > 2048) throw new BadRequestException('Signed QR payload is invalid');
    const match = QR_PATTERN.exec(value);
    if (!match) throw new BadRequestException('Signed QR payload is invalid');

    let claims: unknown;
    try {
      const payloadBytes = Buffer.from(match[1], 'base64url');
      if (payloadBytes.toString('base64url') !== match[1]) throw new Error('Non-canonical payload');
      claims = JSON.parse(payloadBytes.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Signed QR payload is invalid');
    }
    if (!this.isClaims(claims) || !UUID_PATTERN.test(claims.organizationId) || !UUID_PATTERN.test(claims.qrPublicId)) {
      throw new BadRequestException('Signed QR payload is invalid');
    }
    if (claims.organizationId.toLowerCase() !== expectedOrganizationId.toLowerCase()) {
      throw new BadRequestException('This QR label belongs to a different organization');
    }

    const publicKey = this.verificationKey(claims.kid);
    const signature = Buffer.from(match[2], 'base64url');
    if (signature.toString('base64url') !== match[2] || !verifyBytes(null, Buffer.from(match[1], 'ascii'), publicKey, signature)) {
      throw new BadRequestException('Signed QR signature is invalid');
    }
    return claims.qrPublicId;
  }

  private activeSigningKey(): { kid: string; privateKey: KeyObject } {
    const kid = process.env.ASSET_QR_SIGNING_KEY_ID?.trim();
    const pem = process.env.ASSET_QR_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
    if (!kid || !/^[A-Za-z0-9._-]{1,64}$/.test(kid) || !pem) {
      throw new ServiceUnavailableException('Signed QR label printing is not configured');
    }
    try {
      const privateKey = createPrivateKey(pem);
      if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Expected Ed25519 key');
      return { kid, privateKey };
    } catch {
      throw new ServiceUnavailableException('Signed QR signing key is invalid');
    }
  }

  private verificationKey(kid: string): KeyObject {
    let keyMap: Record<string, string> = {};
    const rawKeyMap = process.env.ASSET_QR_VERIFY_PUBLIC_KEYS_JSON;
    if (rawKeyMap) {
      try {
        const parsed: unknown = JSON.parse(rawKeyMap);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Invalid key map');
        keyMap = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      } catch {
        throw new ServiceUnavailableException('Signed QR verification key set is invalid');
      }
    }

    try {
      const pem = keyMap[kid]?.replace(/\\n/g, '\n').trim();
      let publicKey: KeyObject;
      if (pem) {
        publicKey = createPublicKey(pem);
      } else if (kid === process.env.ASSET_QR_SIGNING_KEY_ID?.trim()) {
        const privatePem = process.env.ASSET_QR_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
        if (!privatePem) throw new Error('Missing active private key');
        publicKey = createPublicKey(createPrivateKey(privatePem));
      } else {
        throw new Error('Unknown key id');
      }
      if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('Expected Ed25519 public key');
      return publicKey;
    } catch {
      throw new BadRequestException('Signed QR key is unknown or invalid');
    }
  }

  private isClaims(value: unknown): value is SignedAssetQrClaims {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const claims = value as Record<string, unknown>;
    return claims.v === 1 && typeof claims.kid === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(claims.kid)
      && typeof claims.organizationId === 'string' && typeof claims.qrPublicId === 'string'
      && Object.keys(claims).length === 4;
  }
}
