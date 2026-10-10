import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const runtimeScripts = ['start', 'worker:exports', 'worker:notifications'];

for (const name of runtimeScripts) {
  const command = packageJson.scripts[name];
  const match = /^node\s+(dist\/[^\s]+)$/.exec(command ?? '');
  if (!match) throw new Error(`Runtime script ${name} must execute one built Node entrypoint.`);
  try {
    await access(resolve(packageRoot, match[1]));
  } catch {
    throw new Error(`Runtime script ${name} points to a missing build output: ${match[1]}.`);
  }
}

console.log(`Verified runtime entrypoints: ${runtimeScripts.join(', ')}.`);
