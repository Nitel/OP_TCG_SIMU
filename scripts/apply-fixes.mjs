#!/usr/bin/env node
/**
 * Apply DSL fixes from audit files to packages/data/effects/.
 *
 * Usage:
 *   node scripts/apply-fixes.mjs [--dry-run] [--sets OP-01,EB-01] [--include-minor]
 *
 * Only patches cards whose suggestedDsl uses exclusively known engine types.
 * Skips parallel variants (_p1, _p2, _r1, etc.) and DON!! cards.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT        = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT_DIR   = join(ROOT, 'packages/data/audit');
const EFFECTS_DIR = join(ROOT, 'packages/data/effects');
const SUMMARY_OUT = join(ROOT, 'fix-summary.md');

// ─── Known types (from packages/game-engine/src/types/index.ts) ───────────────

const KNOWN_ACTION_TYPES = new Set([
  // Core actions
  'DrawCard', 'KO', 'ReturnToHand', 'PowerBoost', 'AddLife', 'GiveDon',
  'SearchDeck', 'FlipLife', 'ForceDiscard', 'AttachDon', 'GiveKeyword',
  'Rest', 'RemoveLife', 'Win', 'PlaySelf', 'PlayFromHand',
  'RevealFromHand', 'TrashFromHand',
  // Phase 2
  'TrashFromDeck', 'PlayFromTrash', 'RevealFromDeck', 'PlaceAtBottomOfDeck',
  'SearchTrash', 'Activate',
  // Legacy aliases accepted by engine
  'Draw', 'TrashCard', 'TakeLifeToHand', 'GainKeyword',
]);

const KNOWN_CONDITION_TYPES = new Set([
  'Always', 'TurnCount', 'HasRestingDon', 'LeaderHasAttachedDon', 'HasAttachedDon',
  'TrashCount', 'HasCardOnBoard', 'AnyPlayerHasNoLife',
  'LeaderHasType', 'LeaderHasAnyType', 'LeaderIsName',
]);

const KNOWN_TARGET_SCOPES = new Set([
  'Self', 'Attacker', 'OriginalTarget',
  'AllOpponentCharacters', 'AllOwnCharacters', 'AllOwnCharactersAndLeader',
  'OpponentLeader', 'OwnLeader',
  'ChooseOpponentCharacter', 'ChooseOwnCharacter',
  'ChooseOwnCharacterOrLeader', 'ChooseOpponentCharacterOrLeader',
]);

const KNOWN_TRIGGERS = new Set([
  'OnPlay', 'OnAttack', 'OnAttacked', 'OnKO', 'OnLeaveField', 'OnBlock',
  'OnOpponentBlock', 'OnOpponentPlaysEvent', 'Counter', 'Trigger', 'Activated',
  'StartOfTurn', 'StartOfOpponentTurn', 'StartOfMainPhase', 'EndOfTurn',
]);

const KNOWN_KEYWORDS = new Set(['Rush', 'Blocker', 'DoubleAttack', 'Banish', 'Unblockable', 'Trigger']);

const KNOWN_DURATIONS = new Set(['EndOfTurn', 'DuringYourTurn', 'EndOfBattle', 'EndOfOpponentTurn', 'Permanent']);

const KNOWN_FILTER_KINDS = new Set(['Any', 'ByType', 'ByCost', 'ByName']);

// Duration aliases from LLM → engine value
const DURATION_MAP = {
  DuringOpponentTurn:   'EndOfOpponentTurn',
  DuringThisBattle:     'EndOfBattle',
  UntilStartOfNextTurn: 'EndOfOpponentTurn',
  EndOfTurnOrBattle:    'EndOfBattle',
};

// filter.kind aliases from LLM → engine value
const FILTER_KIND_MAP = {
  Type:   'ByType',
  Cost:   'ByCost',
  Name:   'ByName',
};

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN       = args.includes('--dry-run');
const INCLUDE_MINOR = args.includes('--include-minor');
const setsArg       = args.find(a => a.startsWith('--sets=')) ?? args[args.indexOf('--sets') + 1];
const FILTER_SETS   = setsArg && !setsArg.startsWith('--')
  ? new Set(setsArg.split(',').map(s => s.trim()))
  : null;

const VERDICTS = new Set(['critical', 'major', ...(INCLUDE_MINOR ? ['minor'] : [])]);

// ─── Validation helpers ───────────────────────────────────────────────────────

/** Collect all unknown type-like values from suggestedDsl. Returns [] if all known. */
function collectUnknown(dsl) {
  const unknown = [];

  function checkActions(actions) {
    if (!Array.isArray(actions)) return;
    for (const a of actions) {
      if (!a || typeof a !== 'object') continue;
      if (a.type && !KNOWN_ACTION_TYPES.has(a.type)) {
        unknown.push(`ActionType::${a.type}`);
      }
      if (a.keyword !== undefined && !KNOWN_KEYWORDS.has(a.keyword)) {
        unknown.push(`Keyword::${a.keyword}`);
      }
      // target must be an object with a known scope, not a bare string or {type/kind/...}
      if (a.target !== undefined) {
        if (typeof a.target !== 'object' || a.target === null) {
          unknown.push(`InvalidTarget::${a.type}(notObject)`);
        } else if (!a.target.scope) {
          // target exists but has no scope field (e.g. {type:"Self"} or {kind:"Character"})
          unknown.push(`InvalidTarget::${a.type}(noScope)`);
        } else if (!KNOWN_TARGET_SCOPES.has(a.target.scope)) {
          unknown.push(`TargetScope::${a.target.scope}`);
        }
      }
      // Require target for actions that need it
      if (['KO', 'ReturnToHand', 'PowerBoost', 'GiveKeyword', 'Rest', 'Activate',
           'PlaceAtBottomOfDeck', 'AttachDon'].includes(a.type) && !a.target) {
        unknown.push(`MissingTarget::${a.type}`);
      }
      if (a.duration !== undefined) {
        const resolved = DURATION_MAP[a.duration] ?? a.duration;
        if (!KNOWN_DURATIONS.has(resolved)) unknown.push(`Duration::${a.duration}`);
      }
      if (a.filter !== undefined) {
        if (a.filter?.kind !== undefined) {
          const resolved = FILTER_KIND_MAP[a.filter.kind] ?? a.filter.kind;
          if (!KNOWN_FILTER_KINDS.has(resolved)) unknown.push(`FilterKind::${a.filter.kind}`);
        }
        // filter.cardType must be a single string from valid card types, not an array
        if (a.filter.cardType !== undefined) {
          if (!['Character', 'Event', 'Stage'].includes(a.filter.cardType)) {
            unknown.push(`InvalidFilterCardType::${JSON.stringify(a.filter.cardType)}`);
          }
        }
      }
      if (Array.isArray(a.thenActions)) checkActions(a.thenActions);
    }
  }

  function checkEffect(eff) {
    if (!eff || typeof eff !== 'object') return;
    if (eff.trigger && !KNOWN_TRIGGERS.has(eff.trigger)) {
      unknown.push(`Trigger::${eff.trigger}`);
    }
    // condition must be an object with a known type, not a bare string
    if (eff.condition !== undefined && eff.condition !== null) {
      if (typeof eff.condition !== 'object') {
        unknown.push(`InvalidCondition::string`);
      } else if (!eff.condition.type) {
        unknown.push(`InvalidCondition::noType`);
      } else if (!KNOWN_CONDITION_TYPES.has(eff.condition.type)) {
        unknown.push(`ConditionType::${eff.condition.type}`);
      }
    }
    // conditions (plural array) is not a valid engine format
    if (Array.isArray(eff.conditions)) {
      unknown.push(`InvalidConditions::array`);
    }
    // LeaderHasAnyType requires subTypes (not types) field
    if (eff.condition?.type === 'LeaderHasAnyType' && !Array.isArray(eff.condition.subTypes)) {
      unknown.push(`InvalidCondition::LeaderHasAnyType(noSubTypes)`);
    }
    // LeaderHasType requires subType (singular) field
    if (eff.condition?.type === 'LeaderHasType' && !eff.condition.subType) {
      unknown.push(`InvalidCondition::LeaderHasType(noSubType)`);
    }
    // LeaderIsName requires name field
    if (eff.condition?.type === 'LeaderIsName' && !eff.condition.name) {
      unknown.push(`InvalidCondition::LeaderIsName(noName)`);
    }
    checkActions(eff.actions);
  }

  if (Array.isArray(dsl.effects)) {
    for (const eff of dsl.effects) checkEffect(eff);
  }

  return [...new Set(unknown)]; // deduplicate
}

