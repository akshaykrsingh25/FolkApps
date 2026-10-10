import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requestIdMiddleware, type RequestWithId } from './request-id.middleware';

function runMiddleware(headerValue?: string) {
  const request = { header: vi.fn(() => headerValue) } as unknown as RequestWithId;
  const response = { setHeader: vi.fn() } as unknown as Response;
  const next = vi.fn();
  requestIdMiddleware(request, response, next);
  return { request, response, next };
}

describe('request ID middleware', () => {
  it('preserves a valid upstream UUID and returns it in the response header', () => {
    const requestId = '4e9a2c17-68fe-48d4-9aca-c8a920d84671';
    const result = runMiddleware(requestId);

    expect(result.request.requestId).toBe(requestId);
    expect(result.response.setHeader).toHaveBeenCalledWith('x-request-id', requestId);
    expect(result.next).toHaveBeenCalledOnce();
  });

  it('replaces malformed caller values with a generated UUID', () => {
    const result = runMiddleware('bad\r\nheader');

    expect(result.request.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.request.requestId).not.toContain('bad');
    expect(result.response.setHeader).toHaveBeenCalledWith('x-request-id', result.request.requestId);
    expect(result.next).toHaveBeenCalledOnce();
  });
});
