#!/usr/bin/env node
/**
 * Regenerate DSL files for broken cards — cards whose effects file either:
 *   A) uses a legacy format (trigger/actions at root, or "0" key at root)
 *   B) has an effects array containing unknown types (failed apply-fixes validation)
 *
 * For each broken card:
 *   1. Loads the official effect text from packages/data/raw/
 *   2. Calls claude-haiku-4-5 with the full system prompt + rules.md context
 *   3. Validates the output against known engine types
 *   4. Writes the file if valid, otherwise logs a warning and skips
 *
 * Usage:
 *   node scripts/regenerate-broken-dsl.mjs [--dry-run] [--sets OP-01,ST-22]
 *
 * Requires ANTHROPIC_API_KEY in env or .env file.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT        = join(dirname(fileURLToPath(import.meta.url)), '..');
const EFFECTS_DIR = join(ROOT, 'packages/data/effects');
const RAW_DIR     = join(ROOT, 'packages/data/raw');
const RULES_PATH  = join(ROOT, 'resources/rules.md');
const SUMMARY_OUT = join(ROOT, 'regenerate-broken-summary.md');

// ─── Load .env ────────────────────────────────────────────────────────────────

try {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch { /* sandbox or permission denied — rely on env var being set externally */ }

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const setsArg = args.find(a => a.startsWith('--sets='))?.slice('--sets='.length)
  ?? (args.indexOf('--sets') !== -1 ? args[args.indexOf('--sets') + 1] : undefined);
const FILTER_SETS = setsArg && !setsArg.startsWith('--')
  ? new Set(setsArg.split(',').map(s => s.trim()))
  : null;

// ─── Known engine types (from types/index.ts + apply-fixes.mjs) ──────────────

