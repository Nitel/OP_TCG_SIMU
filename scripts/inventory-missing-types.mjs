#!/usr/bin/env node
/**
 * Scan all packages/data/audit/*.json suggestedDsl fields,
 * extract every type/scope/kind/trigger/condition used,
 * compare against known types from the TypeScript engine,
 * and generate missing-types-report.md.
 *
 * Usage: node scripts/inventory-missing-types.mjs
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT_DIR = join(ROOT, 'packages/data/audit');
const REPORT_PATH = join(ROOT, 'missing-types-report.md');

// ─── Known types (from packages/game-engine/src/types/index.ts) ───────────────

const KNOWN_ACTION_TYPES = new Set([
  'DrawCard', 'KO', 'ReturnToHand', 'PowerBoost', 'AddLife', 'GiveDon',
  'SearchDeck', 'FlipLife', 'ForceDiscard', 'AttachDon', 'GiveKeyword',
  'Rest', 'RemoveLife', 'Win', 'PlaySelf', 'PlayFromHand', 'RevealFromHand',
  'TrashFromHand',
  // Legacy aliases — accepted by engine
  'Draw', 'TrashCard', 'TakeLifeToHand', 'GainKeyword',
]);

const KNOWN_TRIGGERS = new Set([
  'OnPlay', 'OnAttack', 'OnAttacked', 'OnKO', 'OnLeaveField', 'OnBlock',
  'OnOpponentBlock', 'Counter', 'Trigger', 'Activated',
  'StartOfTurn', 'StartOfOpponentTurn', 'StartOfMainPhase', 'EndOfTurn',
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

const KNOWN_DECK_FILTER_KINDS = new Set(['Any', 'ByType', 'ByCost', 'ByName']);

const KNOWN_DURATIONS = new Set(['EndOfTurn', 'EndOfBattle', 'EndOfOpponentTurn', 'Permanent']);

const KNOWN_KEYWORDS = new Set(['Rush', 'Blocker', 'Banish', 'DoubleAttack', 'Unblockable']);

// ─── Collector ────────────────────────────────────────────────────────────────

/** @type {Map<string, { category: string; cards: string[]; examples: string[] }>} */
const missing = new Map();

function report(category, value, cardId, context) {
  const key = `${category}::${value}`;
  if (!missing.has(key)) missing.set(key, { category, value, cards: [], examples: [] });
  const entry = missing.get(key);
  if (!entry.cards.includes(cardId)) entry.cards.push(cardId);
  if (entry.examples.length < 3) entry.examples.push(`${cardId}: ${context}`);
}

function checkValue(category, knownSet, value, cardId, context) {
  if (typeof value === 'string' && !knownSet.has(value)) {
    report(category, value, cardId, context);
  }
}

// ─── Recursive DSL walker ─────────────────────────────────────────────────────

function walkActions(actions, cardId) {
  if (!Array.isArray(actions)) return;
  for (const action of actions) {
    if (typeof action !== 'object' || action === null) continue;

    checkValue('ActionType', KNOWN_ACTION_TYPES, action.type, cardId, `action.type="${action.type}"`);

    if (action.target && typeof action.target === 'object') {
      checkValue('TargetScope', KNOWN_TARGET_SCOPES, action.target.scope, cardId, `target.scope="${action.target.scope}"`);
    }

    if (action.duration !== undefined) {
      checkValue('Duration', KNOWN_DURATIONS, action.duration, cardId, `duration="${action.duration}"`);
    }

    if (action.keyword !== undefined) {
      checkValue('Keyword', KNOWN_KEYWORDS, action.keyword, cardId, `keyword="${action.keyword}"`);
    }

    if (action.filter && typeof action.filter === 'object') {
      if (action.filter.kind !== undefined) {
        checkValue('DeckFilterKind', KNOWN_DECK_FILTER_KINDS, action.filter.kind, cardId, `filter.kind="${action.filter.kind}"`);
      }
    }

    // Recurse into thenActions (RevealFromHand, TrashFromHand)
    if (Array.isArray(action.thenActions)) walkActions(action.thenActions, cardId);
  }
}

