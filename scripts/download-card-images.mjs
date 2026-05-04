#!/usr/bin/env node
/**
 * Download card images for a given set.
 * Usage: node scripts/download-card-images.mjs OP01
 *
 * Convention Bandai :
 *   {id}.png    → art normal
 *   {id}_p1.png → art parallèle
 *
 * Images are saved to apps/client/public/card-images/
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

// Normalize set code to match the raw JSON filename:
//   "OP01"      → "OP-01"
//   "OP14EB04"  → "OP14-EB04"
//   "OP14-EB04" → "OP14-EB04" (already correct)
const setCode  = setArg.toUpperCase();
const jsonName = setCode
  .replace(/^([A-Z]+\d+)([A-Z]+\d+)$/, '$1-$2')  // OP14EB04  → OP14-EB04
  .replace(/^([A-Z]+)(\d+)$/, '$1-$2');            // OP01      → OP-01
const jsonPath  = join(ROOT, `packages/data/raw/${jsonName}.json`);

if (!existsSync(jsonPath)) {
  console.error(`No data file found: ${jsonPath}`);
  process.exit(1);
}

const cards = JSON.parse(readFileSync(jsonPath, 'utf8'));

// Détecte les arts alternatifs par doublon d'ID (robuste quel que soit le suffixe de nom)
const seenIds = new Set();
const altArtNames = new Set();
for (const card of cards) {
  if (seenIds.has(card.id)) altArtNames.add(card.name);
  else seenIds.add(card.id);
}

// Build a list of { id, filename } — alt arts use _p1.png, normals use .png
const targets = [];
const seenFilenames = new Set();
for (const card of cards) {
  const isParallel = altArtNames.has(card.name);
  const filename = isParallel ? `${card.id}_p1.png` : `${card.id}.png`;
  if (!seenFilenames.has(filename)) {
    seenFilenames.add(filename);
    targets.push({ id: card.id, filename, isParallel });
  }
}

console.log(`Set ${setCode}: ${targets.length} images à télécharger  →  ${OUT}\n`);

mkdirSync(OUT, { recursive: true });

const BASE = 'https://en.onepiece-cardgame.com/images/cardlist/card';

// Build map: card.id → imgUrl (from punk-records data, if present)
/** @type {Map<string, string>} */
const imgUrlMap = new Map();
for (const card of cards) {
  if (card.imgUrl) imgUrlMap.set(card.id, card.imgUrl);
}

async function tryDownload(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

const force = process.argv.includes('--force');

let ok = 0, miss = 0, skip = 0;

for (const { id, filename, isParallel } of targets) {
  const dest = join(OUT, filename);

  if (!force && existsSync(dest)) {
    console.log(`SKIP ${filename}`);
    skip++;
    continue;
  }

  let buf = null;
  if (isParallel) {
    // Parallèle : uniquement _p1.png, pas de fallback
    buf = await tryDownload(`${BASE}/${id}_p1.png`);
  } else {
    // Use punk-records imgUrl if available (includes Bandai cache-busting param)
    const directUrl = imgUrlMap.get(id);
    if (directUrl) {
      buf = await tryDownload(directUrl);
    }
    // Fallback: construct URL from ID pattern
    if (!buf) {
      buf = await tryDownload(`${BASE}/${id}.png`) ?? await tryDownload(`${BASE}/${id}_p1.png`);
    }
  }

  if (buf) {
    writeFileSync(dest, buf);
    console.log(`OK   ${filename}`);
    ok++;
  } else {
    console.log(`MISS ${filename}  (image introuvable sur le serveur Bandai)`);
    miss++;
  }
}

console.log(`\nDone — OK: ${ok}  MISS: ${miss}  SKIP: ${skip}`);
