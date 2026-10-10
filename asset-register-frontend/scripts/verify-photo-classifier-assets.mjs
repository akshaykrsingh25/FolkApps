import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const visionPackage = JSON.parse(await readFile(resolve(root, 'node_modules/@mediapipe/tasks-vision/package.json'), 'utf8'));
if (visionPackage.version !== '1.1.0' || visionPackage.license !== 'Apache-2.0') {
  throw new Error('Review the MediaPipe runtime version and license before refreshing the bundled photo-classifier files.');
}

const files = [
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js', 'public/vision/wasm/vision_wasm_internal.js', '7c652617b5bef832f42878ce8c5f752b0724bca6054e4bc1013a37d4b1949723'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm', 'public/vision/wasm/vision_wasm_internal.wasm', '782eda3ec1f414fdb4f1d66a8b59093eb4d5ab437e06117796abf05962d68eef'],
  [null, 'public/vision/efficientnet_lite0_int8_v1.tflite', 'bc2ffe19c1118de0c0c2a9088992da5589722656e0fba81421385300a4a34b16'],
];

for (const [sourcePath, publicPath, expectedHash] of files) {
  const path = resolve(root, publicPath);
  await access(path);
  const bytes = await readFile(path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedHash) throw new Error(`The pinned photo-recognition asset changed unexpectedly: ${publicPath}`);
  if (sourcePath) {
    const source = await readFile(resolve(root, sourcePath));
    if (!source.equals(bytes)) throw new Error(`Bundled MediaPipe runtime file does not match its locked package: ${publicPath}`);
  }
}

const model = resolve(root, 'public/vision/efficientnet_lite0_int8_v1.tflite');
if ((await stat(model)).size !== 5_434_517) throw new Error('The pinned EfficientNet-Lite0 int8 model size changed.');
if (process.env.CI) {
  const distModel = resolve(root, 'dist/vision/efficientnet_lite0_int8_v1.tflite');
  const distWasm = resolve(root, 'dist/vision/wasm/vision_wasm_internal.wasm');
  await Promise.all([access(distModel), access(distWasm)]);
  if (!(await readFile(model)).equals(await readFile(distModel))) throw new Error('Built photo model differs from its pinned source.');
  if (!(await readFile(resolve(root, 'public/vision/wasm/vision_wasm_internal.wasm'))).equals(await readFile(distWasm))) {
    throw new Error('Built vision runtime differs from its pinned source.');
  }
  const serviceWorker = await readFile(resolve(root, 'dist/sw.js'), 'utf8');
  if (!serviceWorker.includes('incuasset-on-device-photo-model-v1')) throw new Error('Photo recognition runtime caching is missing from the service worker.');
  if (!serviceWorker.includes('efficientnet_lite0_int8_v1')) throw new Error('The model URL is not covered by runtime caching.');
}

console.log('Verified the pinned on-device photo model, MediaPipe runtime, and offline cache setup.');
