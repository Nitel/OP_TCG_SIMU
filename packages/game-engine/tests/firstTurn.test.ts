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

/**
 * Bootstraps through StartGame + both mulligans (keep).
 * Returns a state in Refresh phase, turnNumber=1, activePlayerId=firstPlayerId.
 */
function bootstrapAfterMulligan(firstPlayerId = P1): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId,
  }) as GameState;

  // First player decides, then second player
  const [fp, sp] = firstPlayerId === P1 ? [P1, P2] : [P2, P1];
  s = applyAction(s, { type: 'Mulligan', playerId: fp, keep: true }) as GameState;
  s = applyAction(s, { type: 'Mulligan', playerId: sp, keep: true }) as GameState;

  return s; // phase: Refresh, turnNumber: 1, activePlayerId: firstPlayerId
}

// ─── Premier joueur, tour 1 ───────────────────────────────────────────────────

describe('Restrictions premier tour — premier joueur tour 1', () => {
  it('le premier joueur ne pioche pas de carte lors de DrawPhase', () => {
    // Advance to Draw phase
    const refreshState = bootstrapAfterMulligan(P1);
    const drawState: GameState = { ...refreshState, phase: 'Draw' };

    const handBefore = drawState.players[P1]!.hand.length;
    const result = applyAction(drawState, { type: 'DrawPhase', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.hand.length).toBe(handBefore); // aucune carte piochée
    }
  });

  it('DrawPhase passe quand même à la phase DON', () => {
    const refreshState = bootstrapAfterMulligan(P1);
    const drawState: GameState = { ...refreshState, phase: 'Draw' };

    const result = applyAction(drawState, { type: 'DrawPhase', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.phase).toBe('DON');
    }
  });

  it('le premier joueur reçoit exactement 1 DON au tour 1', () => {
    const refreshState = bootstrapAfterMulligan(P1);
    const drawState: GameState = { ...refreshState, phase: 'Draw' };

    const donBefore = drawState.players[P1]!.donArea.length;
    const result = applyAction(drawState, { type: 'DrawPhase', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.donArea.length).toBe(donBefore + 1);
    }
  });

  it('le DON deck diminue de 1 après le premier tour du premier joueur', () => {
    const refreshState = bootstrapAfterMulligan(P1);
    const drawState: GameState = { ...refreshState, phase: 'Draw' };

    const donDeckBefore = drawState.players[P1]!.donDeck.length;
    const result = applyAction(drawState, { type: 'DrawPhase', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.donDeck.length).toBe(donDeckBefore - 1);
    }
  });
});

// ─── Second joueur, tour 1 (= turnNumber 2) ───────────────────────────────────

describe('Restrictions premier tour — second joueur, son premier tour', () => {
  it('le second joueur pioche 1 carte normalement', () => {
    // P2 first turn = turnNumber 2
    const base = bootstrapAfterMulligan(P1);
    const p2DrawState: GameState = {
      ...base,
      phase: 'Draw',
      activePlayerId: P2,
      turnNumber: 2,
    };

    const handBefore = p2DrawState.players[P2]!.hand.length;
    const result = applyAction(p2DrawState, { type: 'DrawPhase', playerId: P2 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P2]!.hand.length).toBe(handBefore + 1);
    }
  });

  it('le second joueur reçoit 2 DON lors de son premier tour', () => {
    const base = bootstrapAfterMulligan(P1);
    const p2DrawState: GameState = {
      ...base,
      phase: 'Draw',
      activePlayerId: P2,
      turnNumber: 2,
    };

    const donBefore = p2DrawState.players[P2]!.donArea.length;
    const result = applyAction(p2DrawState, { type: 'DrawPhase', playerId: P2 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P2]!.donArea.length).toBe(donBefore + 2);
    }
  });
});

// ─── Premier joueur, tour 2 ───────────────────────────────────────────────────

