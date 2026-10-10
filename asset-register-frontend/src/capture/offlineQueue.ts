export interface OfflineAssetDraft {
  clientRequestId?: string;
  locationId: string;
  name: string;
  category: string;
  assetTag?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  condition?: string;
  status?: string;
  purchaseDate?: string;
  purchaseAmount?: number;
  sellerName?: string;
  sellerPhone?: string;
  notes?: string;
}

export interface PendingCapture {
  id: string;
  organizationId: string;
  queuedAt: string;
  payload: OfflineAssetDraft;
  attachments: PendingAttachment[];
  lastError: string | null;
}

export interface PendingAttachment { id: string; kind: 'asset_photo' | 'invoice'; name: string; contentType: string; file: Blob }
export interface NewAttachment { id?: string; kind: PendingAttachment['kind']; file: File }

interface StoredAttachment { id: string; kind: PendingAttachment['kind']; name: string; contentType: string; iv: ArrayBuffer; ciphertext: ArrayBuffer }

interface StoredQueueRecord {
  id: string;
  organizationId: string;
  queuedAt: string;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  lastError: string | null;
  attachments: StoredAttachment[];
}

const DATABASE_NAME = 'incuasset-capture-v1';
const QUEUE_STORE = 'encrypted-queue';
const KEY_STORE = 'device-key';
const SCAN_STORE = 'pending-verification-scans';
let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SCAN_STORE)) db.createObjectStore(SCAN_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open device capture storage'));
  });
  return databasePromise;
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Device storage request failed'));
  });
}

async function deviceKey(db: IDBDatabase) {
  const readTx = db.transaction(KEY_STORE, 'readonly');
  const stored = await requestValue<{ id: string; key: CryptoKey } | undefined>(readTx.objectStore(KEY_STORE).get('primary'));
  if (stored) return stored.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  try {
    const writeTx = db.transaction(KEY_STORE, 'readwrite');
    writeTx.objectStore(KEY_STORE).add({ id: 'primary', key });
    await new Promise<void>((resolve, reject) => { writeTx.oncomplete = () => resolve(); writeTx.onerror = () => reject(writeTx.error); });
    return key;
  } catch {
    const retryTx = db.transaction(KEY_STORE, 'readonly');
    const winner = await requestValue<{ id: string; key: CryptoKey } | undefined>(retryTx.objectStore(KEY_STORE).get('primary'));
    if (winner) return winner.key;
    throw new Error('Could not secure device capture storage');
  }
}

export async function enqueueOfflineAsset(organizationId: string, payload: OfflineAssetDraft, attachments: NewAttachment[] = []): Promise<PendingCapture> {
  const db = await openDatabase();
  const key = await deviceKey(db);
  const id = crypto.randomUUID();
  const queuedAt = new Date().toISOString();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const value = new TextEncoder().encode(JSON.stringify({ payload, organizationId }));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, value);
  const securedAttachments = await Promise.all(attachments.map(async ({ id: attachmentId, kind, file }) => {
    const attachmentIv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: attachmentIv }, key, await file.arrayBuffer());
    return { id: attachmentId || crypto.randomUUID(), kind, name: file.name, contentType: file.type || 'application/octet-stream', iv: attachmentIv.buffer.slice(0) as ArrayBuffer, ciphertext: encrypted };
  }));
  const record: StoredQueueRecord = { id, organizationId, queuedAt, iv: iv.buffer.slice(0) as ArrayBuffer, ciphertext, lastError: null, attachments: securedAttachments };
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  tx.objectStore(QUEUE_STORE).put(record);
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  return { id, organizationId, queuedAt, payload, attachments: attachments.map((attachment, index) => ({ id: securedAttachments[index].id, kind: attachment.kind, name: attachment.file.name, contentType: attachment.file.type || 'application/octet-stream', file: attachment.file })), lastError: null };
}

