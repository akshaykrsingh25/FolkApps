import type { Asset, Location } from '../domain/types';
import type { CaptureSuggestions } from './ocr';

export type RegistrationSeed = CaptureSuggestions & { locationId?: string; ownershipType?: Asset['ownershipType']; condition?: string; notes?: string };
export function similarAssetSeed(asset: Asset): RegistrationSeed {
  return { sourceText: '', name: asset.name, category: asset.category, locationId: asset.locationId,
    manufacturer: asset.manufacturer || undefined, model: asset.model || undefined,
    ownershipType: asset.ownershipType, condition: 'good', purchaseDate: asset.purchaseDate?.slice(0,10) || undefined,
    purchaseAmount: asset.purchaseAmount == null ? undefined : String(asset.purchaseAmount),
    sellerName: asset.sellerName || undefined, sellerPhone: asset.sellerPhone || undefined };
}
export function locationPath(locations: Location[], id: string): string {
  const names: string[] = []; const seen = new Set<string>(); let current = locations.find(item => item.id === id);
  while (current && !seen.has(current.id)) { seen.add(current.id); names.unshift(current.name); current = locations.find(item => item.id === current?.parentId); }
  return names.join(' › ');
}
export function missingAssetDetails(asset: Asset): string[] {
  return [!asset.purchaseDate && 'Purchase date', asset.purchaseAmount == null && 'Unit price', !asset.sellerName && 'Seller'].filter((value): value is string => Boolean(value));
}
export function rememberedLocation(organizationId: string, locations: Location[]): string {
  try { const id = sessionStorage.getItem(`incuasset-working-location:${organizationId}`) || ''; return locations.some(item => item.id === id && item.kind !== 'state') ? id : ''; } catch { return ''; }
}
export function rememberLocation(organizationId: string, id: string) {
  try { sessionStorage.setItem(`incuasset-working-location:${organizationId}`, id); } catch { /* Registration remains available when session storage is disabled. */ }
}

export interface RegistrationBatch { payload: string; ids: string[]; records: Asset[] }
export async function registerCopies(batch: RegistrationBatch, save: (requestId: string) => Promise<Asset>, onProgress: (records: Asset[]) => void): Promise<Asset[]> {
  for (let index=batch.records.length;index<batch.ids.length;index++) {
    const record=await save(batch.ids[index]);
    batch.records.push(record); onProgress([...batch.records]);
  }
  return [...batch.records];
}