/** Recursively normalize duration/filter aliases in suggestedDsl before writing. */
function normalizeDsl(obj) {
  if (Array.isArray(obj)) return obj.map(normalizeDsl);
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'duration' && typeof v === 'string' && DURATION_MAP[v]) {
      result[k] = DURATION_MAP[v];
    } else if (k === 'kind' && typeof v === 'string' && FILTER_KIND_MAP[v]) {
      result[k] = FILTER_KIND_MAP[v];
    } else {
      result[k] = normalizeDsl(v);
    }
  }
  return result;
}

// ─── Set name normalization ───────────────────────────────────────────────────

/** EB01-001 → "EB-01", OP03-042 → "OP-03", ST21-001 → "ST-21", P-025 → "P" */
function setOf(id) {
  const m = id.match(/^([A-Z]{2,4})\d{2}-/);
  if (!m) return id.split('-')[0] ?? id;
  const prefix = m[1];
  const num    = id.match(/^[A-Z]{2,4}(\d{2})-/)?.[1];
  if (!num) return prefix;
  return `${prefix}-${num}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (!existsSync(AUDIT_DIR)) {
  console.error(`Audit directory not found: ${AUDIT_DIR}`);
  process.exit(1);
}

const files = readdirSync(AUDIT_DIR).filter(f => f.endsWith('.json')).sort();

// Stats per set
/** @type {Map<string, { patched: { verdict: string; id: string }[]; skipped: { id: string; reasons: string[] }[] }>} */
const stats = new Map();

function getStats(set) {
  if (!stats.has(set)) stats.set(set, { patched: [], skipped: [] });
  return stats.get(set);
}

let totalPatched = 0;
let totalSkipped = 0;

for (const file of files) {
  // Skip parallel / reprint variants
  if (/_[pr]\d+\.json$/.test(file)) continue;

  const audit = JSON.parse(readFileSync(join(AUDIT_DIR, file), 'utf8'));
  const id    = audit.id ?? file.replace(/\.json$/, '');
  const set   = setOf(id);

  // Apply set filter
  if (FILTER_SETS !== null && !FILTER_SETS.has(set) && !FILTER_SETS.has(id.match(/^[A-Z]{2,4}\d{2}/)?.[0] ?? '')) {
    continue;
  }

  // Skip non-actionable verdicts
  if (!VERDICTS.has(audit.verdict)) continue;
  if (audit.skipped === true) continue;
  if (!audit.suggestedDsl) {
    getStats(set).skipped.push({ id, reasons: ['no suggestedDsl'] });
    totalSkipped++;
    continue;
  }

  const unknown = collectUnknown(audit.suggestedDsl);
  if (unknown.length > 0) {
    getStats(set).skipped.push({ id, reasons: unknown });
    totalSkipped++;
    continue;
  }

  // Build the output DSL (normalize duration/filter aliases)
  const output = normalizeDsl({ id, ...audit.suggestedDsl });
  const outPath = join(EFFECTS_DIR, `${id}.json`);

  if (!DRY_RUN) {
    writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  }

  getStats(set).patched.push({ verdict: audit.verdict, id });
  totalPatched++;
}

// ─── Report ───────────────────────────────────────────────────────────────────

const mode = DRY_RUN ? '[DRY RUN] ' : '';

console.log(`\n${mode}Results:`);
console.log(`  Patched : ${totalPatched}`);
console.log(`  Skipped : ${totalSkipped}`);
console.log('');

let md = `# DSL Fix Summary\n\nGenerated: ${new Date().toISOString()}${DRY_RUN ? ' (DRY RUN)' : ''}\n\n`;
md += `**Total patched:** ${totalPatched} | **Total skipped:** ${totalSkipped}\n\n`;

for (const [set, s] of [...stats.entries()].sort()) {
  if (s.patched.length === 0 && s.skipped.length === 0) continue;

  const critical = s.patched.filter(p => p.verdict === 'critical');
  const major    = s.patched.filter(p => p.verdict === 'major');
  const minor    = s.patched.filter(p => p.verdict === 'minor');

  console.log(`${mode}${set} — ${s.patched.length} patched, ${s.skipped.length} skipped`);

  md += `## ${set} — ${s.patched.length} cartes patchées\n\n`;
  if (critical.length) md += `**critical (${critical.length}):** ${critical.map(p => p.id).join(', ')}\n\n`;
  if (major.length)    md += `**major (${major.length}):** ${major.map(p => p.id).join(', ')}\n\n`;
  if (minor.length)    md += `**minor (${minor.length}):** ${minor.map(p => p.id).join(', ')}\n\n`;

  if (s.skipped.length > 0) {
    md += `**skipped — type inconnu (${s.skipped.length}):**\n`;
    for (const sk of s.skipped) {
      md += `- ${sk.id} (${sk.reasons.join(', ')})\n`;
    }
    md += '\n';
  }
}

if (!DRY_RUN) {
  writeFileSync(SUMMARY_OUT, md);
  console.log(`\nSummary written: ${SUMMARY_OUT}`);
} else {
  console.log('\n' + md);
}
