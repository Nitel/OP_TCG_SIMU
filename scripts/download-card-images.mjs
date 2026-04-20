#!/usr/bin/env node
/**
 * Download card images for a given set.
 * Usage: node scripts/download-card-images.mjs OP01
 *
 * Images are saved to apps/client/public/card-images/
 * Tries {id}_p1.png first, then {id}.png as fallback.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = join(ROOT, 'apps/client/public/card-images');

const setArg = process.argv[2];
if (!setArg) {
  console.error('Usage: node scripts/download-card-images.mjs <SET>  (e.g. OP01)');
  process.exit(1);
}

// Normalize: "OP01" → "OP-01" for the JSON filename, keep "OP01" for card IDs
const setCode   = setArg.toUpperCase();                          // "OP01"
const jsonName  = setCode.replace(/^([A-Z]+)(\d+)$/, '$1-$2');  // "OP-01"
const jsonPath  = join(ROOT, `packages/data/raw/${jsonName}.json`);

if (!existsSync(jsonPath)) {
  console.error(`No data file found: ${jsonPath}`);
  process.exit(1);
}

const cards   = JSON.parse(readFileSync(jsonPath, 'utf8'));
const ids     = [...new Set(cards.map(c => c.id))].sort();
console.log(`Set ${setCode}: ${ids.length} unique card IDs  →  ${OUT}\n`);

mkdirSync(OUT, { recursive: true });

const BASE = 'https://en.onepiece-cardgame.com/images/cardlist/card';

async function tryDownload(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

let ok = 0, miss = 0, skip = 0;

for (const id of ids) {
  const dest = join(OUT, `${id}_p1.png`);

  if (existsSync(dest)) {
    console.log(`SKIP ${id}_p1.png`);
    skip++;
    continue;
  }

  const buf =
    await tryDownload(`${BASE}/${id}_p1.png`) ??
    await tryDownload(`${BASE}/${id}.png`);

  if (buf) {
    writeFileSync(dest, buf);
    console.log(`OK   ${id}_p1.png`);
    ok++;
  } else {
    console.log(`MISS ${id}  (no image on Bandai server)`);
    miss++;
  }
}

console.log(`\nDone — OK: ${ok}  MISS: ${miss}  SKIP: ${skip}`);
