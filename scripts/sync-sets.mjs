#!/usr/bin/env node
/**
 * Synchronise les imports de sets dans deckBuilder.ts.
 * Usage: node scripts/sync-sets.mjs   (ou pnpm sync-sets)
 *
 * Lit tous les fichiers JSON dans packages/data/raw/ et met à jour
 * automatiquement les deux blocs marqués dans deckBuilder.ts :
 *   - les imports TypeScript
 *   - le tableau allRaw
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'packages/data/raw');
const DECK_BUILDER = join(ROOT, 'apps/client/src/data/deckBuilder.ts');

// ─── Dériver le nom de variable depuis le nom de fichier ─────────────────────
// OP-01.json → op01Raw,  EB-01.json → eb01Raw,  ST-21.json → st21Raw
function toVarName(filename) {
  return filename
    .replace(/\.json$/, '')   // OP-01
    .replace(/-/g, '')        // OP01
    .toLowerCase()            // op01
    + 'Raw';                  // op01Raw
}

// ─── Lire la liste des sets ───────────────────────────────────────────────────
const setFiles = readdirSync(RAW_DIR)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .sort();

if (setFiles.length === 0) {
  console.error('Aucun fichier JSON trouvé dans packages/data/raw/');
  process.exit(1);
}

console.log(`Sets détectés (${setFiles.length}) :`);
setFiles.forEach(f => console.log(`  ${f}`));

// ─── Générer les blocs ────────────────────────────────────────────────────────
const IMPORT_START = '// ─── AUTO-GENERATED: raw set imports — do not edit manually, run pnpm sync-sets';
const IMPORT_END   = '// ─── END AUTO-GENERATED ───────────────────────────────────────────────────────';

const importLines = setFiles.map(f => {
  const varName = toVarName(f);
  return `import ${varName} from '../../../../packages/data/raw/${f}';`;
});

const allRawLines = setFiles.map(f => {
  const varName = toVarName(f);
  return `  ...(${varName} as unknown as RawCard[]),`;
});

const importBlock = [
  IMPORT_START,
  ...importLines,
  IMPORT_END,
].join('\n');

const allRawBlock = [
  '// ─── AUTO-GENERATED: allRaw — do not edit manually, run pnpm sync-sets',
  'const allRaw: RawCard[] = [',
  ...allRawLines,
  '];',
  IMPORT_END,
].join('\n');

// ─── Remplacer dans deckBuilder.ts ────────────────────────────────────────────
let source = readFileSync(DECK_BUILDER, 'utf8');

// Remplace le bloc imports
const importRe = new RegExp(
  `${escapeRe(IMPORT_START)}[\\s\\S]*?${escapeRe(IMPORT_END)}`,
);
if (!importRe.test(source)) {
  console.error('Marqueur import introuvable dans deckBuilder.ts');
  process.exit(1);
}
source = source.replace(importRe, importBlock);

// Remplace le bloc allRaw
const allRawRe = new RegExp(
  `// ─── AUTO-GENERATED: allRaw[\\s\\S]*?${escapeRe(IMPORT_END)}`,
);
if (!allRawRe.test(source)) {
  console.error('Marqueur allRaw introuvable dans deckBuilder.ts');
  process.exit(1);
}
source = source.replace(allRawRe, allRawBlock);

writeFileSync(DECK_BUILDER, source);
console.log(`\n✅ deckBuilder.ts mis à jour avec ${setFiles.length} set(s).`);

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
