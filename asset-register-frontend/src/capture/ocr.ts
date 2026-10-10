
export interface CaptureSuggestions {
  name?: string;
  category?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  purchaseAmount?: string;
  sellerName?: string;
  sellerPhone?: string;
  invoiceReference?: string;
  sourceText: string;
}

export function localOcrAssetPaths(baseUrl = '/') {
  const root = `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}ocr/`;
  return {
    workerPath: `${root}worker.min.js`,
    corePath: `${root}core/tesseract-core-lstm.wasm.js`,
    langPath: `${root}lang`,
    gzip: true,
    workerBlobURL: false,
  };
}

const CATEGORY_HINTS: Array<[RegExp, string, string]> = [
  [/\b(laptop|notebook|computer|desktop|workstation)\b/i, 'IT equipment', 'Computer'],
  [/\b(network switch|router|firewall|access point|server)\b/i, 'IT equipment', 'Network equipment'],
  [/\b(monitor|display|screen)\b/i, 'IT equipment', 'Monitor'],
  [/\b(printer|photocopier|scanner)\b/i, 'Office equipment', 'Printer'],
  [/\b(projector)\b/i, 'AV equipment', 'Projector'],
  [/\b(chair|desk|table|cabinet|workstation)\b/i, 'Furniture', 'Furniture'],
  [/\b(air conditioner|hvac|split ac|cassette ac)\b/i, 'Facilities equipment', 'Air conditioner'],
  [/\b(cctv|camera|dvr|nvr)\b/i, 'Security equipment', 'Security camera'],
  [/\b(refrigerator|microwave|water purifier|dispenser)\b/i, 'Appliances', 'Appliance'],
];

export function extractInvoiceSuggestions(sourceText: string): CaptureSuggestions {
  const lines = sourceText.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const text = lines.join('\n');
  const result: CaptureSuggestions = { sourceText };
  const categoryMatch = CATEGORY_HINTS.find(([pattern]) => pattern.test(text));
  if (categoryMatch) {
    result.category = categoryMatch[1];
    result.name = categoryMatch[2];
  }

  const labeled = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim().replace(/\s{2,}/g, ' ');
    }
    return undefined;
  };

  result.invoiceReference = labeled([/(?:^|\n)\s*(?:invoice|bill)\s*(?:no\.?|number)?\s*[:#-]\s*([A-Z0-9][A-Z0-9\-/]{2,})/im]);
  result.serialNumber = labeled([/(?:serial(?:\s*(?:no\.?|number))?|s\/n|s\.n\.)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i]);
  result.model = labeled([/(?:model|item\s*code|product\s*code)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 .\-/]{1,40})/i]);
  result.manufacturer = labeled([/(?:brand|manufacturer|make)\s*[:#-]?\s*([A-Z][A-Z0-9& .-]{1,35})/i]);
  result.sellerPhone = labeled([/(?:phone|mobile|contact|tel)\s*[:#-]?\s*(\+?[0-9][0-9 ()-]{7,17})/i]);
  result.sellerName = labeled([/(?:seller|supplier|vendor|sold\s+by)\s*[:#-]?\s*([^\n]{2,80})/i]);

  const date = labeled([/(?:invoice\s+date|purchase\s+date|date)\s*[:#-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i]);
  if (date) result.purchaseDate = normalizeDate(date);
  const amount = labeled([/(?:grand\s+total|total\s+amount|amount\s+payable|net\s+amount|total)\s*[:₹\s-]*([0-9][0-9,]*(?:\.\d{1,2})?)/i]);
  if (amount) result.purchaseAmount = amount.replaceAll(',', '');
  if (!result.sellerName && lines.length && !/invoice|tax|gst|bill/i.test(lines[0])) result.sellerName = lines[0].slice(0, 80);
  return result;
}

function normalizeDate(value: string) {
  if (/^\d{4}-/.test(value)) return value;
  const [first, second, third] = value.split(/[/-]/);
  const year = third.length === 2 ? `20${third}` : third;
  // Indian invoices commonly print DD/MM/YYYY; keep the interpretation visible for review.
  return `${year}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`;
}

export async function readImageText(file: File, onProgress?: (percent: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', undefined, {
    ...localOcrAssetPaths(import.meta.env.BASE_URL),
    logger: (message) => { if (message.status === 'recognizing text') onProgress?.(Math.round(message.progress * 100)); },
  });
  try {
    const result = await worker.recognize(file);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}
