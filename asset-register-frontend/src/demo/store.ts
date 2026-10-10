import type { Asset, Location, Organization } from '../domain/types';
import centreDirectory from './centreDirectory.json';

export const DEMO_ORGANIZATION: Organization = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'IncuAsset demonstration workspace',
  slug: 'demo',
  roles: [{ role: 'head_office', scopeLocationId: null }],
};

const DEMO_LOCATIONS: Location[] = [
  { id: '10000000-0000-4000-8000-000000000001', parentId: null, kind: 'state', code: null, name: 'Gujarat', city: null, stateName: 'Gujarat', physicalAddress: null, physicalAddressStatus: 'unverified', latitude: null, longitude: null, coordinatesStatus: 'unverified' },
  { id: '10000000-0000-4000-8000-000000000002', parentId: '10000000-0000-4000-8000-000000000001', kind: 'centre', code: 'AHKC', name: 'Ahmedabad Krish Cubicle', city: 'Ahmedabad', stateName: 'Gujarat', physicalAddress: null, physicalAddressStatus: 'unverified', latitude: null, longitude: null, coordinatesStatus: 'unverified' },
  { id: '10000000-0000-4000-8000-000000000003', parentId: null, kind: 'state', code: null, name: 'Karnataka', city: null, stateName: 'Karnataka', physicalAddress: null, physicalAddressStatus: 'unverified', latitude: null, longitude: null, coordinatesStatus: 'unverified' },
  { id: '10000000-0000-4000-8000-000000000004', parentId: '10000000-0000-4000-8000-000000000003', kind: 'centre', code: 'BLQS', name: 'Bangalore Qube Software', city: 'Bengaluru', stateName: 'Karnataka', physicalAddress: null, physicalAddressStatus: 'unverified', latitude: null, longitude: null, coordinatesStatus: 'unverified' },
  { id: '10000000-0000-4000-8000-000000000005', parentId: '10000000-0000-4000-8000-000000000004', kind: 'building', code: null, name: 'Main building', city: 'Bengaluru', stateName: 'Karnataka', physicalAddress: null, physicalAddressStatus: 'unverified', latitude: null, longitude: null, coordinatesStatus: 'unverified' },
  { id: '10000000-0000-4000-8000-000000000006', parentId: '10000000-0000-4000-8000-000000000005', kind: 'floor', code: null, name: 'Floor 4', city: 'Bengaluru', stateName: 'Karnataka', physicalAddress: null, physicalAddressStatus: 'unverified', latitude: null, longitude: null, coordinatesStatus: 'unverified' },
];

