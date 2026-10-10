import { describe, expect, it } from 'vitest';
import centreDirectory from './centreDirectory.json';

describe('supplied Incuspaze centre directory', () => {
  it('normalizes the supplied 64 rows into 60 centres while preserving repeated-code floors', () => {
    const centres = centreDirectory as { code: string | null; name: string; city: string; stateName: string; floors?: string[] }[];
    const codes = centres.map((centre) => centre.code).filter((code): code is string => Boolean(code));
    const floors = centres.flatMap((centre) => (centre.floors || []).map((name) => ({ parentCode: centre.code, name })));
    const representedSourceRows = centres.reduce((count, centre) => count + Math.max(0, (centre.floors?.length || 0) - 1), centres.length);

    expect(centres).toHaveLength(60);
    expect(representedSourceRows).toBe(64);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('NFRO');
    expect(codes).not.toContain('NFO4');
    expect(floors).toHaveLength(8);
    expect(floors.every((floor) => floor.parentCode)).toBe(true);
    expect(new Set(centres.map((centre) => centre.stateName)).size).toBe(11);
    expect(new Set(centres.map((centre) => centre.city)).size).toBe(15);
  });

  it('does not invent coordinates or centre codes missing from the supplied list', () => {
    const centres = centreDirectory as { code: string | null; name: string; city: string; stateName: string }[];
    expect(centres.filter((centre) => !centre.code).map((centre) => centre.name)).toEqual([
      'Hyderabad Gumidelli 4b',
      'Rajpushpa GF',
    ]);
    expect(centres.every((centre) => centre.city && centre.stateName)).toBe(true);
  });
});
