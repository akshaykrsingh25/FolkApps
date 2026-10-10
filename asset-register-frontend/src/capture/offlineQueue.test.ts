import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearOfflineAssetsForTest, enqueueOfflineAsset, enqueueVerificationScan, listOfflineAssets, listVerificationScans, markOfflineAssetError, markVerificationScanError, removeOfflineAsset, removeOfflineAssetAttachment, removeVerificationScan } from './offlineQueue';

afterEach(async () => clearOfflineAssetsForTest());

describe('encrypted offline asset queue', () => {
  it('keeps a recoverable draft encrypted until it is acknowledged', async () => {
    const original = { locationId: 'location-1', name: 'Floor printer', category: 'Office equipment', purchaseAmount: 17000 };
    const photo = new File(['private-photo-data'], 'asset.jpg', { type: 'image/jpeg' });
    const queued = await enqueueOfflineAsset('org-1', original, [{ kind: 'asset_photo', file: photo }]);
    expect(queued.lastError).toBeNull();
    const restored = await listOfflineAssets();
    expect(restored).toMatchObject([{ id: queued.id, organizationId: 'org-1', payload: original, attachments: [{ kind: 'asset_photo', name: 'asset.jpg' }] }]);
    expect(await restored[0].attachments[0].file.text()).toBe('private-photo-data');

    await markOfflineAssetError(queued.id, 'Connection unavailable');
    expect((await listOfflineAssets())[0].lastError).toBe('Connection unavailable');
    await removeOfflineAssetAttachment(queued.id, restored[0].attachments[0].id);
    expect((await listOfflineAssets())[0].attachments).toEqual([]);
    await removeOfflineAsset(queued.id);
    expect(await listOfflineAssets()).toEqual([]);
  });

  it('stores cycle scans encrypted and keeps them until server acknowledgement', async()=>{
    const scan={id:'scan-1',organizationId:'org-1',cycleId:'cycle-1',assetId:'asset-1',locationId:'floor-1',scannedAt:'2026-10-09T00:00:00.000Z'};
    await enqueueVerificationScan(scan);
    expect(await listVerificationScans()).toEqual([{...scan,lastError:null}]);
    await markVerificationScanError(scan.id,'Connection unavailable');
    expect((await listVerificationScans())[0].lastError).toBe('Connection unavailable');
    await removeVerificationScan(scan.id);
    expect(await listVerificationScans()).toEqual([]);
  });
});
