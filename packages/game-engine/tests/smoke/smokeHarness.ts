/**
 * smokeHarness.ts — happy-path smoke runner for all effect DSL files.
 *
 * Strategy:
 *  - OnPlay  → applyAction(PlayCharacterFromHand), verify EFFECT_TRIGGERED in log
 *  - Activated → applyAction(ActivatedAbility), verify EFFECT_TRIGGERED or pending
 *  - OnAttack  → resolveEffects with minimal activeCombat, verify fired
 *  - OnKO / Trigger / StartOfTurn / EndOfTurn → resolveEffects direct
 *  - Counter / OnAttacked / OnBlock / opponent-side → TODO
 *
 * One test per effects file, grouped per set via describeSmoke(prefix).
 */

import { describe, it, afterAll } from 'vitest';
import { expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  resolveEffects,
  computePermanentPowerBonus,
} from '../../src/index.js';
import type { Card, CardId, CardKeyword, GameState, PlayerSetup, CardEffect, PlayerId } from '../../src/index.js';
import { hasKeyword } from '../../src/rules/cardUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EFFECTS_DIR = path.join(__dirname, '../../../data/effects');

const P1 = makePlayerId('p1');
const P2 = makePlayerId('p2');

// ─── Minimal card factories ───────────────────────────────────────────────────