function walkEffect(effect, cardId) {
  if (typeof effect !== 'object' || effect === null) return;

  checkValue('Trigger', KNOWN_TRIGGERS, effect.trigger, cardId, `trigger="${effect.trigger}"`);

  if (effect.condition && typeof effect.condition === 'object') {
    checkValue('ConditionType', KNOWN_CONDITION_TYPES, effect.condition.type, cardId, `condition.type="${effect.condition.type}"`);
  }

  walkActions(effect.actions, cardId);
}

function walkDsl(dsl, cardId) {
  if (typeof dsl !== 'object' || dsl === null) return;

  // keywords array on the card root
  if (Array.isArray(dsl.keywords)) {
    for (const kw of dsl.keywords) {
      checkValue('Keyword', KNOWN_KEYWORDS, kw, cardId, `keywords[]="${kw}"`);
    }
  }

  if (Array.isArray(dsl.effects)) {
    for (const effect of dsl.effects) walkEffect(effect, cardId);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (!existsSync(AUDIT_DIR)) {
  console.error(`Audit directory not found: ${AUDIT_DIR}`);
  process.exit(1);
}

const files = readdirSync(AUDIT_DIR).filter(f => f.endsWith('.json')).sort();
let scanned = 0;
let withSuggested = 0;

for (const file of files) {
  const audit = JSON.parse(readFileSync(join(AUDIT_DIR, file), 'utf8'));
  scanned++;

  if (!audit.suggestedDsl || audit.verdict === 'ok' || audit.verdict === 'error' || audit.verdict === 'parse_error') continue;
  withSuggested++;

  walkDsl(audit.suggestedDsl, audit.id ?? file.replace(/\.json$/, ''));
}

console.log(`Scanned: ${scanned} audit files`);
console.log(`With suggestedDsl: ${withSuggested}`);
console.log(`Unknown values found: ${missing.size}`);

// ─── Generate report ───────────────────────────────────────────────────────────

const CATEGORY_ORDER = ['ActionType', 'Trigger', 'ConditionType', 'TargetScope', 'Duration', 'DeckFilterKind', 'Keyword'];

const byCategory = new Map();
for (const [, entry] of missing) {
  if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
  byCategory.get(entry.category).push(entry);
}
for (const list of byCategory.values()) list.sort((a, b) => b.cards.length - a.cards.length);

const totalMissing = missing.size;

let md = `# Missing Types Report

Generated: ${new Date().toISOString()}
Audit files scanned: ${scanned} | With suggestedDsl: ${withSuggested}
**Unknown values found: ${totalMissing}**

`;

if (totalMissing === 0) {
  md +='All types in suggestedDsl are known. Nothing to add to the engine.\n';
} else {
  for (const cat of [...CATEGORY_ORDER, ...[...byCategory.keys()].filter(k => !CATEGORY_ORDER.includes(k))]) {
    const entries = byCategory.get(cat);
    if (!entries || entries.length === 0) continue;

    md +=`## ${cat} (${entries.length} unknown)\n\n`;
    md +=`| Value | Cards using it |\n`;
    md +=`|-------|---------------|\n`;
    for (const e of entries) {
      md +=`| \`${e.value}\` | ${e.cards.length} |\n`;
    }
    md +='\n';

    for (const e of entries) {
      md +=`### \`${e.value}\` — ${e.cards.length} card(s)\n\n`;
      md +=`**Cards:** ${e.cards.slice(0, 10).join(', ')}${e.cards.length > 10 ? ` … +${e.cards.length - 10} more` : ''}\n\n`;
      if (e.examples.length > 0) {
        md +=`**Examples:**\n`;
        for (const ex of e.examples) report += `- ${ex}\n`;
      }
      md +='\n';
    }
  }
}

writeFileSync(REPORT_PATH, md);
console.log(`Report written: ${REPORT_PATH}`);
