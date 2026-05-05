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
    deckCards: Array.from({ length: 50 }, (_, i) =>
      makeChar(`${idStr}-deck-${i}`, idStr, 2000, { zone: 'deck' })
    ),
    donCards: Array.from({ length: 10 }, (_, i) =>
      makeDon(`${idStr}-don-${i}`, idStr) as Card
    ),
  };
}

/** Bootstrap a full game in Main phase (mulligans resolved so life cards are placed) */
function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let result = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId: P1,
  });
  if (isGameError(result)) throw new Error(`StartGame failed: ${result.message}`);

  result = applyAction(result, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(result)) throw new Error(`Mulligan P1 failed: ${result.message}`);

  result = applyAction(result, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(result)) throw new Error(`Mulligan P2 failed: ${result.message}`);

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
  const target     = makeChar('target', 'p2', targetPower, { tapped: true });

  return {
    ...base,
    turnNumber: 3, // bypass first-turn restriction (only turn 1 / P1's first turn bans attacks)
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
      expect(result.activeCombat).toEqual({ attackerId, targetId, blockerId: null, counterPower: 0 });
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

  it('retourne TARGET_NOT_RESTED si le personnage cible est actif (non reposé)', () => {
    const state = buildCombatState(3000, 2000);
    const targetId = makeCardId('target');
    const s = {
      ...state,
      cards: { ...state.cards, [targetId]: { ...state.cards[targetId]!, tapped: false } },
    };
    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: makeCardId('attacker'),
      targetId,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('TARGET_NOT_RESTED');
  });

  it('peut attaquer le leader adverse même s\'il n\'est pas reposé', () => {
    const state = buildCombatState(3000, 2000);
    const leaderId = state.players[P2]!.leader!;
    const s = {
      ...state,
      cards: { ...state.cards, [leaderId]: { ...state.cards[leaderId]!, tapped: false } },
    };
    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: makeCardId('attacker'),
      targetId: leaderId,
    });
    expect(isGameError(result)).toBe(false);
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
      turnNumber: 3,
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
      turnNumber: 3,
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

  it('attaquant survit si power attaquant < power blocker (attaque repoussée, personne KO)', () => {
    // OP TCG rule: only the blocker can be KO'd; attacker is never KO'd by blocking
    const state  = setupBlockedCombat(2000, 4000);
    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // Attacker survives — attack was repelled
      expect(result.cards[makeCardId('attacker')]!.zone).toBe('board');
      // Blocker also survives (attacker was weaker)
      expect(result.cards[makeCardId('blocker')]!.zone).toBe('board');
      expect(result.activeCombat).toBeNull();
    }
  });

  it('les DON attachés retournent en donArea quand leur porteur (blocker) est KO', () => {
    // Attacker wins (stronger) → blocker is KO'd → DON on the blocker detach
    const base       = buildCombatState(4000, 2000);
    const attackerId = makeCardId('attacker');

    // Add a DON attached to the blocker
    const donId  = makeCardId('extra-don');
    const blockerId = makeCardId('weak-blocker');
    const blockerChar = makeChar('weak-blocker', 'p2', 1000, { keywords: ['Blocker'] });
    const don = {
      id: donId,
      name: 'DON!!',
      cost: 0, power: 0, color: 'Red' as const,
      type: 'DON' as const,
      zone: 'donArea' as const,
      ownerId: P2,
      tapped: false,
      attachedTo: blockerId,
    };

    const s: GameState = {
      ...base,
      cards: { ...base.cards, [donId]: don, [blockerId]: blockerChar },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, blockerId], donArea: [...base.players[P2]!.donArea, donId] },
      },
    };

    const afterAttack = applyAction(s, {
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
      // Blocker KO'd (attacker 4000 >= blocker 1000)
      expect(result.cards[blockerId]!.zone).toBe('trash');
      // Attacker survives
      expect(result.cards[attackerId]!.zone).toBe('board');
      // DON on blocker detached
      expect(result.cards[donId]!.attachedTo).toBeNull();
    }
  });
});

// ─── PlayCounter ─────────────────────────────────────────────────────────────

