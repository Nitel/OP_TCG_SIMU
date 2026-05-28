/**
 * Behavioral Coverage Report
 *
 * Reads all packages/data/effects/*.json and classifies each card:
 *   ✅  Smoke PASS  — at least one effect passes in the smoke harness
 *   ⚠️  Smoke TODO  — has effects but smoke returns TODO (condition not met)
 *   🔬  Integration — explicitly exercised in tests/st*.test.ts or tests/integration/
 *   ❌  No Effects  — effects array empty or missing
 *
 * Run:  npx tsx tests/coverageReport.ts [--set ST22] [--format json]
 *       or: pnpm -F game-engine coverage-report
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { smokeFile, EFFECTS_DIR } from './smoke/smokeHarness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = __dirname;
const INTEGRATION_DIR = path.join(TESTS_DIR, 'integration');

// ─── Collect card IDs explicitly mentioned in test source files ───────────────

function gatherIntegrationCoverage(): Set<string> {
  const covered = new Set<string>();
  const cardIdRe = /[A-Z]{2,3}\d{2}-\d{3}(?:_p\d+)?/g;

  const testDirs = [TESTS_DIR, INTEGRATION_DIR];
  for (const dir of testDirs) {
    if (\!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (\!file.endsWith('.test.ts') && \!file.endsWith('.test.js')) continue;
      if (file.includes('smoke')) continue; // smoke tests auto-cover
      const src = fs.readFileSync(path.join(dir, file), 'utf-8');
      for (const m of src.matchAll(cardIdRe)) covered.add(m[0]\!);
    }
  }
  return covered;
}

// ─── Classify one file ────────────────────────────────────────────────────────

type Status = 'pass' | 'todo' | 'no-effects' | 'integration';

interface CardReport {
  id: string;
  file: string;
  status: Status;
  triggers: string[];
  details: string;
}

function classifyFile(filePath: string, integrationIds: Set<string>): CardReport {
  const file = path.basename(filePath);
  const id = path.basename(filePath, '.json');

  let def: { effects?: { trigger?: string }[]; id?: string } = {};
  try {
    def = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { id, file, status: 'no-effects', triggers: [], details: 'JSON parse error' };
  }

  if (\!def || typeof def \!== 'object' || Array.isArray(def)) {
    return { id, file, status: 'no-effects', triggers: [], details: 'list-format file' };
  }

  const effects = def.effects ?? [];
  const triggers = effects.map((e) => e.trigger ?? '?').filter(Boolean);

  if (effects.length === 0) {
    return { id, file, status: 'no-effects', triggers: [], details: 'no effects defined' };
  }

  if (integrationIds.has(id)) {
    const r = smokeFile(filePath);
    return { id, file, status: 'integration', triggers, details: `smoke:${r.outcome} + integration test` };
  }

  const r = smokeFile(filePath);
  if (r.outcome === 'pass') return { id, file, status: 'pass', triggers, details: r.details };
  if (r.outcome === 'fail') return { id, file, status: 'todo', triggers, details: `FAIL: ${r.details}` };
  return { id, file, status: 'todo', triggers, details: r.details };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filterSet = args[args.indexOf('--set') + 1] ?? null;
const jsonOutput = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';

const integrationIds = gatherIntegrationCoverage();
const allFiles = fs.readdirSync(EFFECTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => path.join(EFFECTS_DIR, f))
  .filter((f) => \!filterSet || path.basename(f).startsWith(`${filterSet}-`));

const reports: CardReport[] = [];
for (const fp of allFiles) {
  reports.push(classifyFile(fp, integrationIds));
}

const byStatus = {
  pass: reports.filter((r) => r.status === 'pass'),
  todo: reports.filter((r) => r.status === 'todo'),
  'no-effects': reports.filter((r) => r.status === 'no-effects'),
  integration: reports.filter((r) => r.status === 'integration'),
};

if (jsonOutput) {
  console.log(JSON.stringify({ summary: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, v.length])), reports }, null, 2));
  process.exit(0);
}

// ─── Text report ──────────────────────────────────────────────────────────────

const ICONS: Record<Status, string> = { pass: '✅', todo: '⚠️ ', 'no-effects': '❌', integration: '🔬' };
const total = reports.length;
const withEffects = total - byStatus['no-effects'].length;

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  Behavioral Coverage Report' + (filterSet ? ` — ${filterSet}` : ''));
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Total files        : ${total}`);
console.log(`  With effects       : ${withEffects} (${Math.round(100 * withEffects / total)}%)`);
console.log(`  ✅ Smoke PASS      : ${byStatus.pass.length}`);
console.log(`  🔬 Integration     : ${byStatus.integration.length}`);
console.log(`  ⚠️  Smoke TODO      : ${byStatus.todo.length}`);
console.log(`  ❌ No effects      : ${byStatus['no-effects'].length}`);

const covered = byStatus.pass.length + byStatus.integration.length;
const coverageRate = withEffects > 0 ? Math.round(100 * covered / withEffects) : 0;
console.log(`  Coverage rate      : ${covered}/${withEffects} with-effects = ${coverageRate}%`);
console.log('───────────────────────────────────────────────────────────────');

if (byStatus.todo.length > 0) {
  console.log(`\n  ⚠️  TODO (${byStatus.todo.length} cards) — effects defined but not yet smoke-passing:`);
  const byTrigger: Record<string, string[]> = {};
  for (const r of byStatus.todo) {
    const key = r.triggers.join('+') || 'unknown';
    (byTrigger[key] ??= []).push(r.id);
  }
  for (const [trigger, ids] of Object.entries(byTrigger).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${trigger} (${ids.length}): ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ` …+${ids.length - 5}` : ''}`);
  }
}

if (filterSet) {
  console.log(`\n  ${filterSet} detailed status:`);
  for (const r of reports) {
    const icon = ICONS[r.status];
    const trigStr = r.triggers.length > 0 ? `[${r.triggers.join(',')}]` : '';
    console.log(`    ${icon} ${r.id.padEnd(14)} ${trigStr.padEnd(25)} ${r.details}`);
  }
}

console.log('');
