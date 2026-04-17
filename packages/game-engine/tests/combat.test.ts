import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  calculatePower,
  checkVictoryCondition,
} from '../src/index.js';
import type { Card, GameState, PlayerSetup } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const P1 = makePlayerId('p1');
const P2 = makePlayerId('p2');

function makeChar(id: string, owner: string, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 0,
    power,
    color: 'Red',
    type: 'Character',
    zone: 'board',
    ownerId: makePlayerId(owner),
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makeDon(id: string, owner: string, attachedTo: string | null = null): Card {
  return {
    id: makeCardId(id),
    name: 'DON!!',
    cost: 0,
    power: 0,
    color: 'Red',
    type: 'DON',
    zone: 'donArea',
    ownerId: makePlayerId(owner),
    tapped: false,
    attachedTo: attachedTo !== null ? makeCardId(attachedTo) : null,
  };
}

function makePlayerSetup(idStr: string): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: makeChar(`${idStr}-leader`, idStr, 5000, { type: 'Leader', zone: 'deck' }),
    deckCards: Array.from({ length: 20 }, (_, i) =>
      makeChar(`${idStr}-deck-${i}`, idStr, 2000, { zone: 'deck' })
    ),
    donCards: Array.from({ length: 10 }, (_, i) =>
      makeDon(`${idStr}-don-${i}`, idStr) as Card
    ),
  };
}

/** Bootstrap a full game in Main phase */
function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  const result = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId: P1,
  });
  if (isGameError(result)) throw new Error(`StartGame failed: ${result.message}`);
  return { ...result, phase: 'Main' };
}

/**
 * Build a minimal GameState with two characters ready to fight.
 * p1's attacker (power: attackerPower) vs p2's target (power: defenderPower).
 */
function buildCombatState(attackerPower: number, targetPower: number): GameState {
  const base = bootstrapGame();
  const attackerId = makeCardId('attacker');
  const targetId   = makeCardId('target');
  const attacker   = makeChar('attacker', 'p1', attackerPower);
  const target     = makeChar('target', 'p2', targetPower);

  return {
    ...base,
    cards: { ...base.cards, [attackerId]: attacker, [targetId]: target },
    players: {
      ...base.players,
      [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attackerId] },
      [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, targetId] },
    },
  };
}

// ─── calculatePower ───────────────────────────────────────────────────────────

describe('calculatePower', () => {
  it('retourne le power de base sans DON attaché', () => {
    const state = bootstrapGame();
    const attackerId = makeCardId('c');
    const card = makeChar('c', 'p1', 3000);
    const s = {
      ...state,
      cards: { ...state.cards, [attackerId]: card },
    };
    expect(calculatePower(attackerId, s)).toBe(3000);
  });

  it('ajoute 1 000 par DON attaché', () => {
    const state = bootstrapGame();
    const charId = makeCardId('char');
    const don1Id = makeCardId('d1');
    const don2Id = makeCardId('d2');
    const char   = makeChar('char', 'p1', 2000);
    const don1   = makeDon('d1', 'p1', 'char');
    const don2   = makeDon('d2', 'p1', 'char');
    const s = {
      ...state,
      cards: { ...state.cards, [charId]: char, [don1Id]: don1, [don2Id]: don2 },
    };
    expect(calculatePower(charId, s)).toBe(4000);
  });
});

// ─── DeclareAttack ────────────────────────────────────────────────────────────

describe('DeclareAttack', () => {
  it('tape l\'attaquant et crée activeCombat', () => {
    const state = buildCombatState(3000, 2000);
    const attackerId = makeCardId('attacker');
    const targetId   = makeCardId('target');

    const result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId,
      targetId,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[attackerId]!.tapped).toBe(true);
      expect(result.activeCombat).toEqual({ attackerId, targetId, blockerId: null });
    }
  });

  it('retourne WRONG_PHASE si on n\'est pas en Main', () => {
    const state = { ...buildCombatState(3000, 2000), phase: 'Draw' as const };
    const result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: makeCardId('attacker'),
      targetId: makeCardId('target'),
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('WRONG_PHASE');
  });

  it('retourne ATTACKER_TAPPED si l\'attaquant est reposé', () => {
    const state = buildCombatState(3000, 2000);
    const attackerId = makeCardId('attacker');
    const s = {
      ...state,
      cards: { ...state.cards, [attackerId]: { ...state.cards[attackerId]!, tapped: true } },
    };
    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId,
      targetId: makeCardId('target'),
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('ATTACKER_TAPPED');
  });

  it('retourne INVALID_TARGET si la cible n\'est pas du bon côté', () => {
    const state = buildCombatState(3000, 2000);
    // Try to attack a p1 card
    const ownCardId = state.players[P1]!.board[0]!;
    const result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: makeCardId('attacker'),
      targetId: ownCardId,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_TARGET');
  });

  it('retourne NOT_ACTIVE_PLAYER si ce n\'est pas son tour', () => {
    const state = buildCombatState(3000, 2000);
    const result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P2,
      attackerId: makeCardId('target'),
      targetId: makeCardId('attacker'),
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NOT_ACTIVE_PLAYER');
  });
});

