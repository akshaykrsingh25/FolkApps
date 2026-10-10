export interface ParsedRfidBatch {
  epcs: string[];
  duplicateCount: number;
  invalidLines: { line: number; value: string }[];
}

const EPC_PATTERN = /^(?:[A-F0-9]{2}){4,32}$/;

/** Parse a reader export with one EPC in the first column of each non-empty line. */
export function parseRfidBatchText(value: string): ParsedRfidBatch {
  const epcs: string[] = [];
  const seen = new Set<string>();
  const invalidLines: ParsedRfidBatch['invalidLines'] = [];
  let duplicateCount = 0;

  value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const candidate = line.replace(/^\uFEFF/, '').split(/[\s,;]+/, 1)[0].toUpperCase();
    if (index === 0 && ['EPC','EPC_ID','EPCID','TAG_EPC'].includes(candidate)) return;
    if (!EPC_PATTERN.test(candidate)) {
      invalidLines.push({ line: index + 1, value: line.slice(0, 80) });
      return;
    }
    if (seen.has(candidate)) {
      duplicateCount += 1;
      return;
    }
    seen.add(candidate);
    epcs.push(candidate);
  });

  return { epcs, duplicateCount, invalidLines };
}
