/**
 * Behavioral Coverage Report
 *
 * Static analysis: reads all packages/data/effects/*.json and classifies each card.
 * No engine calls — runs in ~200 ms as part of pnpm test.
 *
 * Run targeted:  pnpm test -- tests/coverageReport.test.ts
 *
 * Classification:
 *   ✅ covered    — has effects AND at least 1 effect trigger is implemented in smokeHarness
 *   🔬 integration — explicitly tested in tests/st*.test.ts or tests/integration/
 *   ⚠️  partial    — has effects but all triggers are in the unsupported set
 *   ❌ no-effects  — effects array empty or missing
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EFFECTS_DIR = path.resolve(__dirname, '../../data/effects');
const TESTS_DIR = __dirname;
const INTEGRATION_DIR = path.join(TESTS_DIR, 'integration');

// Triggers fully handled in smokeHarness.ts
const SMOKE_HANDLED_TRIGGERS = new Set([
  'OnPlay', 'Activated', 'OnAttack', 'Counter', 'OnAttacked', 'OnBlock',
  'OnOpponentBlock', 'StartOfOpponentTurn', 'OnOpponentPlaysEvent',
  'OnKO', 'Trigger', 'StartOfTurn', 'EndOfTurn', 'WhenAttacking',
  'Permanent', 'OnWouldBeKOByEffect', 'StartOfMainPhase', 'OnDamage', 'OnTrash',
  'OnBlockPrevented', 'OnEnterBoard', 'OnOpponentDrawCard',
]);

// ─── Gather card IDs mentioned in dedicated test files ────────────────────────

function gatherIntegrationIds(): Set<string> {
  const covered = new Set<string>();
  const re = /[A-Z]{2,3}\d{2}-\d{3}(?:_p\d+)?/g;
  const dirs = [TESTS_DIR, INTEGRATION_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.test.ts')) continue;
      if (file.includes('smoke') || file === 'coverageReport.test.ts') continue;
      const src = fs.readFileSync(path.join(dir, file), 'utf-8');
      for (const m of src.matchAll(re)) covered.add(m[0]!);
    }
  }
  return covered;
}

// ─── Classify a single DSL file ───────────────────────────────────────────────

type Status = 'covered' | 'integration' | 'partial' | 'no-effects';

interface CardReport {
  id: string;
  status: Status;
  triggers: string[];
}

function classify(filePath: string, integrationIds: Set<string>): CardReport {
  const id = path.basename(filePath, '.json');
  let def: { effects?: { trigger?: string }[] } = {};
  try { def = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { /* skip */ }

  if (!def || typeof def !== 'object' || Array.isArray(def)) {
    return { id, status: 'no-effects', triggers: [] };
  }

  const effects = def.effects ?? [];
  if (effects.length === 0) return { id, status: 'no-effects', triggers: [] };

  const triggers = effects.map((e) => e.trigger ?? '').filter(Boolean);
  const isIntegration = integrationIds.has(id);
  const hasSmokeTrigger = triggers.some((t) => SMOKE_HANDLED_TRIGGERS.has(t));

  if (isIntegration) return { id, status: 'integration', triggers };
  if (hasSmokeTrigger) return { id, status: 'covered', triggers };
  return { id, status: 'partial', triggers };
}

// ─── Run analysis ─────────────────────────────────────────────────────────────

const integrationIds = gatherIntegrationIds();
const allFiles = fs.readdirSync(EFFECTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => path.join(EFFECTS_DIR, f));

const reports = allFiles.map((f) => classify(f, integrationIds));

const byStatus = {
  covered: reports.filter((r) => r.status === 'covered'),
  integration: reports.filter((r) => r.status === 'integration'),
  partial: reports.filter((r) => r.status === 'partial'),
  'no-effects': reports.filter((r) => r.status === 'no-effects'),
};

const total = reports.length;
const withEffects = total - byStatus['no-effects'].length;
const coveredCount = byStatus.covered.length + byStatus.integration.length;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Behavioral Coverage Report', () => {
  it('report summary (informational — always passes)', () => {
    const rate = withEffects > 0 ? Math.round(100 * coveredCount / withEffects) : 0;

    /* eslint-disable no-console */
    console.log('\n  ══════════════════════════════════════════════════════════');
    console.log('  Behavioral Coverage Report');
    console.log('  ══════════════════════════════════════════════════════════');
    console.log(`  Total effect files   : ${total}`);
    console.log(`  With effects defined : ${withEffects} (${Math.round(100 * withEffects / total)}%)`);
    console.log(`  ✅ Smoke covered     : ${byStatus.covered.length}`);
    console.log(`  🔬 Integration tested: ${byStatus.integration.length}`);
    console.log(`  ⚠️  Partial (trigger) : ${byStatus.partial.length}`);
    console.log(`  ❌ No effects yet    : ${byStatus['no-effects'].length}`);
    console.log(`  Coverage rate        : ${coveredCount}/${withEffects} = ${rate}%`);
    /* eslint-enable no-console */

    // Not a failure — just informational
    expect(total).toBeGreaterThan(3000);
  });

  it('all integration-tested cards have effects defined', () => {
    const missingEffects = [...integrationIds].filter((id) => {
      const fp = path.join(EFFECTS_DIR, `${id}.json`);
      if (!fs.existsSync(fp)) return false;
      const r = reports.find((x) => x.id === id);
      return r?.status === 'no-effects';
    });
    if (missingEffects.length > 0) {
      console.warn(`  Cards in integration tests but missing DSL effects: ${missingEffects.join(', ')}`);
    }
    // Warn only, not fail (some integration tests use hand-crafted effects)
    expect(true).toBe(true);
  });

  it('ST22 coverage — all cards with effects have smoke or integration coverage', () => {
    const st22 = reports.filter((r) => r.id.startsWith('ST22-'));
    const uncovered = st22.filter((r) => r.status === 'partial');

    /* eslint-disable no-console */
    console.log('\n  ST22 coverage detail:');
    for (const r of st22) {
      const icon = { covered: '✅', integration: '🔬', partial: '⚠️ ', 'no-effects': '❌' }[r.status];
      const trig = r.triggers.length > 0 ? `[${r.triggers.join(',')}]` : '';
      console.log(`    ${icon} ${r.id.padEnd(16)} ${trig}`);
    }
    /* eslint-enable no-console */

    if (uncovered.length > 0) {
      console.warn(`  ⚠️  ${uncovered.length} ST22 card(s) have effects but no smoke coverage: ${uncovered.map((r) => r.id).join(', ')}`);
    }
    // Informational only
    expect(st22.length).toBeGreaterThan(0);
  });
});