describe('PlayCounter', () => {
  function setupAttack(): { state: GameState; counterCardId: ReturnType<typeof makeCardId> } {
    const base = buildCombatState(3000, 5000); // attacker weaker than target
    const attackerId = makeCardId('attacker');
    const targetId   = makeCardId('target');
    const counterCardId = makeCardId('counter-card');
    const counterCard   = makeChar('counter-card', 'p2', 1000, { zone: 'hand', counter: 2000 });

    const s: GameState = {
      ...base,
      cards: { ...base.cards, [counterCardId]: counterCard },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, hand: [...base.players[P2]!.hand, counterCardId] },
      },
    };

    const afterAttack = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId,
      targetId,
    });
    if (isGameError(afterAttack)) throw new Error(`DeclareAttack failed: ${afterAttack.message}`);

    return { state: afterAttack, counterCardId };
  }

  it('ajoute la valeur de contre au counterPower du combat', () => {
    const { state, counterCardId } = setupAttack();
    const result = applyAction(state, { type: 'PlayCounter', playerId: P2, cardId: counterCardId });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activeCombat!.counterPower).toBe(2000);
    }
  });

  it('la carte contre va dans la trash du défenseur', () => {
    const { state, counterCardId } = setupAttack();
    const result = applyAction(state, { type: 'PlayCounter', playerId: P2, cardId: counterCardId });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[counterCardId]!.zone).toBe('trash');
      expect(result.players[P2]!.hand).not.toContain(counterCardId);
      expect(result.players[P2]!.trash).toContain(counterCardId);
    }
  });

  it('plusieurs contres s\'accumulent dans counterPower', () => {
    const { state, counterCardId } = setupAttack();

    const c2Id = makeCardId('counter-2');
    const c2   = makeChar('counter-2', 'p2', 1000, { zone: 'hand', counter: 1000 });
    const s2: GameState = {
      ...state,
      cards: { ...state.cards, [c2Id]: c2 },
      players: {
        ...state.players,
        [P2]: { ...state.players[P2]!, hand: [...state.players[P2]!.hand, c2Id] },
      },
    };

    let result = applyAction(s2, { type: 'PlayCounter', playerId: P2, cardId: counterCardId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'PlayCounter', playerId: P2, cardId: c2Id });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activeCombat!.counterPower).toBe(3000); // 2000 + 1000
    }
  });

  it('le contre sauve la cible si attaquant power < cible + contre', () => {
    // attacker 3000 vs target 5000 + counter 2000 = 7000 → no KO
    const { state, counterCardId } = setupAttack();
    const afterCounter = applyAction(state, { type: 'PlayCounter', playerId: P2, cardId: counterCardId });
    expect(isGameError(afterCounter)).toBe(false);
    if (isGameError(afterCounter)) return;

    const result = applyAction(afterCounter, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[makeCardId('target')]!.zone).toBe('board'); // not KO'd
    }
  });

  it('le contre insuffisant ne sauve pas la cible', () => {
    // attacker 6000 vs target 5000 + counter 0 = 5000 → KO (6000 >= 5000)
    const base = buildCombatState(6000, 5000);
    const attackerId = makeCardId('attacker');
    const targetId   = makeCardId('target');
    const afterAttack = applyAction(base, {
      type: 'DeclareAttack', playerId: P1, attackerId, targetId,
    });
    if (isGameError(afterAttack)) throw new Error();

    const result = applyAction(afterAttack, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[makeCardId('target')]!.zone).toBe('trash'); // KO'd
    }
  });

  it('le contre sauve le leader contre une attaque égale', () => {
    const base     = bootstrapGame();
    const leaderId = base.players[P2]!.leader!;
    const leader   = base.cards[leaderId]!;
    const leaderPower = leader.power; // e.g. 5000

    const attackerId = makeCardId('attacker');
    const attacker   = makeChar('attacker', 'p1', leaderPower); // equal power → would normally deal damage
    const counterCardId = makeCardId('ctr');
    const counterCard   = makeChar('ctr', 'p2', 0, { zone: 'hand', counter: 1000 });

    const s: GameState = {
      ...base,
      turnNumber: 3,
      cards: { ...base.cards, [attackerId]: attacker, [counterCardId]: counterCard },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attackerId] },
        [P2]: { ...base.players[P2]!, hand: [...base.players[P2]!.hand, counterCardId] },
      },
    };

    const afterAttack = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId, targetId: leaderId });
    if (isGameError(afterAttack)) throw new Error(`DeclareAttack failed: ${afterAttack.message}`);

    // Play counter: leaderPower (5000) + 1000 counter > attacker (5000) → attack fails
    const afterCounter = applyAction(afterAttack, { type: 'PlayCounter', playerId: P2, cardId: counterCardId });
    expect(isGameError(afterCounter)).toBe(false);
    if (isGameError(afterCounter)) return;

    const lifeBefore = afterCounter.players[P2]!.life.length;
    const result = applyAction(afterCounter, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P2]!.life.length).toBe(lifeBefore); // no damage taken
    }
  });

  it('le contre n\'affecte PAS le blocker — seul attaquant vs blocker compte', () => {
    // Rule: counter adds to the original TARGET power, not the blocker.
    // When blocked, attacker (5000) vs blocker (3000) — counter (3000) is irrelevant.
    // 5000 >= 3000 → blocker KO'd, attacker survives (counter did not help).
    const base      = buildCombatState(5000, 2000);
    const attackerId = makeCardId('attacker');
    const targetId   = makeCardId('target');
    const blockerId  = makeCardId('blocker');
    const blocker    = makeChar('blocker', 'p2', 3000, { keywords: ['Blocker'] });
    const counterCardId = makeCardId('ctr-b');
    const counterCard   = makeChar('ctr-b', 'p2', 0, { zone: 'hand', counter: 3000 });

    const s: GameState = {
      ...base,
      cards: { ...base.cards, [blockerId]: blocker, [counterCardId]: counterCard },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, blockerId], hand: [...base.players[P2]!.hand, counterCardId] },
      },
    };

    const afterAttack = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId, targetId });
    if (isGameError(afterAttack)) throw new Error();

    const afterCounter = applyAction(afterAttack, { type: 'PlayCounter', playerId: P2, cardId: counterCardId });
    expect(isGameError(afterCounter)).toBe(false);
    if (isGameError(afterCounter)) return;

    const afterBlock = applyAction(afterCounter, { type: 'DeclareBlock', playerId: P2, blockerId });
    if (isGameError(afterBlock)) throw new Error();

    // attacker 5000 vs blocker 3000 (counter ignored) → blocker KO'd, attacker survives
    const result = applyAction(afterBlock, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[blockerId]!.zone).toBe('trash'); // blocker KO'd (no counter bonus)
      expect(result.cards[attackerId]!.zone).toBe('board'); // attacker survives
    }
  });

  it('NO_ACTIVE_COMBAT si aucune attaque en cours', () => {
    const state = buildCombatState(3000, 2000);
    const result = applyAction(state, { type: 'PlayCounter', playerId: P2, cardId: makeCardId('any') });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_ACTIVE_COMBAT');
  });

  it("ACTIVE_PLAYER_CANNOT_COUNTER si c'est l'attaquant qui joue un contre", () => {
    const { state, counterCardId } = setupAttack();
    const result = applyAction(state, { type: 'PlayCounter', playerId: P1, cardId: counterCardId });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('ACTIVE_PLAYER_CANNOT_COUNTER');
  });

  it('CARD_NOT_IN_HAND si la carte n\'est pas en main', () => {
    const { state } = setupAttack();
    const result = applyAction(state, { type: 'PlayCounter', playerId: P2, cardId: makeCardId('ghost') });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('CARD_NOT_IN_HAND');
  });

  it('NO_COUNTER_VALUE si la carte n\'a pas de valeur de contre', () => {
    const { state } = setupAttack();

    const noCounterId = makeCardId('no-ctr');
    const noCounter   = makeChar('no-ctr', 'p2', 2000, { zone: 'hand' }); // no counter field

    const s: GameState = {
      ...state,
      cards: { ...state.cards, [noCounterId]: noCounter },
      players: {
        ...state.players,
        [P2]: { ...state.players[P2]!, hand: [...state.players[P2]!.hand, noCounterId] },
      },
    };

    const result = applyAction(s, { type: 'PlayCounter', playerId: P2, cardId: noCounterId });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_COUNTER_VALUE');
  });
});