// ─── DeclareBlock ─────────────────────────────────────────────────────────────

describe('DeclareBlock', () => {
  function withAttack(state: GameState): GameState {
    const result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: makeCardId('attacker'),
      targetId: makeCardId('target'),
    });
    if (isGameError(result)) throw new Error('DeclareAttack failed');
    return result;
  }

  it('assigne un blocker valide', () => {
    const base  = buildCombatState(3000, 2000);
    const blockerId = makeCardId('blocker');
    const blocker   = makeChar('blocker', 'p2', 4000, { keywords: ['Blocker'] });
    const stateWithBlocker: GameState = {
      ...base,
      cards: { ...base.cards, [blockerId]: blocker },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, blockerId] },
      },
    };
    const afterAttack = withAttack(stateWithBlocker);

    const result = applyAction(afterAttack, {
      type: 'DeclareBlock',
      playerId: P2,
      blockerId,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activeCombat!.blockerId).toBe(blockerId);
      expect(result.cards[blockerId]!.tapped).toBe(true);
    }
  });

  it('retourne NO_BLOCKER_KEYWORD si la carte n\'a pas le keyword Blocker', () => {
    const base  = buildCombatState(3000, 2000);
    const noBlockerId = makeCardId('no-blocker');
    const noBlocker   = makeChar('no-blocker', 'p2', 4000); // no keywords
    const s: GameState = {
      ...base,
      cards: { ...base.cards, [noBlockerId]: noBlocker },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, noBlockerId] },
      },
    };
    const afterAttack = withAttack(s);

    const result = applyAction(afterAttack, {
      type: 'DeclareBlock',
      playerId: P2,
      blockerId: noBlockerId,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_BLOCKER_KEYWORD');
  });

  it('retourne ACTIVE_PLAYER_CANNOT_BLOCK si c\'est le joueur actif qui essaie de blocker', () => {
    const state       = buildCombatState(3000, 2000);
    const afterAttack = withAttack(state);

    const result = applyAction(afterAttack, {
      type: 'DeclareBlock',
      playerId: P1,
      blockerId: makeCardId('attacker'),
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('ACTIVE_PLAYER_CANNOT_BLOCK');
  });

  it('retourne NO_ACTIVE_COMBAT s\'il n\'y a pas d\'attaque en cours', () => {
    const state  = buildCombatState(3000, 2000);
    const result = applyAction(state, {
      type: 'DeclareBlock',
      playerId: P2,
      blockerId: makeCardId('target'),
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_ACTIVE_COMBAT');
  });
});

// ─── ResolveCombat ────────────────────────────────────────────────────────────

describe('ResolveCombat — attaque non bloquée sur Character', () => {
  it('KO le défenseur si power attaquant > power défenseur', () => {
    const state = buildCombatState(3000, 2000);
    const afterAttack = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: makeCardId('attacker'),
      targetId: makeCardId('target'),
    });
    if (isGameError(afterAttack)) throw new Error();

    const result = applyAction(afterAttack, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[makeCardId('target')]!.zone).toBe('trash');
      expect(result.players[P2]!.board).not.toContain(makeCardId('target'));
      expect(result.players[P2]!.trash).toContain(makeCardId('target'));
      expect(result.activeCombat).toBeNull();
    }
  });

  it('ne fait rien si power attaquant <= power défenseur', () => {
    const state = buildCombatState(2000, 3000);
    const afterAttack = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: makeCardId('attacker'),
      targetId: makeCardId('target'),
    });
    if (isGameError(afterAttack)) throw new Error();

    const result = applyAction(afterAttack, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[makeCardId('target')]!.zone).toBe('board');
      expect(result.activeCombat).toBeNull();
    }
  });
});

