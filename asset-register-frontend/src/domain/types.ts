export type Role = 'head_office' | 'state_head' | 'centre_head' | 'asset_custodian' | 'viewer';
export type LocationKind = 'state' | 'centre' | 'warehouse' | 'building' | 'floor' | 'area';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  roles: { role: Role; scopeLocationId: string | null }[];
}

export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  phoneNumber: string | null;
  isActive: boolean;
  roles: { role: Role; scopeLocationId: string | null; scopeLocationName: string | null }[];
}

export interface Location {
  id: string;
  parentId: string | null;
  kind: LocationKind;
  code: string | null;
  name: string;
  city: string | null;
  stateName: string | null;
  physicalAddress: string | null;
  physicalAddressStatus: string;
  latitude: number | null;
  longitude: number | null;
  coordinatesStatus: string;
}

export interface Asset {
  id: string;
  locationId: string;
  locationName: string;
  assetTag: string;
  qrPublicId: string;
  rfidEpc?: string | null;
  name: string;
  category: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  status: string;
  condition: string;
  ownershipType: 'INCUSPAZE_OWNED'|'CLIENT_DEDICATED'|'VENDOR_LEASED'|'TRIAL_DEMO';
  purchaseDate: string | null;
  purchaseAmount: string | null;
  currency: string;
  sellerName: string | null;
  sellerPhone: string | null;
  createdAt: string;
}

export interface Evidence {
  id: string;
  kind: string;
  originalName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

export interface VerificationPolicy {
  id: string; scopeLocationId: string; scopeLocationName: string; cadenceMonths: number; graceDays: number; enabled: boolean;
}

export interface VerificationCycle {
  id: string; policyId: string; scopeLocationId: string; scopeLocationName: string; startsAt: string; graceEndsAt: string;
  status: string; assetCount: number; scannedCount: number;
}

export interface VerificationAsset {
  assetId: string; assetTag: string; name: string; locationId: string; locationName: string; scanned: boolean;
  reviewState: 'verified' | 'not_yet_scanned' | 'unseen_after_window';
}

export interface LifecycleReport { id:string; assetId:string; assetTag:string; assetName:string; locationId:string; locationName:string; kind:string; status:string; urgency:string; description:string; resolutionNotes?:string|null; reportedAt:string; resolvedAt?:string|null; }
export interface AssetTransfer { id:string; assetId:string; assetTag:string; assetName:string; fromLocationId:string; fromLocationName:string; toLocationId:string; toLocationName:string; status:string; requestedAt:string; receivedAt?:string|null; handoverNotes?:string|null; }
export interface TransferBatchItem { assetId:string; assetTag:string; assetName:string; qrPublicId:string; receiptStatus:'pending'|'accepted'|'damaged'|'not_received'|'cancelled'; discrepancyNote:string|null; }
export interface TransferBatch { id:string; batchReference:string; fromLocationId:string; fromLocationName:string; toLocationId:string; toLocationName:string; status:string; requestedAt:string; dispatchedAt:string|null; autoFlagAfter:string|null; completedAt:string|null; handoverNotes:string|null; overdue:boolean; itemCount:number; pendingCount:number; items:TransferBatchItem[]; }
export interface WarrantyRecord { id:string; coverageKind:string; provider:string|null; servicePhone:string|null; startsOn:string|null; endsOn:string|null; terms:string|null; }
export interface AssetActivityEvent { id:string; eventType:string; occurredAt:string; actorName:string; details:Record<string,unknown>; }
export interface AssetExportJob {
  id: string;
  status: 'queued'|'running'|'completed'|'failed'|'cancelled'|'expired';
  scopeLocationId: string|null;
  scopeLocationName: string|null;
  filters: { status: string|null; search: string|null };
  processedRows: number;
  resultBytes: number|null;
  resultSha256: string|null;
  failureCode: string|null;
  createdAt: string;
  startedAt: string|null;
  completedAt: string|null;
  expiresAt: string|null;
}
export interface AssetCustody { custodyId:string; custodianUserId:string; custodianName:string; issuedByName:string|null; issuedAt:string; issueCondition:string; issueNotes:string|null; returnedByName:string|null; returnedAt:string|null; returnCondition:string|null; returnNotes:string|null; }
export interface EligibleCustodian { userId:string; displayName:string; }
export interface OperationalAlert { id:string; kind:string; severity:'high'|'medium'|'low'; title:string; description:string; assetId:string; assetTag:string; assetName:string; locationName:string; occurredAt:string; relatedId:string|null; }
export interface InsightOverview { assetCount:number; centreCount:number; missingCount:number; attentionCount:number; unusedCount:number; openReportCount:number; warrantyExpiringCount:number; activeCycleCount:number; openTransferCount:number; scanCompletionPercent:number; }
export interface MapCentre { id:string; name:string; code:string|null; city:string|null; stateName:string|null; physicalAddress:string|null; physicalAddressStatus:string; latitude:number|null; longitude:number|null; coordinatesStatus:string; assetCount:number; missingCount:number; attentionCount:number; unusedCount:number; }
export interface MapState { stateName:string; centreCount:number; assetCount:number; missingCount:number; attentionCount:number; unusedCount:number; }
export interface IndiaMapData { states:MapState[]; centres:MapCentre[]; }

export interface SessionUser {
  subject: string;
  name: string;
  email: string;
  accessToken: string;
}
