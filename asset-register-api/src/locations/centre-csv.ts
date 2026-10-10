export interface CentreCsvRow {
  rowNumber: number;
  code: string;
  name: string;
  city: string;
  stateName: string;
  physicalAddress: string;
  kind: 'centre' | 'floor';
  parentCentreCode: string;
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
  const kindIndex = headers.indexOf('location_kind');
  const parentCodeIndex = headers.indexOf('parent_center_code');
  const addressIndex = headers.indexOf('physical_address') >= 0 ? headers.indexOf('physical_address') : headers.indexOf('address');
  const rows: CentreCsvRow[] = [];
  const seenCodes = new Set<string>();

  records.slice(1).forEach((record, index) => {
    if (record.every((value) => !value.trim())) return;
    const code = record[indexes.center_code]?.trim() ?? '';
    const name = record[indexes.center_name]?.trim() ?? '';
    const city = record[indexes.city]?.trim() ?? '';
    const stateName = record[indexes.state]?.trim() ?? '';
    const physicalAddress = addressIndex < 0 ? '' : record[addressIndex]?.trim() ?? '';
    const kindValue = (kindIndex < 0 ? 'centre' : record[kindIndex]?.trim().toLocaleLowerCase('en-IN') || 'centre');
    const kind = kindValue === 'floor' ? 'floor' : 'centre';
    const parentCentreCode = parentCodeIndex < 0 ? '' : record[parentCodeIndex]?.trim() ?? '';
    const errors: string[] = [];
    if (!name) errors.push('Centre name is required');
    if (kindValue !== 'centre' && kindValue !== 'floor') errors.push('Location kind must be centre or floor');
    if (kind === 'centre' && !city) errors.push('City is required');
    if (kind === 'centre' && !stateName) errors.push('State is required; city names are not used to infer it');
    if (kind === 'centre' && parentCentreCode) errors.push('A centre cannot have a parent centre code');
    if (kind === 'floor' && !parentCentreCode) errors.push('A floor must name its parent centre code');
    if (kind === 'floor' && code) errors.push('A floor inherits its identity from its parent centre and must not have a centre code');
    if (code.length > 40) errors.push('Centre code must be 40 characters or fewer');
    if (name.length > 120) errors.push('Centre name must be 120 characters or fewer');
    if (city.length > 80) errors.push('City must be 80 characters or fewer');
    if (stateName.length > 80) errors.push('State must be 80 characters or fewer');
    if (physicalAddress.length > 300) errors.push('Physical address must be 300 characters or fewer');
    if (parentCentreCode.length > 40) errors.push('Parent centre code must be 40 characters or fewer');
    const normalizedCode = code.toLocaleUpperCase('en-IN');
    if (kind === 'centre' && normalizedCode && seenCodes.has(normalizedCode)) errors.push('Duplicate centre code in this CSV');
    if (kind === 'centre' && normalizedCode) seenCodes.add(normalizedCode);
    rows.push({ rowNumber: index + 2, code, name, city, stateName, physicalAddress, kind, parentCentreCode, errors });
  });

  const centreCodes = new Set(rows.filter((row) => row.kind === 'centre' && row.code).map((row) => row.code.toLocaleUpperCase('en-IN')));
  for (const row of rows) {
    if (row.kind === 'floor' && row.parentCentreCode && !centreCodes.has(row.parentCentreCode.toLocaleUpperCase('en-IN'))) {
      row.errors.push('Parent centre code must belong to a centre row in this CSV');
    }
  }

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
