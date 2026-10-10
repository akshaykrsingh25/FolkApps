const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const HASH_BITS = (HASH_WIDTH - 1) * HASH_HEIGHT;

export function differenceHashFromPixels(pixels: Uint8ClampedArray): string {
  if (pixels.length !== HASH_WIDTH * HASH_HEIGHT * 4) throw new Error('A 9×8 RGBA image is required to create a visual signature.');
  let hash = 0n;
  for (let y = 0; y < HASH_HEIGHT; y += 1) {
    for (let x = 0; x < HASH_WIDTH - 1; x += 1) {
      const left = luminance(pixels, y * HASH_WIDTH + x);
      const right = luminance(pixels, y * HASH_WIDTH + x + 1);
      hash = (hash << 1n) | (left < right ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(HASH_BITS / 4, '0');
}

export async function createVisualHash(image: Blob): Promise<string> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    throw new Error('This device cannot prepare an on-device visual comparison.');
  }
  const bitmap = await createImageBitmap(image);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = HASH_WIDTH;
    canvas.height = HASH_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('The photo could not be prepared for visual comparison.');
    context.drawImage(bitmap, 0, 0, HASH_WIDTH, HASH_HEIGHT);
    return differenceHashFromPixels(context.getImageData(0, 0, HASH_WIDTH, HASH_HEIGHT).data);
  } finally {
    bitmap.close();
  }
}

function luminance(pixels: Uint8ClampedArray, pixel: number): number {
  const offset = pixel * 4;
  return pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
}
