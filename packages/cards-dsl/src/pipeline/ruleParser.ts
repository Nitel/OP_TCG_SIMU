/**
 * Rule-based card text parser — deterministic, zero API cost.
 *
 * Returns a CardDefinition-compatible object when the card text matches
 * known patterns; returns null when the text is too complex, signalling
 * the caller to fall back to the LLM pipeline.
 *
 * Target coverage: ~50 % of cards (simple / medium patterns).
 * The remaining 50 % (Activate:Main costs, conditional chains, SearchDeck
 * with exclusions, RevealFromHand, TrashFromHand, passive immunities) are
 * intentionally left to the LLM.
 */

import type { RawCard } from './fetchCards.js';

// We use a loose record type here because the TypeScript schema (effectSchema.ts)
// does not yet include Counter trigger, ChooseOwnCharacterOrLeader scope, etc.
// Those variants ARE accepted by the runtime validator (effectParser.ts / dslValidation.test.ts).
export interface RuleCardDefinition {
  id: string;
  name: string;
  cost: number;
  power: number;
  color: string;
  cardType: string;
  keywords: string[];
  effects: RuleEffect[];
  counter?: number;
}

interface RuleEffect {
  trigger: string;
  condition?: Record<string, unknown>;
  actions: Record<string, unknown>[];
}

const VALID_KEYWORDS = new Set(['Rush', 'Blocker', 'Banish', 'DoubleAttack', 'Unblockable']);

// Tags that appear in effect text purely as keyword reminders — no DSL action needed.
const KEYWORD_ONLY_TAG = /^(Rush|Blocker|Banish|Double Attack|Unblockable)$/i;

// ─── Main entry point ─────────────────────────────────────────────────────────

export function ruleParseCard(card: RawCard): RuleCardDefinition | null {
  const keywords = parseKeywords(card);
  const rawEffect = (card.effectText ?? '').trim();
  const rawTrigger = (card.triggerText ?? '').trim();

  if ((!rawEffect || rawEffect === '-') && !rawTrigger) {
    return buildDef(card, keywords, []);
  }

  const effects: RuleEffect[] = [];

  if (rawEffect && rawEffect !== '-') {
    const blocks = rawEffect.split(/<br\s*\/?>/i);
    for (const block of blocks) {
      const trimmed = stripFlavorParens(block.trim());
      if (!trimmed) continue;
      const result = parseBlock(trimmed);
      if (result === null) return null;      // unparseable → LLM
      if (result !== undefined) effects.push(result); // undefined = keyword-only, skip
    }
  }

  if (rawTrigger && rawTrigger !== '-') {
    const te = parseTriggerField(rawTrigger);
    if (te === null) return null;
    effects.push(te);
  }

  return buildDef(card, keywords, effects);
}

// ─── Build output ─────────────────────────────────────────────────────────────

function buildDef(card: RawCard, keywords: string[], effects: RuleEffect[]): RuleCardDefinition {
  const def: RuleCardDefinition = {
    id: card.id,
    name: card.name,
    cost: card.cost ?? 0,
    power: card.power ?? 0,
    color: card.color ?? '',
    cardType: card.cardType ?? 'Character',
    keywords,
    effects,
  };
  if (card.counter != null) def.counter = card.counter;
  return def;
}

function parseKeywords(card: RawCard): string[] {
  const kws: string[] = [];
  if (card.attribute) {
    for (const part of card.attribute.split(/[\s,/]+/)) {
      const kw = part.trim();
      if (VALID_KEYWORDS.has(kw)) kws.push(kw);
    }
  }
  return [...new Set(kws)];
}

/** Remove trailing flavor parentheticals like "(This card can attack on the turn...)" */
function stripFlavorParens(text: string): string {
  // Only strip from the END if it's a long explanatory paren
  return text.replace(/\s*\([^)]{15,}\)\s*$/, '').trim();
}

// ─── Block parsing ────────────────────────────────────────────────────────────

/**
 * Parse one <br>-separated effect block.
 * Returns:
 *   RuleEffect   — parsed OK
 *   undefined    — keyword-only block, skip silently
 *   null         — cannot parse, trigger LLM fallback
 */
