import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class OidcAuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const issuer = process.env.OIDC_ISSUER_URL;
    const audience = process.env.OIDC_AUDIENCE;
    const jwksUrl = process.env.OIDC_JWKS_URL;
    if (!issuer || !audience || !jwksUrl) {
      throw new ServiceUnavailableException('Identity provider is not configured');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) throw new UnauthorizedException('Bearer token required');

    try {
      this.jwks ??= createRemoteJWKSet(new URL(jwksUrl));
      const { payload } = await jwtVerify(match[1], this.jwks, {
        issuer,
        audience,
        requiredClaims: ['sub', 'exp', 'iat'],
        clockTolerance: 5,
      });
      request.auth = payload as JWTPayload;
      return true;
    } catch {
      throw new UnauthorizedException('Token is invalid or expired');
    }
  }
}
