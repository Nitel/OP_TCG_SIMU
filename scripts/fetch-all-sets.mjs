#!/usr/bin/env node
/**
 * Fetch card data for all known One Piece TCG sets.
 * Usage: node scripts/fetch-all-sets.mjs [--skip-existing]
 *
 * Calls `pnpm fetch-card-data <SET>` for each set.
 * Skips sets whose JSON already exists in packages/data/raw/ if --skip-existing is passed.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW  = join(ROOT, 'packages/data/raw');

const skipExisting = process.argv.includes('--skip-existing');

// All known sets as of 2025 — update this list as new sets are released
const BOOSTER_SETS = [
  'OP-01', 'OP-02', 'OP-03', 'OP-04', 'OP-05',
  'OP-06', 'OP-07', 'OP-08', 'OP-09', 'OP-10',
];

const STARTER_SETS = [
  'ST-01', 'ST-02', 'ST-03', 'ST-04', 'ST-05', 'ST-06',
  'ST-07', 'ST-08', 'ST-09', 'ST-10', 'ST-11', 'ST-12',
  'ST-13', 'ST-14', 'ST-15', 'ST-16', 'ST-17', 'ST-18',
  'ST-19', 'ST-20', 'ST-21', 'ST-22', 'ST-23', 'ST-24',
  'ST-25', 'ST-26', 'ST-27',
];

const EXTRA_SETS = ['EB-01'];

const ALL_SETS = [...BOOSTER_SETS, ...STARTER_SETS, ...EXTRA_SETS];

let ok = 0, skipped = 0, failed = 0;

for (const setId of ALL_SETS) {
  const jsonPath = join(RAW, `${setId}.json`);

  if (skipExisting && existsSync(jsonPath)) {
    console.log(`SKIP  ${setId}  (already fetched)`);
    skipped++;
    continue;
  }

  try {
    console.log(`\nFetching ${setId}...`);
    execSync(`pnpm fetch-card-data ${setId}`, { cwd: ROOT, stdio: 'inherit' });
    ok++;
  } catch {
    console.error(`FAIL  ${setId}`);
    failed++;
  }
}

console.log(`\n── Done ─────────────────────────────────`);
console.log(`OK: ${ok}  SKIP: ${skipped}  FAIL: ${failed}`);
if (failed > 0) {
  console.log('Failed sets may not exist in the API yet — this is expected for unreleased sets.');
}
console.log('\nRun `pnpm sync-sets` to update deckBuilder.ts imports.');
