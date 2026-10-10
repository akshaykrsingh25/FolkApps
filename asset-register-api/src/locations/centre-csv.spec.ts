import { describe, expect, it } from 'vitest';
import { parseCentreCsv } from './centre-csv';

describe('centre directory CSV', () => {
  it('parses quoted commas, CRLF, BOM, and user-facing header labels', () => {
    const rows = parseCentreCsv('\uFEFFCenter Code,Center Name,City,State\r\nAHKC,"Ahmedabad, Krish Cubicle",Ahmedabad,Gujarat\r\n');
    expect(rows).toEqual([{ rowNumber: 2, code: 'AHKC', name: 'Ahmedabad, Krish Cubicle', city: 'Ahmedabad', stateName: 'Gujarat', errors: [] }]);
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
});
