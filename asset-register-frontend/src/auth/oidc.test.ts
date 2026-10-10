import { describe, expect, it } from 'vitest';
import { createOidcSettings, readOidcEnvironment } from './oidc';

describe('OIDC configuration', () => {
  it('stays disabled until every identity-provider value is present', () => {
    expect(readOidcEnvironment({ VITE_OIDC_AUTHORITY: 'https://login.example.test' })).toBeNull();
  });

  it('rejects malformed redirect URLs', () => {
    expect(readOidcEnvironment({
      VITE_OIDC_AUTHORITY: 'https://login.example.test',
      VITE_OIDC_CLIENT_ID: 'asset-register',
      VITE_OIDC_REDIRECT_URI: '/callback',
      VITE_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:5173/',
    })).toBeNull();
  });

  it('uses authorization code flow and session-scoped browser storage', () => {
    const settings = createOidcSettings({
      authority: 'https://login.example.test',
      clientId: 'asset-register',
      redirectUri: 'http://localhost:5173/auth/callback',
      postLogoutRedirectUri: 'http://localhost:5173/',
    });
    expect(settings.response_type).toBe('code');
    expect(settings.scope).toContain('openid');
    expect(settings.automaticSilentRenew).toBe(false);
  });
});
