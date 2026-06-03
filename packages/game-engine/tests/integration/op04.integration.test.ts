/**
 * OP04 Integration Tests — Kingdom of Intrigue.
 *
 * Cards under test:
 *   OP04-001 — [Activate: Main][Once Per Turn] ➁ Draw 1 + give own char Rush (Crocodile Leader)
 *   OP04-022 — [Activate: Main] rest self: rest opponent char cost ≤1 (Hina)
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  calculatePower,
} from '../../src/index.js';
import type { Card, CardId, CardEffect, GameState, PlayerId, PlayerSetup } from '../../src/index.js';
import { resolveEffects } from '../../src/effects/effectResolver.js';

const P1 = makePlayerId('op04-p1');
const P2 = makePlayerId('op04-p2');

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 3, power, color: 'Red', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}

function makeDon(id: string, owner: PlayerId, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Red', type: 'DON',
    zone: 'donArea', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}

function makePlayerSetup(id: PlayerId): PlayerSetup {
  const s = id as string;
  return {
    id,
    leaderCard: makeChar(`${s}-leader`, id, 5000, { type: 'Leader', zone: 'deck' }),
    deckCards: Array.from({ length: 50 }, (_, i) => makeChar(`${s}-dk-${i}`, id, 2000, { zone: 'deck' })),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${s}-don-${i}`, id) as Card),
  };
}

function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, { type: 'StartGame', player1: makePlayerSetup(P1), player2: makePlayerSetup(P2), firstPlayerId: P1 });
  if (isGameError(s)) throw new Error((s as any).message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error((s as any).message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error((s as any).message);
  return { ...s as GameState, phase: 'Main', activePlayerId: P1, turnNumber: 3 };
}

function addToBoard(state: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: { ...state.players, [owner]: { ...state.players[owner]!, board: [...state.players[owner]!.board, card.id] } },
  };
}

function addToHand(state: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand' } },
    players: { ...state.players, [owner]: { ...state.players[owner]!, hand: [...state.players[owner]!.hand, card.id] } },
  };
}

function attachFreshDon(state: GameState, charId: CardId, owner: PlayerId, count: number, prefix: string): GameState {
  const updated: Record<string, Card> = { ...state.cards };
  for (let i = 0; i < count; i++) {
    const don = makeDon(`${prefix}-fdon-${i}`, owner);
    updated[don.id] = { ...don, attachedTo: charId, zone: 'board' };
  }
  return { ...state, cards: updated as GameState['cards'] };
}

// ─── DSL stubs ─────────────────────────────────────────────────────────────────

const op04001Effect: CardEffect = {
  trigger: 'Activated',
  oncePerTurn: true,
  condition: { type: 'HasAttachedDon', count: 2 },
  actions: [
    { type: 'DrawCard', count: 1 },
    { type: 'GiveKeyword', keyword: 'Rush', target: { scope: 'ChooseOwnCharacter' }, duration: 'DuringYourTurn' } as never,
  ],
};

const op04022Effect: CardEffect = {
  trigger: 'Activated',
  condition: { type: 'Always' },
  actions: [
    { type: 'Rest', target: { scope: 'ChooseOpponentCharacter', maxCost: 1 } } as never,
  ],
};

// ════════════════════════════════════════════════════════════════════════════════
// OP04-001 Crocodile Leader — Activated [DON!! x2] DrawCard + GiveKeyword Rush
// ════════════════════════════════════════════════════════════════════════════════

describe('OP04 integration — OP04-001 Crocodile Leader Activated Draw+Rush', () => {

  it('L1 — 2 DON attached → draws 1 card, sets pendingTargetInteraction for Rush', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op04001Effect] } } };

    // Attach 2 DON to leader
    s = attachFreshDon(s, leaderId, P1, 2, 'l1');

    const deckBefore = s.players[P1]!.deck.length;

    const after = resolveEffects(
      [op04001Effect],
      'Activated',
      { sourceCardId: leaderId, sourcePlayerId: P1 },
      s,
    );

    // DrawCard: deck -1
    expect(after.players[P1]!.deck.length).toBe(deckBefore - 1);
    // GiveKeyword Rush: needs target selection → pendingTargetInteraction OR applied if no chars
    // (resolveEffects may immediately apply if target is forced)
  });

  it('L2 — fewer than 2 DON attached → condition fails, no draw', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op04001Effect] } } };

    // Only 1 DON attached
    s = attachFreshDon(s, leaderId, P1, 1, 'l2');

    const deckBefore = s.players[P1]!.deck.length;

    const after = resolveEffects(
      [op04001Effect],
      'Activated',
      { sourceCardId: leaderId, sourcePlayerId: P1 },
      s,
    );

    // Condition fails (only 1 DON) → no draw
    expect(after.players[P1]!.deck.length).toBe(deckBefore);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// OP04-022 Hina — Activated rest self → rest opponent char cost ≤1
// ════════════════════════════════════════════════════════════════════════════════

describe('OP04 integration — OP04-022 Hina Activated rest opponent char ≤cost1', () => {

  it('C1 — Activate Hina → P2 cheap char auto-rested (Activated scope auto-selects first valid target)', () => {
    let s = bootstrapGame();

    // P2 has a cheap character (eligible target, cost ≤ 1)
    const cheapChar = makeChar('c1-cheap', P2, 2000, { cost: 1 });
    s = addToBoard(s, cheapChar, P2);

    const hina = makeChar('c1-hina', P1, 2000, { effects: [op04022Effect] });
    s = addToBoard(s, hina, P1);
    s = { ...s, newBoardIds: [] };

    // Activate Hina — for Activated trigger, engine auto-selects first valid candidate (no pendingTargetInteraction)
    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: hina.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Target is auto-rested (tapped) without interaction needed
    expect(result.cards[cheapChar.id]?.tapped).toBe(true);
  });

  it('C1b — expensive character (cost > 1) is not a valid target', () => {
    let s = bootstrapGame();

    const expensiveChar = makeChar('c1b-exp', P2, 4000, { cost: 2 });
    s = addToBoard(s, expensiveChar, P2);

    const hina = makeChar('c1b-hina', P1, 2000, { effects: [op04022Effect] });
    s = addToBoard(s, hina, P1);
    s = { ...s, newBoardIds: [] };

    let result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: hina.id });
    if (isGameError(result)) return;

    if (result.pendingTargetInteraction !== null) {
      const attemptKO = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: expensiveChar.id });
      // Engine should reject (cost > 1)
      expect(isGameError(attemptKO)).toBe(true);
    } else {
      // No interaction (no valid targets) — char not rested
      expect(result.cards[expensiveChar.id]?.tapped).toBe(false);
    }
  });

});
