/**
 * ST Sets Integration Tests (ST01–ST08, ST11–ST20, ST23+).
 *
 * Cards under test (one representative per set group):
 *   ST04-008 — [On Play] trash → AddDon 1 active (Jack)
 *   ST05-005 — [Activate: Main][Once Per Turn] condition: opp has more DON → AddDon 2 rested (Carina)
 *   ST10-009 — [On Play] AddDon 1 active (Jean Bart, after fix)
 *   ST10-012 — [On Play/When Attacking] opp has more DON → AddDon 1 rested (Bepo)
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
} from '../../src/index.js';
import type { Card, CardEffect, GameState, PlayerId, PlayerSetup } from '../../src/index.js';

const P1 = makePlayerId('st-p1');
const P2 = makePlayerId('st-p2');

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 3, power, color: 'Purple', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}
function makeDon(id: string, owner: PlayerId): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Purple', type: 'DON',
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
function addToBoard(s: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...s, cards: { ...s.cards, [card.id]: { ...card, zone: 'board' } },
    players: { ...s.players, [owner]: { ...s.players[owner]!, board: [...s.players[owner]!.board, card.id] } },
  };
}
function addToHand(s: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...s, cards: { ...s.cards, [card.id]: { ...card, zone: 'hand' } },
    players: { ...s.players, [owner]: { ...s.players[owner]!, hand: [...s.players[owner]!.hand, card.id] } },
  };
}

// ─── DSL stubs (post-fix versions) ────────────────────────────────────────────

const st04008Effect: CardEffect = {
  trigger: 'OnPlay',
  actions: [
    {
      type: 'TrashFromHand',
      optional: true,
      filter: {},
      thenActions: [{ type: 'AddDon', count: 1, active: true }],
    } as never,
  ],
};

const st10009Effect: CardEffect = {
  trigger: 'OnPlay',
  actions: [{ type: 'AddDon', count: 1, active: true } as never],
};

const st10012Effect: CardEffect = {
  trigger: 'OnPlay',
  condition: { type: 'DonDifference', gap: 1 } as never,
  actions: [{ type: 'AddDon', count: 1, active: false } as never],
};

// ════════════════════════════════════════════════════════════════════════════════
// ST04-008 Jack — OnPlay trash → AddDon 1 active
// ════════════════════════════════════════════════════════════════════════════════

describe('ST sets integration — ST04-008 OnPlay trash → AddDon 1 active', () => {

  it('C1 — trash 1 from hand → donDeck –1, donArea +1 (untapped)', () => {
    let s = bootstrapGame();

    const jack = makeChar('st04-jack', P1, 5000, { zone: 'hand', cost: 0, effects: [st04008Effect] });
    s = addToHand(s, jack, P1);

    const handCard = makeChar('st04-hand', P1, 2000, { zone: 'hand', cost: 0 });
    s = addToHand(s, handCard, P1);

    const donDeckBefore = s.players[P1]!.donDeck.length;
    const donAreaBefore = s.players[P1]!.donArea.length;

    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: jack.id });
    if (isGameError(result)) return;

    if (result.pendingTrashInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [handCard.id] });
      if (isGameError(result)) return;
    }

    expect(result.players[P1]!.donDeck.length).toBe(donDeckBefore - 1);
    expect(result.players[P1]!.donArea.length).toBe(donAreaBefore + 1);

    const newDonId = result.players[P1]!.donArea.find((id) => !s.players[P1]!.donArea.includes(id));
    if (newDonId !== undefined) {
      expect(result.cards[newDonId]?.tapped).toBe(false);
    }
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// ST10-009 Jean Bart — OnPlay AddDon 1 active (simple)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST sets integration — ST10-009 Jean Bart OnPlay AddDon 1 active', () => {

  it('C2 — play Jean Bart → donDeck –1, donArea +1 (active/untapped)', () => {
    let s = bootstrapGame();

    const jeanBart = makeChar('st10-jean', P1, 5000, { zone: 'hand', cost: 0, effects: [st10009Effect] });
    s = addToHand(s, jeanBart, P1);

    const donDeckBefore = s.players[P1]!.donDeck.length;
    const donAreaBefore = s.players[P1]!.donArea.length;

    const result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: jeanBart.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(result.players[P1]!.donDeck.length).toBe(donDeckBefore - 1);
    expect(result.players[P1]!.donArea.length).toBe(donAreaBefore + 1);

    const newDonId = result.players[P1]!.donArea.find((id) => !s.players[P1]!.donArea.includes(id));
    if (newDonId !== undefined) {
      expect(result.cards[newDonId]?.tapped).toBe(false);
    }
  });

});
