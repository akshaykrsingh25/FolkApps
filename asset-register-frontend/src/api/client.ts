import type { AlertPage, Asset, AssetActivityEvent, AssetCustody, AssetExportJob, AuditEventPage, EligibleCustodian, Evidence, Location, ManagedUser, NotificationInbox, NotificationPreferences, Organization, Role, RfidScanReconcileResult, VerificationAsset, VerificationCycle, VerificationPolicy, LifecycleReport, AssetTransfer, TransferBatch, WarrantyRecord, InsightOverview, IndiaMapData, NotificationCategory } from '../domain/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
}

async function request<T>(path: string, token: string, organizationId?: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      authorization: `Bearer ${token}`,
      ...(organizationId ? { 'x-organization-id': organizationId } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string | string[] };
    const message = Array.isArray(error.message) ? error.message.join('. ') : error.message;
    throw new ApiError(response.status, message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  organizations: (token: string) => request<Organization[]>('/me/organizations', token),
  managedUsers: (token: string, organizationId: string) => request<ManagedUser[]>('/users', token, organizationId),
  createManagedUser: (token: string, organizationId: string, data: { identitySubject: string; email: string; displayName: string; phoneNumber?: string; role: Role; scopeLocationId?: string }) =>
    request<{ id: string; email: string; displayName: string; phoneNumber: string | null; isActive: boolean; role: Role; scopeLocationId: string | null; created: boolean }>('/users', token, organizationId, data),
  setManagedUserActive: (token: string, organizationId: string, id: string, isActive: boolean) =>
    request<{ id: string; isActive: boolean }>(`/users/${encodeURIComponent(id)}/active`, token, organizationId, { isActive }, 'PATCH'),
  locations: (token: string, organizationId: string, filters: { q?: string; parentId?: string } = {}) => {
    const query = new URLSearchParams();
    if (filters.q) query.set('q', filters.q);
    if (filters.parentId) query.set('parentId', filters.parentId);
    const suffix = query.size ? `?${query}` : '';
    return request<Location[]>(`/locations${suffix}`, token, organizationId);
  },
  createLocation: (token: string, organizationId: string, data: Partial<Location> & { kind: LocationKindValue; name: string }) =>
    request<Location>('/locations', token, organizationId, data),
  assets: (token: string, organizationId: string, q = '', status = '', cursor = '', locationId = '') => {
    const params=new URLSearchParams(); if(q)params.set('q',q); if(status)params.set('status',status); if(cursor)params.set('cursor',cursor); if(locationId)params.set('locationId',locationId);
    const query = params.size ? `?${params}` : '';
    return request<{ data: Asset[]; nextCursor: string | null }>(`/assets${query}`, token, organizationId);
  },
  assetById: (token:string,organizationId:string,id:string)=>request<Asset>(`/assets/${encodeURIComponent(id)}`,token,organizationId),
  createAsset: (token: string, organizationId: string, data: Record<string, unknown>) =>
    request<Asset>('/assets', token, organizationId, data),
  updateAsset: (token: string, organizationId: string, id: string, data: Record<string, unknown>) =>
    request<Asset>(`/assets/${encodeURIComponent(id)}`, token, organizationId, data),
  evidence: (token: string, organizationId: string, assetId: string) =>
    request<Evidence[]>(`/assets/${encodeURIComponent(assetId)}/evidence`, token, organizationId),
  createEvidenceUpload: (token: string, organizationId: string, assetId: string, data: { clientEvidenceId: string; kind: string; originalName: string; contentType: string; byteSize: number; sha256: string }) =>
    request<{ evidenceId: string; alreadyCompleted?: boolean; uploadUrl: string | null; headers: Record<string, string>; expiresInSeconds: number }>(`/assets/${encodeURIComponent(assetId)}/evidence/upload-url`, token, organizationId, data),
  completeEvidenceUpload: (token: string, organizationId: string, assetId: string, evidenceId: string) =>
    request<Evidence>(`/assets/${encodeURIComponent(assetId)}/evidence/complete`, token, organizationId, { evidenceId }),
  evidenceDownload: (token: string, organizationId: string, assetId: string, evidenceId: string) =>
    request<{ downloadUrl: string; expiresInSeconds: number }>(`/assets/${encodeURIComponent(assetId)}/evidence/${encodeURIComponent(evidenceId)}/download`, token, organizationId),
  verificationPolicies: (token: string, organizationId: string) => request<VerificationPolicy[]>('/verification/policies',token,organizationId),
  createVerificationPolicy: (token: string, organizationId: string, data: { scopeLocationId: string; cadenceMonths: number; graceDays: number; escalationIntervalDays?: number }) =>
    request<VerificationPolicy>('/verification/policies',token,organizationId,data),
  updateVerificationPolicy: (token: string, organizationId: string, id: string, data: { cadenceMonths?: number; graceDays?: number; escalationIntervalDays?: number; enabled?: boolean }) =>
    request<VerificationPolicy>(`/verification/policies/${encodeURIComponent(id)}`,token,organizationId,data,'PATCH'),
  verificationCycles: (token: string, organizationId: string) => request<VerificationCycle[]>('/verification/cycles',token,organizationId),
  createVerificationCycle: (token: string, organizationId: string, policyId: string) =>
    request<{ id: string; reused: boolean }>('/verification/cycles',token,organizationId,{policyId}),
  closeVerificationCycle: (token: string, organizationId: string, cycleId: string, reason: string) =>
    request<{ id: string; status: string; closedAt: string; closeReason: string; unresolvedAssetCount: number }>(`/verification/cycles/${encodeURIComponent(cycleId)}/close`,token,organizationId,{reason}),
  verificationProgress: (token: string, organizationId: string, cycleId: string) =>
    request<VerificationAsset[]>(`/verification/cycles/${encodeURIComponent(cycleId)}/progress`,token,organizationId),
  recordVerificationScan: (token: string, organizationId: string, cycleId: string, data: { assetId: string; locationId: string; clientEventId: string; scannedAt: string; identificationMethod?: 'qr'|'barcode'|'rfid'|'manual' }) =>
    request<{ id: string; duplicate: boolean }>(`/verification/cycles/${encodeURIComponent(cycleId)}/scans`,token,organizationId,data),
  recordRfidScans: (token: string, organizationId: string, cycleId: string, data: { locationId: string; readings: { epc: string; clientEventId: string; scannedAt: string }[] }) =>
    request<RfidScanReconcileResult>(`/verification/cycles/${encodeURIComponent(cycleId)}/rfid-scans`,token,organizationId,data),
  reports: (token:string,organizationId:string)=>request<LifecycleReport[]>('/reports',token,organizationId),
  createReport: (token:string,organizationId:string,data:Record<string,unknown>)=>request<LifecycleReport>('/reports',token,organizationId,data),
  updateReport: (token:string,organizationId:string,id:string,data:Record<string,unknown>)=>request<LifecycleReport>(`/reports/${encodeURIComponent(id)}`,token,organizationId,data,'PATCH'),
  transfers: (token:string,organizationId:string)=>request<AssetTransfer[]>('/transfers',token,organizationId),
  createTransfer: (token:string,organizationId:string,data:Record<string,unknown>)=>request<{id:string}>('/transfers',token,organizationId,data),
  transferAction: (token:string,organizationId:string,id:string,action:string,handoverNotes?:string)=>request<AssetTransfer>(`/transfers/${encodeURIComponent(id)}`,token,organizationId,{action,handoverNotes},'PATCH'),
  transferBatches: (token:string,organizationId:string)=>request<TransferBatch[]>('/transfer-batches',token,organizationId),
  createTransferBatch: (token:string,organizationId:string,data:{assetIds:string[];toLocationId:string;handoverNotes?:string})=>request<{id:string;batchReference:string;itemCount:number}>('/transfer-batches',token,organizationId,data),
  transferBatchAction: (token:string,organizationId:string,id:string,data:{action:string;handoverNotes?:string;items?:{assetId:string;receiptStatus:'accepted'|'damaged'|'not_received';discrepancyNote?:string}[]})=>request<{id:string;status:string}>(`/transfer-batches/${encodeURIComponent(id)}`,token,organizationId,data,'PATCH'),
  warranties: (token:string,organizationId:string,assetId:string)=>request<WarrantyRecord[]>(`/assets/${encodeURIComponent(assetId)}/warranties`,token,organizationId),
  createWarranty: (token:string,organizationId:string,assetId:string,data:Record<string,unknown>)=>request<WarrantyRecord>(`/assets/${encodeURIComponent(assetId)}/warranties`,token,organizationId,data),
  assetActivity: (token:string,organizationId:string,assetId:string)=>request<AssetActivityEvent[]>(`/assets/${encodeURIComponent(assetId)}/activity`,token,organizationId),
  assetCustody: (token:string,organizationId:string,assetId:string)=>request<AssetCustody[]>(`/assets/${encodeURIComponent(assetId)}/custody`,token,organizationId),
  eligibleCustodians: (token:string,organizationId:string,assetId:string)=>request<EligibleCustodian[]>(`/assets/${encodeURIComponent(assetId)}/custodians`,token,organizationId),
  createAssetExport: (token:string,organizationId:string,data:{clientRequestId:string;scopeLocationId?:string;status?:string;search?:string})=>request<AssetExportJob>('/exports/assets',token,organizationId,data),
  assetExports: (token:string,organizationId:string)=>request<AssetExportJob[]>('/exports',token,organizationId),
  cancelAssetExport: (token:string,organizationId:string,id:string)=>request<AssetExportJob>(`/exports/${encodeURIComponent(id)}/cancel`,token,organizationId,{},'POST'),
  assetExportDownload: (token:string,organizationId:string,id:string)=>request<{downloadUrl:string;expiresInSeconds:number;sha256:string|null;byteSize:number|null}>(`/exports/${encodeURIComponent(id)}/download`,token,organizationId),
  issueCustody: (token:string,organizationId:string,assetId:string,data:Record<string,unknown>)=>request<{custodyId:string;issuedAt:string}>(`/assets/${encodeURIComponent(assetId)}/custody`,token,organizationId,data),
  returnCustody: (token:string,organizationId:string,assetId:string,custodyId:string,data:Record<string,unknown>)=>request<{custodyId:string;returnedAt:string}>(`/assets/${encodeURIComponent(assetId)}/custody/${encodeURIComponent(custodyId)}/return`,token,organizationId,data),
  insightOverview: (token:string,organizationId:string)=>request<InsightOverview>('/insights/overview',token,organizationId),
  alerts: (token:string,organizationId:string,cursor?:string)=>request<AlertPage>(`/insights/alerts${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,token,organizationId),
  notifications: (token:string,organizationId:string,cursor?:string)=>request<NotificationInbox>(`/notifications${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,token,organizationId),
  markNotificationRead: (token:string,organizationId:string,id:string)=>request<{id:string;readAt:string}>(`/notifications/${encodeURIComponent(id)}/read`,token,organizationId,{},'PATCH'),
  notificationPreferences: (token:string,organizationId:string)=>request<NotificationPreferences>('/notifications/preferences',token,organizationId),
  updateNotificationPreference: (token:string,organizationId:string,category:NotificationCategory,inAppEnabled:boolean)=>request<{category:NotificationCategory;inAppEnabled:boolean;highPriorityAlwaysOn:boolean}>('/notifications/preferences',token,organizationId,{category,inAppEnabled},'PATCH'),
  auditEvents: (token:string,organizationId:string,options:{cursor?:string;limit?:number;locationId?:string;eventType?:string}={})=>{
    const params=new URLSearchParams();
    for(const [key,value] of Object.entries(options))if(value!==undefined&&value!=='')params.set(key,String(value));
    return request<AuditEventPage>(`/audit/events${params.size?`?${params.toString()}`:''}`,token,organizationId);
  },
  mapData: (token:string,organizationId:string)=>request<IndiaMapData>('/insights/map',token,organizationId),
  confirmCentreCoordinates: (token:string,organizationId:string,id:string,data:{latitude:number;longitude:number;physicalAddress?:string|null})=>request<Location>(`/locations/${encodeURIComponent(id)}/coordinates`,token,organizationId,data,'PATCH'),
  assetByQr: (token: string, organizationId: string, qrPublicId: string) =>
    request<Asset>(`/assets/qr/${encodeURIComponent(qrPublicId)}`, token, organizationId),
  signedAssetQr: (token: string, organizationId: string, assetId: string) =>
    request<{ value: string; keyId: string; version: number }>(`/assets/${encodeURIComponent(assetId)}/qr`, token, organizationId),
  assetByRfidEpc: (token: string, organizationId: string, epc: string) =>
    request<Asset>(`/assets/rfid/${encodeURIComponent(epc.trim().toUpperCase())}`,token,organizationId),
};

type LocationKindValue = 'state' | 'centre' | 'warehouse' | 'building' | 'floor' | 'area';
