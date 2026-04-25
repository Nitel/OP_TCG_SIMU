import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
} from '../src/index.js';
import type { Card, GameState, PlayerSetup } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCard(id: string, type: Card['type'] = 'Character'): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 0,
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
    deckCards: Array.from({ length: deckSize }, (_, i) => makeCard(`${idStr}-deck-${i}`)),
    donCards: Array.from({ length: 10 }, (_, i) => makeCard(`${idStr}-don-${i}`, 'DON')),
  };
}

const P1 = makePlayerId('p1');
const P2 = makePlayerId('p2');

function startGame(firstPlayerId = P1): GameState {
  const seed = makeEmptyState(P1, P2);
  const result = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId,
  });
  if (isGameError(result)) throw new Error(`StartGame failed: ${result.message}`);
  return result;
}

function afterBothMulligans(p1Keep = true, p2Keep = true): GameState {
  let s = startGame();
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: p1Keep }) as GameState;
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: p2Keep }) as GameState;
  return s;
}

// ─── Initial state after StartGame ───────────────────────────────────────────

describe('Mulligan — état initial après StartGame', () => {
  it('la phase est Mulligan', () => {
    const s = startGame();
    expect(s.phase).toBe('Mulligan');
  });

  it('life est vide avant le mulligan', () => {
    const s = startGame();
    expect(s.players[P1]!.life.length).toBe(0);
    expect(s.players[P2]!.life.length).toBe(0);
  });

  it('chaque joueur a 5 cartes en main', () => {
    const s = startGame();
    expect(s.players[P1]!.hand.length).toBe(5);
    expect(s.players[P2]!.hand.length).toBe(5);
  });

  it("firstPlayerId est le joueur actif au début du mulligan", () => {
    const s = startGame(P1);
    expect(s.activePlayerId).toBe(P1);
    expect(s.firstPlayerId).toBe(P1);
  });

  it("firstPlayerId=p2 rend p2 actif au début du mulligan", () => {
    const s = startGame(P2);
    expect(s.activePlayerId).toBe(P2);
    expect(s.firstPlayerId).toBe(P2);
  });

  it('mulliganDecided est vide', () => {
    const s = startGame();
    expect(s.mulliganDecided.length).toBe(0);
  });
});

// ─── Garder la main ───────────────────────────────────────────────────────────

describe('Mulligan — garder la main (keep:true)', () => {
  it('la main reste identique', () => {
    const before = startGame();
    const handBefore = [...before.players[P1]!.hand];

    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: true });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.hand).toEqual(handBefore);
    }
  });

  it('le deck reste identique', () => {
    const before = startGame();
    const deckBefore = [...before.players[P1]!.deck];

    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: true });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.deck).toEqual(deckBefore);
    }
  });

  it("le tour passe au second joueur", () => {
    const before = startGame(P1); // P1 is firstPlayerId → active first
    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: true });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activePlayerId).toBe(P2);
    }
  });

  it('mulliganDecided inclut le joueur qui vient de décider', () => {
    const before = startGame();
    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: true });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.mulliganDecided).toContain(P1);
    }
  });

  it('la phase reste Mulligan tant que le second joueur n\'a pas décidé', () => {
    const before = startGame();
    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: true });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.phase).toBe('Mulligan');
    }
  });
});

// ─── Relancer (keep:false) ────────────────────────────────────────────────────

describe('Mulligan — relancer la main (keep:false)', () => {
  it('la nouvelle main contient toujours 5 cartes', () => {
    const before = startGame();
    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: false });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.hand.length).toBe(5);
    }
  });

  it('deck + main = total initial (aucune carte perdue)', () => {
    const before = startGame();
    const totalBefore = before.players[P1]!.hand.length + before.players[P1]!.deck.length;

    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: false });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      const totalAfter = result.players[P1]!.hand.length + result.players[P1]!.deck.length;
      expect(totalAfter).toBe(totalBefore);
    }
  });

  it('toutes les cartes de la nouvelle main ont zone hand', () => {
    const before = startGame();
    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: false });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      for (const id of result.players[P1]!.hand) {
        expect(result.cards[id]!.zone).toBe('hand');
      }
    }
  });

  it('toutes les cartes restantes dans le deck ont zone deck', () => {
    const before = startGame();
    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: false });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      for (const id of result.players[P1]!.deck) {
        expect(result.cards[id]!.zone).toBe('deck');
      }
    }
  });

  it("le tour passe au second joueur", () => {
    const before = startGame(P1);
    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: false });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activePlayerId).toBe(P2);
    }
  });

  it('la main de p2 est intacte après le mulligan de p1', () => {
    const before = startGame();
    const p2HandBefore = [...before.players[P2]!.hand];

    const result = applyAction(before, { type: 'Mulligan', playerId: P1, keep: false });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P2]!.hand).toEqual(p2HandBefore);
    }
  });
});

