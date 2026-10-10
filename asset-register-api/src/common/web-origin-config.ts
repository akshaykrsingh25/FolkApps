const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function parseWebOrigins(value: string | undefined, production = process.env.NODE_ENV === 'production'): string[] {
  const candidates = (value ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  if (candidates.length === 0) {
    if (production) throw new Error('WEB_ORIGIN must contain at least one approved HTTPS origin in production.');
    return [];
  }

  const origins = new Set<string>();
  for (const candidate of candidates) {
    if (candidate === '*') throw new Error('WEB_ORIGIN cannot contain a wildcard origin.');

    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error('WEB_ORIGIN contains an invalid URL.');
    }

    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('WEB_ORIGIN must contain bare HTTP(S) origins without credentials, paths, queries, or fragments.');
    }
    if (production && (parsed.protocol !== 'https:' || LOCAL_HOSTS.has(parsed.hostname))) {
      throw new Error('Production WEB_ORIGIN values must use HTTPS and cannot point to localhost.');
    }

    origins.add(parsed.origin);
  }

  return [...origins];
}
