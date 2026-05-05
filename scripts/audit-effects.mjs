#!/usr/bin/env node
/**
 * Audit effect DSL files against official card text using Claude.
 *
 * Usage:
 *   node scripts/audit-effects.mjs [options]
 *
 * Options:
 *   --sets OP-01,OP-02   Only audit these sets (comma-separated, use dash form: OP-01)
 *   --only-issues        Only write audit/{id}.json files for cards with issues
 *   --max-cost 0         Dry-run: list cards that would be audited without calling the API
 *
 * Output:
 *   packages/data/audit/{id}.json   — per-card audit result
 *   audit-report.md                 — summary report
 *
 * Requires ANTHROPIC_API_KEY in env or .env file.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT       = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR    = join(ROOT, 'packages/data/raw');
const EFFECTS_DIR = join(ROOT, 'packages/data/effects');
const AUDIT_DIR  = join(ROOT, 'packages/data/audit');
const REPORT_PATH = join(ROOT, 'audit-report.md');

// ─── Load .env ────────────────────────────────────────────────────────────────

try {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch { /* .env not readable in sandbox — rely on env vars */ }

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  const prefixed = args.find(a => a.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
}

const setsArg      = getArg('--sets');
const onlyIssues   = args.includes('--only-issues');
const maxCostArg   = getArg('--max-cost');
const dryRun       = maxCostArg !== undefined && Number(maxCostArg) === 0;
const retryErrors  = args.includes('--retry-errors'); // only audit missing or errored audit files
const MAX_CONCURRENT = 2;

if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set. Use --max-cost 0 for dry-run.');
  process.exit(1);
}

// ─── Collect cards to audit ───────────────────────────────────────────────────

const setsFilter = setsArg ? new Set(setsArg.split(',').map(s => s.trim())) : null;

let rawFiles = readdirSync(RAW_DIR)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .sort();

if (setsFilter !== null) {
  rawFiles = rawFiles.filter(f => setsFilter.has(f.replace(/\.json$/, '')));
  if (rawFiles.length === 0) {
    console.error(`No matching sets for --sets: ${setsArg}`);
    process.exit(1);
  }
}

/** @type {{ id: string; name: string; set: string; effectText: string; dsl: object }[]} */
const toAudit = [];

for (const rawFile of rawFiles) {
  const cards = JSON.parse(readFileSync(join(RAW_DIR, rawFile), 'utf8'));
  for (const card of cards) {
    // Skip parallel variants (_p1, _p2…) — same effect as the main card
    if (/_p\d+$/.test(card.id)) continue;
    // Skip DON!! cards — no effects DSL
    if (card.cardType === 'DON!!') continue;

    const dslPath = join(EFFECTS_DIR, `${card.id}.json`);
    if (!existsSync(dslPath)) continue; // no DSL yet — not our problem here

    if (retryErrors) {
      const auditPath = join(AUDIT_DIR, `${card.id}.json`);
      if (existsSync(auditPath)) {
        const prev = JSON.parse(readFileSync(auditPath, 'utf8'));
        if (prev.verdict !== 'error' && prev.verdict !== 'parse_error') continue; // already audited successfully — skip
      }
      // no audit file → include (not yet audited)
    }

    const dsl = JSON.parse(readFileSync(dslPath, 'utf8'));
    toAudit.push({ id: card.id, name: card.name, set: card.set, effectText: card.effectText ?? '', dsl });
  }
}

console.log(`Cards to audit: ${toAudit.length}${dryRun ? '  [DRY RUN — no API calls]' : ''}`);
if (dryRun) {
  for (const c of toAudit) console.log(`  ${c.id}  ${c.name}`);
  process.exit(0);
}

mkdirSync(AUDIT_DIR, { recursive: true });

// ─── Audit prompt ─────────────────────────────────────────────────────────────

