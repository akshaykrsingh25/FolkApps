import { UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts';

export interface OidcEnvironment {
  authority: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
}

export function readOidcEnvironment(env: Record<string, string | undefined>): OidcEnvironment | null {
  const authority = env.VITE_OIDC_AUTHORITY?.trim();
  const clientId = env.VITE_OIDC_CLIENT_ID?.trim();
  const redirectUri = env.VITE_OIDC_REDIRECT_URI?.trim();
  const postLogoutRedirectUri = env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI?.trim();
  if (!authority || !clientId || !redirectUri || !postLogoutRedirectUri) return null;
  try {
    for (const url of [authority, redirectUri, postLogoutRedirectUri]) new URL(url);
  } catch {
    return null;
  }
  return { authority, clientId, redirectUri, postLogoutRedirectUri };
}

export function createOidcSettings(config: OidcEnvironment): UserManagerSettings {
  const sessionStore = typeof window === 'undefined'
    ? undefined
    : new WebStorageStateStore({ store: window.sessionStorage });
  return {
    authority: config.authority,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    post_logout_redirect_uri: config.postLogoutRedirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    loadUserInfo: true,
    ...(sessionStore ? { userStore: sessionStore, stateStore: sessionStore } : {}),
    automaticSilentRenew: false,
    monitorSession: false,
  };
}

const config = readOidcEnvironment(import.meta.env);
export const oidcConfigured = Boolean(config);
export const userManager = config ? new UserManager(createOidcSettings(config)) : null;