// ─── First-turn attack restriction ───────────────────────────────────────────

describe('DeclareAttack — restriction premier tour', () => {
  it('NO_ATTACK_FIRST_TURN à turnNumber === 1 (premier joueur)', () => {
    const state = { ...buildCombatState(3000, 2000), turnNumber: 1 };
    const result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: makeCardId('attacker'),
      targetId: makeCardId('target'),
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_ATTACK_FIRST_TURN');
  });

  it('turnNumber === 2 (premier tour J2) — peut attaquer (OPTCG : seul J1 est bloqué au tour 1)', () => {
    const base = bootstrapGame();
    // Build state with P2 active, turnNumber 2, with an untapped attacker for P2
    const p2Attacker = makeChar('p2-attacker', 'p2', 3000); // untapped by default
    const p1Target   = makeChar('p1-target',   'p1', 1000, { tapped: true });
    let state: GameState = {
      ...base,
      turnNumber: 2,
      activePlayerId: P2,
      phase: 'Main',
      cards: { ...base.cards, [p2Attacker.id]: p2Attacker, [p1Target.id]: p1Target },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, p2Attacker.id] },
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, p1Target.id] },
      },
    };
    const result = applyAction(state, {
      type: 'DeclareAttack', playerId: P2, attackerId: p2Attacker.id, targetId: p1Target.id,
    });
    // P2 can attack on their first turn — only P1's turn 1 is banned
    expect(isGameError(result)).toBe(false);
  });

  it('autorise l\'attaque à turnNumber === 3 (dès le 3e tour)', () => {
    const state = buildCombatState(3000, 2000); // already has turnNumber: 3
    const result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: makeCardId('attacker'),
      targetId: makeCardId('target'),
    });
    expect(isGameError(result)).toBe(false);
  });
});

