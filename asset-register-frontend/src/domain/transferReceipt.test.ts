import { describe, expect, it } from 'vitest';
import type { TransferBatchItem } from './types';
import { findTransferReceiptAsset, validateTransferReceiptScans } from './transferReceipt';

const items: TransferBatchItem[] = [
  { assetId: 'asset-1', assetTag: 'IT-00482', assetName: 'Network switch', qrPublicId: 'a1b2-c3d4', receiptStatus: 'pending', discrepancyNote: null },
  { assetId: 'asset-2', assetTag: 'IT-00483', assetName: 'Router', qrPublicId: 'e5f6-g7h8', receiptStatus: 'pending', discrepancyNote: null },
];

describe('transfer receipt scan checks', () => {
  it('matches a tag or QR identifier after trimming and case normalization', () => {
    expect(findTransferReceiptAsset(items, '  it-00482 ')).toMatchObject({ assetId: 'asset-1' });
    expect(findTransferReceiptAsset(items, 'E5F6-G7H8')).toMatchObject({ assetId: 'asset-2' });
  });

  it('rejects a code outside the manifest', () => {
    expect(findTransferReceiptAsset(items, 'unknown-tag')).toBeNull();
    expect(findTransferReceiptAsset(items, '  ')).toBeNull();
  });

  it('requires scans for received and damaged items, while preventing scanned items being called not received', () => {
    expect(validateTransferReceiptScans([
      { assetId: 'asset-1', receiptStatus: 'accepted' },
      { assetId: 'asset-2', receiptStatus: 'damaged' },
    ], ['asset-1'])).toBe('Scan the QR label of each item marked as received or damaged.');

    expect(validateTransferReceiptScans([
      { assetId: 'asset-1', receiptStatus: 'not_received' },
    ], ['asset-1'])).toBe('A scanned item cannot also be marked not received.');

    expect(validateTransferReceiptScans([
      { assetId: 'asset-1', receiptStatus: 'accepted' },
      { assetId: 'asset-2', receiptStatus: 'not_received', discrepancyNote: 'Not at receiving desk.' },
    ], ['asset-1'])).toBeNull();
  });
});
