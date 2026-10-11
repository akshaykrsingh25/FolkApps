import type { Evidence } from '../domain/types';
import type { PendingAttachment } from '../capture/offlineQueue';

type StoredEvidence = Evidence & { assetId: string; file: Blob };
async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('incuasset-demo-evidence-v1', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('files', { keyPath: ['assetId', 'id'] });
      store.createIndex('assetId', 'assetId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('files', mode);
    const request = action(tx.objectStore('files'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Browser storage could not save the attachment.')); };
    tx.onerror = () => { /* onabort reports failed transactions */ };
  });
}
export async function saveDemoEvidence(assetId: string, attachment: PendingAttachment): Promise<void> {
  await transact('readwrite', store => store.put({
    assetId, id: attachment.id, kind: attachment.kind, originalName: attachment.name,
    contentType: attachment.contentType, byteSize: attachment.file.size,
    createdAt: new Date().toISOString(), file: attachment.file,
  } satisfies StoredEvidence));
}
export async function listDemoEvidence(assetId: string): Promise<Evidence[]> {
  const items = await transact<StoredEvidence[]>('readonly', store => store.index('assetId').getAll(assetId));
  return items.map(({ assetId: _assetId, file: _file, ...metadata }) => metadata);
}
export async function readDemoEvidence(assetId: string, id: string): Promise<Blob> {
  const item = await transact<StoredEvidence | undefined>('readonly', store => store.get([assetId, id]));
  if (!item) throw new Error('This attachment is no longer available in this browser.');
  return item.file;
}