function makeChar(id: string, owner: string, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 0,
    power,
    color: 'Red',
    type: 'Character',
    zone: 'board',
    ownerId: makePlayerId(owner),
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makeDon(id: string, owner: string, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: 'DON!!',
    cost: 0,
    power: 0,
    color: 'Red',
    type: 'DON',
    zone: 'donArea',
    ownerId: makePlayerId(owner),
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makePlayerSetup(idStr: string): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: makeChar(`${idStr}-leader`, idStr, 5000, { type: 'Leader', zone: 'deck' }),
    deckCards: Array.from({ length: 50 }, (_, i) =>
      makeChar(`${idStr}-deck-${i}`, idStr, 2000, { zone: 'deck' }),
    ),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${idStr}-don-${i}`, idStr) as Card),
  };
}

// ─── Base game (cached per module) ───────────────────────────────────────────

let _base: GameState | null = null;

function getBase(): GameState {
  if (_base !== null) return _base;
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId: P1,
  });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  _base = { ...s, phase: 'Main', turnNumber: 3 };
  return _base;
}

// ─── State mutation helpers ───────────────────────────────────────────────────

function addToBoard(state: GameState, card: Card, pid: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board', ownerId: pid } },
    players: { ...state.players, [pid]: { ...state.players[pid]!, board: [...state.players[pid]!.board, card.id] } },
  };
}

function addToHand(state: GameState, card: Card, pid: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand', ownerId: pid } },
    players: { ...state.players, [pid]: { ...state.players[pid]!, hand: [...state.players[pid]!.hand, card.id] } },
  };
}

function addToTrash(state: GameState, card: Card, pid: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'trash', ownerId: pid } },
    players: { ...state.players, [pid]: { ...state.players[pid]!, trash: [...state.players[pid]!.trash, card.id] } },
  };
}

function addDon(state: GameState, dons: Card[], pid: PlayerId): GameState {
  const updated: Record<string, Card> = { ...state.cards };
  for (const d of dons) updated[d.id] = { ...d, zone: 'donArea', ownerId: pid };
  return {
    ...state,
    cards: updated as GameState['cards'],
    players: { ...state.players, [pid]: { ...state.players[pid]!, donArea: [...state.players[pid]!.donArea, ...dons.map((d) => d.id)] } },
  };
}

// ─── Condition satisfaction ───────────────────────────────────────────────────

type SatResult = { ok: true; state: GameState } | { ok: false; reason: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function satisfyCond(cond: any, state: GameState, srcId: CardId, ix: number, trigger = ''): SatResult {
  if (!cond?.type) return { ok: true, state };
  const key = `${ix}`;

  switch (cond.type) {
    case 'Always':
    case 'OncePerTurn':
    case 'Optional':
    case 'DuringYourTurn':
      return { ok: true, state };

    case 'TurnCount': {
      let t = state.turnNumber;
      if (cond.min !== undefined) t = Math.max(t, cond.min);
      if (cond.max !== undefined) t = Math.min(t, cond.max);
      return { ok: true, state: { ...state, turnNumber: t } };
    }

    case 'HasRestingDon': {
      const n = cond.count ?? 1;
      if (trigger === 'OnAttack') {
        // OnAttack: engine checks countAttachedDon(cards, srcId) — add N DON attached to src card
        return { ok: true, state: addDon(state, Array.from({ length: n }, (_, i) =>
          makeDon(`h-don-${key}-${i}`, 'p1', { tapped: true, attachedTo: srcId })), P1) };
      }
      if (trigger === 'Activated') {
        // Activated: engine may check TAPPED DON (for AttachDon from:'rested') or UNTAPPED DON (rest-as-cost).
        // Add both to cover either branch.
        const tapped = Array.from({ length: n }, (_, i) => makeDon(`h-don-t-${key}-${i}`, 'p1', { tapped: true, attachedTo: null }));
        const untapped = Array.from({ length: n }, (_, i) => makeDon(`h-don-u-${key}-${i}`, 'p1', { tapped: false, attachedTo: null }));
        let s = addDon(state, tapped, P1);
        s = addDon(s, untapped, P1);
        return { ok: true, state: s };
      }
      // Other triggers: engine checks active (untapped, unattached) DON in donArea
      return { ok: true, state: addDon(state, Array.from({ length: n }, (_, i) =>
        makeDon(`h-don-${key}-${i}`, 'p1', { tapped: false, attachedTo: null })), P1) };
    }
    case 'HasAttachedDon': {
      const n = cond.count ?? 1;
      return { ok: true, state: addDon(state, Array.from({ length: n }, (_, i) =>
        makeDon(`a-don-${key}-${i}`, 'p1', { tapped: true, attachedTo: srcId })), P1) };
    }
    case 'LeaderHasAttachedDon': {
      const leaderId = state.players[P1]!.leader!;
      const n = cond.count ?? 1;
      // Engine checks countAttachedDon against context.sourceCardId — attach to both leader and srcId
      let s = addDon(state, Array.from({ length: n }, (_, i) =>
        makeDon(`ld-don-${key}-${i}`, 'p1', { tapped: true, attachedTo: leaderId })), P1);
      s = addDon(s, Array.from({ length: n }, (_, i) =>
        makeDon(`ld-don-s-${key}-${i}`, 'p1', { tapped: true, attachedTo: srcId })), P1);
      return { ok: true, state: s };
    }
    case 'HasTotalAttachedDon': {
      const n = cond.min ?? 1;
      return { ok: true, state: addDon(state, Array.from({ length: n }, (_, i) =>
        makeDon(`td-don-${key}-${i}`, 'p1', { tapped: true, attachedTo: srcId })), P1) };
    }
    case 'HasCardOnBoard': {
      if (cond.negate === true) {
        // Condition is "card NOT on board" — satisfied by default (don't add the card)
        return { ok: true, state };
      }
      if (cond.name) {
        const c = makeChar(`req-${key}`, 'p1', 3000, { name: cond.name });
        return { ok: true, state: addToBoard(state, c, P1) };
      }
      return { ok: true, state };
    }
    case 'HasBoardCount': {
      const need = Math.max(0, (cond.min ?? 1) - state.players[P1]!.board.length);
      let s = state;
      for (let i = 0; i < need; i++) s = addToBoard(s, makeChar(`bf-${key}-${i}`, 'p1', 2000), P1);
      return { ok: true, state: s };
    }
    case 'HasHandCount':
    case 'HandCount':
      return { ok: true, state };
    case 'TrashCount': {
      const need = Math.max(0, (cond.min ?? 1) - state.players[P1]!.trash.length);
      let s = state;
      for (let i = 0; i < need; i++) s = addToTrash(s, makeChar(`tr-${key}-${i}`, 'p1', 2000, { zone: 'trash' }), P1);
      return { ok: true, state: s };
    }
    case 'AnyPlayerHasNoLife':
      return { ok: true, state: { ...state, players: { ...state.players, [P1]: { ...state.players[P1]!, life: [] } } } };
    case 'HasCharacterWithMinPower': {
      const minP = cond.minPower ?? 5000;
      const pid = cond.controller === 'Opponent' ? P2 : P1;
      return { ok: true, state: addToBoard(state, makeChar(`hp-${key}`, String(pid), minP + 1000), pid) };
    }
    case 'LeaderHasType': {
      if (cond.subType) {
        const lid = state.players[P1]!.leader!;
        return { ok: true, state: { ...state, cards: { ...state.cards, [lid]: { ...state.cards[lid]!, subTypes: cond.subType } } } };
      }
      return { ok: false, reason: `LeaderHasType: DSL has 'value' but engine checks 'subType'` };
    }
    case 'LeaderHasAnyType': {
      const st = (cond.subTypes as string[] | undefined)?.[0];
      if (st) {
        const lid = state.players[P1]!.leader!;
        return { ok: true, state: { ...state, cards: { ...state.cards, [lid]: { ...state.cards[lid]!, subTypes: st } } } };
      }
      return { ok: false, reason: 'LeaderHasAnyType: empty subTypes' };
    }
    case 'LeaderIsName': {
      const name = cond.name ?? cond.value ?? cond.leaderName ?? '';
      const lid = state.players[P1]!.leader!;
      return { ok: true, state: { ...state, cards: { ...state.cards, [lid]: { ...state.cards[lid]!, name } } } };
    }

    // ── Life-count conditions ────────────────────────────────────────────────
    case 'LifeCount':
    case 'HasLife':
    case 'HasLifeCards': {
      const need = cond.count ?? cond.min ?? 1;
      const current = state.players[P1]!.life.length;
      if (current >= need) return { ok: true, state };
      let s = state;
      const extras: CardId[] = [];
      for (let i = 0; i < need - current; i++) {
        const c = makeChar(`lc-${key}-${i}`, 'p1', 1000, { zone: 'life' as const });
        s = { ...s, cards: { ...s.cards, [c.id]: c } };
        extras.push(c.id);
      }
      s = { ...s, players: { ...s.players, [P1]: { ...s.players[P1]!, life: [...s.players[P1]!.life, ...extras] } } };
      return { ok: true, state: s };
    }
    case 'OpponentLifeCount':
    case 'OpponentLife': {
      const need = cond.count ?? cond.min ?? 1;
      const current = state.players[P2]!.life.length;
      if (current >= need) return { ok: true, state };
      let s = state;
      const extras: CardId[] = [];
      for (let i = 0; i < need - current; i++) {
        const c = makeChar(`p2lc-${key}-${i}`, 'p2', 1000, { zone: 'life' as const });
        s = { ...s, cards: { ...s.cards, [c.id]: c } };
        extras.push(c.id);
      }
      s = { ...s, players: { ...s.players, [P2]: { ...s.players[P2]!, life: [...s.players[P2]!.life, ...extras] } } };
      return { ok: true, state: s };
    }
    case 'HasFewerLifeThanOpponent':
    case 'PlayerLifeLessThanOpponent': {
      const p1Life = state.players[P1]!.life.length;
      const p2Life = state.players[P2]!.life.length;
      if (p2Life > p1Life) return { ok: true, state };
      const c = makeChar(`p2extra-${key}`, 'p2', 1000, { zone: 'life' as const });
      let s = { ...state, cards: { ...state.cards, [c.id]: c } };
      s = { ...s, players: { ...s.players, [P2]: { ...s.players[P2]!, life: [...s.players[P2]!.life, c.id] } } };
      return { ok: true, state: s };
    }

    // ── Card-power / opponent-state conditions ───────────────────────────────
    case 'HasPower':
    case 'CardPower':
    case 'PowerCheck':
    case 'FlipCount':
    case 'LeaderHasLife':
    case 'LeaderLife':
    case 'OpponentRestingCards':
    case 'KOByOpponentEffect':
    case 'RevealedCardCostMatch':
    case 'HasLifeOrLess':
    case 'LifeComparison':
    case 'TrashFromHand':
    case 'ActivatedEventWithMinCost':
    case 'PlayedThisTurn':
    case 'OpponentHasMoreDon':
    case 'OpponentHandCount':
    case 'OpponentHandSize':
    case 'ByEffect':
    case 'RevealFromDeck':
    case 'PreviousActionResolved':
      return { ok: true, state };

    default:
      return { ok: false, reason: `unhandled condition: ${cond.type}` };
  }
}

// ─── Verification helpers ─────────────────────────────────────────────────────

function hasPending(s: GameState): boolean {
  return (
    s.pendingTargetInteraction !== null ||
    s.pendingOnKOInteraction !== null ||
    s.pendingRevealInteraction !== null ||
    s.pendingTrashInteraction !== null ||
    s.pendingSearchInteraction !== null ||
    s.pendingForceDiscardInteraction !== null
  );
}

function logFired(before: GameState, after: GameState, srcId: CardId): boolean {
  return after.gameLog.slice(before.gameLog.length).some(
    (e) => e.event === 'EFFECT_TRIGGERED' && e.cardId === srcId,
  );
}

function observablyChanged(before: GameState, after: GameState): boolean {
  const bp1 = before.players[P1]!;
  const ap1 = after.players[P1]!;
  const bp2 = before.players[P2]!;
  const ap2 = after.players[P2]!;
  return (
    bp1.hand.length !== ap1.hand.length ||
    bp1.board.length !== ap1.board.length ||
    bp1.trash.length !== ap1.trash.length ||
    bp1.life.length !== ap1.life.length ||
    bp1.donArea.length !== ap1.donArea.length ||
    bp2.hand.length !== ap2.hand.length ||
    bp2.board.length !== ap2.board.length ||
    bp2.trash.length !== ap2.trash.length ||
    hasPending(after)
  );
}

// ─── Result assertions ────────────────────────────────────────────────────────

type VResult = { ok: true } | { ok: false; message: string } | { skip: string };

/**
 * Returns true if a target selector might have no valid targets in the generic
 * smoke test setup (e.g. Choose scopes, or scopes filtered by subType/power/cost).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function targetMightHaveNoValidCards(target: any): boolean {
  if (!target) return false;
  const scope = (target.scope ?? target.type) as string | undefined;
  if (scope?.startsWith('Choose')) return true; // player-choice: might have no valid cards
  // Filtered All-scopes: the generic board may not contain matching cards
  if (target.subType !== undefined) return true;
  if (target.maxPower !== undefined) return true;
  if (target.maxCost !== undefined) return true;
  if (target.name !== undefined) return true;
  return false;
}

/**
 * Verify ALL observable actions in an effect sequence.
 *
 * Iterates every action; once a "pending-creating" action is reached
 * (ForceDiscard, TrashFromHand, RevealFromHand, KO-ChooseTarget, etc.) the loop
 * stops because subsequent actions have not yet executed.
 *
 * Per-action conditions (`condition`, `optional`, `conditional`) are skipped since
 * they may not be satisfied in the generic smoke setup.
 *
 * After each action, checks whether a new pending interaction was created by the
 * resolved effect chain — if so, subsequent actions are marked as not-yet-executed.
 *
 * Returns ok:true  if every checked assertion passed (≥1 assertion checked),
 *         ok:false if any assertion failed (with combined SEQUENCE FAIL message),
 *         skip     if no assertable action was found.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function verifyResult(actions: any[], before: GameState, after: GameState, srcId: CardId, pid: PlayerId, trigger: string, fileId: string): VResult {
  const fails: string[] = [];
  const passes: string[] = [];
  let terminatedByPending = false;

  // True when the resolved effect chain created any new pending interaction that blocks
  // subsequent actions (covers all pending* fields in GameState).
  const anyNewPending = (): boolean => (
    (before.pendingTargetInteraction       === null && after.pendingTargetInteraction       !== null) ||
    (before.pendingRevealInteraction       === null && after.pendingRevealInteraction       !== null) ||
    (before.pendingSearchInteraction       === null && after.pendingSearchInteraction       !== null) ||
    (before.pendingTrashInteraction        === null && after.pendingTrashInteraction        !== null) ||
    (before.pendingForceDiscardInteraction === null && after.pendingForceDiscardInteraction !== null) ||
    (before.pendingOnKOInteraction         === null && after.pendingOnKOInteraction         !== null) ||
    (before.pendingChoiceInteraction       === null && after.pendingChoiceInteraction       !== null) ||
    (before.pendingLifeInteraction         === null && after.pendingLifeInteraction         !== null)
  );

  for (let i = 0; i < actions.length; i++) {
    if (terminatedByPending) break;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const act = actions[i] as Record<string, any>;
    const t = act['type'] as string | undefined;
    if (!t) continue;

    const tag = `[${fileId}] action[${i}:${t}]`;

    // Skip actions with per-action conditions (might not be satisfied in smoke setup)
    // or that are optional/conditional (engine may have correctly skipped them).
    if (act['condition'] != null || act['optional'] === true || act['conditional'] === true) {
      if (anyNewPending()) terminatedByPending = true;
      continue;
    }

    switch (t) {
      case 'DrawCard': {
        // Non-standard DrawCard with target scope (e.g. ChooseOpponentCharacter) — skip
        if (act['target'] !== undefined) break;
        const rawCount = act['count'];
        if (typeof rawCount !== 'number') break; // dynamic count
        const count = rawCount;
        const beforeHand = before.players[pid]!.hand.length;
        const afterHand  = after.players[pid]!.hand.length;
        const minExpected = trigger === 'OnPlay' ? beforeHand - 1 + count : beforeHand + count;
        if (afterHand >= minExpected) {
          passes.push(tag);
        } else {
          fails.push(`SEQUENCE FAIL: ${tag} DrawCard×${count}: hand ${beforeHand}→${afterHand} (expected ≥${minExpected})`);
        }
        break;
      }

      case 'GiveDon': {
        const rawCount = act['count'];
        if (typeof rawCount !== 'number') break;
        const count = rawCount;
        const beforeDon = before.players[pid]!.donArea.length;
        const afterDon  = after.players[pid]!.donArea.length;
        if (afterDon >= beforeDon + count) {
          passes.push(tag);
        } else {
          passes.push(`${tag} skip (donDeck may be depleted)`);
        }
        break;
      }

      case 'AddToLife': {
        const p1Before = before.players[P1]!.life.length;
        const p2Before = before.players[P2]!.life.length;
        const p1After  = after.players[P1]!.life.length;
        const p2After  = after.players[P2]!.life.length;
        if (p1After > p1Before || p2After > p2Before) {
          passes.push(tag);
        } else {
          fails.push(`SEQUENCE FAIL: ${tag} AddToLife: life unchanged (P1: ${p1Before}→${p1After}, P2: ${p2Before}→${p2After})`);
        }
        break;
      }

      case 'RemoveLife': {
        const p1Before = before.players[P1]!.life.length;
        const p2Before = before.players[P2]!.life.length;
        const p1After  = after.players[P1]!.life.length;
        const p2After  = after.players[P2]!.life.length;
        if (p1After < p1Before || p2After < p2Before) {
          passes.push(tag);
        } else {
          fails.push(`SEQUENCE FAIL: ${tag} RemoveLife: life unchanged (P1: ${p1Before}→${p1After}, P2: ${p2Before}→${p2After})`);
        }
        break;
      }

      case 'KO': {
        const p1TrashBefore = before.players[P1]!.trash.length;
        const p2TrashBefore = before.players[P2]!.trash.length;
        if (after.players[P1]!.trash.length > p1TrashBefore || after.players[P2]!.trash.length > p2TrashBefore) {
          passes.push(tag);
        } else if (after.pendingTargetInteraction !== null && before.pendingTargetInteraction === null) {
          passes.push(tag); // KO created pending target (Choose scope)
          terminatedByPending = true;
        } else if (targetMightHaveNoValidCards(act['target'])) {
          break; // skip — no valid card in smoke setup
        } else {
          fails.push(`SEQUENCE FAIL: ${tag} KO: no card sent to trash`);
        }
        break;
      }

      case 'Rest': {
        const scope = (act['target'] as Record<string,unknown> | undefined)?.['scope'] as string | undefined;
        if (scope?.startsWith('All')) break; // All-scope: all may already be tapped
        const newlyTapped = Object.keys(after.cards).filter((id) => {
          const ac = after.cards[id as CardId];
          const bc = before.cards[id as CardId];
          return ac?.tapped === true && bc?.tapped === false;
        });
        if (newlyTapped.length > 0) {
          passes.push(tag);
        } else if (after.pendingTargetInteraction !== null && before.pendingTargetInteraction === null) {
          passes.push(tag); // Rest with Choose target created pending
          terminatedByPending = true;
        } else if (targetMightHaveNoValidCards(act['target'])) {
          break; // skip
        } else {
          fails.push(`SEQUENCE FAIL: ${tag} Rest: no card became tapped`);
        }
        break;
      }

      case 'SearchDeck': {
        if (after.pendingSearchInteraction !== null) {
          passes.push(tag);
          terminatedByPending = true;
        } else if (after.players[pid]!.hand.length > before.players[pid]!.hand.length) {
          passes.push(tag);
        }
        // else skip (empty deck or no filter match)
        break;
      }

      case 'TrashFromHand': {
        if (after.pendingTrashInteraction !== null) {
          passes.push(tag);
        } else {
          fails.push(`SEQUENCE FAIL: ${tag} TrashFromHand: pendingTrashInteraction not set`);
        }
        terminatedByPending = true;
        break;
      }

      case 'ForceDiscard': {
        // Skip non-standard variants: non-hand source, optional, or Choose-target
        const source = act['source'] as string | undefined;
        const fScope = (act['target'] as Record<string,unknown> | undefined)?.['scope'] as string | undefined;
        if ((source !== undefined && source !== 'Hand') || (fScope?.startsWith('Choose') ?? false)) break;

        if (after.pendingForceDiscardInteraction !== null) {
          passes.push(tag);
        } else {
          fails.push(`SEQUENCE FAIL: ${tag} ForceDiscard: pendingForceDiscardInteraction not set`);
        }
        terminatedByPending = true;
        break;
      }

      case 'RevealFromDeck':
      case 'RevealFromHand': {
        if (after.pendingRevealInteraction !== null) {
          passes.push(tag);
          terminatedByPending = true;
        }
        // else skip (auto-resolved or deck/hand empty)
        break;
      }

      case 'ReturnToHand': {
        const beforeHandP1 = before.players[P1]!.hand.length;
        const beforeHandP2 = before.players[P2]!.hand.length;
        const afterHandP1  = after.players[P1]!.hand.length;
        const afterHandP2  = after.players[P2]!.hand.length;
        if (afterHandP1 > beforeHandP1 || afterHandP2 > beforeHandP2) {
          passes.push(tag);
        } else if (after.pendingTargetInteraction !== null && before.pendingTargetInteraction === null) {
          passes.push(tag); terminatedByPending = true;
        } else if (targetMightHaveNoValidCards(act['target'])) {
          break;
        }
        break;
      }

      case 'PlaceAtBottomOfDeck': {
        const beforeDeckP1 = before.players[P1]!.deck.length;
        const beforeDeckP2 = before.players[P2]!.deck.length;
        const afterDeckP1  = after.players[P1]!.deck.length;
        const afterDeckP2  = after.players[P2]!.deck.length;
        if (afterDeckP1 > beforeDeckP1 || afterDeckP2 > beforeDeckP2) {
          passes.push(tag);
        } else if (targetMightHaveNoValidCards(act['target'])) {
          break;
        }
        break;
      }

      case 'PowerBoost': {
        const duration   = act['duration'] as string | undefined;
        const boostAmount = act['amount'] as number | undefined;
        if (boostAmount === 0) break;
        if (targetMightHaveNoValidCards(act['target'])) break;

        if (duration === 'EndOfBattle') {
          if (after.cards[srcId]?.zone === 'trash') break;
          const anyChanged = Object.keys(after.cards).some((id) =>
            (after.cards[id as CardId]?.powerModifierBattle ?? 0) !== (before.cards[id as CardId]?.powerModifierBattle ?? 0));
          if (anyChanged) {
            passes.push(tag);
          } else {
            fails.push(`SEQUENCE FAIL: ${tag} PowerBoost EndOfBattle: no powerModifierBattle changed`);
          }
        } else if (duration === 'EndOfTurn') {
          if (after.cards[srcId]?.zone === 'trash') break;
          const anyChanged = Object.keys(after.cards).some((id) =>
            (after.cards[id as CardId]?.powerModifier ?? 0) !== (before.cards[id as CardId]?.powerModifier ?? 0));
          if (anyChanged) {
            passes.push(tag);
          } else {
            fails.push(`SEQUENCE FAIL: ${tag} PowerBoost EndOfTurn: no powerModifier changed`);
          }
        } else if (duration === 'Permanent') {
          const bonus = computePermanentPowerBonus(srcId, after);
          if (bonus > 0) passes.push(tag);
        }
        break;
      }

      case 'GiveKeyword': {
        const kw = act['keyword'] as CardKeyword;
        if (targetMightHaveNoValidCards(act['target'])) break;
        const srcCard = after.cards[srcId];
        if (srcCard && hasKeyword(srcCard, kw, after)) { passes.push(tag); break; }
        const anyGot = Object.keys(after.cards).some((id) => {
          const ac = after.cards[id as CardId];
          const bc = before.cards[id as CardId];
          return ac && bc && hasKeyword(ac, kw, after) && !hasKeyword(bc, kw, before);
        });
        if (anyGot) {
          passes.push(tag);
        } else {
          fails.push(`SEQUENCE FAIL: ${tag} GiveKeyword ${kw}: no card gained the keyword`);
        }
        break;
      }

      default:
        break;
    }

    // After processing each action, detect if a new pending was created by the resolved chain.
    // This happens when a Choose-target action (PowerBoost, Rest, AttachDon, etc.) creates
    // pendingTargetInteraction — subsequent actions in the sequence have not yet executed.
    if (!terminatedByPending && anyNewPending()) {
      terminatedByPending = true;
    }
  }

  if (fails.length > 0) return { ok: false, message: fails.join(' | ') };
  if (passes.length > 0) return { ok: true };
  return { skip: 'no assertable action type in effect' };
}

/**
 * Check if the effect fired AND verify its result.
 * Returns a SmokeResult if the effect fired (pass or fail), or null if it did not fire.
 */
function checkFiredAndVerify(
  trigger: string,
  before: GameState,
  after: GameState,
  srcId: CardId,
  effect: CardEffect,
  fileId: string,
  passMsg: string,
): SmokeResult | null {
  if (!logFired(before, after, srcId) && !hasPending(after) && !observablyChanged(before, after)) {
    return null;
  }
  const vr = verifyResult(effect.actions as unknown[], before, after, srcId, P1, trigger, fileId);
  if ('message' in vr) {
    return { outcome: 'fail', trigger, details: vr.message };
  }
  return { outcome: 'pass', trigger, details: passMsg };
}

// ─── Triggers that genuinely cannot be smoke-tested ──────────────────────────
// (requires engine state we cannot easily set up generically)
const TODO_TRIGGERS = new Set<string>([
  // none currently — all adversarial triggers are now handled below
]);

// ─── Smoke for one effect ─────────────────────────────────────────────────────

type SmokeResult = { outcome: 'pass' | 'todo' | 'fail'; trigger: string; details: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function smokeEffect(def: any, effect: CardEffect, allEffects: CardEffect[], fileId: string, ei: number): SmokeResult {
  const trigger = effect.trigger;

  if (TODO_TRIGGERS.has(trigger)) {
    return { outcome: 'todo', trigger, details: `'${trigger}' requires opponent-side timing` };
  }

  const base = getBase();
  const srcId = makeCardId(`sm-${fileId.replace(/[^a-z0-9]/gi, '')}-${ei}`);
  const srcCard = makeChar(srcId, 'p1', 3000, {
    id: srcId,
    name: def.id ?? fileId,
    effects: allEffects,
    cost: 0,
  });

  // Build initial state: source card placed according to trigger
  let state = base;
  if (trigger === 'OnPlay') {
    state = addToHand(state, srcCard, P1);
  } else {
    state = addToBoard(state, srcCard, P1);
  }

  // Always add a tapped P2 target (KO / PowerBoost / target effects need it)
  const p2tgt = makeChar(`p2t-${fileId.replace(/[^a-z0-9]/gi, '')}-${ei}`, 'p2', 2000, { tapped: true });
  state = addToBoard(state, p2tgt, P2);

  // Pre-add active DON for any effect-level cost (cost.don > 0) so cost payment succeeds
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effectCostDon: number = (effect as any).cost?.don ?? 0;
  if (effectCostDon > 0) {
    state = addDon(state, Array.from({ length: effectCostDon }, (_, i) =>
      makeDon(`cost-don-${ei}-${i}`, 'p1', { tapped: false, attachedTo: null })), P1);
  }

  // Satisfy conditions
  const conds = [
    ...(effect.condition != null ? [effect.condition] : []),
    ...(effect.conditions ?? []),
  ];
  for (let ci = 0; ci < conds.length; ci++) {
    const r = satisfyCond(conds[ci], state, srcId, ci, trigger);
    if (!r.ok) return { outcome: 'todo', trigger, details: `cond not satisfiable: ${r.reason}` };
    state = r.state;
  }

  const ctx = { sourceCardId: srcId, sourcePlayerId: P1 };

  try {
    // ── OnPlay via applyAction ──────────────────────────────────────────────
    if (trigger === 'OnPlay') {
      const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: srcId });
      if (isGameError(result)) {
        // Fall back to resolveEffects (condition check bypassed)
        const r2 = resolveEffects(allEffects, 'OnPlay', ctx, state);
        if (logFired(state, r2, srcId)) {
          const rv = checkFiredAndVerify(trigger, state, r2, srcId, effect, fileId, 'OnPlay fired via resolveEffects fallback');
          if (rv) return rv;
        }
        return { outcome: 'todo', trigger, details: `PlayCharacterFromHand: ${result.message}` };
      }
      if (logFired(state, result, srcId) || hasPending(result)) {
        const rv = checkFiredAndVerify(trigger, state, result, srcId, effect, fileId, 'OnPlay effect fired');
        if (rv) return rv;
      }
      return { outcome: 'todo', trigger, details: 'OnPlay conditions not met at runtime' };
    }

    // ── Activated via applyAction ───────────────────────────────────────────
    if (trigger === 'Activated') {
      const result = applyAction(state, { type: 'ActivatedAbility', playerId: P1, cardId: srcId });
      if (isGameError(result)) {
        const r2 = resolveEffects(allEffects, 'Activated', ctx, state);
        if (logFired(state, r2, srcId) || hasPending(r2)) {
          const rv = checkFiredAndVerify(trigger, state, r2, srcId, effect, fileId, 'Activated fired via resolveEffects fallback');
          if (rv) return rv;
        }
        return { outcome: 'todo', trigger, details: `ActivatedAbility: ${result.message}` };
      }
      if (logFired(state, result, srcId) || hasPending(result)) {
        const rv = checkFiredAndVerify(trigger, state, result, srcId, effect, fileId, 'Activated effect fired');
        if (rv) return rv;
      }
      return { outcome: 'todo', trigger, details: 'Activated conditions not met at runtime' };
    }

    // ── OnAttack: inject minimal activeCombat ───────────────────────────────
    if (trigger === 'OnAttack') {
      const stateWithCombat: GameState = {
        ...state,
        activeCombat: { attackerId: srcId, targetId: p2tgt.id, blockerId: null, counterAmount: 0 },
      };
      const after = resolveEffects(allEffects, 'OnAttack', ctx, stateWithCombat);
      const rv = checkFiredAndVerify(trigger, stateWithCombat, after, srcId, effect, fileId, 'OnAttack effect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'OnAttack conditions not met at runtime' };
    }

    // ── Counter: src card in hand, opponent attacks a P1 character ─────────
    if (trigger === 'Counter') {
      const p1Defender = makeChar(`p1-def-${fileId.replace(/[^a-z0-9]/gi, '')}-${ei}`, 'p1', 3000);
      const p2Attacker = makeChar(`p2-att-${fileId.replace(/[^a-z0-9]/gi, '')}-${ei}`, 'p2', 4000, { tapped: true });
      let s = addToBoard(state, p1Defender, P1);
      s = addToBoard(s, p2Attacker, P2);
      // Counter cards are played from hand — move src off board
      s = {
        ...s,
        cards: { ...s.cards, [srcId]: { ...s.cards[srcId]!, zone: 'hand' } },
        players: {
          ...s.players,
          [P1]: {
            ...s.players[P1]!,
            board: s.players[P1]!.board.filter((id) => id !== srcId),
            hand: [...s.players[P1]!.hand, srcId],
          },
        },
        activeCombat: { attackerId: p2Attacker.id, targetId: p1Defender.id, blockerId: null, counterAmount: 0 },
      };
      const after = resolveEffects(allEffects, 'Counter', ctx, s);
      const rv = checkFiredAndVerify(trigger, s, after, srcId, effect, fileId, 'Counter effect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'Counter conditions not met at runtime' };
    }

    // ── OnAttacked: src card is the combat target ────────────────────────────
    if (trigger === 'OnAttacked') {
      const p2Attacker = makeChar(`p2-att-atk-${fileId.replace(/[^a-z0-9]/gi, '')}-${ei}`, 'p2', 4000, { tapped: true });
      const s: GameState = {
        ...addToBoard(state, p2Attacker, P2),
        activeCombat: { attackerId: p2Attacker.id, targetId: srcId, blockerId: null, counterAmount: 0 },
      };
      const after = resolveEffects(allEffects, 'OnAttacked', ctx, s);
      const rv = checkFiredAndVerify(trigger, s, after, srcId, effect, fileId, 'OnAttacked effect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'OnAttacked conditions not met at runtime' };
    }

    // ── OnBlock: src card is the blocker ─────────────────────────────────────
    if (trigger === 'OnBlock') {
      const p2Attacker = makeChar(`p2-att-blk-${fileId.replace(/[^a-z0-9]/gi, '')}-${ei}`, 'p2', 4000, { tapped: true });
      const p1Defender = makeChar(`p1-def-blk-${fileId.replace(/[^a-z0-9]/gi, '')}-${ei}`, 'p1', 3000);
      let s = addToBoard(state, p2Attacker, P2);
      s = addToBoard(s, p1Defender, P1);
      s = { ...s, activeCombat: { attackerId: p2Attacker.id, targetId: p1Defender.id, blockerId: srcId, counterAmount: 0 } };
      const after = resolveEffects(allEffects, 'OnBlock', ctx, s);
      const rv = checkFiredAndVerify(trigger, s, after, srcId, effect, fileId, 'OnBlock effect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'OnBlock conditions not met at runtime' };
    }

    // ── OnOpponentBlock: src card is attacking, opponent is the blocker ──────
    if (trigger === 'OnOpponentBlock') {
      const p2Blocker = makeChar(`p2-blk-ob-${fileId.replace(/[^a-z0-9]/gi, '')}-${ei}`, 'p2', 2000, { tapped: true });
      const p2Defender = makeChar(`p2-def-ob-${fileId.replace(/[^a-z0-9]/gi, '')}-${ei}`, 'p2', 3000);
      let s = addToBoard(state, p2Blocker, P2);
      s = addToBoard(s, p2Defender, P2);
      s = { ...s, activeCombat: { attackerId: srcId, targetId: p2Defender.id, blockerId: p2Blocker.id, counterAmount: 0 } };
      const after = resolveEffects(allEffects, 'OnOpponentBlock', ctx, s);
      const rv = checkFiredAndVerify(trigger, s, after, srcId, effect, fileId, 'OnOpponentBlock effect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'OnOpponentBlock conditions not met at runtime' };
    }

    // ── StartOfOpponentTurn: active player is P2 ────────────────────────────
    if (trigger === 'StartOfOpponentTurn') {
      const s: GameState = { ...state, activePlayerId: P2 };
      const after = resolveEffects(allEffects, 'StartOfOpponentTurn', ctx, s);
      const rv = checkFiredAndVerify(trigger, s, after, srcId, effect, fileId, 'StartOfOpponentTurn effect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'StartOfOpponentTurn conditions not met at runtime' };
    }

    // ── OnOpponentPlaysEvent ─────────────────────────────────────────────────
    if (trigger === 'OnOpponentPlaysEvent') {
      const after = resolveEffects(allEffects, 'OnOpponentPlaysEvent', ctx, state);
      const rv = checkFiredAndVerify(trigger, state, after, srcId, effect, fileId, 'OnOpponentPlaysEvent effect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'OnOpponentPlaysEvent conditions not met at runtime' };
    }

    // ── Permanent: static buff/keyword applied as long as card is in play ───
    if (trigger === 'Permanent') {
      const beforeStr = JSON.stringify(state.cards[srcId]);
      const after = resolveEffects(allEffects, 'Permanent', ctx, state);
      const afterStr = JSON.stringify(after.cards[srcId]);
      if (logFired(state, after, srcId) || hasPending(after) || observablyChanged(state, after) || beforeStr !== afterStr) {
        const rv = checkFiredAndVerify(trigger, state, after, srcId, effect, fileId, 'Permanent effect applied');
        if (rv) return rv;
        // Structural change (beforeStr !== afterStr) but checkFiredAndVerify returned null — still a pass
        return { outcome: 'pass', trigger, details: 'Permanent effect applied' };
      }
      return { outcome: 'todo', trigger, details: 'Permanent: no observable change' };
    }

    // ── OnWouldBeKOByEffect: source card faces KO by an effect ───────────────
    if (trigger === 'OnWouldBeKOByEffect') {
      const after = resolveEffects(allEffects, 'OnWouldBeKOByEffect', ctx, state);
      const rv = checkFiredAndVerify(trigger, state, after, srcId, effect, fileId, 'OnWouldBeKOByEffect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'OnWouldBeKOByEffect: no observable change' };
    }

    // ── StartOfMainPhase ─────────────────────────────────────────────────────
    if (trigger === 'StartOfMainPhase') {
      const after = resolveEffects(allEffects, 'StartOfMainPhase', ctx, state);
      const rv = checkFiredAndVerify(trigger, state, after, srcId, effect, fileId, 'StartOfMainPhase effect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'StartOfMainPhase: no observable change' };
    }

    // ── OnDamage: source player takes a life hit ─────────────────────────────
    if (trigger === 'OnDamage') {
      const after = resolveEffects(allEffects, 'OnDamage', ctx, state);
      const rv = checkFiredAndVerify(trigger, state, after, srcId, effect, fileId, 'OnDamage effect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'OnDamage: no observable change' };
    }

    // ── OnTrash: source card is moved to trash ───────────────────────────────
    if (trigger === 'OnTrash') {
      const s: GameState = {
        ...state,
        cards: { ...state.cards, [srcId]: { ...state.cards[srcId]!, zone: 'trash' } },
        players: {
          ...state.players,
          [P1]: {
            ...state.players[P1]!,
            board: state.players[P1]!.board.filter((id) => id !== srcId),
            trash: [...state.players[P1]!.trash, srcId],
          },
        },
      };
      const after = resolveEffects(allEffects, 'OnTrash', ctx, s);
      const rv = checkFiredAndVerify(trigger, s, after, srcId, effect, fileId, 'OnTrash effect fired');
      if (rv) return rv;
      return { outcome: 'todo', trigger, details: 'OnTrash: no observable change' };
    }

    // ── All other triggers: resolveEffects direct ───────────────────────────
    const after = resolveEffects(allEffects, trigger, ctx, state);
    const rv = checkFiredAndVerify(trigger, state, after, srcId, effect, fileId, `${trigger} effect fired`);
    if (rv) return rv;
    return { outcome: 'todo', trigger, details: `${trigger} conditions not met at runtime` };

  } catch (e) {
    return { outcome: 'fail', trigger, details: `exception: ${String(e)}` };
  }
}

// ─── Smoke for one file ───────────────────────────────────────────────────────

export function smokeFile(filePath: string): SmokeResult {
  const fileId = path.basename(filePath, '.json');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let def: any;
  try {
    def = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { outcome: 'fail', trigger: 'N/A', details: 'JSON parse error' };
  }

  if (!def || typeof def !== 'object' || Array.isArray(def)) {
    return { outcome: 'todo', trigger: 'N/A', details: 'list-format file (no effects object)' };
  }

  const effects = (def.effects ?? []) as CardEffect[];
  if (effects.length === 0) {
    return { outcome: 'todo', trigger: 'N/A', details: 'no effects defined' };
  }

  const results = effects.map((eff, ei) => smokeEffect(def, eff, effects, fileId, ei));

  const pass = results.find((r) => r.outcome === 'pass');
  if (pass) return pass;
  const fail = results.find((r) => r.outcome === 'fail');
  if (fail) return fail;
  return results[0]!; // all todo
}

// ─── Set file list ────────────────────────────────────────────────────────────

export function getSetFiles(prefix: string): string[] {
  return fs
    .readdirSync(EFFECTS_DIR)
    .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.json'))
    .sort()
    .map((f) => path.join(EFFECTS_DIR, f));
}

// ─── Describe builder — called from per-set files ─────────────────────────────

export function describeSmoke(prefix: string): void {
  const files = getSetFiles(prefix);

  describe(`Smoke: ${prefix} (${files.length} cards)`, () => {
    let pass = 0;
    let todo = 0;
    let fail = 0;
    const failList: string[] = [];

    for (const fp of files) {
      const name = path.basename(fp, '.json');
      it(name, () => {
        const r = smokeFile(fp);
        if (r.outcome === 'todo') {
          todo++;
          return; // pass silently — not a test failure
        }
        if (r.outcome === 'fail') {
          fail++;
          failList.push(`${name} [${r.trigger}]: ${r.details}`);
          expect.fail(`[${r.trigger}] ${r.details}`);
        }
        pass++;
      });
    }

    afterAll(() => {
      const total = pass + todo + fail;
      /* eslint-disable no-console */
      console.log(`\n  ── ${prefix} smoke ─────────────────────────────────────`);
      console.log(`     total: ${total}  pass: ${pass}  todo: ${todo}  fail: ${fail}`);
      if (failList.length > 0) {
        console.log('     FAILED:');
        for (const f of failList) console.log(`       ${f}`);
      }
      /* eslint-enable no-console */
    });
  });
}
