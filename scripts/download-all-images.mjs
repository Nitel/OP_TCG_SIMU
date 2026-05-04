#!/usr/bin/env node
/**
 * Download card images for all sets that have a raw JSON in packages/data/raw/.
 * Usage: node scripts/download-all-images.mjs [--force]
 *
 * Default: skip files that already exist locally.
 * --force: re-download everything, overwriting existing files.
 */

import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'packages/data/raw');

const sets = readdirSync(RAW_DIR)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  // Pass the set name as-is (without .json); download-card-images.mjs handles normalization
  .map(f => f.replace(/\.json$/, ''));

if (sets.length === 0) {
  console.error('No sets found in packages/data/raw/ — run `pnpm fetch-all-sets` first.');
  process.exit(1);
}

console.log(`Downloading images for ${sets.length} set(s): ${sets.join(', ')}\n`);

let ok = 0, failed = 0;

for (const setCode of sets) {
  console.log(`\n─── ${setCode} ───────────────────────────────────────`);
  try {
    const forceFlag = process.argv.includes('--force') ? ' --force' : '';
    execSync(`node scripts/download-card-images.mjs ${setCode}${forceFlag}`, { cwd: ROOT, stdio: 'inherit' });
    ok++;
  } catch {
    console.error(`FAIL  ${setCode}`);
    failed++;
  }
}

console.log(`\n── Done ─────────────────────────────────`);
console.log(`OK: ${ok}  FAIL: ${failed}`);
if (failed > 0) console.log('Some images may be unavailable on the Bandai CDN (normal for older sets).');
