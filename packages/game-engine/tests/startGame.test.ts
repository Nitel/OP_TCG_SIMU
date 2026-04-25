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

function makeCard(id: string, type: Card['type'] = 'Character'): Card {
  return {
    id: makeCardId(id),
    name: `Card-${id}`,
    cost: 2,
    power: 2000,
    color: 'Red',
    type,
    zone: 'deck',
    ownerId: makePlayerId('placeholder'),
    tapped: false,
    attachedTo: null,
  };
}

function makePlayerSetup(idStr: string, deckSize = 50): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: makeCard(`${idStr}-leader`, 'Leader'),
    deckCards: Array.from({ length: deckSize }, (_, i) =>
      makeCard(`${idStr}-deck-${i}`)
    ),
    donCards: Array.from({ length: 10 }, (_, i) =>
      makeCard(`${idStr}-don-${i}`, 'DON')
    ),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StartGame', () => {
  it('chaque joueur reçoit exactement 5 cartes en main', () => {
    const p1 = makePlayerId('p1');
    const p2 = makePlayerId('p2');
    const seed = makeEmptyState(p1, p2);

    const result = applyAction(seed, {
      type: 'StartGame',
      player1: makePlayerSetup('p1'),
      player2: makePlayerSetup('p2'),
      firstPlayerId: p1,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[p1]!.hand.length).toBe(5);
      expect(result.players[p2]!.hand.length).toBe(5);
    }
  });

  it('chaque joueur a son leader en zone leader', () => {
    const p1 = makePlayerId('p1');
    const p2 = makePlayerId('p2');
    const seed = makeEmptyState(p1, p2);
    const p1Setup = makePlayerSetup('p1');
    const p2Setup = makePlayerSetup('p2');

    const result = applyAction(seed, {
      type: 'StartGame',
      player1: p1Setup,
      player2: p2Setup,
      firstPlayerId: p1,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      const p1LeaderId = result.players[p1]!.leader;
      const p2LeaderId = result.players[p2]!.leader;

      expect(p1LeaderId).toBe(p1Setup.leaderCard.id);
      expect(p2LeaderId).toBe(p2Setup.leaderCard.id);
      expect(result.cards[p1LeaderId!]!.zone).toBe('leader');
      expect(result.cards[p2LeaderId!]!.zone).toBe('leader');
    }
  });

  it('chaque joueur a 5 cartes de vie (après mulligan)', () => {
    const p1 = makePlayerId('p1');
    const p2 = makePlayerId('p2');
    const seed = makeEmptyState(p1, p2);

    let result = applyAction(seed, {
      type: 'StartGame',
      player1: makePlayerSetup('p1'),
      player2: makePlayerSetup('p2'),
      firstPlayerId: p1,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Life cards are placed after both mulligan decisions
    result = applyAction(result, { type: 'Mulligan', playerId: p1, keep: true });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'Mulligan', playerId: p2, keep: true });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[p1]!.life.length).toBe(5);
      expect(result.players[p2]!.life.length).toBe(5);
      // Toutes les cartes de vie ont bien le zone 'life'
      for (const lifeId of result.players[p1]!.life) {
        expect(result.cards[lifeId]!.zone).toBe('life');
      }
    }
  });

  it('les cartes en main et en vie sont distinctes (après mulligan)', () => {
    const p1 = makePlayerId('p1');
    const p2 = makePlayerId('p2');
    const seed = makeEmptyState(p1, p2);

    let result = applyAction(seed, {
      type: 'StartGame',
      player1: makePlayerSetup('p1'),
      player2: makePlayerSetup('p2'),
      firstPlayerId: p1,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'Mulligan', playerId: p1, keep: true });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'Mulligan', playerId: p2, keep: true });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      const p1Hand = new Set(result.players[p1]!.hand);
      const p1Life = new Set(result.players[p1]!.life);
      const intersection = [...p1Hand].filter((id) => p1Life.has(id));
      expect(intersection.length).toBe(0);
    }
  });

  it('le DON deck est initialisé avec les cartes DON', () => {
    const p1 = makePlayerId('p1');
    const p2 = makePlayerId('p2');
    const seed = makeEmptyState(p1, p2);
    const p1Setup = makePlayerSetup('p1');

    const result = applyAction(seed, {
      type: 'StartGame',
      player1: p1Setup,
      player2: makePlayerSetup('p2'),
      firstPlayerId: p1,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[p1]!.donDeck.length).toBe(10);
      expect(result.players[p1]!.donArea.length).toBe(0);
    }
  });

  it('retourne DUPLICATE_PLAYER si les deux joueurs ont le même ID', () => {
    const p1 = makePlayerId('p1');
    const seed = makeEmptyState(p1, makePlayerId('p2'));

    const result = applyAction(seed, {
      type: 'StartGame',
      player1: makePlayerSetup('p1'),
      player2: makePlayerSetup('p1'), // même ID !
      firstPlayerId: p1,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('DUPLICATE_PLAYER');
    }
  });

  it('retourne INVALID_DECK si le deck n\'a pas exactement 50 cartes', () => {
    const p1 = makePlayerId('p1');
    const p2 = makePlayerId('p2');
    const seed = makeEmptyState(p1, p2);

    const result = applyAction(seed, {
      type: 'StartGame',
      player1: makePlayerSetup('p1', 5), // trop petit
      player2: makePlayerSetup('p2'),
      firstPlayerId: p1,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('INVALID_DECK');
    }
  });
});
