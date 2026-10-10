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

  it('sends batch receipt decisions without changing the single-transfer contract', async () => {
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'batch-1',status:'received_with_discrepancy'}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    const receipt={action:'receive',items:[
      {assetId:'asset-1',receiptStatus:'accepted' as const},
      {assetId:'asset-2',receiptStatus:'not_received' as const,discrepancyNote:'Not found on arrival.'},
    ]};

    await expect(api.transferBatchAction('signed-token','org-123','batch-1',receipt)).resolves.toMatchObject({status:'received_with_discrepancy'});

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/transfer-batches/batch-1',expect.objectContaining({
      method:'PATCH',
      headers:expect.objectContaining({authorization:'Bearer signed-token','x-organization-id':'org-123','content-type':'application/json'}),
      body:JSON.stringify(receipt),
    }));
  });
});
