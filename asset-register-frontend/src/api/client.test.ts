import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('asset register API client', () => {
  it('sends a tenant-scoped visual matching request and optional location filter', async () => {
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({matches:[]}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(api.visualMatches('signed-token','org-123','0123456789abcdef','floor-4')).resolves.toEqual({matches:[]});
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/assets/visual-matches?visualHash=0123456789abcdef&locationId=floor-4',expect.objectContaining({
      method:'GET',headers:expect.objectContaining({authorization:'Bearer signed-token','x-organization-id':'org-123'}),
    }));
  });

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

  it('links provisioned work identities to scoped roles without sending local credentials', async () => {
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({id:'user-1',email:'custodian@example.test',displayName:'Floor Custodian',phoneNumber:null,isActive:true,role:'asset_custodian',scopeLocationId:'floor-1',created:true}),{status:201}))
      .mockResolvedValueOnce(new Response(JSON.stringify({id:'user-1',isActive:false}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    const account={identitySubject:'oidc-subject',email:'custodian@example.test',displayName:'Floor Custodian',role:'asset_custodian' as const,scopeLocationId:'floor-1'};
    await expect(api.createManagedUser('signed-token','org-123',account)).resolves.toMatchObject({created:true,role:'asset_custodian'});
    await api.setManagedUserActive('signed-token','org-123','user-1',false);
    expect(fetchMock).toHaveBeenNthCalledWith(1,'http://localhost:4000/api/v1/users',expect.objectContaining({
      method:'POST',headers:expect.objectContaining({'x-organization-id':'org-123'}),body:JSON.stringify(account),
    }));
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('password');
    expect(fetchMock).toHaveBeenNthCalledWith(2,'http://localhost:4000/api/v1/users/user-1/active',expect.objectContaining({method:'PATCH'}));
  });

  it('sends tenant-scoped RFID batches and normalizes EPC lookups', async () => {
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({cycleId:'cycle-1',receivedCount:1,recordedCount:1,duplicateCount:0,wrongLocationCount:0,notRegisteredCount:0}),{status:201}))
      .mockResolvedValueOnce(new Response(JSON.stringify({id:'asset-1',rfidEpc:'E2801160600000000000034A'}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    const payload={locationId:'floor-4',readings:[{epc:'E2801160600000000000034A',clientEventId:'event-1',scannedAt:'2026-10-10T12:00:00.000Z'}]};
    await expect(api.recordRfidScans('signed-token','org-123','cycle-1',payload)).resolves.toMatchObject({recordedCount:1});
    await expect(api.assetByRfidEpc('signed-token','org-123','e2801160600000000000034a')).resolves.toMatchObject({rfidEpc:'E2801160600000000000034A'});
    expect(fetchMock).toHaveBeenNthCalledWith(1,'http://localhost:4000/api/v1/verification/cycles/cycle-1/rfid-scans',expect.objectContaining({
      method:'POST',headers:expect.objectContaining({authorization:'Bearer signed-token','x-organization-id':'org-123'}),body:JSON.stringify(payload),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2,'http://localhost:4000/api/v1/assets/rfid/E2801160600000000000034A',expect.anything());
  });

  it('reads and updates personal notification preferences and requests scoped audit pages', async () => {
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({preferences:[{category:'missing',inAppEnabled:true}],highPriorityAlwaysOn:true}),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({category:'missing',inAppEnabled:false,highPriorityAlwaysOn:true}),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({items:[],nextCursor:null}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);

    await expect(api.notificationPreferences('signed-token','org-123')).resolves.toMatchObject({highPriorityAlwaysOn:true});
    await expect(api.updateNotificationPreference('signed-token','org-123','missing',false)).resolves.toMatchObject({inAppEnabled:false});
    await expect(api.auditEvents('signed-token','org-123',{locationId:'loc 1',eventType:'asset.created',limit:50})).resolves.toMatchObject({items:[],nextCursor:null});

    expect(fetchMock).toHaveBeenNthCalledWith(1,'http://localhost:4000/api/v1/notifications/preferences',expect.objectContaining({headers:expect.objectContaining({'x-organization-id':'org-123'})}));
    expect(fetchMock).toHaveBeenNthCalledWith(2,'http://localhost:4000/api/v1/notifications/preferences',expect.objectContaining({method:'PATCH',body:JSON.stringify({category:'missing',inAppEnabled:false})}));
    expect(fetchMock).toHaveBeenNthCalledWith(3,'http://localhost:4000/api/v1/audit/events?locationId=loc+1&eventType=asset.created&limit=50',expect.anything());
  });

  it('loads subsequent scoped Watch pages with an encoded cursor', async () => {
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[],nextCursor:null}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(api.alerts('signed-token','org-123','cursor_01-02')).resolves.toMatchObject({items:[],nextCursor:null});
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/insights/alerts?cursor=cursor_01-02',expect.objectContaining({headers:expect.objectContaining({'x-organization-id':'org-123'})}));
  });
});
