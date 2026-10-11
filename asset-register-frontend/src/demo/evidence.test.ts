import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { listDemoEvidence, readDemoEvidence, saveDemoEvidence } from './evidence';

it('saves original attachment bytes, survives reopening, and isolates assets', async () => {
  const assetId = crypto.randomUUID();
  const attachment = { id: crypto.randomUUID(), kind: 'invoice' as const, name: 'invoice.png', contentType: 'image/png', file: new Blob(['original invoice bytes'], { type: 'image/png' }) };
  await saveDemoEvidence(assetId, attachment);
  expect(await listDemoEvidence(assetId)).toMatchObject([{ id: attachment.id, originalName: 'invoice.png', byteSize: 22 }]);
  expect(await (await readDemoEvidence(assetId, attachment.id)).text()).toBe('original invoice bytes');
  expect(await listDemoEvidence('another-asset')).toEqual([]);
  await expect(readDemoEvidence('another-asset', attachment.id)).rejects.toThrow('no longer available');
  await saveDemoEvidence(assetId, attachment);
  expect(await listDemoEvidence(assetId)).toHaveLength(1);
});
