#!/usr/bin/env node
/**
 * List cards in a set that have no effect file yet.
 * Usage: node scripts/check-effects.mjs OP02
 *
 * Effect files are expected at packages/data/effects/{id}.json
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '..');
const EFFDIR   = join(ROOT, 'packages/data/effects');

const setArg = process.argv[2];
if (!setArg) {
  console.error('Usage: node scripts/check-effects.mjs <SET>  (e.g. OP02)');
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
const missing = cards.filter(c => !existsSync(join(EFFDIR, `${c.id}.json`)));
const present = cards.length - missing.length;

console.log(`\nSet ${setCode} — ${cards.length} cartes`);
console.log(`  Avec fichier d'effets  : ${present}`);
console.log(`  Sans fichier d'effets  : ${missing.length}`);

if (missing.length > 0) {
  console.log('\nCartes sans effet (à créer dans packages/data/effects/) :');
  for (const c of missing) {
    console.log(`  ${c.id.padEnd(12)}  ${c.cardType.padEnd(12)}  ${c.name}`);
  }
}
console.log('');
