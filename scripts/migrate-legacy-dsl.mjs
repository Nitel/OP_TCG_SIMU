#!/usr/bin/env node
/**
 * Migrate legacy DSL formats in packages/data/effects/ to the canonical form.
 *
 * Variant B — numeric key "0" at root:
 *   { "0": { trigger, condition, actions, ... }, "id": "X" }
 *   → { "id": "X", "effects": [{ trigger, condition, actions, ... }] }
 *
 * Variant A — effect fields directly at root (no "effects" array, no "0" key):
 *   { "id": "X", "trigger": "...", "actions": [] }
 *   → { "id": "X", "effects": [{ "trigger": "...", "actions": [] }] }
 *
 * Usage:
 *   node scripts/migrate-legacy-dsl.mjs [--dry-run] [--sets OP-01,ST-22]
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT        = join(dirname(fileURLToPath(import.meta.url)), '..');
const EFFECTS_DIR = join(ROOT, 'packages/data/effects');
const SUMMARY_OUT = join(ROOT, 'migration-summary.md');

// Fields that belong to the card metadata (stay at root level)
const CARD_META_FIELDS = new Set([
  'id', 'cardId', 'name', 'cost', 'power', 'color', 'cardType', 'keywords',
  'counter', 'attribute', 'set', 'subTypes', 'imgUrl', 'effectText',
]);

// Fields that belong to an effect block
const EFFECT_FIELDS = new Set([
  'trigger', 'condition', 'conditions', 'actions', 'duration',
  'description', 'constraints', 'activationCost',
]);

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const setsArg = args.find(a => a.startsWith('--sets=')) ?? args[args.indexOf('--sets') + 1];
const FILTER_SETS = setsArg && !setsArg.startsWith('--')
  ? new Set(setsArg.split(',').map(s => s.trim()))
  : null;

// ─── Set detection ────────────────────────────────────────────────────────────

function setOf(id) {
  const m = id.match(/^([A-Z]{2,4})(\d{2})-/);
  if (!m) return id.split('-')[0] ?? id;
  return `${m[1]}-${m[2]}`;
}

// ─── Migration logic ──────────────────────────────────────────────────────────

/** Returns { migrated: boolean, type: 'A'|'B'|null, output: object } */
function migrateFile(raw) {
  // Already in canonical form
  if (Array.isArray(raw.effects)) return { migrated: false, type: null, output: raw };

  // Variant B: has a "0" numeric key
  if (raw['0'] !== undefined && typeof raw['0'] === 'object') {
    const effectBlock = raw['0'];
    const meta = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k !== '0') meta[k] = v;
    }
    return {
      migrated: true,
      type: 'B',
      output: { ...meta, effects: [effectBlock] },
    };
  }

  // Variant A: trigger or other effect fields at root level
  const hasTrigger = raw.trigger !== undefined;
  const hasActions = raw.actions !== undefined;
  if (!hasTrigger && !hasActions) return { migrated: false, type: null, output: raw };

  const meta   = {};
  const effect = {};
  for (const [k, v] of Object.entries(raw)) {
    if (CARD_META_FIELDS.has(k)) {
      meta[k] = v;
    } else if (EFFECT_FIELDS.has(k)) {
      effect[k] = v;
    } else {
      // Unknown field: keep at meta level (safe default)
      meta[k] = v;
    }
  }

  return {
    migrated: true,
    type: 'A',
    output: { ...meta, effects: [effect] },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const files = readdirSync(EFFECTS_DIR)
  .filter(f => f.endsWith('.json') && !/_[pr]\d+\.json$/.test(f))
  .sort();

const stats = { A: [], B: [], skipped: 0, alreadyOk: 0 };

for (const file of files) {
  const id  = file.replace(/\.json$/, '');
  const set = setOf(id);

  if (FILTER_SETS !== null && !FILTER_SETS.has(set)) continue;

  const filePath = join(EFFECTS_DIR, file);
  let raw;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    console.error(`  SKIP (parse error): ${file}`);
    stats.skipped++;
    continue;
  }

  const { migrated, type, output } = migrateFile(raw);

  if (!migrated) {
    stats.alreadyOk++;
    continue;
  }

  if (!DRY_RUN) {
    writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n');
  }

  if (type === 'A') stats.A.push(id);
  else             stats.B.push(id);
}

// ─── Report ───────────────────────────────────────────────────────────────────

const mode = DRY_RUN ? '[DRY RUN] ' : '';
const totalMigrated = stats.A.length + stats.B.length;

console.log(`\n${mode}Migration results:`);
console.log(`  Variant A (trigger at root) : ${stats.A.length}`);
console.log(`  Variant B (key "0" at root) : ${stats.B.length}`);
console.log(`  Total migrated              : ${totalMigrated}`);
console.log(`  Already canonical           : ${stats.alreadyOk}`);
console.log(`  Parse errors (skipped)      : ${stats.skipped}`);

const now = new Date().toISOString();
let md = `# Migration Summary — Legacy DSL Format\n\n`;
md += `Generated: ${now}${DRY_RUN ? ' (DRY RUN)' : ''}\n\n`;
md += `**Variant A** (trigger at root): ${stats.A.length}\n`;
md += `**Variant B** (key "0" at root): ${stats.B.length}\n`;
md += `**Total migrated**: ${totalMigrated}\n\n`;

if (stats.A.length) {
  md += `### Variant A\n${stats.A.map(id => `- ${id}`).join('\n')}\n\n`;
}
if (stats.B.length) {
  md += `### Variant B\n${stats.B.map(id => `- ${id}`).join('\n')}\n\n`;
}

if (!DRY_RUN) {
  writeFileSync(SUMMARY_OUT, md);
  console.log(`\nSummary written: ${SUMMARY_OUT}`);
} else {
  console.log('\n--- Preview ---\n' + md.slice(0, 1000));
}