function parseBlock(block: string): RuleEffect | undefined | null {
  const { trigger, condition, body } = extractPrefixTags(block);

  if (trigger === null) return null;
  if (trigger === 'SKIP') return undefined;

  const cleanBody = stripFlavorParens(body.trim());
  if (!cleanBody) return undefined;

  // Bail out on patterns we deliberately skip
  if (isComplexBody(cleanBody)) return null;

  const actions = parseActions(cleanBody);
  if (actions === null) return null;
  if (actions.length === 0) return undefined;

  const effect: RuleEffect = { trigger, actions };
  if (condition !== undefined) effect.condition = condition;
  return effect;
}

/** Quick-reject patterns that indicate complexity beyond our rule set. */
function isComplexBody(text: string): boolean {
  // "you may X: Y" conditional cost pattern (Activate: Main bodies, etc.)
  if (/you may .{5,60}:/i.test(text)) return true;
  if (/you can .{5,60}:/i.test(text)) return true;
  // DON!! cost pattern "DON!! −N (...): ..."
  if (/DON!!\s*[−\-]\d/i.test(text)) return true;
  // Conditional "if you have X..."
  if (/\bif you have\b/i.test(text)) return true;
  if (/\bif your\b/i.test(text)) return true;
  // Passive immunity
  if (/\bcannot be K\.O\.\b/i.test(text)) return true;
  // "when your opponent X" conditional
  if (/\bwhen your opponent\b/i.test(text)) return true;
  // "can also attack" Unblockable-like
  if (/can also attack your opponent'?s? active/i.test(text)) return true;
  // "cannot attack" restriction
  if (/cannot attack/i.test(text)) return true;
  // SearchDeck with complex exclusion
  if (/other than \[/i.test(text)) return true;
  // Look at top N cards (complex SearchDeck)
  if (/\bLook at\b/i.test(text)) return true;
  // "place ... at the bottom of your deck" (hand manipulation)
  if (/place .{5,40} at the bottom of your deck/i.test(text)) return true;
  return false;
}

// ─── Prefix tag extraction ────────────────────────────────────────────────────

interface PrefixResult {
  trigger: string | null; // null = unrecognized, 'SKIP' = keyword-only
  condition?: Record<string, unknown> | undefined;
  body: string;
}

function extractPrefixTags(text: string): PrefixResult {
  let remaining = text;
  let trigger: string | null = null;
  let donCount: number | undefined;

  while (remaining.startsWith('[')) {
    const m = remaining.match(/^\[([^\]]+)\]\s*/);
    if (!m) break;
    const tag = m[1]!.trim();
    remaining = remaining.slice(m[0].length);

    // DON!! condition: [DON!! xN]
    const donM = tag.match(/^DON!!\s*x(\d)$/i);
    if (donM) { donCount = parseInt(donM[1]!, 10); continue; }

    // Pure modifier tags (no trigger meaning on their own)
    if (/^once per turn$/i.test(tag)) continue;
    if (/^your turn$/i.test(tag)) continue;
    if (/^opponent'?s? turn$/i.test(tag)) continue;

    // Keyword-only reminder text
    if (KEYWORD_ONLY_TAG.test(tag)) { trigger = 'SKIP'; break; }

    // Actual trigger tags
    if (/^on play$/i.test(tag))                      { trigger = 'OnPlay';    break; }
    if (/^on k\.?o\.?$/i.test(tag))                  { trigger = 'OnKO';      break; }
    if (/^when attacking$/i.test(tag))                { trigger = 'OnAttack';  break; }
    if (/^when attacked$/i.test(tag))                 { trigger = 'OnAttacked'; break; }
    if (/^on your opponent'?s? attack$/i.test(tag))   { trigger = 'OnAttacked'; break; }
    if (/^counter$/i.test(tag))                       { trigger = 'Counter';   break; }
    if (/^trigger$/i.test(tag))                       { trigger = 'Trigger';   break; }
    if (/^on block$/i.test(tag))                      { trigger = 'OnBlock';   break; }
    if (/^activate:\s*main$/i.test(tag))              { trigger = 'Activated'; break; }
    if (/^main$/i.test(tag))                          { trigger = 'OnPlay';    break; }
    if (/^end of (?:your )?turn$/i.test(tag))         { trigger = 'EndOfTurn'; break; }
    if (/^start of (?:your )?turn$/i.test(tag))       { trigger = 'StartOfTurn'; break; }
    if (/^your turn.*on play$/i.test(tag))            { trigger = 'OnPlay';    break; }

    // Named character triggers like [Kouzuki Oden] or [Uta] → complex
    trigger = null;
    break;
  }

  // DON!! with no following trigger → Activated passive
  if (trigger === null && donCount !== undefined) {
    trigger = 'Activated';
    // Re-parse remaining without brackets that have already been consumed
    remaining = text.replace(/^(\[[^\]]+\]\s*)+/, '');
  }

  // Activated with DON!! cost body ("DON!! −N (...):" pattern) → complex
  if (trigger === 'Activated' && /DON!!\s*[−\-]\d/i.test(remaining)) {
    return { trigger: null, body: remaining };
  }

  const condition: Record<string, unknown> | undefined =
    donCount !== undefined && trigger !== 'SKIP'
      ? { type: 'HasRestingDon', count: donCount }
      : undefined;

  return { trigger, condition, body: remaining };
}

// ─── Action list parsing ──────────────────────────────────────────────────────

function parseActions(body: string): Record<string, unknown>[] | null {
  // Split on ". Then, " / ". Then " separators
  const parts = body.split(/\.\s*Then[,]?\s+/i);

  const actions: Record<string, unknown>[] = [];
  for (const raw of parts) {
    const part = raw.trim().replace(/\.$/, '').trim();
    if (!part) continue;

    const action = tryParseAction(part);
    if (action === null) return null;
    actions.push(action);
  }

  return actions;
}

function tryParseAction(text: string): Record<string, unknown> | null {
  return (
    tryPlaySelf(text) ??
    tryDraw(text) ??
    tryTakeLifeToHand(text) ??
    tryAddLife(text) ??
    tryRemoveLife(text) ??
    tryGiveDon(text) ??
    tryAttachDon(text) ??
    tryKO(text) ??
    tryReturnToHand(text) ??
    tryRest(text) ??
    tryTrashCard(text) ??
    tryPowerBoost(text) ??
    tryGainKeyword(text) ??
    null
  );
}

// ─── Individual action parsers ────────────────────────────────────────────────

function tryPlaySelf(text: string): Record<string, unknown> | null {
  if (/\bplay this card\b/i.test(text)) return { type: 'PlaySelf' };
  return null;
}

function tryDraw(text: string): Record<string, unknown> | null {
  const m = text.match(/\bDraw (\d+) cards?\b/i);
  if (m) return { type: 'Draw', count: parseInt(m[1]!, 10) };
  return null;
}

function tryTakeLifeToHand(text: string): Record<string, unknown> | null {
  // "Add N card(s) from your Life area to your hand"
  const m = text.match(/\bAdd (\d+) cards? from your Life area to your hand\b/i);
  if (m) return { type: 'TakeLifeToHand', count: parseInt(m[1]!, 10) };
  // "Add this card to your hand" (from triggerText context)
  if (/\bAdd this card to your hand\b/i.test(text)) return { type: 'TakeLifeToHand', count: 1 };
  return null;
}

function tryAddLife(text: string): Record<string, unknown> | null {
  const m = text.match(/\bAdd (\d+) cards? to (?:the top of )?your Life area\b/i);
  if (m) return { type: 'AddLife', count: parseInt(m[1]!, 10) };
  return null;
}

function tryRemoveLife(text: string): Record<string, unknown> | null {
  const m = text.match(/\bTrash (\d+) of your Life cards?\b/i);
  if (m) return { type: 'RemoveLife', count: parseInt(m[1]!, 10) };
  if (/\bRemove (?:a|1) [Ll]ife card\b/.test(text)) return { type: 'RemoveLife', count: 1 };
  return null;
}

function tryGiveDon(text: string): Record<string, unknown> | null {
  // "Give N DON!! to your opponent"
  const m = text.match(/\bGive (\d+) DON!!\b/i);
  if (m) return { type: 'GiveDon', count: parseInt(m[1]!, 10) };
  return null;
}

function tryAttachDon(text: string): Record<string, unknown> | null {
  // "Give this Leader or 1 of your Characters up to N rested DON!! card(s)"
  // "Give up to N rested DON!! card(s) to your Leader or 1 of your Characters"
  // "Give this Character up to N rested DON!!"
  const m1 = text.match(/\bup to (\d+) rested DON!!/i);
  if (!m1) return null;
  const count = parseInt(m1[1]!, 10);

  const target =
    /\bLeader or (?:1 of your )?Characters?\b/i.test(text)
      ? { scope: 'ChooseOwnCharacterOrLeader' }
      : /\bthis (?:Leader|Character|card)\b/i.test(text)
        ? { scope: 'Self' }
        : { scope: 'ChooseOwnCharacter' };

  return { type: 'AttachDon', count, target };
}

function tryKO(text: string): Record<string, unknown> | null {
  const base = /\bK\.O\.\s+up to 1 of your opponent'?s? Characters?\b/i;
  if (!base.test(text)) return null;

  const powerM = text.match(/with (\d+) power or less\b/i);
  const costM  = text.match(/with a cost of (\d+) or less\b/i);

  const target: Record<string, unknown> = { scope: 'ChooseOpponentCharacter' };
  if (powerM) target['maxPower'] = parseInt(powerM[1]!, 10);
  if (costM)  target['maxCost']  = parseInt(costM[1]!, 10);

  return { type: 'KO', target };
}

function tryReturnToHand(text: string): Record<string, unknown> | null {
  if (/\bReturn this card to (?:its owner'?s?|your) hand\b/i.test(text)) {
    return { type: 'ReturnToHand', target: { scope: 'Self' } };
  }
  if (/\bReturn (?:up to )?1 of your opponent'?s? Characters?.*?to (?:their|its owner'?s?) hand\b/i.test(text)) {
    return { type: 'ReturnToHand', target: { scope: 'ChooseOpponentCharacter' } };
  }
  if (/\bReturn (?:up to )?1 of your (?:own )?Characters?.*?to (?:your|their) hand\b/i.test(text)) {
    return { type: 'ReturnToHand', target: { scope: 'ChooseOwnCharacter' } };
  }
  return null;
}

function tryRest(text: string): Record<string, unknown> | null {
  if (!/\bRest (?:up to )?1 of your opponent'?s? Characters?\b/i.test(text)) return null;

  const powerM = text.match(/with (\d+) power or less\b/i);
  const costM  = text.match(/with a cost of (\d+) or less\b/i);

  const target: Record<string, unknown> = { scope: 'ChooseOpponentCharacter' };
  if (powerM) target['maxPower'] = parseInt(powerM[1]!, 10);
  if (costM)  target['maxCost']  = parseInt(costM[1]!, 10);

  return { type: 'Rest', target };
}

function tryTrashCard(text: string): Record<string, unknown> | null {
  const oppM = text.match(/\bTrash (\d+) cards? from your opponent'?s? hand\b/i);
  if (oppM) return { type: 'TrashCard', count: parseInt(oppM[1]!, 10), from: 'OpponentHand' };

  const ownM = text.match(/\bTrash (\d+) cards? from your hand\b/i);
  if (ownM) return { type: 'TrashCard', count: parseInt(ownM[1]!, 10), from: 'OwnHand' };

  return null;
}

function tryPowerBoost(text: string): Record<string, unknown> | null {
  // Match +N or −N / -N (unicode minus signs used in card text)
  const amountM = text.match(/([+\-−＋－])(\d+)\s*power\b/);
  if (!amountM) return null;

  const isNeg = amountM[1] === '-' || amountM[1] === '−' || amountM[1] === '－';
  const amount = (isNeg ? -1 : 1) * parseInt(amountM[2]!, 10);

  const duration: string =
    /during this battle/i.test(text) ? 'EndOfBattle' : 'EndOfTurn';

  const target = inferBoostTarget(text);
  if (target === null) return null;

  return { type: 'PowerBoost', amount, target, duration };
}

function inferBoostTarget(text: string): Record<string, unknown> | null {
  // "All of your Characters and Leader" / "All of your Characters and your Leader"
  if (/\bAll of your Characters and (?:your )?Leaders?\b/i.test(text)) {
    return { scope: 'AllOwnCharactersAndLeader' };
  }
  // "All of your Characters gain"
  if (/\bAll of your Characters\b/i.test(text)) {
    return { scope: 'AllOwnCharacters' };
  }
  // "Up to 1 of your Leader or Character cards"
  if (/\bUp to 1 of your Leaders? or Characters? cards?\b/i.test(text)) {
    return { scope: 'ChooseOwnCharacterOrLeader' };
  }
  // "your Leader gains" (no Characters mentioned)
  if (/\byour Leaders? (?:with [^.]+)?gains?\b/i.test(text) && !/\bCharacters?\b/.test(text)) {
    return { scope: 'OwnLeader' };
  }
  // "Up to 1 of your Characters gains"
  if (/\bUp to 1 of your Characters? (?:cards? )?gains?\b/i.test(text)) {
    return { scope: 'ChooseOwnCharacter' };
  }
  // "this Character / this card gains"
  if (/\bThis (?:Character|card) gains?\b/i.test(text)) {
    return { scope: 'Self' };
  }
  // Opponent negative boost
  if (/\bGive (?:up to )?1 of your opponent'?s?.*?Characters?\b/i.test(text) ||
      /\byour opponent'?s? (?:Leader or )?Characters? (?:cards? )?(?:gains?|receives?)\b/i.test(text)) {
    return { scope: 'ChooseOpponentCharacter' };
  }
  // "1 each of your opponent's Leader and Character cards" (AllOpponentCharacters)
  if (/\b(?:each of )?your opponent'?s? (?:Leader and )?Characters?\b/i.test(text)) {
    return { scope: 'AllOpponentCharacters' };
  }
  return null;
}

function tryGainKeyword(text: string): Record<string, unknown> | null {
  const KW_MAP: Record<string, string> = {
    'Rush':          'Rush',
    'Double Attack': 'DoubleAttack',
    'Blocker':       'Blocker',
    'Banish':        'Banish',
    'Unblockable':   'Unblockable',
  };

  for (const [label, kwType] of Object.entries(KW_MAP)) {
    const re = new RegExp(`gains?\\s+\\[${label}\\]`, 'i');
    if (!re.test(text)) continue;

    const duration = /during this battle/i.test(text) ? 'EndOfBattle' : 'EndOfTurn';
    const isSelf   = /\bThis (?:Character|card)\b/i.test(text);
    const target   = isSelf
      ? { scope: 'Self' }
      : { scope: 'ChooseOwnCharacterOrLeader' };

    return { type: 'GainKeyword', keyword: kwType, target, duration };
  }

  return null;
}

// ─── triggerText field ────────────────────────────────────────────────────────

function parseTriggerField(text: string): RuleEffect | null {
  // Strip optional "[Trigger]" prefix added by the fetcher
  const body = text.replace(/^\[Trigger\]\s*/i, '').trim();

  // Common fixed patterns
  if (/^Play this card\.?$/i.test(body)) {
    return { trigger: 'Trigger', actions: [{ type: 'PlaySelf' }] };
  }
  if (/^Add this card to your hand\.?$/i.test(body)) {
    return { trigger: 'Trigger', actions: [{ type: 'TakeLifeToHand', count: 1 }] };
  }

  // Try generic action parsing under Trigger trigger
  if (isComplexBody(body)) return null;
  const actions = parseActions(body);
  if (actions === null || actions.length === 0) return null;
  return { trigger: 'Trigger', actions };
}
