import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('asset register API client', () => {
  it('sends scoped bearer requests and safely encodes search text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [], nextCursor: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.assets('signed-token', 'org-123', 'printer & switch');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/assets?q=printer+%26+switch',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer signed-token', 'x-organization-id': 'org-123' }),
      }),
    );
  });

  it('turns API validation responses into readable errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: ['Name is required', 'Category is required'] }), { status: 400 })));

    await expect(api.locations('signed-token', 'org-123')).rejects.toMatchObject({
      name: 'ApiError', status: 400, message: 'Name is required. Category is required',
    } satisfies Partial<ApiError>);
  });
});