// ─── Counter vs blocker (règle) ───────────────────────────────────────────────

describe('Contre et blocker — règle d\'application', () => {
  it('contre joué + blocker : le blocker affronte l\'attaquant sans bonus', () => {
    // attacker 3000 vs blocker 2000, counter 5000 joué → counter ignoré en combat bloqué
    // 3000 >= 2000 → blocker KO'd
    const base = buildCombatState(3000, 4000); // target power irrelevant
    const attackerId = makeCardId('attacker');
    const targetId   = makeCardId('target');
    const blockerId  = makeCardId('bl2');
    const blocker    = makeChar('bl2', 'p2', 2000, { keywords: ['Blocker'] });
    const ctrId      = makeCardId('ctr2');
    const ctr        = makeChar('ctr2', 'p2', 0, { zone: 'hand', counter: 5000 });

    const s: GameState = {
      ...base,
      cards: { ...base.cards, [blockerId]: blocker, [ctrId]: ctr },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, blockerId], hand: [...base.players[P2]!.hand, ctrId] },
      },
    };

    const afterAttack  = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId, targetId });
    if (isGameError(afterAttack)) throw new Error('DeclareAttack failed');
    const afterCounter = applyAction(afterAttack, { type: 'PlayCounter', playerId: P2, cardId: ctrId });
    if (isGameError(afterCounter)) throw new Error('PlayCounter failed');
    const afterBlock   = applyAction(afterCounter, { type: 'DeclareBlock', playerId: P2, blockerId });
    if (isGameError(afterBlock)) throw new Error('DeclareBlock failed');

    const result = applyAction(afterBlock, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // attacker 3000 >= blocker 2000 (no counter bonus) → blocker KO'd
      expect(result.cards[blockerId]!.zone).toBe('trash');
      expect(result.cards[attackerId]!.zone).toBe('board');
    }
  });

  it('contre non-bloqué : sauve la cible si cible + contre > attaquant', () => {
    // attacker 3000 vs target 2000 + counter 2000 = 4000 → attacker fails (3000 < 4000)
    const base = buildCombatState(3000, 2000);
    const attackerId = makeCardId('attacker');
    const targetId   = makeCardId('target');
    const ctrId      = makeCardId('ctr3');
    const ctr        = makeChar('ctr3', 'p2', 0, { zone: 'hand', counter: 2000 });

    const s: GameState = {
      ...base,
      cards: { ...base.cards, [ctrId]: ctr },
      players: { ...base.players, [P2]: { ...base.players[P2]!, hand: [...base.players[P2]!.hand, ctrId] } },
    };

    const afterAttack  = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId, targetId });
    if (isGameError(afterAttack)) throw new Error();
    const afterCounter = applyAction(afterAttack, { type: 'PlayCounter', playerId: P2, cardId: ctrId });
    if (isGameError(afterCounter)) throw new Error();

    const result = applyAction(afterCounter, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[targetId]!.zone).toBe('board'); // target survives
    }
  });

  it('contre non-bloqué : ne sauve pas si cible + contre === attaquant (égalité = attaquant gagne)', () => {
    // attacker 4000 vs target 2000 + counter 2000 = 4000 → 4000 >= 4000 → target KO'd
    const base = buildCombatState(4000, 2000);
    const attackerId = makeCardId('attacker');
    const targetId   = makeCardId('target');
    const ctrId      = makeCardId('ctr4');
    const ctr        = makeChar('ctr4', 'p2', 0, { zone: 'hand', counter: 2000 });

    const s: GameState = {
      ...base,
      cards: { ...base.cards, [ctrId]: ctr },
      players: { ...base.players, [P2]: { ...base.players[P2]!, hand: [...base.players[P2]!.hand, ctrId] } },
    };

    const afterAttack  = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId, targetId });
    if (isGameError(afterAttack)) throw new Error();
    const afterCounter = applyAction(afterAttack, { type: 'PlayCounter', playerId: P2, cardId: ctrId });
    if (isGameError(afterCounter)) throw new Error();

    const result = applyAction(afterCounter, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[targetId]!.zone).toBe('trash'); // target KO'd (tie goes to attacker)
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

