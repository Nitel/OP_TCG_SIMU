#!/usr/bin/env node
/**
 * Download card images for all sets that have a raw JSON in packages/data/raw/.
 * Usage: node scripts/download-all-images.mjs [--skip-existing]
 *
 * --skip-existing is passed to download-card-images.mjs (already skips by default per file).
 * This script just iterates over all known JSON files.
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
  // Convert "OP-01.json" → "OP01" (format expected by download-card-images.mjs)
  .map(f => f.replace(/\.json$/, '').replace(/-/g, ''));

if (sets.length === 0) {
  console.error('No sets found in packages/data/raw/ — run `pnpm fetch-all-sets` first.');
  process.exit(1);
}

console.log(`Downloading images for ${sets.length} set(s): ${sets.join(', ')}\n`);

let ok = 0, failed = 0;

for (const setCode of sets) {
  console.log(`\n─── ${setCode} ───────────────────────────────────────`);
  try {
    execSync(`node scripts/download-card-images.mjs ${setCode}`, { cwd: ROOT, stdio: 'inherit' });
    ok++;
  } catch {
    console.error(`FAIL  ${setCode}`);
    failed++;
  }
}

console.log(`\n── Done ─────────────────────────────────`);
console.log(`OK: ${ok}  FAIL: ${failed}`);
if (failed > 0) console.log('Some images may be unavailable on the Bandai CDN (normal for older sets).');
