/**
 * OP07 Integration Tests — 500 Years in the Future.
 *
 * Cards under test:
 *   OP07-001 — [Activate: Main][Once Per Turn] AttachDon to own character (Dragon Leader)
 *   OP09-001 analog: OP07-001 Activated AttachDon
 *   OP07-061 — [On Play] If Vinsmoke Family leader, draw 1 (Vinsmoke Sanji)
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
} from '../../src/index.js';
import type { Card, CardId, CardEffect, GameState, PlayerId, PlayerSetup } from '../../src/index.js';
import { resolveEffects } from '../../src/effects/effectResolver.js';

const P1 = makePlayerId('op07-p1');
const P2 = makePlayerId('op07-p2');

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 3, power, color: 'Black', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}
function makeDon(id: string, owner: PlayerId): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Black', type: 'DON',
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
function addToHand(state: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand' } },
    players: { ...state.players, [owner]: { ...state.players[owner]!, hand: [...state.players[owner]!.hand, card.id] } },
  };
}
function addFreeDon(state: GameState, dons: Card[]): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const d of dons) updatedCards[d.id] = { ...d, zone: 'donArea', tapped: false, attachedTo: null };
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: { ...state.players, [P1]: { ...state.players[P1]!, donArea: [...state.players[P1]!.donArea, ...dons.map((d) => d.id)] } },
  };
}

// ─── DSL stubs ─────────────────────────────────────────────────────────────────

const op07001Effect: CardEffect = {
  trigger: 'Activated',
  oncePerTurn: true,
  actions: [
    { type: 'AttachDon', count: 2, target: { scope: 'ChooseOwnCharacter' } } as never,
  ],
};

const op07061Effect: CardEffect = {
  trigger: 'OnPlay',
  condition: { type: 'LeaderHasType', subType: 'The Vinsmoke Family' } as never,
  actions: [{ type: 'DrawCard', count: 1 }],
};

// ════════════════════════════════════════════════════════════════════════════════
// OP07-001 Dragon Leader — Activated: AttachDon 2 to own Character
// ════════════════════════════════════════════════════════════════════════════════

describe('OP07 integration — OP07-001 Dragon Activated: AttachDon 2', () => {

  it('L1 — Activate leader: 2 free DON attach to chosen own character (auto-select)', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op07001Effect] } } };

    // Add 2 free DON to P1's donArea
    const don1 = makeDon('l1-d1', P1);
    const don2 = makeDon('l1-d2', P1);
    s = addFreeDon(s, [don1, don2]);

    // Add a character to P1's board (AttachDon target)
    const char = makeChar('l1-char', P1, 3000);
    s = addToBoard(s, char, P1);
    s = { ...s, newBoardIds: [] };

    const donAreaBefore = s.players[P1]!.donArea.length;

    // Activate leader — Activated trigger auto-selects first valid ChooseOwnCharacter
    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: leaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // 2 DON attached to the character
    const attachedCount = Object.values(result.cards).filter(
      (c) => c.type === 'DON' && c.attachedTo === char.id
    ).length;
    expect(attachedCount).toBe(2);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// OP07-061 Vinsmoke Sanji — OnPlay draw if Vinsmoke Family leader
// ════════════════════════════════════════════════════════════════════════════════

describe('OP07 integration — OP07-061 Vinsmoke Sanji OnPlay draw', () => {

  it('C1 — leader has Vinsmoke Family type → draws 1 on play', () => {
    let s = bootstrapGame();

    // Inject Vinsmoke Family leader
    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, subTypes: 'The Vinsmoke Family' } } };

    const deckBefore = s.players[P1]!.deck.length;

    const after = resolveEffects(
      [op07061Effect],
      'OnPlay',
      { sourceCardId: leaderId, sourcePlayerId: P1 },
      s,
    );

    expect(after.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

  it('C2 — leader does NOT have Vinsmoke Family → no draw', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    const deckBefore = s.players[P1]!.deck.length;

    const after = resolveEffects(
      [op07061Effect],
      'OnPlay',
      { sourceCardId: leaderId, sourcePlayerId: P1 },
      s,
    );

    expect(after.players[P1]!.deck.length).toBe(deckBefore);
  });

});
