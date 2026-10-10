import { describe, expect, it } from 'vitest';
import { differenceHashFromPixels } from './visualMatch';

function grayscalePixels(sample: (x: number, y: number) => number) {
  const pixels = new Uint8ClampedArray(9 * 8 * 4);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const index = (y * 9 + x) * 4;
      const value = sample(x, y);
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

describe('on-device visual signature', () => {
  it('creates a stable 64-bit difference hash from image luminance', () => {
    const signature = differenceHashFromPixels(grayscalePixels((x) => x * 20));
    expect(signature).toBe('ffffffffffffffff');
    expect(differenceHashFromPixels(grayscalePixels((x) => x * 20))).toBe(signature);
  });

  it('handles a reversed light-to-dark pattern', () => {
    expect(differenceHashFromPixels(grayscalePixels((x) => (8 - x) * 20))).toBe('0000000000000000');
  });

  it('rejects unexpected image dimensions', () => {
    expect(() => differenceHashFromPixels(new Uint8ClampedArray(4))).toThrow('9×8 RGBA image');
  });
});
