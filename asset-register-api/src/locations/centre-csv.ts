export interface CentreCsvRow {
  rowNumber: number;
  code: string;
  name: string;
  city: string;
  stateName: string;
  errors: string[];
}

export function parseCentreCsv(csv: string): CentreCsvRow[] {
  const records = parseRecords(csv.replace(/^\uFEFF/, ''));
  if (records.length === 0) throw new BadRequestException('The CSV is empty');
  const headers = records[0].map((value) => value.trim().toLowerCase().replace(/[ -]+/g, '_'));
  const required = ['center_code', 'center_name', 'city', 'state'];
  const indexes = Object.fromEntries(required.map((header) => [header, headers.indexOf(header)]));
  const missing = required.filter((header) => indexes[header] < 0);
  if (missing.length) throw new BadRequestException(`Required columns: ${missing.join(', ')}`);
  const rows: CentreCsvRow[] = [];
  const seenCodes = new Set<string>();

  records.slice(1).forEach((record, index) => {
    if (record.every((value) => !value.trim())) return;
    const code = record[indexes.center_code]?.trim() ?? '';
    const name = record[indexes.center_name]?.trim() ?? '';
    const city = record[indexes.city]?.trim() ?? '';
    const stateName = record[indexes.state]?.trim() ?? '';
    const errors: string[] = [];
    if (!code) errors.push('Centre code is required');
    if (!name) errors.push('Centre name is required');
    if (!city) errors.push('City is required');
    if (!stateName) errors.push('State is required; city names are not used to infer it');
    if (code.length > 40) errors.push('Centre code must be 40 characters or fewer');
    if (name.length > 120) errors.push('Centre name must be 120 characters or fewer');
    if (city.length > 80) errors.push('City must be 80 characters or fewer');
    if (stateName.length > 80) errors.push('State must be 80 characters or fewer');
    const normalizedCode = code.toLocaleUpperCase('en-IN');
    if (normalizedCode && seenCodes.has(normalizedCode)) errors.push('Duplicate centre code in this CSV');
    if (normalizedCode) seenCodes.add(normalizedCode);
    rows.push({ rowNumber: index + 2, code, name, city, stateName, errors });
  });

  if (rows.length === 0) throw new BadRequestException('The CSV has no centre rows');
  if (rows.length > 5000) throw new BadRequestException('Import up to 5,000 centres per file');
  return rows;
}

function parseRecords(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += character;
  }
  if (quoted) throw new BadRequestException('A quoted field is not closed');
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
import { BadRequestException } from '@nestjs/common';
