/**
 * OP05 Integration Tests — Awakening of the New Era.
 *
 * Cards under test:
 *   OP05-001 — [DON!! x1][Opponent's Turn][Once Per Turn] char ≥5000 survives KO, −1000 (Sabo Leader)
 *   OP05-073 — [On Play] trash 1 from hand → AddDon 1 rested (Miss Doublefinger)
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

const P1 = makePlayerId('op05-p1');
const P2 = makePlayerId('op05-p2');

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 3, power, color: 'Green', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}

function makeDon(id: string, owner: PlayerId, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Green', type: 'DON',
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

const op05001Effect: CardEffect = {
  trigger: 'OnWouldBeKOByEffect',
  oncePerTurn: true,
  condition: {
    type: 'And',
    conditions: [
      { type: 'HasAttachedDon', count: 1 },
      { type: 'HasPowerThreshold', power: 5000, comparison: 'GreaterOrEqual' },
    ],
  },
  actions: [
    { type: 'PowerBoost', amount: -1000, target: { scope: 'Self' }, duration: 'EndOfOpponentTurn' } as never,
  ],
};

const op05073Effect: CardEffect = {
  trigger: 'OnPlay',
  actions: [
    {
      type: 'TrashFromHand',
      optional: true,
      filter: { kind: 'Any' },
      thenActions: [{ type: 'AddDon', count: 1, active: false }],
    } as never,
  ],
};

// ════════════════════════════════════════════════════════════════════════════════
// OP05-001 Sabo Leader — OnWouldBeKOByEffect [DON!! x1]
// ════════════════════════════════════════════════════════════════════════════════

describe('OP05 integration — OP05-001 Sabo Leader OnWouldBeKOByEffect', () => {

  it('L1 — 1 DON attached, char ≥5000 → survives KO by effect, gets −1000 EndOfOpponentTurn', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op05001Effect] } } };

    // A char with ≥5000 power and 1 DON attached
    const strongChar = makeChar('l1-strong', P1, 5000);
    s = addToBoard(s, strongChar, P1);
    s = attachFreshDon(s, strongChar.id, P1, 1, 'l1');

    const basePower = calculatePower(strongChar.id, s);

    // Simulate OnWouldBeKOByEffect → resolveEffects directly
    const after = resolveEffects(
      [op05001Effect],
      'OnWouldBeKOByEffect',
      { sourceCardId: strongChar.id, sourcePlayerId: P1 },
      s,
    );

    // Character gets -1000 (EndOfOpponentTurn modifier)
    expect(calculatePower(strongChar.id, after)).toBe(basePower - 1000);
  });

  it('L2 — no DON attached → condition fails, no power modifier', () => {
    let s = bootstrapGame();

    const char = makeChar('l2-char', P1, 5000);
    s = addToBoard(s, char, P1);
    // No DON attached

    const basePower = calculatePower(char.id, s);

    const after = resolveEffects(
      [op05001Effect],
      'OnWouldBeKOByEffect',
      { sourceCardId: char.id, sourcePlayerId: P1 },
      s,
    );

    expect(calculatePower(char.id, after)).toBe(basePower);
  });

  it('L3 — char with 3000+1DON=4000 power → threshold 5000 fails, no modifier', () => {
    let s = bootstrapGame();

    // 3000 base + 1 DON = 4000 calculated → below the 5000 threshold
    const weakChar = makeChar('l3-weak', P1, 3000);
    s = addToBoard(s, weakChar, P1);
    s = attachFreshDon(s, weakChar.id, P1, 1, 'l3');

    const basePower = calculatePower(weakChar.id, s); // = 4000

    const after = resolveEffects(
      [op05001Effect],
      'OnWouldBeKOByEffect',
      { sourceCardId: weakChar.id, sourcePlayerId: P1 },
      s,
    );

    // HasPowerThreshold 5000 fails (4000 < 5000) → no modifier applied
    expect(calculatePower(weakChar.id, after)).toBe(basePower);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// OP05-073 Miss Doublefinger — OnPlay trash → AddDon 1 rested
// ════════════════════════════════════════════════════════════════════════════════

describe('OP05 integration — OP05-073 Miss Doublefinger OnPlay AddDon rested', () => {

  it('C1 — trash 1 from hand → donDeck −1, donArea +1 (rested DON)', () => {
    let s = bootstrapGame();

    const doublefinger = makeChar('c1-df', P1, 4000, { zone: 'hand', cost: 0, effects: [op05073Effect] });
    s = addToHand(s, doublefinger, P1);

    // P1 needs a card in hand to trash (besides doublefinger)
    const handCard = makeChar('c1-hand', P1, 2000, { zone: 'hand', cost: 0 });
    s = addToHand(s, handCard, P1);

    const donDeckBefore = s.players[P1]!.donDeck.length;
    const donAreaBefore = s.players[P1]!.donArea.length;

    // Play Miss Doublefinger → OnPlay → TrashFromHand → pendingTrashInteraction
    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: doublefinger.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(result.pendingTrashInteraction).not.toBeNull();

    // Trash the hand card → thenActions: AddDon count:1 active:false
    result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [handCard.id] });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // AddDon: donDeck -1, donArea +1
    expect(result.players[P1]!.donDeck.length).toBe(donDeckBefore - 1);
    expect(result.players[P1]!.donArea.length).toBe(donAreaBefore + 1);

    // The new DON should be rested (tapped = true)
    const newDonId = result.players[P1]!.donArea.find((id) => !s.players[P1]!.donArea.includes(id));
    if (newDonId !== undefined) {
      expect(result.cards[newDonId]?.tapped).toBe(true);
    }
  });

  it('C2 — optional: trash 0 cards → no DON gain', () => {
    let s = bootstrapGame();

    const doublefinger = makeChar('c2-df', P1, 4000, { zone: 'hand', cost: 0, effects: [op05073Effect] });
    s = addToHand(s, doublefinger, P1);

    const donDeckBefore = s.players[P1]!.donDeck.length;
    const donAreaBefore = s.players[P1]!.donArea.length;

    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: doublefinger.id });
    if (isGameError(result)) return;

    if (result.pendingTrashInteraction !== null) {
      // Decline to trash (optional: true)
      result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [] });
      expect(isGameError(result)).toBe(false);
      if (isGameError(result)) return;
    }

    // No DON gain when 0 cards trashed
    expect(result.players[P1]!.donDeck.length).toBe(donDeckBefore);
    expect(result.players[P1]!.donArea.length).toBe(donAreaBefore);
  });

});
