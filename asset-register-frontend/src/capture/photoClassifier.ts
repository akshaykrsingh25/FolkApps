import type { Category } from '@mediapipe/tasks-vision';

export interface AssetPhotoSuggestion {
  name: string;
  category: string;
  label: string;
  confidence: number;
}

const EXPECTED_MODEL_SHA256 = 'bc2ffe19c1118de0c0c2a9088992da5589722656e0fba81421385300a4a34b16';

export function localPhotoClassifierPaths(baseUrl = '/') {
  const root = `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}vision/`;
  return {
    modelPath: `${root}efficientnet_lite0_int8_v1.tflite`,
    wasmPath: `${root}wasm/`,
  };
}

const ASSET_LABELS: Array<[RegExp, string, string]> = [
  [/\b(laptop|notebook computer)\b/i, 'IT equipment', 'Laptop'],
  [/\b(desktop computer|desktop pc|personal computer)\b/i, 'IT equipment', 'Desktop computer'],
  [/\b(computer monitor|computer screen|monitor|screen)\b/i, 'IT equipment', 'Monitor'],
  [/\b(printer|photocopier|copier)\b/i, 'Office equipment', 'Printer'],
  [/\b(projector)\b/i, 'AV equipment', 'Projector'],
  [/\b(computer keyboard|keyboard)\b/i, 'IT equipment', 'Keyboard'],
  [/\b(computer mouse|mouse)\b/i, 'IT equipment', 'Computer mouse'],
  [/\b(office chair|desk chair|chair)\b/i, 'Furniture', 'Office chair'],
  [/\b(desk|table)\b/i, 'Furniture', 'Desk or table'],
  [/\b(router|modem|network switch)\b/i, 'IT equipment', 'Network equipment'],
];

export function suggestAssetFromPhotoLabel(
  categories: Pick<Category, 'categoryName' | 'displayName' | 'score'>[],
  minimumConfidence = 0.18,
): AssetPhotoSuggestion | undefined {
  for (const prediction of categories) {
    const label = (prediction.displayName || prediction.categoryName).trim();
    if (!label || prediction.score < minimumConfidence) continue;
    const mapped = ASSET_LABELS.find(([pattern]) => pattern.test(label));
    if (!mapped) continue;
    return {
      category: mapped[1],
      name: mapped[2],
      label,
      confidence: prediction.score,
    };
  }
  return undefined;
}

type ClassifierRuntime = typeof import('@mediapipe/tasks-vision');
let runtimePromise: Promise<ClassifierRuntime> | null = null;
type LocalImageClassifier = Awaited<ReturnType<ClassifierRuntime['ImageClassifier']['createFromOptions']>>;
let classifierPromise: Promise<LocalImageClassifier> | null = null;

async function runtime() {
  runtimePromise ??= import('@mediapipe/tasks-vision');
  return runtimePromise;
}

function absoluteUrl(path: string) {
  return new URL(path, window.location.href).toString();
}

export async function isPhotoClassifierCached(baseUrl = import.meta.env.BASE_URL): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const { modelPath } = localPhotoClassifierPaths(baseUrl);
    return Boolean(await caches.match(absoluteUrl(modelPath)));
  } catch {
    return false;
  }
}

export async function preparePhotoClassifier(
  onProgress?: (percent: number, stage: string) => void,
  baseUrl = import.meta.env.BASE_URL,
) {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { FilesetResolver, ImageClassifier } = await runtime();
      const { modelPath, wasmPath } = localPhotoClassifierPaths(baseUrl);
      const wasmFiles = await FilesetResolver.forVisionTasks(wasmPath);

      onProgress?.(0, 'Loading the private on-device photo model');
      const response = await fetch(modelPath);
      if (!response.ok) throw new Error(`Could not load the local photo model (${response.status}).`);
      const total = Number(response.headers.get('content-length')) || 5_434_517;
      const chunks: Uint8Array[] = [];
      let received = 0;
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          onProgress?.(Math.min(72, Math.round((received / total) * 72)), 'Loading the private on-device photo model');
        }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        chunks.push(bytes);
        received = bytes.byteLength;
      }
      if (received === 0) throw new Error('The local photo model was empty.');
      if (received !== total) throw new Error('The local photo model download was incomplete.');
      const model = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        model.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const digest = await crypto.subtle.digest('SHA-256', model);
      const fingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      if (fingerprint !== EXPECTED_MODEL_SHA256) {
        if (typeof caches !== 'undefined') {
          const cache = await caches.open('incuasset-on-device-photo-model-v1');
          await cache.delete(absoluteUrl(modelPath));
        }
        throw new Error('The local photo model did not match its pinned integrity check.');
      }

      onProgress?.(76, 'Preparing the on-device vision engine');
      const classifier = await ImageClassifier.createFromOptions(wasmFiles, {
        baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
        runningMode: 'IMAGE',
        displayNamesLocale: 'en',
        maxResults: 8,
        scoreThreshold: 0.08,
      });
      onProgress?.(100, 'Photo suggestions are ready on this device');
      return classifier;
    })().catch((error: unknown) => {
      classifierPromise = null;
      throw error;
    });
  }
  return classifierPromise;
}

export async function suggestAssetFromPhoto(file: Blob): Promise<AssetPhotoSuggestion | undefined> {
  const classifier = await preparePhotoClassifier();
  const bitmap = await createImageBitmap(file);
  try {
    const result = classifier.classify(bitmap);
    return suggestAssetFromPhotoLabel(result.classifications[0]?.categories || []);
  } finally {
    bitmap.close();
  }
}
