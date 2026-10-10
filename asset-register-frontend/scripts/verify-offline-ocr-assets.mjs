import { access, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const packageRoot = process.cwd();
const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const tesseractPackage = JSON.parse(await readFile(resolve(packageRoot, 'node_modules/tesseract.js/package.json'), 'utf8'));
const corePackage = JSON.parse(await readFile(resolve(packageRoot, 'node_modules/tesseract.js-core/package.json'), 'utf8'));
const modelPackage = JSON.parse(await readFile(resolve(packageRoot, 'node_modules/@tesseract.js-data/eng/package.json'), 'utf8'));

if (tesseractPackage.version !== '7.0.0' || corePackage.version !== '7.0.0') {
  throw new Error('Refresh the committed local OCR worker and core when upgrading Tesseract.js.');
}
if (modelPackage.version !== '1.0.0' || modelPackage.license !== 'MIT') {
  throw new Error('The bundled English OCR model package or license changed. Review and update the bundled assets.');
}

const precacheFiles = [
  'ocr/worker.min.js',
  'ocr/core/tesseract-core-lstm.wasm.js',
  'ocr/lang/eng.traineddata.gz',
];
const sourceFiles = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'public/ocr/core/tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'public/ocr/lang/eng.traineddata.gz'],
];
const maxFileSize = 5 * 1024 * 1024;
for (const [packageFile, publicFile] of sourceFiles) {
  const [packageBytes, publicBytes] = await Promise.all([
    readFile(resolve(packageRoot, packageFile)),
    readFile(resolve(packageRoot, publicFile)),
  ]);
  const packageHash = createHash('sha256').update(packageBytes).digest('hex');
  const publicHash = createHash('sha256').update(publicBytes).digest('hex');
  if (packageHash !== publicHash) throw new Error(`Committed OCR asset differs from its locked package source: ${publicFile}`);
}

for (const relativePath of precacheFiles) {
  const publicPath = resolve(packageRoot, 'public', relativePath);
  const builtPath = resolve(packageRoot, 'dist', relativePath);
  await access(publicPath);
  await access(builtPath);
  const [{ size }, publicBytes, builtBytes] = await Promise.all([stat(builtPath), readFile(publicPath), readFile(builtPath)]);
  if (!publicBytes.equals(builtBytes)) throw new Error(`Built offline OCR asset differs from the public source: ${relativePath}`);
  if (size > maxFileSize) throw new Error(`Offline OCR asset exceeds the Workbox precache limit: ${relativePath}`);
}

const serviceWorker = await readFile(resolve(packageRoot, 'dist/sw.js'), 'utf8');
for (const relativePath of precacheFiles) {
  if (!serviceWorker.includes(relativePath)) throw new Error(`Offline OCR asset is missing from the generated precache: ${relativePath}`);
}

if (!packageJson.scripts['verify:offline-ocr']) throw new Error('Expose the offline OCR asset verification in the frontend package scripts.');
console.log('Verified the version-matched local OCR worker, core, English model, and generated service-worker precache.');
