import type {
  CardEffect,
  CardDefinition,
  EffectAction,
  EffectTrigger,
  TargetSelector,
  CardKeyword,
} from '../schema/effectSchema.js';

// ─── Validation helpers ───────────────────────────────────────────────────────

const VALID_TRIGGERS: EffectTrigger[] = ['OnPlay', 'OnAttack', 'OnKO', 'OnBlock', 'Trigger', 'Activated'];
const VALID_KEYWORDS: CardKeyword[]   = ['Rush', 'Blocker', 'Banish', 'DoubleAttack', 'Unblockable'];
const TARGET_SCOPES = [
  'Self', 'Attacker', 'OriginalTarget',
  'AllOpponentCharacters', 'AllOwnCharacters',
  'OpponentLeader', 'OwnLeader',
  'ChooseOpponentCharacter', 'ChooseOwnCharacter',
] as const;

export interface ParseError {
  readonly path: string;
  readonly message: string;
}

function validateTarget(target: unknown, path: string): ParseError[] {
  if (typeof target !== 'object' || target === null) {
    return [{ path, message: 'Target must be an object' }];
  }
  const t = target as Record<string, unknown>;
  if (!TARGET_SCOPES.includes(t['scope'] as typeof TARGET_SCOPES[number])) {
    return [{ path: `${path}.scope`, message: `Unknown scope: ${String(t['scope'])}` }];
  }
  return [];
}

function validateAction(action: unknown, path: string): ParseError[] {
  if (typeof action !== 'object' || action === null) {
    return [{ path, message: 'Action must be an object' }];
  }
  const a = action as Record<string, unknown>;
  const errors: ParseError[] = [];

  switch (a['type']) {
    case 'Draw':
      if (typeof a['count'] !== 'number' || a['count'] < 1) {
        errors.push({ path: `${path}.count`, message: 'Draw.count must be a positive number' });
      }
      break;
    case 'KO':
    case 'ReturnToHand':
      errors.push(...validateTarget(a['target'], `${path}.target`));
      break;
    case 'PowerBoost':
      if (typeof a['amount'] !== 'number') {
        errors.push({ path: `${path}.amount`, message: 'PowerBoost.amount must be a number' });
      }
      errors.push(...validateTarget(a['target'], `${path}.target`));
      if (!['EndOfTurn', 'EndOfBattle', 'Permanent'].includes(a['duration'] as string)) {
        errors.push({ path: `${path}.duration`, message: 'PowerBoost.duration is invalid' });
      }
      break;
    case 'TrashCard':
      if (typeof a['count'] !== 'number' || a['count'] < 1) {
        errors.push({ path: `${path}.count`, message: 'TrashCard.count must be a positive number' });
      }
      if (!['OpponentHand', 'OwnHand'].includes(a['from'] as string)) {
        errors.push({ path: `${path}.from`, message: 'TrashCard.from must be OpponentHand or OwnHand' });
      }
      break;
    case 'AddLife':
      if (typeof a['count'] !== 'number' || a['count'] < 1) {
        errors.push({ path: `${path}.count`, message: 'AddLife.count must be a positive number' });
      }
      break;
    case 'GiveDon':
      if (typeof a['count'] !== 'number' || a['count'] < 1) {
        errors.push({ path: `${path}.count`, message: 'GiveDon.count must be a positive number' });
      }
      break;
    case 'SearchDeck':
      if (!['hand', 'board'].includes(a['destination'] as string)) {
        errors.push({ path: `${path}.destination`, message: 'SearchDeck.destination must be hand or board' });
      }
      break;
    default:
      errors.push({ path: `${path}.type`, message: `Unknown action type: ${String(a['type'])}` });
  }
  return errors;
}

function validateEffect(effect: unknown, path: string): ParseError[] {
  if (typeof effect !== 'object' || effect === null) {
    return [{ path, message: 'Effect must be an object' }];
  }
  const e = effect as Record<string, unknown>;
  const errors: ParseError[] = [];

  if (!VALID_TRIGGERS.includes(e['trigger'] as EffectTrigger)) {
    errors.push({ path: `${path}.trigger`, message: `Unknown trigger: ${String(e['trigger'])}` });
  }
  if (!Array.isArray(e['actions']) || e['actions'].length === 0) {
    errors.push({ path: `${path}.actions`, message: 'Effect must have at least one action' });
  } else {
    (e['actions'] as unknown[]).forEach((action, i) => {
      errors.push(...validateAction(action, `${path}.actions[${i}]`));
    });
  }
  return errors;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ParseResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly errors: readonly ParseError[];
}

/** Validate a raw object against the CardEffect schema. */
export function parseEffect(raw: unknown): ParseResult<CardEffect> {
  const errors = validateEffect(raw, 'effect');
  if (errors.length === 0) {
    return { ok: true, value: raw as CardEffect, errors: [] };
  }
  return { ok: false, errors };
}

/** Validate a raw object against the CardDefinition schema. */
export function parseCardDefinition(raw: unknown): ParseResult<CardDefinition> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: [{ path: 'root', message: 'CardDefinition must be an object' }] };
  }
  const r = raw as Record<string, unknown>;
  const errors: ParseError[] = [];

  if (typeof r['id'] !== 'string')   errors.push({ path: 'id',   message: 'id must be a string' });
  if (typeof r['name'] !== 'string') errors.push({ path: 'name', message: 'name must be a string' });
  if (typeof r['cost'] !== 'number') errors.push({ path: 'cost', message: 'cost must be a number' });
  if (typeof r['power'] !== 'number') errors.push({ path: 'power', message: 'power must be a number' });

  if (!Array.isArray(r['keywords'])) {
    errors.push({ path: 'keywords', message: 'keywords must be an array' });
  } else {
    (r['keywords'] as unknown[]).forEach((kw, i) => {
      if (!VALID_KEYWORDS.includes(kw as CardKeyword)) {
        errors.push({ path: `keywords[${i}]`, message: `Unknown keyword: ${String(kw)}` });
      }
    });
  }

  if (!Array.isArray(r['effects'])) {
    errors.push({ path: 'effects', message: 'effects must be an array' });
  } else {
    (r['effects'] as unknown[]).forEach((effect, i) => {
      errors.push(...validateEffect(effect, `effects[${i}]`));
    });
  }

  if (errors.length === 0) {
    return { ok: true, value: raw as CardDefinition, errors: [] };
  }
  return { ok: false, errors };
}
