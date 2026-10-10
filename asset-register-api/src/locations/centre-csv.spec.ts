import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseCentreCsv } from './centre-csv';

describe('centre directory CSV', () => {
  it('parses quoted commas, CRLF, BOM, and user-facing header labels', () => {
    const rows = parseCentreCsv('\uFEFFCenter Code,Center Name,City,State\r\nAHKC,"Ahmedabad, Krish Cubicle",Ahmedabad,Gujarat\r\n');
    expect(rows).toEqual([{ rowNumber: 2, code: 'AHKC', name: 'Ahmedabad, Krish Cubicle', city: 'Ahmedabad', stateName: 'Gujarat', physicalAddress: '', kind: 'centre', parentCentreCode: '', errors: [] }]);
  });

  it('accepts an optional physical address and rejects oversized address values', () => {
    const rows = parseCentreCsv('Center Code,Center Name,City,State,Physical Address\nA,First,Delhi,Delhi,"Tower 4, Connaught Place"\n');
    expect(rows[0].physicalAddress).toBe('Tower 4, Connaught Place');
    const oversized = parseCentreCsv(`Center Code,Center Name,City,State,Address\nA,First,Delhi,Delhi,${'x'.repeat(301)}\n`);
    expect(oversized[0].errors).toContain('Physical address must be 300 characters or fewer');
  });

  it('flags duplicate codes and missing explicit state instead of inferring it from city', () => {
    const rows = parseCentreCsv('center code,center name,city,state\nA,First,Austin,Texas\na,Second,Austin,\n');
    expect(rows[1].errors).toContain('Duplicate centre code in this CSV');
    expect(rows[1].errors).toContain('State is required; city names are not used to infer it');
  });

  it('rejects malformed quoted data and missing columns as request errors', () => {
    expect(() => parseCentreCsv('center_code,name,city,state\n1,"Bad row,Delhi,Delhi')).toThrow('A quoted field is not closed');
    expect(() => parseCentreCsv('center_code,city\nA,Delhi')).toThrow('Required columns');
  });

  it('models repeated source codes as one centre with direct floor children', () => {
    const rows = parseCentreCsv([
      'Center Code,Center Name,City,State,Location Kind,Parent Center Code',
      'IKDS,iKeva Divyasree,Hyderabad,Telangana,centre,',
      ',2F,Hyderabad,Telangana,floor,IKDS',
      ',3F,Hyderabad,Telangana,floor,IKDS',
    ].join('\n'));
    expect(rows.map(({ kind, parentCentreCode, errors }) => ({ kind, parentCentreCode, errors }))).toEqual([
      { kind: 'centre', parentCentreCode: '', errors: [] },
      { kind: 'floor', parentCentreCode: 'IKDS', errors: [] },
      { kind: 'floor', parentCentreCode: 'IKDS', errors: [] },
    ]);
  });

  it('requires floor rows to reference a centre in the same import and rejects floor codes', () => {
    const rows = parseCentreCsv([
      'Center Code,Center Name,City,State,Location Kind,Parent Center Code',
      'IKDS,2F,Hyderabad,Telangana,floor,UNKNOWN',
    ].join('\n'));
    expect(rows[0].errors).toContain('A floor inherits its identity from its parent centre and must not have a centre code');
    expect(rows[0].errors).toContain('Parent centre code must belong to a centre row in this CSV');
  });

  it('accepts the prepared centre directory without duplicate codes or invented identifiers', async () => {
    const csv = await readFile(new URL('../../database/seeds/incuspaze-centre-directory.csv', import.meta.url), 'utf8');
    const rows = parseCentreCsv(csv);
    const centres = rows.filter((row) => row.kind === 'centre');
    const floors = rows.filter((row) => row.kind === 'floor');

    expect(rows.flatMap((row) => row.errors)).toEqual([]);
    expect(centres).toHaveLength(60);
    expect(floors).toHaveLength(8);
    expect(centres.filter((row) => !row.code)).toHaveLength(2);
    expect(new Set(centres.map((row) => row.code).filter(Boolean)).size).toBe(58);
  });
});
