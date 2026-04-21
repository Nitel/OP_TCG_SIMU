#!/usr/bin/env node
/**
 * Validate a raw card set JSON file.
 * Usage: node scripts/validate-set.mjs OP02
 *
 * Checks:
 *  - File exists
 *  - Card count by type
 *  - Duplicate IDs
 *  - Required fields present on every card
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const setArg = process.argv[2];
if (!setArg) {
  console.error('Usage: node scripts/validate-set.mjs <SET>  (e.g. OP02)');
  process.exit(1);
}

const setCode  = setArg.toUpperCase();
const jsonName = setCode.replace(/^([A-Z]+)(\d+)$/, '$1-$2');
const jsonPath = join(ROOT, `packages/data/raw/${jsonName}.json`);

if (!existsSync(jsonPath)) {
  console.error(`✖  Fichier introuvable : ${jsonPath}`);
  console.error(`   Créez-le d'abord (voir docs/ADDING_CARD_SETS.md)`);
  process.exit(1);
}

const cards = JSON.parse(readFileSync(jsonPath, 'utf8'));

// Count by type
const byType = {};
for (const c of cards) byType[c.cardType] = (byType[c.cardType] ?? 0) + 1;
console.log(`\nSet ${setCode} — ${cards.length} cartes`);
for (const [type, n] of Object.entries(byType)) {
  console.log(`  ${type.padEnd(12)} ${n}`);
}

// Check duplicate IDs (parallels intentionally share the same ID — warning only)
const ids = cards.map(c => c.id);
const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
if (dupes.length > 0) {
  console.log(`\n⚠  ${dupes.length} ID(s) en double (cartes parallèles normales) :`);
  dupes.forEach(id => console.log(`   ${id}`));
} else {
  console.log('\n✔  Aucun doublon d\'ID');
}

// Check required fields
const REQUIRED = ['id', 'name', 'set', 'cardType', 'cost', 'power', 'color', 'counter', 'effectText'];
let fieldErrors = 0;
for (const c of cards) {
  for (const f of REQUIRED) {
    if (!(f in c)) {
      console.error(`✖  Champ manquant "${f}" sur ${c.id ?? '?'}`);
      fieldErrors++;
    }
  }
}
if (fieldErrors > 0) process.exit(1);
console.log('✔  Tous les champs obligatoires présents');
console.log('\nValidation OK\n');