export async function listOfflineAssets(): Promise<PendingCapture[]> {
  const db = await openDatabase();
  const key = await deviceKey(db);
  const tx = db.transaction(QUEUE_STORE, 'readonly');
  const records = await requestValue<StoredQueueRecord[]>(tx.objectStore(QUEUE_STORE).getAll());
  const result = await Promise.all(records.map(async (record) => {
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv) }, key, record.ciphertext);
    const stored = JSON.parse(new TextDecoder().decode(bytes)) as { payload: OfflineAssetDraft; organizationId: string };
    const attachments = await Promise.all(record.attachments.map(async (attachment) => ({
      id: attachment.id, kind: attachment.kind, name: attachment.name, contentType: attachment.contentType,
      file: new Blob([await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(attachment.iv) }, key, attachment.ciphertext)], { type: attachment.contentType }),
    })));
    return { id: record.id, organizationId: stored.organizationId, queuedAt: record.queuedAt, payload: stored.payload, attachments, lastError: record.lastError };
  }));
  return result.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function markOfflineAssetError(id: string, lastError: string) {
  const db = await openDatabase();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(QUEUE_STORE);
  const record = await requestValue<StoredQueueRecord | undefined>(store.get(id));
  if (record) store.put({ ...record, lastError });
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}

export async function removeOfflineAsset(id: string) {
  const db = await openDatabase();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  tx.objectStore(QUEUE_STORE).delete(id);
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}

export async function removeOfflineAssetAttachment(id: string, attachmentId: string) {
  const db = await openDatabase();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(QUEUE_STORE);
  const record = await requestValue<StoredQueueRecord | undefined>(store.get(id));
  if (record) store.put({ ...record, attachments: record.attachments.filter((attachment) => attachment.id !== attachmentId) });
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}

export async function clearOfflineAssetsForTest() {
  const db = await openDatabase();
  const tx = db.transaction([QUEUE_STORE, KEY_STORE, SCAN_STORE], 'readwrite');
  tx.objectStore(QUEUE_STORE).clear();
  tx.objectStore(KEY_STORE).clear();
  tx.objectStore(SCAN_STORE).clear();
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  databasePromise = null;
}

export interface PendingVerificationScan {
  id: string; organizationId: string; cycleId: string; assetId: string; locationId: string; scannedAt: string; lastError: string | null;
}
interface StoredVerificationScan { id: string; organizationId: string; cycleId: string; iv: ArrayBuffer; ciphertext: ArrayBuffer; lastError: string | null; }

export async function enqueueVerificationScan(scan: Omit<PendingVerificationScan,'lastError'>) {
  const db=await openDatabase(); const key=await deviceKey(db); const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(scan)));
  const tx=db.transaction(SCAN_STORE,'readwrite');
  tx.objectStore(SCAN_STORE).put({id:scan.id,organizationId:scan.organizationId,cycleId:scan.cycleId,iv:iv.buffer.slice(0) as ArrayBuffer,ciphertext,lastError:null});
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
  return {...scan,lastError:null};
}

export async function listVerificationScans():Promise<PendingVerificationScan[]> {
  const db=await openDatabase(); const key=await deviceKey(db); const tx=db.transaction(SCAN_STORE,'readonly');
  const records=await requestValue<StoredVerificationScan[]>(tx.objectStore(SCAN_STORE).getAll());
  return Promise.all(records.map(async(record)=>({...JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(record.iv)},key,record.ciphertext))) as Omit<PendingVerificationScan,'lastError'>,lastError:record.lastError})));
}

export async function removeVerificationScan(id:string) {
  const db=await openDatabase(); const tx=db.transaction(SCAN_STORE,'readwrite'); tx.objectStore(SCAN_STORE).delete(id);
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}

export async function markVerificationScanError(id:string,lastError:string) {
  const db=await openDatabase(); const tx=db.transaction(SCAN_STORE,'readwrite'); const store=tx.objectStore(SCAN_STORE);
  const record=await requestValue<StoredVerificationScan|undefined>(store.get(id)); if(record) store.put({...record,lastError});
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
