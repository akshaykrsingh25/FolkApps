import { describe, expect, it } from 'vitest';
import { localPhotoClassifierPaths, suggestAssetFromPhotoLabel } from './photoClassifier';

describe('on-device asset photo suggestions', () => {
  it('uses same-origin model and vision runtime files for the installed app', () => {
    expect(localPhotoClassifierPaths('/register/')).toEqual({
      modelPath: '/register/vision/efficientnet_lite0_int8_v1.tflite',
      wasmPath: '/register/vision/wasm/',
    });
  });

  it.each([
    ['laptop, notebook computer', 'IT equipment', 'Laptop'],
    ['computer monitor', 'IT equipment', 'Monitor'],
    ['printer', 'Office equipment', 'Printer'],
    ['office chair', 'Furniture', 'Office chair'],
    ['computer keyboard', 'IT equipment', 'Keyboard'],
  ])('maps the known model label %s to a reviewable asset type', (label, category, name) => {
    expect(suggestAssetFromPhotoLabel([{ categoryName: label, displayName: label, score: 0.64 }])).toMatchObject({
      label,
      category,
      name,
      confidence: 0.64,
    });
  });

  it('does not substitute a weak asset guess for a confident unsupported object', () => {
    expect(suggestAssetFromPhotoLabel([
      { categoryName: 'tabby cat', displayName: 'tabby cat', score: 0.71 },
      { categoryName: 'computer keyboard', displayName: 'computer keyboard', score: 0.22 },
    ])).toBeUndefined();
    expect(suggestAssetFromPhotoLabel([{ categoryName: 'tabby cat', displayName: 'tabby cat', score: 0.91 }])).toBeUndefined();
  });

  it('does not offer a category when model confidence is weak', () => {
    expect(suggestAssetFromPhotoLabel([{ categoryName: 'printer', displayName: 'printer', score: 0.17 }])).toBeUndefined();
  });

  it('rejects malformed confidence and non-computer screen labels',()=>{expect(suggestAssetFromPhotoLabel([{categoryName:'printer',displayName:'printer',score:NaN}])).toBeUndefined();expect(suggestAssetFromPhotoLabel([{categoryName:'screen door',displayName:'screen door',score:.8}])).toBeUndefined();});

  it('does not claim to recognize a specialized network device from a generic model label', () => {
    expect(suggestAssetFromPhotoLabel([{ categoryName: 'switch', displayName: 'switch', score: 0.54 }])).toBeUndefined();
  });
});
