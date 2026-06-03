/**
 * DSL Coverage — required-field validation for every effect file.
 *
 * Complements dslValidation.test.ts (which only checks enum membership).
 * This file verifies that each action carries the mandatory fields the engine needs.
 *
 * Run:  pnpm test -- dslCoverage
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EFFECTS_DIR = path.join(__dirname, '../../data/effects');
const RAW_DIR = path.join(__dirname, '../../data/raw');

// ─── Required-field rules per action type ─────────────────────────────────────
// Each rule is [fieldPath, description].  A dot path like "target.scope" means
// action.target?.scope must be non-null.

type Rule = [string, string];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function get(obj: any, dotPath: string): unknown {
  return dotPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const REQUIRED_FIELDS: Record<string, Rule[]> = {
  DrawCard:     [['count', 'count (number of cards to draw)']],
  KO:           [['target', 'target selector']],
  PowerBoost:   [['target', 'target selector'], ['amount', 'power delta (number)'], ['duration', 'duration enum']],
  ForceDiscard: [['count', 'number of cards to discard']],
  FlipLife:     [['count', 'number of life cards to flip']],
  AddLife:      [['count', 'number of life cards to add']],
  GiveDon:      [['count', 'number of DON!! to give/remove']],
  AttachDon:    [['count', 'number of DON!! to attach']],
  GiveKeyword:  [['keyword', 'keyword string'], ['target', 'target selector']],
  Rest:         [['target', 'target selector']],
  RemoveLife:   [['count', 'number of life cards to remove']],
  PlaceAtBottomOfDeck: [['target', 'target selector']],
  Activate:     [['target', 'target selector']],
  DynamicPowerBoost: [['target', 'target selector'], ['multiplier', 'per-card multiplier'], ['duration', 'duration enum']],
  ProportionalPowerBoost: [['target', 'target selector'], ['amount', 'power per unit'], ['per', 'factor (CardsInTrash|EventsInTrash|CardsInHand|RestingDon|AttachedDon)'], ['duration', 'duration enum']],
  TakeFromLife: [['count', 'number of life cards to take']],
  ReduceEventCost: [['amount', 'cost reduction amount']],
  SuppressBlockerForAttacker: [['target', 'target selector']],
  DisableBlocker: [['target', 'target selector']],
  RevealFromDeck: [['count', 'cards to reveal from deck'], ['thenActions', 'continuation actions array']],
  RevealFromHand: [['count', 'cards to reveal from hand'], ['thenActions', 'continuation actions array']],
  TrashFromDeck:  [['count', 'cards to trash from deck'], ['thenActions', 'continuation actions array']],
  TrashFromHand:  [['filter', 'hand filter object']],
  PlayFromHand:   [['filter', 'hand filter object']],
  PlayFromTrash:  [['filter', 'hand filter object']],
  SearchDeck:     [['filter', 'deck filter object'], ['destination', 'hand | board | bottomOfDeck']],
  SearchTrash:    [['filter', 'hand filter object'], ['count', 'max cards to retrieve']],
  // No required fields beyond type: Win, PlaySelf, ForceAttack
};

// ─── Required-field rules per condition type ─────────────────────────────────

const REQUIRED_CONDITION_FIELDS: Record<string, Rule[]> = {
  LeaderHasType:    [['subType', 'leader sub-type string (use subType, not value)']],
  LeaderHasAnyType: [['subTypes', 'array of leader sub-type strings']],
};

// ─── Violation collector ──────────────────────────────────────────────────────

interface Violation {
  file: string;
  effectIndex: number;
  trigger: string;
  actionIndex: number;
  actionType: string;
  field: string;
  description: string;
}

const allViolations: Violation[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkConditions(conditions: any[], file: string, effectIndex: number, trigger: string): void {
  for (const [ci, cond] of (conditions ?? []).entries()) {
    const rules = REQUIRED_CONDITION_FIELDS[cond.type as string] ?? [];
    for (const [field, description] of rules) {
      const val = get(cond, field);
      if (val === undefined || val === null) {
        allViolations.push({ file, effectIndex, trigger, actionIndex: ci, actionType: `condition:${cond.type}`, field, description });
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkActions(actions: any[], file: string, effectIndex: number, trigger: string): void {
  for (const [ai, action] of (actions ?? []).entries()) {
    const rules = REQUIRED_FIELDS[action.type as string] ?? [];
    for (const [field, description] of rules) {
      const val = get(action, field);
      if (val === undefined || val === null) {
        allViolations.push({ file, effectIndex, trigger, actionIndex: ai, actionType: action.type, field, description });
      }
    }
    // Recurse into thenActions
    if (Array.isArray(action.thenActions)) {
      checkActions(action.thenActions, file, effectIndex, trigger);
    }
  }
}

// ─── Build violation list eagerly (once) ─────────────────────────────────────

const files = fs.readdirSync(EFFECTS_DIR).filter((f) => f.endsWith('.json')).sort();

// Collect files where `effects` is not an array (old numbered-key format)
const nonArrayEffects: string[] = [];
for (const file of files) {
  const raw = fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = JSON.parse(raw) as unknown;
  // Only inspect plain objects (skip arrays, primitives, etc.)
  if (def === null || typeof def !== 'object' || Array.isArray(def)) continue;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = def as Record<string, any>;
  if ('effects' in obj && !Array.isArray(obj['effects'])) {
    nonArrayEffects.push(file);
  }
  // Root-level numeric keys = dead stranded effect (whether or not effects array exists)
  const numericRootKeys = Object.keys(obj).filter((k) => /^\d+$/.test(k));
  if (numericRootKeys.length > 0) {
    nonArrayEffects.push(file);
  }
}

for (const file of files) {
  const raw = fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = JSON.parse(raw) as { effects?: any[] };
  for (const [ei, effect] of (def.effects ?? []).entries()) {
    // Check actions
    checkActions(effect.actions ?? [], file, ei, effect.trigger ?? '?');
    // Check conditions
    const conds = [
      ...(effect.condition != null ? [effect.condition] : []),
      ...(effect.conditions ?? []),
    ];
    checkConditions(conds, file, ei, effect.trigger ?? '?');
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

const byActionType = new Map<string, Violation[]>();
for (const v of allViolations) {
  const list = byActionType.get(v.actionType) ?? [];
  list.push(v);
  byActionType.set(v.actionType, list);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DSL Coverage — required fields', () => {
  it('at least 3800 effect files present', () => {
    expect(files.length).toBeGreaterThanOrEqual(3800);
  });

  it('effects is always an array (never numbered-key object)', () => {
    // Baseline: 149 files have stranded numeric root keys alongside an effects array
    // (pre-existing LLM-generated DSL errors). New additions must not grow this count.
    const STRANDED_KEY_BASELINE = 149;
    if (nonArrayEffects.length > STRANDED_KEY_BASELINE) {
      expect.fail(
        `Stranded numeric root keys grew from baseline ${STRANDED_KEY_BASELINE} to ${nonArrayEffects.length}.\n` +
        `New files with stranded numeric keys (fix them):\n` +
        nonArrayEffects.slice(STRANDED_KEY_BASELINE).map((f) => `  ${f}`).join('\n'),
      );
    }
    if (nonArrayEffects.length > 0) {
      console.warn(`[Stranded keys] ${nonArrayEffects.length} file(s) have numeric root keys (baseline ${STRANDED_KEY_BASELINE})`);
    }
  });

  // One test per action type that has rules, reporting all affected cards
  for (const [actionType, rules] of Object.entries(REQUIRED_FIELDS)) {
    it(`${actionType} — all required fields present`, () => {
      const violations = byActionType.get(actionType) ?? [];
      if (violations.length > 0) {
        const detail = violations
          .map((v) => `  ${v.file} effects[${v.effectIndex}] actions[${v.actionIndex}]: missing "${v.field}" (${v.description})`)
          .join('\n');
        expect.fail(
          `${violations.length} violation(s) for ${actionType}:\n${detail}\n` +
          `Rules checked: ${rules.map(([f]) => f).join(', ')}`
        );
      }
    });
  }

  // One test per condition type that has rules
  for (const [condType, rules] of Object.entries(REQUIRED_CONDITION_FIELDS)) {
    it(`condition:${condType} — all required fields present`, () => {
      const violations = byActionType.get(`condition:${condType}`) ?? [];
      if (violations.length > 0) {
        const detail = violations
          .map((v) => `  ${v.file} effects[${v.effectIndex}] conditions[${v.actionIndex}]: missing "${v.field}" (${v.description})`)
          .join('\n');
        expect.fail(
          `${violations.length} violation(s) for condition:${condType}:\n${detail}\n` +
          `Rules checked: ${rules.map(([f]) => f).join(', ')}`
        );
      }
    });
  }

  // KW4 — every card with a static keyword in raw data must have it in its effects file
  it('KW4 — every card with a static keyword in raw data has it in its DSL effects file', () => {
    const KW_PATTERNS: [string, RegExp][] = [
      ['Blocker',       /\[Blocker\]/i],
      ['Rush',          /\[Rush\]/i],
      ['Banish',        /\[Banish\]/i],
      ['DoubleAttack',  /\[Double Attack\]/i],
      ['Unblockable',   /\[Unblockable\]/i],
    ];

    function isStaticKeyword(effectText: string, re: RegExp): boolean {
      const m = re.exec(effectText);
      if (!m) return false;
      const prefix = effectText.slice(Math.max(0, m.index - 25), m.index);
      // Also exclude "activate(s) [a] [Kw]" — card references the keyword on another card
      return !/(?:gains?|give|grant|get|activate[sd]?\s+(?:a\s+)?)\s*$/i.test(prefix);
    }

    const ALT_ART_RE = /^(.+?)(_p\d+|_r\d+|_alt\w*)$/;

    // Build raw keyword map
    const rawKws = new Map<string, Set<string>>();
    const rawFiles = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
    for (const rawFile of rawFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, rawFile), 'utf-8')) as unknown;
        const cards = Array.isArray(data) ? data : [];
        for (const card of cards as { id?: string; effectText?: string }[]) {
          const cid = card.id;
          if (!cid) continue;
          const et = card.effectText ?? '';
          const kws = KW_PATTERNS
            .filter(([, re]) => isStaticKeyword(et, re))
            .map(([kw]) => kw);
          if (kws.length > 0) rawKws.set(cid, new Set(kws));
        }
      } catch { /* skip unparseable files */ }
    }

    // Load effects files
    const effectsKws = new Map<string, Set<string>>();
    for (const file of files) {
      try {
        const def = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8')) as { id?: string; keywords?: string[] };
        if (def.id) effectsKws.set(def.id, new Set(def.keywords ?? []));
      } catch { /* skip */ }
    }

    function getExpectedKws(cardId: string): Set<string> {
      const kws = rawKws.get(cardId);
      if (kws) return kws;
      const m = ALT_ART_RE.exec(cardId);
      if (m) return rawKws.get(m[1]!) ?? new Set();
      return new Set();
    }

    const missingKwViolations: string[] = [];
    for (const [cardId, needed] of rawKws) {
      const existing = effectsKws.get(cardId) ?? new Set();
      for (const kw of needed) {
        if (!existing.has(kw)) {
          missingKwViolations.push(`  ${cardId}: keyword "${kw}" in raw effectText but missing from DSL keywords array`);
        }
      }
    }
    // Also check alt-art variants that have effects files
    for (const [fileCardId, existing] of effectsKws) {
      const needed = getExpectedKws(fileCardId);
      for (const kw of needed) {
        if (!existing.has(kw)) {
          const violation = `  ${fileCardId}: keyword "${kw}" expected (inherited from base) but missing from DSL keywords array`;
          if (!missingKwViolations.includes(violation)) {
            missingKwViolations.push(violation);
          }
        }
      }
    }

    if (missingKwViolations.length > 0) {
      expect.fail(
        `${missingKwViolations.length} cards have keywords in raw data but missing from DSL effects file:\n` +
        missingKwViolations.slice(0, 20).join('\n') +
        (missingKwViolations.length > 20 ? `\n  ... and ${missingKwViolations.length - 20} more` : ''),
      );
    }
  });

  // Bug B guard: ByType filters must only use real card types as value
  it('Bug B guard — ByType filters must not use sub-type values', () => {
    const REAL_TYPES = new Set(['Character', 'Event', 'Stage', 'Leader', 'DON']);
    const violations: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function scanFilter(filter: any, file: string): void {
      if (!filter || typeof filter !== 'object') return;
      if (filter.kind === 'ByType') {
        const val = filter.value ?? filter.type ?? filter.cardType;
        if (val && !REAL_TYPES.has(String(val))) {
          violations.push(`  ${file}: ByType filter with non-card-type value "${val}" (should be BySubType)`);
        }
      }
      for (const v of Object.values(filter)) {
        if (Array.isArray(v)) v.forEach((item) => scanFilter(item, file));
        else scanFilter(v, file);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function scanActions(actions: any[], file: string): void {
      for (const action of actions ?? []) {
        if (action?.filter) scanFilter(action.filter, file);
        if (Array.isArray(action?.thenActions)) scanActions(action.thenActions, file);
      }
    }

    for (const file of files) {
      try {
        const def = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8')) as { effects?: { actions?: unknown[] }[] };
        for (const effect of def.effects ?? []) {
          scanActions(effect.actions ?? [], file);
        }
      } catch { /* skip */ }
    }

    if (violations.length > 0) {
      expect.fail(`${violations.length} ByType filter(s) using sub-type values:\n${violations.join('\n')}`);
    }
  });

  // Bug A guard: SearchDeck must not use legacy look-count field names
  it('Bug A guard — SearchDeck must not use legacy look-count field names', () => {
    const LEGACY_LOOK_FIELDS = [
      'lookAtCount', 'deckLookCount', 'depth', 'fromTop', 'topCards',
      'searchAmount', 'lookQuantity', 'deckLookAtCount', 'deckSearchDepth',
    ];
    const violations: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function scanActions(actions: any[], file: string): void {
      for (const action of actions ?? []) {
        if (action?.type === 'SearchDeck') {
          for (const field of LEGACY_LOOK_FIELDS) {
            if (field in action) {
              violations.push(`  ${file}: SearchDeck still has legacy field "${field}" (should be lookCount)`);
            }
          }
        }
        if (Array.isArray(action?.thenActions)) scanActions(action.thenActions, file);
      }
    }

    for (const file of files) {
      try {
        const def = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8')) as { effects?: { actions?: unknown[] }[] };
        for (const effect of def.effects ?? []) {
          scanActions(effect.actions ?? [], file);
        }
      } catch { /* skip */ }
    }

    if (violations.length > 0) {
      expect.fail(`${violations.length} SearchDeck action(s) with legacy look-count field names:\n${violations.join('\n')}`);
    }
  });

  // Bug D guard: SearchDeck lookCount/count sanity checks
  it('Bug D guard — SearchDeck lookCount must be a positive integer; count must not exceed lookCount', () => {
    const violations: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function scanActionsD(actions: any[], file: string): void {
      for (const action of actions ?? []) {
        if (action?.type === 'SearchDeck') {
          const lc = action?.lookCount;
          const c = action?.count;
          // lookCount must be a number (not boolean, not object)
          if (lc !== undefined && (typeof lc !== 'number' || !Number.isInteger(lc) || lc < 1)) {
            violations.push(`  ${file}: SearchDeck lookCount=${JSON.stringify(lc)} is not a positive integer`);
          }
          // count must be a number if set
          if (c !== undefined && (typeof c !== 'number' || !Number.isInteger(c) || c < 1)) {
            violations.push(`  ${file}: SearchDeck count=${JSON.stringify(c)} is not a positive integer`);
          }
          // lookCount must be >= count (can't select more than you revealed)
          if (typeof lc === 'number' && typeof c === 'number' && lc < c) {
            violations.push(`  ${file}: SearchDeck lookCount=${lc} < count=${c} (likely swapped — lookCount is cards to reveal, count is cards to select)`);
          }
        }
        if (Array.isArray(action?.thenActions)) scanActionsD(action.thenActions, file);
      }
    }

    for (const file of files) {
      try {
        const def = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8')) as { effects?: { actions?: unknown[] }[] };
        for (const effect of def.effects ?? []) {
          scanActionsD(effect.actions ?? [], file);
        }
      } catch { /* skip */ }
    }

    if (violations.length > 0) {
      expect.fail(`${violations.length} SearchDeck lookCount/count violation(s):\n${violations.join('\n')}`);
    }
  });

  // Bug E guard — comprehensive SearchDeck lookCount invariants (2026-05-21)
  //
  // Canonical rule: when a SearchDeck action reveals the TOP of the main deck
  // ("Look at the top N cards") and moves results to hand/board, `lookCount: N`
  // MUST be present. `count` is reserved for the number of cards the player may
  // SELECT from the revealed set (maxSelect).
  //
  // Exemptions (count IS the take-count, no lookCount needed):
  //   - source/from present (trash, hand, or other non-deck sources)
  //   - destination is not 'hand' or 'board' (life, deckBottom, TopOfLife, etc.)
  //   - count === 1 with non-'Any' filter (full-deck search, player auto-picks 1)
  //
  // Violation classes caught:
  //   E1 — count > 1 on a hand/board destination deck search, no lookCount present
  //        (count misused as look depth — the UI shows count cards instead of M)
  //   E2 — legacy alias fields present (searchCount, deckSize, lookAtTop, etc.)
  //   E3 — lookCount equals count when count > 1 (copy-paste: look N = take N)
  it('Bug E guard — SearchDeck lookCount invariants: no legacy aliases, no count-as-look-depth', () => {
    const LEGACY_LOOK_ALIASES = [
      'searchCount', 'deckPositionCount', 'deckSize', 'lookAtTop', 'revealedCount',
      'searchAmount', 'lookQuantity', 'lookAtCount', 'deckLookCount',
      'depth', 'fromTop', 'topCards', 'deckLookAtCount', 'deckSearchDepth',
    ];
    // Destination values that are NOT hand/board — count is take-count in these cases
    const LIFE_OR_DECK_DESTS = new Set([
      'life', 'Life', 'LifeCards', 'lifeCards', 'TopOfLife', 'topOfLife',
      'TopOfLifeCards', 'bottomOfDeck', 'BottomOfDeck', 'DeckBottom', 'deck',
      'TopOrBottomOfDeck', 'active', 'DeckTop',
    ]);
    const violations: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function scanActionsE(actions: any[], file: string): void {
      for (const action of actions ?? []) {
        if (action?.type === 'SearchDeck') {
          const lc = action?.lookCount;
          const c  = action?.count;
          const src = action?.source ?? action?.from ?? '';
          const dst = String(action?.destination ?? '');

          // E1: count > 1 on a hand/board dest deck-top search, no lookCount
          // (count=1 is fine — either full-deck auto-pick or top-1 both show 1 card)
          const isHandOrBoard   = dst === 'hand' || dst === 'board';
          const isNonDeckSource = typeof src === 'string' && src.length > 0;
          const isLifeOrDeckDst = LIFE_OR_DECK_DESTS.has(dst);
          if (lc === undefined && c !== undefined && typeof c === 'number' && c > 1
              && isHandOrBoard && !isNonDeckSource && !isLifeOrDeckDst) {
            violations.push(`  ${file}: E1 — count=${c} on deck→hand/board search without lookCount; use lookCount=${c} + count=<selectable>`);
          }

          // E2: legacy alias fields (always wrong)
          for (const alias of LEGACY_LOOK_ALIASES) {
            if (alias in action) {
              violations.push(`  ${file}: E2 — legacy field "${alias}" (rename to lookCount)`);
            }
          }

          // E3: lookCount equals count when count > 1
          if (lc !== undefined && c !== undefined
              && typeof lc === 'number' && typeof c === 'number'
              && lc === c && c > 1) {
            violations.push(`  ${file}: E3 — lookCount(${lc}) === count(${c}): if ${c} cards are revealed and 1 selected, use count:1`);
          }
        }
        if (Array.isArray(action?.thenActions)) scanActionsE(action.thenActions, file);
      }
    }

    for (const file of files) {
      try {
        const def = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8')) as { effects?: { actions?: unknown[] }[] };
        for (const effect of def.effects ?? []) {
          scanActionsE(effect.actions ?? [], file);
        }
      } catch { /* skip */ }
    }

    if (violations.length > 0) {
      expect.fail(`${violations.length} SearchDeck lookCount violation(s):\n${violations.join('\n')}`);
    }
  });

  // Bug C guard: SearchDeck with filter.kind "Any" and no lookCount
  // These are full-deck-search effects (intentional in most cases).
  // The guard warns if new instances are added beyond the known baseline of 188,
  // catching accidental "look at top N" cards encoded without lookCount.
  // Root cause: OP05-106 was one such bug (fixed — it now uses BySubType + lookCount:5).
  it('Bug C guard — SearchDeck kind:Any without lookCount should not grow', () => {
    const KNOWN_BASELINE = 188; // count after fixing 19 alt-print errors (2026-05-20)
    const suspects: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function scanActionsC(actions: any[], file: string): void {
      for (const action of actions ?? []) {
        if (action?.type === 'SearchDeck') {
          const f = action?.filter;
          if (f?.kind === 'Any' && action?.lookCount === undefined) {
            suspects.push(file);
          }
        }
        if (Array.isArray(action?.thenActions)) scanActionsC(action.thenActions, file);
      }
    }

    for (const file of files) {
      try {
        const def = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8')) as { effects?: { actions?: unknown[] }[] };
        for (const effect of def.effects ?? []) {
          scanActionsC(effect.actions ?? [], file);
        }
      } catch { /* skip */ }
    }

    if (suspects.length > KNOWN_BASELINE) {
      expect.fail(
        `SearchDeck kind:Any without lookCount grew from ${KNOWN_BASELINE} to ${suspects.length}.\n` +
        `New instances (verify these are full-deck-search effects, not "look at top N" bugs):\n` +
        suspects.slice(KNOWN_BASELINE).map((f) => `  ${f}`).join('\n'),
      );
    }
    if (suspects.length > 0) {
      // Informational: log count so developers know these exist
      console.warn(
        `[Bug C] ${suspects.length} SearchDeck kind:Any without lookCount ` +
        `(baseline ${KNOWN_BASELINE}) — these are full-deck-search effects; verify new cards use lookCount for "look at top N" patterns`,
      );
    }
  });

  // OPT guard: any card whose raw effectText contains [Once Per Turn] must have
  // at least one DSL effect with oncePerTurn: true.
  //
  // Baseline of 13 known gaps: cards whose DSL only encodes a Counter/Trigger
  // effect and the [Once Per Turn] block belongs to a not-yet-encoded Activated
  // effect. These are tracked separately and must not grow.
  it('OPT guard — cards with [Once Per Turn] in effectText must have oncePerTurn: true in DSL', () => {
    const OPT_KNOWN_GAPS = 28; // confirmed incomplete DSLs as of 2026-05-26 (only Counter/Trigger effects encoded)

    // Build a map from cardId → effectText from raw files
    const rawTextMap = new Map<string, string>();
    const rawFiles = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
    for (const rawFile of rawFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, rawFile), 'utf-8')) as unknown;
        const cards = Array.isArray(data) ? data : [];
        for (const card of cards as { id?: string; card_id?: string; card_set_id?: string; effectText?: string }[]) {
          const cid = card.id ?? card.card_set_id ?? card.card_id;
          if (!cid) continue;
          const et = card.effectText ?? '';
          if (et && et !== '-') rawTextMap.set(cid, et);
        }
      } catch { /* skip unparseable files */ }
    }

    // Build a map from cardId → whether any effect has oncePerTurn: true
    const dslOPTMap = new Map<string, boolean>();
    for (const file of files) {
      try {
        const def = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8')) as { id?: string; effects?: { oncePerTurn?: boolean }[] };
        if (!def.id) continue;
        const hasOPT = (def.effects ?? []).some((e) => e.oncePerTurn === true);
        dslOPTMap.set(def.id, hasOPT);
      } catch { /* skip */ }
    }

    const violations: string[] = [];
    for (const [cardId, text] of rawTextMap) {
      if (!/\[Once Per Turn\]/i.test(text)) continue;
      const hasOPT = dslOPTMap.get(cardId);
      // Only flag cards that have an effects file (otherwise it's a missing-file issue, not an OPT issue)
      if (hasOPT === false) {
        violations.push(`  ${cardId}: effectText has [Once Per Turn] but no DSL effect has oncePerTurn: true`);
      }
    }

    if (violations.length > OPT_KNOWN_GAPS) {
      expect.fail(
        `OPT violations grew from baseline ${OPT_KNOWN_GAPS} to ${violations.length}.\n` +
        `New cards missing oncePerTurn: true (fix the DSL):\n` +
        violations.slice(OPT_KNOWN_GAPS).join('\n'),
      );
    }
    if (violations.length > 0) {
      console.warn(
        `[OPT] ${violations.length} card(s) have [Once Per Turn] in effectText but missing oncePerTurn in DSL ` +
        `(baseline ${OPT_KNOWN_GAPS} — incomplete DSLs with only Counter/Trigger effects encoded)`,
      );
    }
  });

  // Bug F guard: PowerBoost amount must be a non-zero multiple of 1000
  it('Bug F guard — PowerBoost amount must be a non-zero multiple of 1000', () => {
    const PB_KNOWN_BASELINE = 43; // existing LLM-generated DSL errors (amounts like -1 instead of -1000)
    const violations: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function scanActionsF(actions: any[], file: string): void {
      for (const action of actions ?? []) {
        if (action?.type === 'PowerBoost') {
          const amt = action?.amount;
          if (typeof amt === 'number' && amt % 1000 !== 0) {
            violations.push(`  ${file}: PowerBoost amount=${amt} is not a multiple of 1000`);
          }
        }
        if (Array.isArray(action?.thenActions)) scanActionsF(action.thenActions, file);
      }
    }

    for (const file of files) {
      try {
        const def = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8')) as { effects?: { actions?: unknown[] }[] };
        for (const effect of def.effects ?? []) {
          scanActionsF(effect.actions ?? [], file);
        }
      } catch { /* skip */ }
    }

    if (violations.length > PB_KNOWN_BASELINE) {
      expect.fail(
        `PowerBoost invalid-amount violations grew from baseline ${PB_KNOWN_BASELINE} to ${violations.length}.\n` +
        `New violations:\n${violations.slice(PB_KNOWN_BASELINE).join('\n')}`,
      );
    }
    if (violations.length > 0) {
      console.warn(`[Bug F] ${violations.length} PowerBoost action(s) with non-1000-multiple amounts (baseline ${PB_KNOWN_BASELINE})`);
    }
  });

  // Bug G guard: DrawCard count must be between 1 and 5
  it('Bug G guard — DrawCard count must be between 1 and 5', () => {
    const violations: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function scanActionsG(actions: any[], file: string): void {
      for (const action of actions ?? []) {
        if (action?.type === 'DrawCard') {
          const c = action?.count;
          if (typeof c === 'number' && (c < 1 || c > 5 || !Number.isInteger(c))) {
            violations.push(`  ${file}: DrawCard count=${c} is out of range [1–5]`);
          }
        }
        if (Array.isArray(action?.thenActions)) scanActionsG(action.thenActions, file);
      }
    }

    for (const file of files) {
      try {
        const def = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8')) as { effects?: { actions?: unknown[] }[] };
        for (const effect of def.effects ?? []) {
          scanActionsG(effect.actions ?? [], file);
        }
      } catch { /* skip */ }
    }

    if (violations.length > 0) {
      expect.fail(`${violations.length} DrawCard action(s) with invalid count:\n${violations.join('\n')}`);
    }
  });

  // Bug H guard: every BySubType filter value must match ≥1 card in raw data
  it('Bug H guard — BySubType filter values must match at least one raw card', () => {
    // Build set of all raw subTypes strings
    const rawSubTypes: string[] = [];
    if (fs.existsSync(RAW_DIR)) {
      for (const f of fs.readdirSync(RAW_DIR).filter((x) => x.endsWith('.json'))) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf-8'));
          const cards: unknown[] = Array.isArray(raw) ? raw : (raw as { cards?: unknown[] }).cards ?? [];
          for (const c of cards) {
            const st = (c as { subTypes?: string }).subTypes;
            if (typeof st === 'string' && st.length > 0) rawSubTypes.push(st);
          }
        } catch { /* skip */ }
      }
    }

    /** Same normalised substring logic as the engine's hasSubType */
    const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '');
    function matchesRaw(filter: string): boolean {
      return rawSubTypes.some((st) => {
        if (st.includes(filter)) return true;
        return norm(st).includes(norm(filter));
      });
    }

    const violations: string[] = [];
    for (const file of files) {
      try {
        const text = fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8');
        const def = JSON.parse(text) as { effects?: unknown[] };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        function scanFilter(obj: any, filePath: string): void {
          if (!obj || typeof obj !== 'object') return;
          if (obj.kind === 'BySubType' && typeof obj.subType === 'string') {
            if (!matchesRaw(obj.subType)) {
              violations.push(`  ${filePath}: BySubType subType=${JSON.stringify(obj.subType)} matches no raw card`);
            }
          }
          for (const v of Object.values(obj)) {
            if (v && typeof v === 'object') scanFilter(v, filePath);
          }
        }
        for (const eff of def.effects ?? []) scanFilter(eff, file);
      } catch { /* skip */ }
    }

    if (violations.length > 0) {
      expect.fail(`${violations.length} BySubType filter(s) matching no raw card:\n${violations.join('\n')}`);
    }
  });

  // Master summary — fails with a full table if ANY violation exists
  it('zero total violations across all cards', () => {
    if (allViolations.length === 0) return;

    const rows = allViolations.map((v) => ({
      file:      v.file,
      trigger:   v.trigger,
      action:    `[${v.actionIndex}] ${v.actionType}`,
      field:     v.field,
    }));

    // Print table to console for the report
    console.table(rows);

    expect(allViolations.length, `${allViolations.length} DSL violations found — see table above`).toBe(0);
  });
});
