#!/usr/bin/env node
/**
 * Check which card images are missing for a given set.
 * Usage: node scripts/check-images.mjs OP02
 *
 * Compares card IDs in packages/data/raw/{SET}.json
 * against files in apps/client/public/card-images/
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMGDIR = join(ROOT, 'apps/client/public/card-images');

const setArg = process.argv[2];
if (!setArg) {
  console.error('Usage: node scripts/check-images.mjs <SET>  (e.g. OP02)');
  process.exit(1);
}

const setCode  = setArg.toUpperCase();
const jsonName = setCode.replace(/^([A-Z]+)(\d+)$/, '$1-$2');
const jsonPath = join(ROOT, `packages/data/raw/${jsonName}.json`);

if (!existsSync(jsonPath)) {
  console.error(`✖  Fichier introuvable : ${jsonPath}`);
  process.exit(1);
}

const cards   = JSON.parse(readFileSync(jsonPath, 'utf8'));
const ids     = [...new Set(cards.map(c => c.id))].sort();
const missing = ids.filter(id => !existsSync(join(IMGDIR, `${id}.png`)));
const present = ids.length - missing.length;

console.log(`\nSet ${setCode} — ${ids.length} cartes uniques`);
console.log(`  Présentes : ${present}`);
console.log(`  Manquantes: ${missing.length}`);

if (missing.length > 0) {
  console.log('\nImages manquantes :');
  missing.forEach(id => console.log(`  MISS  ${id}.png`));
  console.log('\nLancez : pnpm fetch-cards ' + setCode);
} else {
  console.log('\n✔  Toutes les images sont présentes\n');
}