// ─── Après les deux décisions ─────────────────────────────────────────────────

describe('Mulligan — après les deux décisions', () => {
  it('life a 5 cartes pour chaque joueur (les deux gardent)', () => {
    const s = afterBothMulligans(true, true);
    expect(s.players[P1]!.life.length).toBe(5);
    expect(s.players[P2]!.life.length).toBe(5);
  });

  it('life a 5 cartes pour chaque joueur (les deux relancent)', () => {
    const s = afterBothMulligans(false, false);
    expect(s.players[P1]!.life.length).toBe(5);
    expect(s.players[P2]!.life.length).toBe(5);
  });

  it('life a 5 cartes (p1 garde, p2 relance)', () => {
    const s = afterBothMulligans(true, false);
    expect(s.players[P1]!.life.length).toBe(5);
    expect(s.players[P2]!.life.length).toBe(5);
  });

  it('toutes les cartes life ont zone life', () => {
    const s = afterBothMulligans(true, true);
    for (const id of s.players[P1]!.life) {
      expect(s.cards[id]!.zone).toBe('life');
    }
    for (const id of s.players[P2]!.life) {
      expect(s.cards[id]!.zone).toBe('life');
    }
  });

  it('main et life sont disjointes pour p1', () => {
    const s = afterBothMulligans(true, true);
    const hand = new Set(s.players[P1]!.hand);
    const life = new Set(s.players[P1]!.life);
    const overlap = [...hand].filter((id) => life.has(id));
    expect(overlap.length).toBe(0);
  });

  it('phase est Refresh (les cartes sont détapées)', () => {
    const s = afterBothMulligans(true, true);
    expect(s.phase).toBe('Refresh');
  });

  it('le joueur actif est firstPlayerId', () => {
    const s = afterBothMulligans(true, true);
    expect(s.activePlayerId).toBe(s.firstPlayerId);
  });

  it('mulliganDecided contient les deux joueurs', () => {
    const s = afterBothMulligans(true, true);
    expect(s.mulliganDecided).toContain(P1);
    expect(s.mulliganDecided).toContain(P2);
  });

  it('le total deck+main+life reste cohérent (50 cartes initiales)', () => {
    const s = afterBothMulligans(true, true);
    const p1Total =
      s.players[P1]!.deck.length +
      s.players[P1]!.hand.length +
      s.players[P1]!.life.length;
    expect(p1Total).toBe(50);
  });

  it('quand p2 est firstPlayerId, p2 est actif après mulligan', () => {
    const seed = makeEmptyState(P1, P2);
    let s = applyAction(seed, {
      type: 'StartGame',
      player1: makePlayerSetup('p1'),
      player2: makePlayerSetup('p2'),
      firstPlayerId: P2,
    }) as GameState;
    // P2 decides first (active at start of Mulligan)
    s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true }) as GameState;
    s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true }) as GameState;

    expect(s.activePlayerId).toBe(P2);
    expect(s.firstPlayerId).toBe(P2);
  });
});

// ─── Cas d'erreur ─────────────────────────────────────────────────────────────

describe('Mulligan — cas d\'erreur', () => {
  it('WRONG_PHASE si la phase n\'est pas Mulligan', () => {
    const s: GameState = { ...startGame(), phase: 'Main' };
    const result = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('WRONG_PHASE');
  });

  it("NOT_ACTIVE_PLAYER si c'est p2 qui tente de décider en premier (p1 est actif)", () => {
    const s = startGame(P1); // P1 is active
    const result = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NOT_ACTIVE_PLAYER');
  });

  it('ALREADY_MULLIGANED si le joueur essaie de décider deux fois', () => {
    const s = startGame(P1);
    const afterP1 = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
    expect(isGameError(afterP1)).toBe(false);
    if (isGameError(afterP1)) return;

    // P1 tries again (but now P2 is active — so this is NOT_ACTIVE_PLAYER, not ALREADY_MULLIGANED)
    // To test ALREADY_MULLIGANED, we inject a state where P1 is active but already decided
    const injected: GameState = { ...afterP1, activePlayerId: P1 };
    const result = applyAction(injected, { type: 'Mulligan', playerId: P1, keep: true });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('ALREADY_MULLIGANED');
  });
});