// ─── Summon sickness ──────────────────────────────────────────────────────────

describe('Summon sickness', () => {
  /** Advance to the active player's Main phase at turn 3+ so attacks are normally allowed */
  function advanceToMainTurn3(): GameState {
    let s = bootstrapGame();
    // Force to turn 3 Main so turnNumber > 2 restriction is cleared
    s = { ...s, turnNumber: 3, phase: 'Main', activePlayerId: P1 };
    return s;
  }

  it('un personnage posé ce tour ne peut pas attaquer sans Rush', () => {
    const base = advanceToMainTurn3();
    const target = makeChar('target', 'p2', 1000, { zone: 'board' });
    const p2 = base.players[P2]!;
    let s: GameState = {
      ...base,
      cards: { ...base.cards, [target.id]: target },
      players: { ...base.players, [P2]: { ...p2, board: [...p2.board, target.id] } },
    };

    // Play a character (cost 0, no Rush)
    const newChar = makeChar('new-char', 'p1', 2000, { zone: 'hand', cost: 0 });
    const p1 = s.players[P1]!;
    s = {
      ...s,
      cards: { ...s.cards, [newChar.id]: newChar },
      players: { ...s.players, [P1]: { ...p1, hand: [...p1.hand, newChar.id] } },
    };
    const afterPlay = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: newChar.id });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;

    // Immediately try to attack → summon sickness
    const result = applyAction(afterPlay, { type: 'DeclareAttack', playerId: P1, attackerId: newChar.id, targetId: target.id });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('SUMMON_SICKNESS');
  });

  it('un personnage posé ce tour avec Rush peut attaquer immédiatement', () => {
    const base = advanceToMainTurn3();
    const target = makeChar('target2', 'p2', 1000, { zone: 'board', tapped: true });
    const p2 = base.players[P2]!;
    let s: GameState = {
      ...base,
      cards: { ...base.cards, [target.id]: target },
      players: { ...base.players, [P2]: { ...p2, board: [...p2.board, target.id] } },
    };

    // Play a character with Rush
    const rushChar = makeChar('rush-char', 'p1', 2000, { zone: 'hand', cost: 0, keywords: ['Rush'] });
    const p1 = s.players[P1]!;
    s = {
      ...s,
      cards: { ...s.cards, [rushChar.id]: rushChar },
      players: { ...s.players, [P1]: { ...p1, hand: [...p1.hand, rushChar.id] } },
    };
    const afterPlay = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: rushChar.id });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;

    // Rush → can attack immediately
    const result = applyAction(afterPlay, { type: 'DeclareAttack', playerId: P1, attackerId: rushChar.id, targetId: target.id });
    expect(isGameError(result)).toBe(false);
  });

  it('un personnage posé au tour précédent peut attaquer normalement', () => {
    const base = advanceToMainTurn3();
    const target = makeChar('target3', 'p2', 1000, { zone: 'board', tapped: true });
    const p2 = base.players[P2]!;
    let s: GameState = {
      ...base,
      cards: { ...base.cards, [target.id]: target },
      players: { ...base.players, [P2]: { ...p2, board: [...p2.board, target.id] } },
    };

    // Inject the card directly into newBoardIds (as if played last turn) — but here we put it on the board
    // without going through PlayCharacterFromHand, so newBoardIds stays empty
    const oldChar = makeChar('old-char', 'p1', 2000, { zone: 'board' });
    const p1 = s.players[P1]!;
    s = {
      ...s,
      cards: { ...s.cards, [oldChar.id]: oldChar },
      players: { ...s.players, [P1]: { ...p1, board: [...p1.board, oldChar.id] } },
      // newBoardIds is empty → card was played a previous turn
    };

    const result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: oldChar.id, targetId: target.id });
    expect(isGameError(result)).toBe(false);
  });
});
