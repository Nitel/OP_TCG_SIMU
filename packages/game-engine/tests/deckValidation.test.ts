import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
} from '../src/index.js';
import type { Card, PlayerSetup } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCard(
  id: string,
  opts: Partial<Card> = {},
): Card {
  return {
    id: makeCardId(id),
    name: opts.name ?? id,
    cost: 0,
    power: 2000,
    color: 'Red',
    type: 'Character',
    zone: 'deck',
    ownerId: makePlayerId('p1'),
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makeLeader(id: string, color = 'Red'): Card {
  return makeCard(id, { type: 'Leader', color, name: `Leader-${id}` });
}

function makeDon(id: string): Card {
  return makeCard(id, { type: 'DON', name: 'DON!!' });
}

/** Build a valid 50-card deck of Red characters. */
function makeDeck(count: number, color = 'Red'): Card[] {
  // Max 4 copies per name — use groups of 4
  return Array.from({ length: count }, (_, i) =>
    makeCard(`deck-${i}`, { name: `Card-${Math.floor(i / 4)}`, color })
  );
}

function makeValidSetup(idStr: string): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: makeLeader(`${idStr}-leader`),
    deckCards: makeDeck(50),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${idStr}-don-${i}`)),
  };
}

function startGame(p1Setup: PlayerSetup, p2Setup: PlayerSetup) {
  const p1 = makePlayerId('p1');
  const p2 = makePlayerId('p2');
  const seed = makeEmptyState(p1, p2);
  return applyAction(seed, {
    type: 'StartGame',
    player1: p1Setup,
    player2: p2Setup,
    firstPlayerId: p1,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validatePlayerSetup — deck invalide', () => {
  it('INVALID_DECK si le deck a 49 cartes (trop court)', () => {
    const setup: PlayerSetup = { ...makeValidSetup('p1'), deckCards: makeDeck(49) };
    const result = startGame(setup, makeValidSetup('p2'));
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_DECK');
  });

  it('INVALID_DECK si le deck a 51 cartes (trop long)', () => {
    const setup: PlayerSetup = { ...makeValidSetup('p1'), deckCards: makeDeck(51) };
    const result = startGame(setup, makeValidSetup('p2'));
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_DECK');
  });

  it('INVALID_DECK si le DON deck n\'a pas 10 cartes', () => {
    const setup: PlayerSetup = {
      ...makeValidSetup('p1'),
      donCards: Array.from({ length: 8 }, (_, i) => makeDon(`don-${i}`)),
    };
    const result = startGame(setup, makeValidSetup('p2'));
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_DECK');
  });

  it('INVALID_DECK si le leader n\'est pas de type Leader', () => {
    const setup: PlayerSetup = {
      ...makeValidSetup('p1'),
      leaderCard: makeCard('fake-leader', { type: 'Character' }),
    };
    const result = startGame(setup, makeValidSetup('p2'));
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_DECK');
  });

  it('INVALID_DECK si plus de 4 copies d\'une même carte (même name)', () => {
    // 5 copies of the same card name among 50
    const deck = makeDeck(50);
    deck[0] = makeCard('extra-copy', { name: 'Card-1' }); // Card-1 now has 5 copies
    const setup: PlayerSetup = { ...makeValidSetup('p1'), deckCards: deck };
    const result = startGame(setup, makeValidSetup('p2'));
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_DECK');
  });

  it('INVALID_DECK si une carte a une couleur incompatible avec le leader', () => {
    const deck = makeDeck(49); // 49 Red cards
    deck.push(makeCard('blue-card', { name: 'Blue-Card', color: 'Blue' })); // incompatible
    const setup: PlayerSetup = {
      ...makeValidSetup('p1'),
      leaderCard: makeLeader('p1-leader', 'Red'),
      deckCards: deck,
    };
    const result = startGame(setup, makeValidSetup('p2'));
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_DECK');
  });
});

describe('validatePlayerSetup — deck valide', () => {
  it('accepte un deck valide (50 cartes, 10 DON, leader correct, ≤4 copies, couleurs OK)', () => {
    const result = startGame(makeValidSetup('p1'), makeValidSetup('p2'));
    expect(isGameError(result)).toBe(false);
  });
});
