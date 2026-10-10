import { describe, expect, it } from 'vitest';
import { extractInvoiceSuggestions, localOcrAssetPaths } from './ocr';

describe('on-device invoice and label extraction', () => {
  it('uses same-origin OCR assets so the installed app can recognize labels offline', () => {
    expect(localOcrAssetPaths('/register/')).toEqual({
      workerPath: '/register/ocr/worker.min.js',
      corePath: '/register/ocr/core/tesseract-core-lstm.wasm.js',
      langPath: '/register/ocr/lang',
      gzip: true,
      workerBlobURL: false,
    });
    const paths = localOcrAssetPaths('/register/');
    for (const path of [paths.workerPath, paths.corePath, paths.langPath]) {
      expect(path.startsWith('/register/ocr/')).toBe(true);
    }
  });

  it('suggests a category and editable purchase details from invoice text', () => {
    const result = extractInvoiceSuggestions(`ACME TECHNOLOGY\nTAX INVOICE\nInvoice No: INV-2025-17\nInvoice Date: 04/05/2025\nBrand: Cisco\nModel: C9200-24P\nSerial No: SN-778899\nDescription: Network switch\nSeller: Acme Technology Services\nPhone: +91 98765 43210\nGrand Total: ₹48,500.00`);

    expect(result.category).toBe('IT equipment');
    expect(result.name).toBe('Network equipment');
    expect(result.invoiceReference).toBe('INV-2025-17');
    expect(result.purchaseDate).toBe('2025-05-04');
    expect(result.purchaseAmount).toBe('48500.00');
    expect(result.serialNumber).toBe('SN-778899');
    expect(result.model).toBe('C9200-24P');
    expect(result.sellerName).toBe('Acme Technology Services');
  });

  it('keeps uncertain details blank instead of guessing values', () => {
    const result = extractInvoiceSuggestions('TAX INVOICE\nAmount subject to tax');
    expect(result.category).toBeUndefined();
    expect(result.purchaseDate).toBeUndefined();
    expect(result.purchaseAmount).toBeUndefined();
  });
});
