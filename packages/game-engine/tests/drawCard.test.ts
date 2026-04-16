import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
} from '../src/index.js';
import type { GameState, Card, PlayerState } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCard(id: string, ownerId: string, zone: Card['zone']): Card {
  return {
    id: makeCardId(id),
    name: `Card-${id}`,
    cost: 1,
    power: 1000,
    color: 'Red',
    type: 'Character',
    zone,
    ownerId: makePlayerId(ownerId),
    tapped: false,
    attachedTo: null,
  };
}

function makePlayer(id: string, deckSize: number): { player: PlayerState; cards: Record<string, Card> } {
  const pid = makePlayerId(id);
  const deckCards = Array.from({ length: deckSize }, (_, i) =>
    makeCard(`${id}-card-${i}`, id, 'deck')
  );
  const cards: Record<string, Card> = {};
  for (const c of deckCards) cards[c.id] = c;

  return {
    player: {
      id: pid,
      leader: null,
      life: [],
      deck: deckCards.map((c) => c.id),
      hand: [],
      board: [],
      donDeck: [],
      donArea: [],
      trash: [],
    },
    cards,
  };
}

function makeInitialState(deckSize: number): GameState {
  const p1 = makePlayerId('p1');
  const p2 = makePlayerId('p2');
  const { player: player1, cards: cards1 } = makePlayer('p1', deckSize);
  const { player: player2, cards: cards2 } = makePlayer('p2', 0);

  return {
    cards: { ...cards1, ...cards2 } as GameState['cards'],
    players: { [p1]: player1, [p2]: player2 },
    playerOrder: [p1, p2],
    activePlayerId: p1,
    phase: 'Main',
    turnNumber: 1,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DrawCard', () => {
  it('diminue le deck de 1 après DrawCard', () => {
    const state = makeInitialState(5);
    const p1 = makePlayerId('p1');

    const result = applyAction(state, { type: 'DrawCard', playerId: p1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[p1]!.deck.length).toBe(4);
    }
  });

  it('augmente la main de 1 après DrawCard', () => {
    const state = makeInitialState(5);
    const p1 = makePlayerId('p1');

    const result = applyAction(state, { type: 'DrawCard', playerId: p1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[p1]!.hand.length).toBe(1);
    }
  });

  it('la carte piochée est bien dans la main et plus dans le deck', () => {
    const state = makeInitialState(3);
    const p1 = makePlayerId('p1');
    const topCard = state.players[p1]!.deck[0]!;

    const result = applyAction(state, { type: 'DrawCard', playerId: p1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[p1]!.hand).toContain(topCard);
      expect(result.players[p1]!.deck).not.toContain(topCard);
      expect(result.cards[topCard]!.zone).toBe('hand');
    }
  });

  it('retourne une GameError si le deck est vide', () => {
    const state = makeInitialState(0);
    const p1 = makePlayerId('p1');

    const result = applyAction(state, { type: 'DrawCard', playerId: p1 });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('EMPTY_DECK');
    }
  });

  it("ne mute pas l'état original", () => {
    const state = makeInitialState(3);
    const p1 = makePlayerId('p1');
    const originalDeckLength = state.players[p1]!.deck.length;

    applyAction(state, { type: 'DrawCard', playerId: p1 });

    expect(state.players[p1]!.deck.length).toBe(originalDeckLength);
  });
});
