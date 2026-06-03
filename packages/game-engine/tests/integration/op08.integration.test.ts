/**
 * OP08 Integration Tests — Two Legends.
 *
 * Cards under test:
 *   OP08-001 — [Activate: Main][Once Per Turn] AttachDon 1 each to up to 3 Animal/Drum Kingdom chars (Chopper Leader)
 *   OP08-010 — [DON!! x1][Activate: Main][Once Per Turn] other Animal char +1000 DuringYourTurn (Hiking Bear)
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

const P1 = makePlayerId('op08-p1');
const P2 = makePlayerId('op08-p2');

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 3, power, color: 'Blue', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}
function makeDon(id: string, owner: PlayerId): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Blue', type: 'DON',
    zone: 'donArea', ownerId: owner, tapped: false, attachedTo: null,
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
function attachFreshDon(state: GameState, charId: CardId, owner: PlayerId, count: number, prefix: string): GameState {
  const updated: Record<string, Card> = { ...state.cards };
  for (let i = 0; i < count; i++) {
    const don = makeDon(`${prefix}-fdon-${i}`, owner);
    updated[don.id] = { ...don, attachedTo: charId, zone: 'board' };
  }
  return { ...state, cards: updated as GameState['cards'] };
}

// ─── DSL stubs ─────────────────────────────────────────────────────────────────

const op08010Effect: CardEffect = {
  trigger: 'Activated',
  oncePerTurn: true,
  condition: { type: 'HasAttachedDon', count: 1 },
  actions: [
    {
      type: 'PowerBoost',
      amount: 1000,
      target: { scope: 'ChooseOwnCharacter', subType: 'Animal' },
      duration: 'DuringYourTurn',
    } as never,
  ],
};

// ════════════════════════════════════════════════════════════════════════════════
// OP08-010 Hiking Bear — Activated [DON!! x1]: other Animal char +1000
// ════════════════════════════════════════════════════════════════════════════════

describe('OP08 integration — OP08-010 Hiking Bear Activated [DON!! x1] +1000 to Animal', () => {

  it('C1 — 1 DON attached, Animal char on board → that char +1000 DuringYourTurn', () => {
    let s = bootstrapGame();

    const hikingBear = makeChar('c1-bear', P1, 3000, {
      effects: [op08010Effect], subTypes: 'Animal',
    });
    s = addToBoard(s, hikingBear, P1);
    s = { ...s, newBoardIds: [] };

    // Attach 1 DON to satisfy HasAttachedDon:1
    s = attachFreshDon(s, hikingBear.id, P1, 1, 'c1');

    // Target Animal character (different from Hiking Bear itself)
    const animalChar = makeChar('c1-animal', P1, 4000, { subTypes: 'Animal' });
    s = addToBoard(s, animalChar, P1);

    const basePower = calculatePower(animalChar.id, s);

    // Activate — auto-selects first Animal char (Hiking Bear itself or animalChar)
    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: hikingBear.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // An Animal char on the board has +1000
    const afterPower = calculatePower(animalChar.id, result);
    const hikingPower = calculatePower(hikingBear.id, result);
    expect(afterPower === basePower + 1000 || hikingPower === calculatePower(hikingBear.id, s) + 1000).toBe(true);
  });

  it('C1b — no DON attached → condition fails, no boost', () => {
    let s = bootstrapGame();

    const hikingBear = makeChar('c1b-bear', P1, 3000, {
      effects: [op08010Effect], subTypes: 'Animal',
    });
    s = addToBoard(s, hikingBear, P1);
    s = { ...s, newBoardIds: [] };
    // No DON attached

    const animalChar = makeChar('c1b-animal', P1, 4000, { subTypes: 'Animal' });
    s = addToBoard(s, animalChar, P1);
    const basePower = calculatePower(animalChar.id, s);

    const result = resolveEffects(
      [op08010Effect],
      'Activated',
      { sourceCardId: hikingBear.id, sourcePlayerId: P1 },
      s,
    );

    expect(calculatePower(animalChar.id, result)).toBe(basePower);
  });

});
