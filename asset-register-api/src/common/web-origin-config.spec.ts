import { describe, expect, it } from 'vitest';
import { parseWebOrigins } from './web-origin-config';

describe('parseWebOrigins', () => {
  it('trims, normalizes, and deduplicates approved origins', () => {
    expect(parseWebOrigins(' https://asset.example.com/ , https://admin.example.com,https://asset.example.com ', true)).toEqual([
      'https://asset.example.com',
      'https://admin.example.com',
    ]);
  });

  it('allows localhost HTTP origins outside production', () => {
    expect(parseWebOrigins(' http://localhost:5173, http://127.0.0.1:5173 ', false)).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('fails closed when production has no configured origin', () => {
    expect(() => parseWebOrigins(' , ', true)).toThrow('WEB_ORIGIN must contain at least one approved HTTPS origin in production.');
  });

  it.each([
    '*',
    'http://asset.example.com',
    'https://asset.example.com/path',
    'https://user:pass@asset.example.com',
    'https://asset.example.com?debug=true',
    'not a URL',
  ])('rejects unsafe or malformed production origins: %s', (origin) => {
    expect(() => parseWebOrigins(origin, true)).toThrow();
  });
});