describe('Restrictions premier tour — premier joueur à partir du tour 2', () => {
  it('le premier joueur pioche 1 carte normalement à son tour 2', () => {
    const base = bootstrapAfterMulligan(P1);
    const p1Turn2: GameState = {
      ...base,
      phase: 'Draw',
      activePlayerId: P1,
      turnNumber: 3, // P1's second turn (turns: 1=P1, 2=P2, 3=P1)
    };

    const handBefore = p1Turn2.players[P1]!.hand.length;
    const result = applyAction(p1Turn2, { type: 'DrawPhase', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.hand.length).toBe(handBefore + 1);
    }
  });

  it('le premier joueur reçoit 2 DON à partir du tour 2', () => {
    const base = bootstrapAfterMulligan(P1);
    const p1Turn2: GameState = {
      ...base,
      phase: 'Draw',
      activePlayerId: P1,
      turnNumber: 3,
    };

    const donBefore = p1Turn2.players[P1]!.donArea.length;
    const result = applyAction(p1Turn2, { type: 'DrawPhase', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.donArea.length).toBe(donBefore + 2);
    }
  });

  it('turnNumber=1 mais activePlayer !== firstPlayer → pioche normalement', () => {
    // Edge case: turnNumber=1 but a different player is active (shouldn't happen in real game
    // but ensures the restriction only targets firstPlayer on turn 1)
    const base = bootstrapAfterMulligan(P1);
    const edgeState: GameState = {
      ...base,
      phase: 'Draw',
      activePlayerId: P2,
      turnNumber: 1, // turn 1, but P2 is active (P1 is firstPlayer)
    };

    const handBefore = edgeState.players[P2]!.hand.length;
    const result = applyAction(edgeState, { type: 'DrawPhase', playerId: P2 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P2]!.hand.length).toBe(handBefore + 1);
    }
  });
});

// ─── Quand p2 est le premier joueur ───────────────────────────────────────────

describe('Restrictions premier tour — quand p2 est firstPlayer', () => {
  it('p2 comme firstPlayer : ne pioche pas au tour 1', () => {
    const base = bootstrapAfterMulligan(P2);
    const drawState: GameState = { ...base, phase: 'Draw' }; // turnNumber=1, firstPlayerId=P2

    const handBefore = drawState.players[P2]!.hand.length;
    const result = applyAction(drawState, { type: 'DrawPhase', playerId: P2 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P2]!.hand.length).toBe(handBefore);
    }
  });

  it('p2 comme firstPlayer : reçoit 1 DON au tour 1', () => {
    const base = bootstrapAfterMulligan(P2);
    const drawState: GameState = { ...base, phase: 'Draw' };

    const donBefore = drawState.players[P2]!.donArea.length;
    const result = applyAction(drawState, { type: 'DrawPhase', playerId: P2 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P2]!.donArea.length).toBe(donBefore + 1);
    }
  });

  it('p2 comme firstPlayer : p1 pioche normalement à turnNumber 2', () => {
    const base = bootstrapAfterMulligan(P2);
    const p1DrawState: GameState = {
      ...base,
      phase: 'Draw',
      activePlayerId: P1,
      turnNumber: 2,
    };

    const handBefore = p1DrawState.players[P1]!.hand.length;
    const result = applyAction(p1DrawState, { type: 'DrawPhase', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.hand.length).toBe(handBefore + 1);
    }
  });

  it('p2 comme firstPlayer : p1 reçoit 2 DON à turnNumber 2', () => {
    const base = bootstrapAfterMulligan(P2);
    const p1DrawState: GameState = {
      ...base,
      phase: 'Draw',
      activePlayerId: P1,
      turnNumber: 2,
    };

    const donBefore = p1DrawState.players[P1]!.donArea.length;
    const result = applyAction(p1DrawState, { type: 'DrawPhase', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.donArea.length).toBe(donBefore + 2);
    }
  });
});

// ─── DON via EndPhase (passer Draw sans DrawPhase) ────────────────────────────

describe('DON via EndPhase', () => {
  it('passer la phase Draw via EndPhase distribue quand même 2 DON au tour 2', () => {
    const base = bootstrapAfterMulligan(P1);
    // Simulate being in Draw phase on turn 2 as P1, skipping draw via EndPhase
    const drawState: GameState = {
      ...base,
      phase: 'Draw',
      activePlayerId: P1,
      turnNumber: 2,
    };

    const donBefore = drawState.players[P1]!.donArea.length;
    const result = applyAction(drawState, { type: 'EndPhase', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.phase).toBe('DON');
      expect(result.players[P1]!.donArea.length).toBe(donBefore + 2);
    }
  });
});