// A demo copy of the supplied active-centre list. Where a code appears on
// multiple floor rows, the centre is represented once and those floors sit
// directly below it. Pins remain unset until a centre confirms its address.
const directoryLocations = (() => {
  const rows = centreDirectory as { code: string | null; name: string; city: string; stateName: string; floors?: string[] }[];
  const existing = new Map(DEMO_LOCATIONS.filter((item) => item.kind === 'centre').map((item) => [`${item.code}|${item.name}`, item.id]));
  const stateIds = new Map(DEMO_LOCATIONS.filter((item) => item.kind === 'state').map((item) => [item.name, item.id]));
  const result: Location[] = [...DEMO_LOCATIONS];
  let nextId = 7;
  const id = () => `10000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
  for (const row of rows) {
    let stateId = stateIds.get(row.stateName);
    if (!stateId) {
      stateId = id();
      stateIds.set(row.stateName, stateId);
      result.push({ id: stateId, parentId: null, kind: 'state', code: null, name: row.stateName, city: null, stateName: row.stateName, physicalAddress: null, physicalAddressStatus: 'unverified', latitude: null, longitude: null, coordinatesStatus: 'unverified' });
    }
    const key = `${row.code || ''}|${row.name}`;
    let centreId = existing.get(key);
    if (!centreId) {
      centreId = id();
      existing.set(key, centreId);
      result.push({ id: centreId, parentId: stateId, kind: 'centre', code: row.code || null, name: row.name, city: row.city, stateName: row.stateName, physicalAddress: null, physicalAddressStatus: 'unverified', latitude: null, longitude: null, coordinatesStatus: 'unverified' });
    }
    for (const floorName of row.floors || []) {
      if (result.some((item) => item.kind === 'floor' && item.parentId === centreId && item.name === floorName)) continue;
      result.push({ id: id(), parentId: centreId, kind: 'floor', code: null, name: floorName, city: row.city, stateName: row.stateName, physicalAddress: null, physicalAddressStatus: 'unverified', latitude: null, longitude: null, coordinatesStatus: 'unverified' });
    }
  }
  return result;
})();

const DEMO_ASSETS: Asset[] = [
  { id: '20000000-0000-4000-8000-000000000001', locationId: DEMO_LOCATIONS[5].id, locationName: 'Floor 4', assetTag: 'IT-00482', qrPublicId: '30000000-0000-4000-8000-000000000001', name: 'Network switch', category: 'IT equipment', serialNumber: 'SW-2488', manufacturer: 'Cisco', model: 'Catalyst 9200', status: 'active', condition: 'good', ownershipType: 'INCUSPAZE_OWNED', purchaseDate: '2024-09-12', purchaseAmount: '48500.00', currency: 'INR', sellerName: 'Network Systems India', sellerPhone: null, createdAt: new Date().toISOString() },
  { id: '20000000-0000-4000-8000-000000000002', locationId: DEMO_LOCATIONS[1].id, locationName: 'Ahmedabad Krish Cubicle', assetTag: 'OF-00087', qrPublicId: '30000000-0000-4000-8000-000000000002', name: 'Office printer', category: 'Office equipment', serialNumber: 'PR-4432', manufacturer: 'HP', model: 'LaserJet Pro', status: 'in_repair', condition: 'fair', ownershipType: 'INCUSPAZE_OWNED', purchaseDate: '2023-02-18', purchaseAmount: '28900.00', currency: 'INR', sellerName: 'Office Tech', sellerPhone: null, createdAt: new Date().toISOString() },
];

const STORAGE_KEY = 'incuasset-demo-v3';
interface DemoState { locations: Location[]; assets: Asset[] }

function read(): DemoState {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    if (value) {
      const saved=JSON.parse(value) as DemoState;
      return {...saved,locations:saved.locations.map((location)=>({...location,physicalAddress:location.physicalAddress??null,physicalAddressStatus:location.physicalAddressStatus||'unverified'})),assets:saved.assets.map(asset=>({...asset,ownershipType:asset.ownershipType||'INCUSPAZE_OWNED'}))};
    }
  } catch { /* use the clean synthetic fixtures */ }
  return { locations: [...directoryLocations], assets: [...DEMO_ASSETS] };
}

function write(state: DemoState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const demoStore = {
  organizations: async () => [DEMO_ORGANIZATION],
  locations: async (q = '') => read().locations.filter((location) => !q || `${location.name} ${location.code || ''} ${location.city || ''} ${location.physicalAddress || ''}`.toLowerCase().includes(q.toLowerCase())),
  createLocation: async (data: { kind: Location['kind']; name: string; parentId?: string; code?: string; city?: string; stateName?: string }) => {
    const state = read();
    const item: Location = { id: crypto.randomUUID(), parentId: data.parentId || null, kind: data.kind, name: data.name, code: data.code || null, city: data.city || null, stateName: data.stateName || null, physicalAddress: null, physicalAddressStatus: 'unverified', latitude: null, longitude: null, coordinatesStatus: 'unverified' };
    state.locations.push(item); write(state); return item;
  },
  assets: async (q = '') => read().assets.filter((asset) => !q || `${asset.name} ${asset.assetTag} ${asset.serialNumber || ''} ${asset.category}`.toLowerCase().includes(q.toLowerCase())),
  createAsset: async (data: Record<string, unknown>) => {
    const state = read();
    const requestId = String(data.clientRequestId || '');
    const replay = requestId ? state.assets.find((item) => item.id === requestId) : undefined;
    if (replay) return replay;
    const location = state.locations.find((item) => item.id === data.locationId);
    const asset: Asset = {
      id: requestId || crypto.randomUUID(), locationId: String(data.locationId), locationName: location?.name || 'Unknown place',
      assetTag: String(data.assetTag || `INC-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`),
      qrPublicId: crypto.randomUUID(), name: String(data.name), category: String(data.category),
      serialNumber: String(data.serialNumber || '') || null, manufacturer: String(data.manufacturer || '') || null,
      model: String(data.model || '') || null, status: 'active', condition: String(data.condition || 'good'),
      ownershipType: String(data.ownershipType || 'INCUSPAZE_OWNED') as Asset['ownershipType'],
      purchaseDate: String(data.purchaseDate || '') || null, purchaseAmount: String(data.purchaseAmount || '') || null,
      currency: String(data.currency || 'INR'), sellerName: String(data.sellerName || '') || null,
      sellerPhone: String(data.sellerPhone || '') || null, createdAt: new Date().toISOString(),
    };
    state.assets.unshift(asset); write(state); return asset;
  },
  updateAsset: async (id: string, data: Record<string, unknown>) => {
    const state = read();
    const asset = state.assets.find((item) => item.id === id);
    if (!asset) throw new Error('Asset was not found');
    const location = data.locationId ? state.locations.find((item) => item.id === data.locationId) : undefined;
    Object.assign(asset, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== '')));
    if (location) asset.locationName = location.name;
    write(state); return asset;
  },
  assetByQr: async (id: string) => read().assets.find((asset) => asset.qrPublicId === id) || null,
};
