import type { TransferBatchItem } from './types';

export type TransferReceiptDecision = Pick<TransferBatchItem, 'assetId' | 'receiptStatus'> & {
  discrepancyNote?: string | null;
};

export function findTransferReceiptAsset(items: TransferBatchItem[], scannedCode: string): TransferBatchItem | null {
  const normalized = scannedCode.trim().toLocaleLowerCase();
  if (!normalized) return null;
  return items.find((item) => item.qrPublicId.toLocaleLowerCase() === normalized || item.assetTag.toLocaleLowerCase() === normalized) ?? null;
}

export function validateTransferReceiptScans(
  decisions: TransferReceiptDecision[],
  scannedAssetIds: string[],
): string | null {
  const scanned = new Set(scannedAssetIds);
  if (decisions.some((item) => item.receiptStatus !== 'not_received' && !scanned.has(item.assetId))) {
    return 'Scan the QR label of each item marked as received or damaged.';
  }
  if (decisions.some((item) => item.receiptStatus === 'not_received' && scanned.has(item.assetId))) {
    return 'A scanned item cannot also be marked not received.';
  }
  return null;
}
