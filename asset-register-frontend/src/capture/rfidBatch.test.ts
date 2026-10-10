import { describe, expect, it } from 'vitest';
import { parseRfidBatchText } from './rfidBatch';

describe('parseRfidBatchText', () => {
  it('normalizes EPCs, reads the first export column, and removes duplicate radio reads', () => {
    expect(parseRfidBatchText('e2801160600000000000034a,-47,1\nE2801160600000000000034A\n\nE2801160600000000000034b'))
      .toEqual({
        epcs: ['E2801160600000000000034A', 'E2801160600000000000034B'],
        duplicateCount: 1,
        invalidLines: [],
      });
  });

  it('accepts a UTF-8 CSV header before the first EPC', () => {
    expect(parseRfidBatchText('\uFEFFEPC,RSSI\r\nE2801160600000000000034A,-47'))
      .toMatchObject({ epcs: ['E2801160600000000000034A'], invalidLines: [] });
  });

  it('reports malformed non-empty rows with their original line numbers', () => {
    expect(parseRfidBatchText('E2801160600000000000034A\nreader stopped\nE2801160600000000000034B'))
      .toEqual({
        epcs: ['E2801160600000000000034A', 'E2801160600000000000034B'],
        duplicateCount: 0,
        invalidLines: [{ line: 2, value: 'reader stopped' }],
      });
  });

  it('does not accept odd-length or too-short hexadecimal values', () => {
    const result = parseRfidBatchText('E2801160600000000000034\nAB12');
    expect(result.epcs).toEqual([]);
    expect(result.invalidLines).toHaveLength(2);
  });
});