const KNOWN_ACTION_TYPES = new Set([
  'DrawCard', 'KO', 'ReturnToHand', 'PowerBoost', 'AddLife', 'GiveDon',
  'SearchDeck', 'FlipLife', 'ForceDiscard', 'AttachDon', 'GiveKeyword',
  'Rest', 'RemoveLife', 'Win', 'PlaySelf', 'PlayFromHand', 'RevealFromHand',
  'TrashFromHand',
  'TrashFromDeck', 'PlayFromTrash', 'RevealFromDeck', 'PlaceAtBottomOfDeck',
  'SearchTrash', 'Activate',
  // Legacy aliases still accepted by engine
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

const KNOWN_DURATIONS = new Set([
  'EndOfTurn', 'DuringYourTurn', 'EndOfBattle', 'EndOfOpponentTurn', 'Permanent',
]);

const KNOWN_FILTER_KINDS = new Set(['Any', 'ByType', 'ByCost', 'ByName']);

// Legacy aliases: normalize LLM output before validation
const LEGACY_ACTION_MAP = {
  Draw:         'DrawCard',
  TrashCard:    'ForceDiscard',
  TakeLifeToHand: 'FlipLife',
  GainKeyword:  'GiveKeyword',
};

const DURATION_ALIASES = {
  DuringOpponentTurn:   'EndOfOpponentTurn',
  DuringThisBattle:     'EndOfBattle',
  UntilStartOfNextTurn: 'EndOfOpponentTurn',
  EndOfTurnOrBattle:    'EndOfBattle',
  DuringTurn:           'EndOfTurn',
};

// ─── Set detection ────────────────────────────────────────────────────────────

function setOf(id) {
  const m = id.match(/^([A-Z]{2,4})(\d{2})-/);
  if (!m) return id.split('-')[0] ?? id;
  return `${m[1]}-${m[2]}`;
}

// ─── Validation (mirrors apply-fixes.mjs collectUnknown) ─────────────────────

function collectUnknown(dsl) {
  const unknown = [];

  function checkActions(actions) {
    if (!Array.isArray(actions)) return;
    for (const a of actions) {
      if (!a || typeof a !== 'object') continue;
      if (a.type && !KNOWN_ACTION_TYPES.has(a.type)) unknown.push(`ActionType::${a.type}`);
      if (a.keyword !== undefined && !KNOWN_KEYWORDS.has(a.keyword)) unknown.push(`Keyword::${a.keyword}`);
      if (a.target !== undefined) {
        if (typeof a.target !== 'object' || a.target === null) {
          unknown.push(`InvalidTarget::${a.type}(notObject)`);
        } else if (!a.target.scope) {
          unknown.push(`InvalidTarget::${a.type}(noScope)`);
        } else if (!KNOWN_TARGET_SCOPES.has(a.target.scope)) {
          unknown.push(`TargetScope::${a.target.scope}`);
        }
      }
      if (['KO', 'ReturnToHand', 'PowerBoost', 'GiveKeyword', 'GainKeyword', 'Rest', 'Activate',
           'PlaceAtBottomOfDeck', 'AttachDon'].includes(a.type) && !a.target) {
        unknown.push(`MissingTarget::${a.type}`);
      }
      if (a.duration !== undefined) {
        const resolved = DURATION_ALIASES[a.duration] ?? a.duration;
        if (!KNOWN_DURATIONS.has(resolved)) unknown.push(`Duration::${a.duration}`);
      }
      if (a.filter?.kind !== undefined) {
        const resolved = a.filter.kind;
        if (!KNOWN_FILTER_KINDS.has(resolved)) unknown.push(`FilterKind::${a.filter.kind}`);
      }
      if (a.filter?.cardType !== undefined) {
        if (!['Character', 'Event', 'Stage'].includes(a.filter.cardType)) {
          unknown.push(`InvalidFilterCardType::${JSON.stringify(a.filter.cardType)}`);
        }
      }
      if (Array.isArray(a.thenActions)) checkActions(a.thenActions);
    }
  }

  function checkEffect(eff) {
    if (!eff || typeof eff !== 'object') return;
    if (eff.trigger && !KNOWN_TRIGGERS.has(eff.trigger)) unknown.push(`Trigger::${eff.trigger}`);
    if (eff.condition !== undefined && eff.condition !== null) {
      if (typeof eff.condition !== 'object') {
        unknown.push(`InvalidCondition::string`);
      } else if (!eff.condition.type) {
        unknown.push(`InvalidCondition::noType`);
      } else if (!KNOWN_CONDITION_TYPES.has(eff.condition.type)) {
        unknown.push(`ConditionType::${eff.condition.type}`);
      }
    }
    if (Array.isArray(eff.conditions)) unknown.push(`InvalidConditions::array`);
    if (eff.condition?.type === 'LeaderHasAnyType' && !Array.isArray(eff.condition.subTypes)) {
      unknown.push(`InvalidCondition::LeaderHasAnyType(noSubTypes)`);
    }
    if (eff.condition?.type === 'LeaderHasType' && !eff.condition.subType) {
      unknown.push(`InvalidCondition::LeaderHasType(noSubType)`);
    }
    if (eff.condition?.type === 'LeaderIsName' && !eff.condition.name) {
      unknown.push(`InvalidCondition::LeaderIsName(noName)`);
    }
    checkActions(eff.actions);
  }

  if (Array.isArray(dsl.effects)) {
    for (const eff of dsl.effects) checkEffect(eff);
  }
  return [...new Set(unknown)];
}

// ─── Broken file detection ────────────────────────────────────────────────────

/**
 * Returns { broken: boolean, reason: string }
 * "broken" = legacy format OR has unknown types in effects array
 */
function assessFile(raw) {
  // Legacy Variant B: "0" key present, no effects array
  if (!raw.effects && raw['0'] !== undefined) {
    return { broken: true, reason: 'legacy-B("0" key)' };
  }
  // Legacy Variant A: trigger or actions at root
  if (!Array.isArray(raw.effects) && (raw.trigger !== undefined || raw.actions !== undefined)) {
    return { broken: true, reason: 'legacy-A(root fields)' };
  }
  // No effects at all (and not legacy) — cards with no effect text, genuinely empty
  if (!Array.isArray(raw.effects)) {
    return { broken: false, reason: 'no-effects-array(ok)' };
  }
  // Has effects array — check for unknown types
  const unknown = collectUnknown(raw);
  if (unknown.length > 0) {
    return { broken: true, reason: `invalid-types: ${unknown.slice(0, 3).join(', ')}` };
  }
  return { broken: false, reason: 'ok' };
}

// ─── DSL normalization (post-LLM) ────────────────────────────────────────────

function normalizeDsl(obj) {
  if (Array.isArray(obj)) return obj.map(normalizeDsl);
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'type' && typeof v === 'string' && LEGACY_ACTION_MAP[v]) {
      result[k] = LEGACY_ACTION_MAP[v];
    } else if (k === 'duration' && typeof v === 'string' && DURATION_ALIASES[v]) {
      result[k] = DURATION_ALIASES[v];
    } else {
      result[k] = normalizeDsl(v);
    }
  }
  return result;
}