describe('ResolveCombat — attaque non bloquée sur Leader', () => {
  it('révèle la carte du dessus de Life et la met en main du défenseur', () => {
    const base     = bootstrapGame();
    const leaderId = base.players[P2]!.leader!;
    const p2Life   = base.players[P2]!.life;

    const attackerId = makeCardId('attacker');
    const attacker   = makeChar('attacker', 'p1', 5000);
    const s: GameState = {
      ...base,
      cards: { ...base.cards, [attackerId]: attacker },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attackerId] },
      },
    };

    const afterAttack = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId,
      targetId: leaderId,
    });
    if (isGameError(afterAttack)) throw new Error(`DeclareAttack failed: ${afterAttack.message}`);

    const result = applyAction(afterAttack, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P2]!.life.length).toBe(p2Life.length - 1);
      // Revealed card went to hand
      const revealedId = p2Life[0]!;
      expect(result.cards[revealedId]!.zone).toBe('hand');
      expect(result.players[P2]!.hand).toContain(revealedId);
      expect(result.winner).toBeNull(); // game not over yet
    }
  });

  it('détermine un vainqueur quand le Life est vide au moment de l\'attaque', () => {
    const base     = bootstrapGame();
    const leaderId = base.players[P2]!.leader!;

    const attackerId = makeCardId('attacker');
    const attacker   = makeChar('attacker', 'p1', 5000);
    // P2 has no life cards
    const s: GameState = {
      ...base,
      cards: { ...base.cards, [attackerId]: attacker },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attackerId] },
        [P2]: { ...base.players[P2]!, life: [] },
      },
    };

    const afterAttack = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId,
      targetId: leaderId,
    });
    if (isGameError(afterAttack)) throw new Error();

    const result = applyAction(afterAttack, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.winner).toBe(P1);
      expect(checkVictoryCondition(result)).toBe(P1);
    }
  });
});

describe('ResolveCombat — attaque bloquée', () => {
  function setupBlockedCombat(
    attackerPower: number,
    blockerPower: number,
  ): GameState {
    const base      = buildCombatState(attackerPower, 2000); // target power doesn't matter
    const attackerId = makeCardId('attacker');
    const blockerId  = makeCardId('blocker');
    const targetId   = makeCardId('target');
    const blocker    = makeChar('blocker', 'p2', blockerPower, { keywords: ['Blocker'] });

    const s: GameState = {
      ...base,
      cards: { ...base.cards, [blockerId]: blocker },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, blockerId] },
      },
    };

    const afterAttack = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId,
      targetId,
    });
    if (isGameError(afterAttack)) throw new Error(`DeclareAttack failed: ${afterAttack.message}`);

    const afterBlock = applyAction(afterAttack, {
      type: 'DeclareBlock',
      playerId: P2,
      blockerId,
    });
    if (isGameError(afterBlock)) throw new Error(`DeclareBlock failed: ${afterBlock.message}`);

    return afterBlock;
  }

  it('KO le blocker si power attaquant >= power blocker', () => {
    const state  = setupBlockedCombat(4000, 3000);
    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[makeCardId('blocker')]!.zone).toBe('trash');
      expect(result.players[P2]!.trash).toContain(makeCardId('blocker'));
      expect(result.activeCombat).toBeNull();
    }
  });

  it('KO l\'attaquant si power attaquant < power blocker', () => {
    const state  = setupBlockedCombat(2000, 4000);
    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[makeCardId('attacker')]!.zone).toBe('trash');
      expect(result.players[P1]!.trash).toContain(makeCardId('attacker'));
      expect(result.activeCombat).toBeNull();
    }
  });

  it('les DON attachés retournent en donArea quand leur porteur est KO', () => {
    const base       = buildCombatState(4000, 2000);
    const attackerId = makeCardId('attacker');
    const donId      = makeCardId('extra-don');
    const don        = makeDon('extra-don', 'p1', 'attacker');

    const s: GameState = {
      ...base,
      cards: { ...base.cards, [donId]: don },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, donArea: [...base.players[P1]!.donArea, donId] },
      },
    };

    // Use a blocker with higher power to KO the attacker
    const blockerId = makeCardId('strong-blocker');
    const blocker   = makeChar('strong-blocker', 'p2', 8000, { keywords: ['Blocker'] });
    const s2: GameState = {
      ...s,
      cards: { ...s.cards, [blockerId]: blocker },
      players: {
        ...s.players,
        [P2]: { ...s.players[P2]!, board: [...s.players[P2]!.board, blockerId] },
      },
    };

    const afterAttack = applyAction(s2, {
      type: 'DeclareAttack', playerId: P1, attackerId, targetId: makeCardId('target'),
    });
    if (isGameError(afterAttack)) throw new Error();

    const afterBlock = applyAction(afterAttack, {
      type: 'DeclareBlock', playerId: P2, blockerId,
    });
    if (isGameError(afterBlock)) throw new Error();

    const result = applyAction(afterBlock, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // Attacker KO'd, its DON detached
      expect(result.cards[donId]!.attachedTo).toBeNull();
    }
  });
});

// ─── checkVictoryCondition ────────────────────────────────────────────────────

describe('checkVictoryCondition', () => {
  it('retourne null si la partie est en cours', () => {
    const state = bootstrapGame();
    expect(checkVictoryCondition(state)).toBeNull();
  });

  it('retourne le vainqueur si winner est défini dans le state', () => {
    const state: GameState = { ...bootstrapGame(), winner: P1 };
    expect(checkVictoryCondition(state)).toBe(P1);
  });
});