const AUDIT_SYSTEM = `\
OPTCG DSL auditor. Verify DSL JSON matches official card effect text. Reply with JSON only, no prose.

Triggers: OnPlay|OnAttack|OnAttacked|OnKO|OnBlock|Counter|Trigger|Activated|StartOfTurn|EndOfTurn
Conditions: Always|TurnCount|HasRestingDon|HasAttachedDon|LeaderHasType|LeaderHasAnyType|LeaderIsName|HasCardOnBoard|TrashCount
Actions: DrawCard|KO|ReturnToHand|PowerBoost|ForceDiscard|AddLife|GiveDon|FlipLife|AttachDon|GiveKeyword|Rest|RemoveLife|PlaySelf|SearchDeck|PlayFromHand|RevealFromHand|TrashFromHand|Win
Legacy aliases (do NOT flag): Draw=DrawCard, TrashCard=ForceDiscard, TakeLifeToHand=FlipLife, GainKeyword=GiveKeyword

Duration rules:
- "[Your Turn]" in text → duration:"DuringYourTurn" (not EndOfTurn/Permanent) — violation=major
- "opponent's turn" in text → duration:"DuringOpponentTurn" (not EndOfTurn/Permanent) — violation=major

Severity: critical=effect missing/completely wrong | major=wrong condition/target/duration | minor=small inaccuracy
Empty effectText + empty effects[] → verdict "ok".
suggestedDsl: output full corrected DSL only for major/critical; null otherwise.

Output schema (JSON, no markdown):
{"verdict":"ok"|"minor"|"major"|"critical","issues":[{"severity":"...","field":"effects[0].actions[0].type","description":"..."}],"suggestedDsl":{...}|null}`;

function buildAuditMessage(card) {
  // Minify DSL to reduce tokens
  const effectsStr = JSON.stringify(card.dsl.effects ?? []);
  return `${card.id} | ${card.effectText || '(none)'}
DSL: ${effectsStr}`;
}

// ─── Concurrency limiter ───────────────────────────────────────────────────────

async function withConcurrencyLimit(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Call Claude API ───────────────────────────────────────────────────────────

function parseAuditResponse(text) {
  // 1. Extract content between first ``` fence pair (handles trailing prose after closing ```)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return JSON.parse(fenced[1].trim());
  // 2. Extract bare JSON object if no fences
  const obj = text.match(/(\{[\s\S]*\})/);
  if (obj) return JSON.parse(obj[1].trim());
  // 3. Last resort: parse the whole trimmed text
  return JSON.parse(text.trim());
}

async function auditCard(card, maxTokens = 768) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system: AUDIT_SYSTEM,
    messages: [{ role: 'user', content: buildAuditMessage(card) }],
  });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body,
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`API error ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const data = await resp.json();
  const raw = data.content?.[0]?.text ?? '';

  let result;
  try {
    result = parseAuditResponse(raw);
  } catch {
    result = { verdict: 'parse_error', issues: [], suggestedDsl: null, _raw: raw.slice(0, 300) };
  }

  await new Promise(r => setTimeout(r, 6000));
  return result;
}

// ─── Main audit loop ───────────────────────────────────────────────────────────

/** @type {{ id: string; name: string; set: string; verdict: string; issues: any[]; suggestedDsl: any }[]} */
const auditResults = [];
/** @type {{ card: typeof toAudit[0]; idx: number }[]} */
const parseErrors = [];

let done = 0;
const total = toAudit.length;
const startTime = Date.now();

function logLine(card, result, current, outOf) {
  const pct = ((current / outOf) * 100).toFixed(0);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const icon = result.verdict === 'ok' ? '✓' : (result.verdict === 'error' || result.verdict === 'parse_error') ? '!' : '✗';
  console.log(`[${current}/${outOf} ${pct}% ${elapsed}s] ${icon} ${card.id} ${card.name}  →  ${result.verdict}`);
}

function makeEntry(card, result) {
  return {
    id: card.id,
    name: card.name,
    set: card.set,
    verdict: result.verdict,
    issues: result.issues ?? [],
    suggestedDsl: result.suggestedDsl ?? null,
    auditedAt: new Date().toISOString(),
  };
}

const tasks = toAudit.map((card, cardIdx) => async () => {
  let result;
  try {
    result = await auditCard(card);
  } catch (err) {
    result = {
      verdict: 'error',
      issues: [{ severity: 'critical', description: `API call failed: ${err.message}`, field: '' }],
      suggestedDsl: null,
    };
  }

  done++;
  logLine(card, result, done, total);

  if (result.verdict === 'parse_error') {
    parseErrors.push({ card, idx: cardIdx });
    // Write temporary error entry — will be overwritten by retry pass
    const entry = makeEntry(card, {
      verdict: 'error',
      issues: [{ severity: 'critical', description: `Failed to parse API response: ${result._raw ?? ''}`, field: '' }],
      suggestedDsl: null,
    });
    writeFileSync(join(AUDIT_DIR, `${card.id}.json`), JSON.stringify(entry, null, 2) + '\n');
    auditResults.push(entry);
    return;
  }

  const entry = makeEntry(card, result);
  const shouldWrite = !onlyIssues || result.verdict !== 'ok';
  if (shouldWrite) {
    writeFileSync(join(AUDIT_DIR, `${card.id}.json`), JSON.stringify(entry, null, 2) + '\n');
  }
  auditResults.push(entry);
});

await withConcurrencyLimit(tasks, MAX_CONCURRENT);

// ─── Retry pass : parse errors with higher token budget ───────────────────────

if (parseErrors.length > 0) {
  console.log(`\n── Retry pass (${parseErrors.length} parse error(s) with max_tokens=1536) ──`);
  let retryDone = 0;

  const retryTasks = parseErrors.map(({ card, idx }) => async () => {
    let result;
    try {
      result = await auditCard(card, 2048);
    } catch (err) {
      result = {
        verdict: 'error',
        issues: [{ severity: 'critical', description: `API call failed: ${err.message}`, field: '' }],
        suggestedDsl: null,
      };
    }

    retryDone++;
    logLine(card, result, retryDone, parseErrors.length);

    const entry = makeEntry(card, result);
    const shouldWrite = !onlyIssues || result.verdict !== 'ok';
    if (shouldWrite) {
      writeFileSync(join(AUDIT_DIR, `${card.id}.json`), JSON.stringify(entry, null, 2) + '\n');
    }

    // Replace the temporary error entry in auditResults
    const existing = auditResults.findIndex(r => r.id === card.id);
    if (existing !== -1) auditResults[existing] = entry;
    else auditResults.push(entry);
  });

  await withConcurrencyLimit(retryTasks, MAX_CONCURRENT);
}

// ─── Generate report ───────────────────────────────────────────────────────────

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2, ok: 3, error: 0 };

const withIssues = auditResults.filter(r => r.verdict !== 'ok').sort((a, b) => {
  const sa = Math.min(...(a.issues.length ? a.issues.map(i => SEVERITY_ORDER[i.severity] ?? 99) : [99]));
  const sb = Math.min(...(b.issues.length ? b.issues.map(i => SEVERITY_ORDER[i.severity] ?? 99) : [99]));
  return sa - sb;
});

const counts = { ok: 0, minor: 0, major: 0, critical: 0, error: 0 };
for (const r of auditResults) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;

const totalWithIssues = auditResults.length - counts.ok;
const pctOk = auditResults.length > 0 ? ((counts.ok / auditResults.length) * 100).toFixed(1) : '0.0';

let report = `# Effect DSL Audit Report

