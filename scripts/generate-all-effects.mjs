#!/usr/bin/env node
/**
 * Generate effect DSLs for all sets, skipping cards that already have an effect file.
 * Usage: node scripts/generate-all-effects.mjs [--force] [--sets EB-01,OP-01,ST-22]
 *
 * --force         Regenerate even cards that already have an effect file
 * --sets A,B,C    Only process the listed sets (comma-separated)
 *
 * Requires ANTHROPIC_API_KEY in env or .env file.
 * Calls `pnpm generate-effects <SET> --skip-existing` for each set in packages/data/raw/.
 */

import { execSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR   = join(ROOT, 'packages/data/raw');
const EFFECTS_DIR = join(ROOT, 'packages/data/effects');

// Load .env if present
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

const force = process.argv.includes('--force');

const setsArg = process.argv.find(a => a.startsWith('--sets='))?.slice('--sets='.length)
  ?? (process.argv.indexOf('--sets') !== -1 ? process.argv[process.argv.indexOf('--sets') + 1] : undefined);
const setsFilter = setsArg ? new Set(setsArg.split(',').map(s => s.trim())) : null;

let sets = readdirSync(RAW_DIR)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map(f => f.replace(/\.json$/, ''));  // "OP-01.json" → "OP-01"

if (setsFilter !== null) {
  sets = sets.filter(s => setsFilter.has(s));
  if (sets.length === 0) {
    console.error(`No matching sets found for --sets filter: ${setsArg}`);
    process.exit(1);
  }
  console.log(`Targeting ${sets.length} set(s): ${sets.join(', ')}\n`);
}

if (sets.length === 0) {
  console.error('No sets found in packages/data/raw/');
  process.exit(1);
}

// Count cards to process (all if --force, missing only otherwise)
let totalMissing = 0;
for (const setId of sets) {
  const cards = JSON.parse(readFileSync(join(RAW_DIR, `${setId}.json`), 'utf8'));
  const missing = force
    ? cards.length
    : cards.filter(c => !existsSync(join(EFFECTS_DIR, `${c.id}.json`))).length;
  if (missing > 0) totalMissing += missing;
}

if (totalMissing === 0) {
  console.log('All cards already have effect DSL files. Nothing to do.');
  process.exit(0);
}

console.log(`Found ${totalMissing} card(s) to process across ${sets.length} set(s).\n`);

let ok = 0, failed = 0;

for (const setId of sets) {
  const cards = JSON.parse(readFileSync(join(RAW_DIR, `${setId}.json`), 'utf8'));
  const missing = force
    ? cards.length
    : cards.filter(c => !existsSync(join(EFFECTS_DIR, `${c.id}.json`))).length;

  if (missing === 0) continue;

  console.log(`\n─── ${setId} (${missing} missing) ──────────────────────────`);
  try {
    execSync(`pnpm generate-effects ${setId}${force ? '' : ' --skip-existing'}`, { cwd: ROOT, stdio: 'inherit' });
    ok++;
  } catch {
    console.error(`FAIL  ${setId}`);
    failed++;
  }
}

console.log(`\n── Done ─────────────────────────────────`);
console.log(`OK: ${ok}  FAIL: ${failed}`);
