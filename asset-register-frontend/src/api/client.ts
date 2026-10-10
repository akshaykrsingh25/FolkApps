import type { Asset, Evidence, Location, Organization, VerificationAsset, VerificationCycle, VerificationPolicy, LifecycleReport, AssetTransfer, WarrantyRecord, InsightOverview, IndiaMapData } from '../domain/types';

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
  createVerificationPolicy: (token: string, organizationId: string, data: { scopeLocationId: string; cadenceMonths: number; graceDays: number }) =>
    request<VerificationPolicy>('/verification/policies',token,organizationId,data),
  verificationCycles: (token: string, organizationId: string) => request<VerificationCycle[]>('/verification/cycles',token,organizationId),
  createVerificationCycle: (token: string, organizationId: string, policyId: string) =>
    request<{ id: string }>('/verification/cycles',token,organizationId,{policyId}),
  verificationProgress: (token: string, organizationId: string, cycleId: string) =>
    request<VerificationAsset[]>(`/verification/cycles/${encodeURIComponent(cycleId)}/progress`,token,organizationId),
  recordVerificationScan: (token: string, organizationId: string, cycleId: string, data: { assetId: string; locationId: string; clientEventId: string; scannedAt: string }) =>
    request<{ id: string; duplicate: boolean }>(`/verification/cycles/${encodeURIComponent(cycleId)}/scans`,token,organizationId,data),
  reports: (token:string,organizationId:string)=>request<LifecycleReport[]>('/reports',token,organizationId),
  createReport: (token:string,organizationId:string,data:Record<string,unknown>)=>request<LifecycleReport>('/reports',token,organizationId,data),
  updateReport: (token:string,organizationId:string,id:string,data:Record<string,unknown>)=>request<LifecycleReport>(`/reports/${encodeURIComponent(id)}`,token,organizationId,data,'PATCH'),
  transfers: (token:string,organizationId:string)=>request<AssetTransfer[]>('/transfers',token,organizationId),
  createTransfer: (token:string,organizationId:string,data:Record<string,unknown>)=>request<{id:string}>('/transfers',token,organizationId,data),
  transferAction: (token:string,organizationId:string,id:string,action:string,handoverNotes?:string)=>request<AssetTransfer>(`/transfers/${encodeURIComponent(id)}`,token,organizationId,{action,handoverNotes},'PATCH'),
  warranties: (token:string,organizationId:string,assetId:string)=>request<WarrantyRecord[]>(`/assets/${encodeURIComponent(assetId)}/warranties`,token,organizationId),
  createWarranty: (token:string,organizationId:string,assetId:string,data:Record<string,unknown>)=>request<WarrantyRecord>(`/assets/${encodeURIComponent(assetId)}/warranties`,token,organizationId,data),
  insightOverview: (token:string,organizationId:string)=>request<InsightOverview>('/insights/overview',token,organizationId),
  mapData: (token:string,organizationId:string)=>request<IndiaMapData>('/insights/map',token,organizationId),
  confirmCentreCoordinates: (token:string,organizationId:string,id:string,data:{latitude:number;longitude:number})=>request<Location>(`/locations/${encodeURIComponent(id)}/coordinates`,token,organizationId,data,'PATCH'),
  assetByQr: (token: string, organizationId: string, qrPublicId: string) =>
    request<Asset>(`/assets/qr/${encodeURIComponent(qrPublicId)}`, token, organizationId),
};

type LocationKindValue = 'state' | 'centre' | 'warehouse' | 'building' | 'floor' | 'area';
