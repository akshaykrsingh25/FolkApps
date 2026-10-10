export type Role = 'head_office' | 'state_head' | 'centre_head' | 'asset_custodian' | 'viewer';
export type LocationKind = 'state' | 'centre' | 'warehouse' | 'building' | 'floor' | 'area';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  roles: { role: Role; scopeLocationId: string | null }[];
}

export interface Location {
  id: string;
  parentId: string | null;
  kind: LocationKind;
  code: string | null;
  name: string;
  city: string | null;
  stateName: string | null;
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
  name: string;
  category: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  status: string;
  condition: string;
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
export interface WarrantyRecord { id:string; coverageKind:string; provider:string|null; servicePhone:string|null; startsOn:string|null; endsOn:string|null; terms:string|null; }
export interface InsightOverview { assetCount:number; centreCount:number; missingCount:number; attentionCount:number; unusedCount:number; openReportCount:number; warrantyExpiringCount:number; activeCycleCount:number; openTransferCount:number; scanCompletionPercent:number; }
export interface MapCentre { id:string; name:string; code:string|null; city:string|null; stateName:string|null; latitude:number|null; longitude:number|null; coordinatesStatus:string; assetCount:number; missingCount:number; attentionCount:number; unusedCount:number; }
export interface MapState { stateName:string; centreCount:number; assetCount:number; missingCount:number; attentionCount:number; unusedCount:number; }
export interface IndiaMapData { states:MapState[]; centres:MapCentre[]; }

export interface SessionUser {
  subject: string;
  name: string;
  email: string;
  accessToken: string;
}