Generated: ${new Date().toISOString()}
Sets: ${setsArg ?? 'all'}

## Summary

| Status | Count |
|--------|-------|
| ✅ ok | ${counts.ok} |
| ⚠️ minor | ${counts.minor} |
| 🔶 major | ${counts.major} |
| 🔴 critical | ${counts.critical} |
| ❌ error | ${counts.error ?? 0} |
| **Total audited** | **${auditResults.length}** |
| **Correct rate** | **${pctOk}%** |

`;

if (withIssues.length === 0) {
  report += '## All cards are correctly encoded! 🎉\n';
} else {
  report += `## Cards with issues (${withIssues.length})\n\n`;

  for (const r of withIssues) {
    const severityIcon = r.verdict === 'critical' ? '🔴' : r.verdict === 'major' ? '🔶' : r.verdict === 'error' ? '❌' : '⚠️';
    report += `### ${severityIcon} ${r.id} — ${r.name} (${r.set})\n\n`;
    report += `**Verdict:** ${r.verdict}\n\n`;

    if (r.issues.length > 0) {
      report += '**Issues:**\n';
      for (const issue of r.issues) {
        const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'major' ? '🔶' : '⚠️';
        report += `- ${icon} \`${issue.field || 'general'}\` — ${issue.description}\n`;
      }
      report += '\n';
    }

    if (r.suggestedDsl !== null) {
      report += '**Suggested DSL:**\n\n';
      report += '```json\n';
      report += JSON.stringify(r.suggestedDsl, null, 2);
      report += '\n```\n\n';
    }

    report += '---\n\n';
  }
}

writeFileSync(REPORT_PATH, report);

console.log(`\n── Audit complete ─────────────────────────────────────────`);
console.log(`Cards audited  : ${auditResults.length}`);
console.log(`Correct (ok)   : ${counts.ok}  (${pctOk}%)`);
console.log(`With issues    : ${totalWithIssues}  (minor: ${counts.minor}, major: ${counts.major}, critical: ${counts.critical}, error: ${counts.error ?? 0})`);
console.log(`Report written : ${REPORT_PATH}`);
console.log(`Audit files    : ${AUDIT_DIR}/`);