// ─── Load raw card data ───────────────────────────────────────────────────────

/** Returns Map<cardId, rawCard> for all sets (or filtered sets) */
function loadRawCards() {
  const map = new Map();
  if (!existsSync(RAW_DIR)) return map;
  const files = readdirSync(RAW_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const setId = file.replace(/\.json$/, '');
    if (FILTER_SETS !== null && !FILTER_SETS.has(setId)) continue;
    try {
      const cards = JSON.parse(readFileSync(join(RAW_DIR, file), 'utf8'));
      for (const card of cards) {
        if (card.id) map.set(card.id, card);
      }
    } catch { /* skip malformed */ }
  }
  return map;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const RULES_CONTEXT = existsSync(RULES_PATH)
  ? `\n\n## Game Rules Context\n\n${readFileSync(RULES_PATH, 'utf8')}`
  : '';

const SYSTEM_PROMPT = `You are an expert One Piece Trading Card Game (OPTCG) effect parser.
Your job is to convert a card's raw text into a structured JSON object.
${RULES_CONTEXT}

## CardDefinition schema

\`\`\`typescript
interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  power: number;
  color: string;  // "Red"|"Blue"|"Green"|"Yellow"|"Purple"|"Black"|"Multi"
  cardType: "Leader" | "Character" | "Event" | "Stage";
  keywords: CardKeyword[];
  effects: CardEffect[];
  counter?: number;
}

type CardKeyword = "Rush" | "Blocker" | "Banish" | "DoubleAttack" | "Unblockable";

interface CardEffect {
  trigger: EffectTrigger;
  condition?: EffectCondition;
  actions: EffectAction[];
}

type EffectTrigger =
  | "OnPlay" | "OnAttack" | "OnAttacked" | "OnKO" | "OnBlock" | "OnLeaveField"
  | "OnOpponentBlock" | "OnOpponentPlaysEvent"
  | "Counter" | "Trigger" | "Activated"
  | "StartOfTurn" | "StartOfOpponentTurn" | "StartOfMainPhase" | "EndOfTurn";

type EffectCondition =
  | { type: "Always" }
  | { type: "TurnCount"; min?: number; max?: number }
  | { type: "HasRestingDon"; count: number }
  | { type: "HasAttachedDon"; count: number }
  | { type: "LeaderHasAttachedDon"; count: number }
  | { type: "TrashCount"; min: number }
  | { type: "HasCardOnBoard"; name: string }
  | { type: "AnyPlayerHasNoLife" }
  | { type: "LeaderHasType"; subType: string }
  | { type: "LeaderHasAnyType"; subTypes: string[] }
  | { type: "LeaderIsName"; name: string };

type EffectAction =
  | { type: "DrawCard"; count: number }
  | { type: "KO"; target: TargetSelector }
  | { type: "ReturnToHand"; target: TargetSelector }
  | { type: "PowerBoost"; amount: number; target: TargetSelector; duration: EffectDuration; perTrashedCard?: true }
  | { type: "ForceDiscard"; count: number }
  | { type: "AddLife"; count: number }
  | { type: "RemoveLife"; count: number }
  | { type: "GiveDon"; count: number }
  | { type: "FlipLife"; count: number }
  | { type: "SearchDeck"; filter: DeckFilter; destination: "hand" | "board" }
  | { type: "Rest"; target: TargetSelector }
  | { type: "PlaySelf" }
  | { type: "AttachDon"; count: number; target: TargetSelector }
  | { type: "GiveKeyword"; keyword: CardKeyword; target: TargetSelector; duration: EffectDuration }
  | { type: "PlayFromHand"; filter: HandFilter }
  | { type: "RevealFromHand"; count: number; filter: HandFilter; thenActions: EffectAction[] }
  | { type: "TrashFromHand"; filter: HandFilter; thenActions: EffectAction[] }
  | { type: "TrashFromDeck"; count: number; thenActions: EffectAction[] }
  | { type: "PlayFromTrash"; filter: HandFilter }
  | { type: "PlaceAtBottomOfDeck"; target: TargetSelector }
  | { type: "Win" };

type EffectDuration = "EndOfTurn" | "DuringYourTurn" | "EndOfBattle" | "EndOfOpponentTurn" | "Permanent";

type TargetSelector =
  | { scope: "Self" }
  | { scope: "Attacker" }
  | { scope: "OriginalTarget" }
  | { scope: "AllOpponentCharacters" }
  | { scope: "AllOwnCharacters" }
  | { scope: "AllOwnCharactersAndLeader" }
  | { scope: "OpponentLeader" }
  | { scope: "OwnLeader" }
  | { scope: "ChooseOpponentCharacter"; maxCost?: number; maxPower?: number }
  | { scope: "ChooseOwnCharacter"; maxCost?: number; maxPower?: number }
  | { scope: "ChooseOwnCharacterOrLeader"; maxCost?: number; maxPower?: number }
  | { scope: "ChooseOpponentCharacterOrLeader"; maxCost?: number; maxPower?: number };

type DeckFilter =
  | { kind: "Any" }
  | { kind: "ByType"; cardType: "Character" | "Event" | "Stage" }
  | { kind: "ByCost"; maxCost: number }
  | { kind: "ByName"; name: string };

interface HandFilter {
  color?: string;
  cardType?: "Character" | "Event" | "Stage";
  maxPower?: number;
  subType?: string;
  excludeSelf?: boolean;
}
\`\`\`

## Rules
1. Return ONLY valid JSON. No markdown, no code blocks, no explanation.
2. Use ONLY the types listed in the schema above — never invent new types.
3. If an effect cannot be fully mapped, omit that entire effect. Never emit \`actions: []\`.
4. If NO effects can be mapped, use \`"effects": []\`.
5. \`keywords\`: only "Rush", "Blocker", "Banish", "DoubleAttack", "Unblockable". Never add card attribute types (Slash, Strike, etc.).
6. "Add N card(s) from your Life area to your hand" → \`FlipLife { count: N }\` (not RemoveLife).
7. "Trash N life" / "remove a life card" → \`RemoveLife { count: N }\`.
8. "[Trigger] Play this card" → \`{ trigger: "Trigger", actions: [{ type: "PlaySelf" }] }\`.
9. "[Your Turn] When your opponent activates an Event" → trigger \`"OnOpponentPlaysEvent"\`.
10. "[Your Turn] When your opponent activates [Blocker]" → trigger \`"OnOpponentBlock"\`.
11. "Up to 1 of your Leader or Character cards" → target scope \`"ChooseOwnCharacterOrLeader"\`.
12. "Your opponent's Leader or Character" → target scope \`"ChooseOpponentCharacterOrLeader"\`.
13. "Your Leader" (no choice) → scope \`"OwnLeader"\` (not "ChooseOwnLeader").
14. "[Counter] ... gains +N power" → \`{ trigger: "Counter", actions: [PowerBoost { scope: "ChooseOwnCharacterOrLeader", duration: "EndOfTurn" }] }\`.
15. "During this turn" / "during your turn" → duration \`"DuringYourTurn"\`.
16. "Until end of turn" / "this turn" → duration \`"EndOfTurn"\`.
17. Leader condition "[DON!! x1]" / "if your Leader has the {X} type" → condition \`{ type: "LeaderHasType", subType: "X" }\`.
18. ForceDiscard has NO target field — it always forces the opponent to discard.
19. TrashFromDeck must include \`thenActions: []\` (even if empty).

## Examples

### Example 1 — OnPlay DrawCard
Input: ID: OP01-013, Type: Character, Cost: 1, Power: 1000, Color: Blue, Counter: 1000, Effect: [On Play] Draw 1 card.
Output: {"id":"OP01-013","name":"Koby","cost":1,"power":1000,"color":"Blue","cardType":"Character","keywords":[],"effects":[{"trigger":"OnPlay","actions":[{"type":"DrawCard","count":1}]}],"counter":1000}

### Example 2 — OnKO ReturnToHand with Rush keyword
Input: ID: OP01-025, Name: Alvida, Type: Character, Cost: 2, Power: 2000, Color: Red, Attribute: Rush, Effect: [On K.O.] Return this card to its owner's hand.
Output: {"id":"OP01-025","name":"Alvida","cost":2,"power":2000,"color":"Red","cardType":"Character","keywords":["Rush"],"effects":[{"trigger":"OnKO","actions":[{"type":"ReturnToHand","target":{"scope":"Self"}}]}]}

### Example 3 — OnAttack PowerBoost
Input: ID: OP01-001, Type: Leader, Effect: [On Attack] Give up to 1 of your Characters +1000 power until end of turn.
Output: {"id":"OP01-001","name":"Monkey D. Luffy","cost":0,"power":5000,"color":"Red","cardType":"Leader","keywords":[],"effects":[{"trigger":"OnAttack","actions":[{"type":"PowerBoost","amount":1000,"target":{"scope":"ChooseOwnCharacter"},"duration":"EndOfTurn"}]}]}

### Example 4 — RevealFromHand with subType
Input: ID: ST22-011, Effect: [On Play] You may reveal 2 cards with a type including "Whitebeard Pirates" from your hand: Up to 1 of your Leader with a type including "Whitebeard Pirates" gains +2000 power during this turn.
Output: {"id":"ST22-011","name":"Whitey Bay","cost":1,"power":1000,"color":"Blue","cardType":"Character","keywords":[],"effects":[{"trigger":"OnPlay","condition":{"type":"Always"},"actions":[{"type":"RevealFromHand","count":2,"filter":{"subType":"Whitebeard Pirates"},"thenActions":[{"type":"PowerBoost","amount":2000,"target":{"scope":"OwnLeader"},"duration":"EndOfTurn"}]}]}],"counter":2000}

### Example 5 — OnOpponentPlaysEvent
Input: ID: OP11-012, Effect: [Your Turn] [Once Per Turn] When your opponent activates an Event, all of your Characters gain +2000 power during this turn.
Output: {"id":"OP11-012","name":"Franky","cost":4,"power":4000,"color":"Red","cardType":"Character","keywords":[],"effects":[{"trigger":"OnOpponentPlaysEvent","condition":{"type":"Always"},"actions":[{"type":"PowerBoost","amount":2000,"target":{"scope":"AllOwnCharacters"},"duration":"DuringYourTurn"}]}],"counter":2000}

### Example 6 — LeaderHasType condition
Input: ID: OP04-018, Effect: [On Play] If your Leader has the {Alabasta} type, up to 1 of your opponent's Characters with a cost of 3 or less gets -3000 power until the end of your opponent's turn.
Output: {"id":"OP04-018","name":"...","cost":2,"power":2000,"color":"Green","cardType":"Character","keywords":[],"effects":[{"trigger":"OnPlay","condition":{"type":"LeaderHasType","subType":"Alabasta"},"actions":[{"type":"PowerBoost","amount":-3000,"target":{"scope":"ChooseOpponentCharacter","maxCost":3},"duration":"EndOfOpponentTurn"}]}]}
`;

// ─── User message builder ─────────────────────────────────────────────────────

function buildUserMessage(card) {
  return `Convert this card to the CardDefinition JSON format:

ID: ${card.id}
Name: ${card.name}
Type: ${card.cardType}
Cost: ${card.cost}
Power: ${card.power}
Color: ${card.color}
Counter: ${card.counter !== null && card.counter !== undefined ? card.counter : 'none'}
Attribute: ${card.attribute || 'none'}
Types/Affiliations: ${card.subTypes || 'none'}
Effect: ${card.effectText || '(no effect)'}
Trigger: ${card.triggerText || 'none'}

Return ONLY the JSON object.`;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load SDK from cards-dsl workspace
  let Anthropic;
  try {
    const sdkPath = new URL(
      '../packages/cards-dsl/node_modules/@anthropic-ai/sdk/index.mjs',
      import.meta.url,
    ).href;
    ({ default: Anthropic } = await import(sdkPath));
  } catch (err) {
    console.error('Could not load @anthropic-ai/sdk:', err.message);
    console.error('Run: pnpm install inside packages/cards-dsl');
    process.exit(1);
  }

  if (!DRY_RUN && !process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  // Build raw card map
  const rawCards = loadRawCards();
  console.log(`Loaded ${rawCards.size} raw card(s) from data/raw/`);

  // Scan effects files for broken ones
  const effectFiles = readdirSync(EFFECTS_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_') && !/_[pr]\d+\.json$/.test(f))
    .sort();

  const broken = [];
  for (const file of effectFiles) {
    const id  = file.replace(/\.json$/, '');
    const set = setOf(id);
    if (FILTER_SETS !== null && !FILTER_SETS.has(set)) continue;

    let raw;
    try {
      raw = JSON.parse(readFileSync(join(EFFECTS_DIR, file), 'utf8'));
    } catch { continue; }

    const { broken: isBroken, reason } = assessFile(raw);
    if (!isBroken) continue;

    const card = rawCards.get(id);
    if (!card) {
      console.warn(`  SKIP ${id} — no raw data found`);
      continue;
    }

    broken.push({ id, set, reason, card });
  }

  console.log(`\nFound ${broken.length} broken file(s)${FILTER_SETS ? ` in ${[...FILTER_SETS].join(', ')}` : ''}.\n`);

  if (broken.length === 0) {
    console.log('Nothing to regenerate.');
    return;
  }

  if (DRY_RUN) {
    console.log('[DRY RUN] Would regenerate:');
    const bySet = new Map();
    for (const { id, set, reason } of broken) {
      if (!bySet.has(set)) bySet.set(set, []);
      bySet.get(set).push({ id, reason });
    }
    for (const [set, items] of [...bySet.entries()].sort()) {
      console.log(`\n  ${set} (${items.length}):`);
      for (const { id, reason } of items) {
        console.log(`    ${id}  [${reason}]`);
      }
    }
    return;
  }

  const client = new Anthropic();

  let written = 0, skipped = 0;
  const skipLog = [];

  for (let i = 0; i < broken.length; i++) {
    const { id, card } = broken[i];
    process.stdout.write(`[${i + 1}/${broken.length}] ${id} ${card.name ?? ''}... `);

    let rawText = '';
    try {
      // Call the API
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: buildUserMessage(card) }],
          });
          const block = response.content[0];
          if (!block || block.type !== 'text') throw new Error('Unexpected API response format');
          rawText = block.text;
          break;
        } catch (err) {
          if (attempt === 2) throw err;
          process.stdout.write('(retry) ');
          await sleep(1000);
        }
      }

      // Parse
      const parsed = JSON.parse(extractJSON(rawText));

      // Strip invalid keywords
      const VALID_KW = new Set(['Rush', 'Blocker', 'Banish', 'DoubleAttack', 'Unblockable']);
      if (Array.isArray(parsed.keywords)) {
        parsed.keywords = parsed.keywords.filter(k => typeof k === 'string' && VALID_KW.has(k));
      }

      // Normalize legacy aliases + duration aliases
      const normalized = normalizeDsl(parsed);

      // Strip effects with empty actions
      if (Array.isArray(normalized.effects)) {
        normalized.effects = normalized.effects.filter(
          e => typeof e === 'object' && e !== null && Array.isArray(e.actions) && e.actions.length > 0,
        );
      }

      // Validate
      const unknown = collectUnknown(normalized);
      if (unknown.length > 0) {
        process.stdout.write(`❌ (${unknown.slice(0, 2).join(', ')})\n`);
        skipLog.push({ id, reason: `invalid-types: ${unknown.join(', ')}`, rawText: rawText.slice(0, 200) });
        skipped++;
        continue;
      }

      // Write
      const outPath = join(EFFECTS_DIR, `${id}.json`);
      writeFileSync(outPath, JSON.stringify(normalized, null, 2) + '\n');
      process.stdout.write('✅\n');
      written++;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`❌ (${msg.slice(0, 80)})\n`);
      skipLog.push({ id, reason: msg, rawText: rawText.slice(0, 200) });
      skipped++;
    }

    // Rate limit
    if (i < broken.length - 1) await sleep(400);
  }

  // Summary
  console.log(`\n── Done ──────────────────────────────────────────────`);
  console.log(`  Written  : ${written}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Total    : ${broken.length}`);

  let md = `# Regenerate Broken DSL — Summary\n\nGenerated: ${new Date().toISOString()}\n\n`;
  md += `**Written:** ${written} | **Skipped:** ${skipped} | **Total broken:** ${broken.length}\n\n`;

  if (skipped > 0) {
    md += `## Skipped (still invalid after regeneration)\n\n`;
    for (const { id, reason } of skipLog) {
      md += `- **${id}**: ${reason}\n`;
    }
    md += '\n';
  }

  writeFileSync(SUMMARY_OUT, md);
  console.log(`\nSummary written: ${SUMMARY_OUT}`);
}

main().catch(err => {
  console.error('regenerate-broken-dsl error:', err);
  process.exit(1);
});
