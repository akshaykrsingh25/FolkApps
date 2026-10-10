import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoStore } from './store';

const values = new Map<string,string>();

describe('browser-only sample report workflow', () => {
  beforeEach(() => {
    values.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key:string) => values.get(key) ?? null,
      setItem: (key:string,value:string) => { values.set(key,value); },
    });
    vi.stubGlobal('crypto', { randomUUID: () => '40000000-0000-4000-8000-000000000002' });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows a realistic repair example in the sample workspace', async () => {
    await expect(demoStore.reports()).resolves.toMatchObject([
      { assetTag:'OF-00087', kind:'needs_repair', status:'in_repair', urgency:'high' },
    ]);
  });

  it('records a sample issue and permits only the visible repair progression', async () => {
    const report = await demoStore.createReport({
      assetId:'20000000-0000-4000-8000-000000000001',
      kind:'damaged', urgency:'urgent', description:'One network port is not working.',
    });
    expect(report).toMatchObject({ assetTag:'IT-00482', kind:'damaged', status:'reported', urgency:'urgent' });

    await demoStore.updateReport(report.id,'assigned');
    await demoStore.updateReport(report.id,'in_repair');
    const resolved = await demoStore.updateReport(report.id,'resolved');
    expect(resolved.resolvedAt).toEqual(expect.any(String));
    await expect(demoStore.updateReport(report.id,'reported')).rejects.toThrow('cannot move to that status');
    await expect(demoStore.reports()).resolves.toHaveLength(2);
  });
});
