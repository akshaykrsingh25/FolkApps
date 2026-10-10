import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import type { ExecutionContext } from '@nestjs/common';
import { OidcAuthGuard } from './oidc-auth.guard';

let server: Server;
let issuer: string;
let privateKey: CryptoKey;
let publicJwk: JWK;

function context(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

async function token(overrides: { issuer?: string; audience?: string; expired?: boolean } = {}) {
  return new SignJWT({ email: 'staff@example.test' })
    .setProtectedHeader({ alg: 'RS256', kid: 'phase-one-key' })
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? 'asset-api')
    .setSubject('staff-123')
    .setIssuedAt()
    .setExpirationTime(overrides.expired ? '10 seconds ago' : '5 minutes')
    .sign(privateKey);
}

describe('OIDC authentication guard', () => {
  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey as CryptoKey;
    publicJwk = { ...await exportJWK(pair.publicKey), kid: 'phase-one-key', alg: 'RS256', use: 'sig' };
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' });
      response.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    issuer = `http://127.0.0.1:${address.port}/issuer`;
    process.env.OIDC_ISSUER_URL = issuer;
    process.env.OIDC_AUDIENCE = 'asset-api';
    process.env.OIDC_JWKS_URL = `http://127.0.0.1:${address.port}/jwks`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.OIDC_AUDIENCE;
    delete process.env.OIDC_JWKS_URL;
  });

  it('accepts a correctly signed token and attaches verified claims', async () => {
    const request = { headers: { authorization: `Bearer ${await token()}` } };
    expect(await new OidcAuthGuard().canActivate(context(request))).toBe(true);
    expect(request).toHaveProperty('auth.sub', 'staff-123');
  });

  it('rejects missing credentials, bad audience, expired, and forged tokens', async () => {
    await expect(new OidcAuthGuard().canActivate(context({ headers: {} }))).rejects.toMatchObject({ status: 401 });
    const wrongAudience = { headers: { authorization: `Bearer ${await token({ audience: 'other-api' })}` } };
    await expect(new OidcAuthGuard().canActivate(context(wrongAudience))).rejects.toMatchObject({ status: 401 });
    const expired = { headers: { authorization: `Bearer ${await token({ expired: true })}` } };
    await expect(new OidcAuthGuard().canActivate(context(expired))).rejects.toMatchObject({ status: 401 });
    const forged = { headers: { authorization: `Bearer ${await token()}x` } };
    await expect(new OidcAuthGuard().canActivate(context(forged))).rejects.toMatchObject({ status: 401 });
  });
});
