/**
 * ST09 Integration Tests — StartOfOpponentTurn conditional effects.
 *
 * Cards under test:
 *   ST09-001 — Leader: if HasAttachedDon:1 AND LifeCount ≤2, gain +1000 until end of opponent's turn
 *   ST09-004 — Kaido: if HasAttachedDon:1 AND LifeCount ≤2, gain CannotBeKOdInBattle until end of turn
 *
 * All tests use applyAction() exclusively (public API only).
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

const P1 = makePlayerId('s09-p1');
const P2 = makePlayerId('s09-p2');

// ─── Card factories ────────────────────────────────────────────────────────────

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 3,
    power,
    color: 'Yellow',
    type: 'Character',
    zone: 'board',
    ownerId: owner,
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makeDon(id: string, owner: PlayerId, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: 'DON!!',
    cost: 0,
    power: 0,
    color: 'Red',
    type: 'DON',
    zone: 'donArea',
    ownerId: owner,
    tapped: false,
    attachedTo: null,
    ...opts,
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

// ─── Bootstrap ─────────────────────────────────────────────────────────────────

function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, { type: 'StartGame', player1: makePlayerSetup(P1), player2: makePlayerSetup(P2), firstPlayerId: P1 });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  return s as GameState;
}

function addToBoard(state: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: { ...state.players, [owner]: { ...state.players[owner]!, board: [...state.players[owner]!.board, card.id] } },
  };
}

// ─── DSL effect stubs ──────────────────────────────────────────────────────────

// ST09-001: at start of opponent's turn, if DON attached and life ≤2 → leader +1000
const st09001Effect: CardEffect = {
  trigger: 'StartOfOpponentTurn',
  condition: {
    type: 'And',
    conditions: [
      { type: 'HasAttachedDon', count: 1 },
      { type: 'LifeCount', max: 2 },
    ],
  } as never,
  actions: [{ type: 'PowerBoost', amount: 1000, target: { scope: 'OwnLeader' }, duration: 'EndOfOpponentTurn' } as never],
};

// ST09-004: at start of opponent's turn, if DON attached and life ≤2 → CannotBeKOdInBattle
const st09004Effect: CardEffect = {
  trigger: 'StartOfOpponentTurn',
  condition: {
    type: 'And',
    conditions: [
      { type: 'HasAttachedDon', count: 1 },
      { type: 'LifeCount', max: 2 },
    ],
  } as never,
  actions: [{ type: 'GiveKeyword', keyword: 'CannotBeKOdInBattle', target: { scope: 'Self' }, duration: 'EndOfTurn' } as never],
};

// ─── Helper: trigger P1's turn start via P2 EndPhase ──────────────────────────

/**
 * Puts the state at P2's End phase and calls EndPhase.
 * This triggers applyRefresh(P1), which fires StartOfOpponentTurn for P2's cards.
 */
function triggerP1TurnStart(state: GameState): GameState {
  const s = { ...state, phase: 'End' as const, activePlayerId: P2, turnNumber: 4 };
  const result = applyAction(s, { type: 'EndPhase', playerId: P2 });
  if (isGameError(result)) throw new Error(result.message);
  return result as GameState;
}

// ─── ST09-001 tests ────────────────────────────────────────────────────────────

describe('ST09 integration — ST09-001 : Leader +1000 at StartOfOpponentTurn', () => {

  it('S1 — conditions met: DON attached to leader AND life ≤2 → leader gains +1000 powerModifierOT', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P2]!.leader!;

    // Inject ST09-001 effect onto P2's leader
    s = {
      ...s,
      cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [st09001Effect] } },
    };

    // Attach 1 DON to P2's leader
    const don = makeDon('s1-don', P2, { attachedTo: leaderId });
    s = {
      ...s,
      cards: { ...s.cards, [don.id]: don },
      players: { ...s.players, [P2]: { ...s.players[P2]!, donArea: [...s.players[P2]!.donArea, don.id] } },
    };

    // Trim P2's life to exactly 2 cards
    const p2Life = s.players[P2]!.life.slice(0, 2) as CardId[];
    s = { ...s, players: { ...s.players, [P2]: { ...s.players[P2]!, life: p2Life } } };

    // Trigger P1's turn start → StartOfOpponentTurn fires for P2's cards
    const s2 = triggerP1TurnStart(s);

    const leaderPower = calculatePower(leaderId, s2);
    expect(leaderPower).toBeGreaterThanOrEqual(6000); // 5000 base + 1000 OT boost
  });

  it('S2 — conditions NOT met: no DON attached → leader stays at base power', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P2]!.leader!;

    s = {
      ...s,
      cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [st09001Effect] } },
    };

    // Life ≤2 but NO DON attached
    const p2Life = s.players[P2]!.life.slice(0, 2) as CardId[];
    s = { ...s, players: { ...s.players, [P2]: { ...s.players[P2]!, life: p2Life } } };

    const s2 = triggerP1TurnStart(s);

    const leaderPower = calculatePower(leaderId, s2);
    expect(leaderPower).toBe(5000); // no boost — condition not met
  });

  it('S3 — conditions NOT met: DON attached but life > 2 → leader stays at base power', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P2]!.leader!;

    s = {
      ...s,
      cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [st09001Effect] } },
    };

    // Attach 1 DON but keep life at 5 (default)
    const don = makeDon('s3-don', P2, { attachedTo: leaderId });
    s = {
      ...s,
      cards: { ...s.cards, [don.id]: don },
      players: { ...s.players, [P2]: { ...s.players[P2]!, donArea: [...s.players[P2]!.donArea, don.id] } },
    };

    // Ensure P2 has >2 life (default is 5)
    expect(s.players[P2]!.life.length).toBeGreaterThan(2);

    const s2 = triggerP1TurnStart(s);

    const leaderPower = calculatePower(leaderId, s2);
    expect(leaderPower).toBe(5000); // no boost — life count too high
  });

  it('S4 — boost is cleared when P2\'s own turn starts (EndOfOpponentTurn)', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P2]!.leader!;

    s = {
      ...s,
      cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [st09001Effect] } },
    };

    const don = makeDon('s4-don', P2, { attachedTo: leaderId });
    s = {
      ...s,
      cards: { ...s.cards, [don.id]: don },
      players: { ...s.players, [P2]: { ...s.players[P2]!, donArea: [...s.players[P2]!.donArea, don.id] } },
    };

    const p2Life = s.players[P2]!.life.slice(0, 2) as CardId[];
    s = { ...s, players: { ...s.players, [P2]: { ...s.players[P2]!, life: p2Life } } };

    // P1's turn starts → P2's leader gets +1000
    const s2 = triggerP1TurnStart(s);
    expect(calculatePower(leaderId, s2)).toBeGreaterThanOrEqual(6000);

    // Now trigger P2's turn start (P1's End phase → P2's Refresh)
    const s3 = applyAction({ ...s2, phase: 'End' as const, activePlayerId: P1, turnNumber: 5 }, { type: 'EndPhase', playerId: P1 }) as GameState;
    if (isGameError(s3)) throw new Error((s3 as { message: string }).message);

    // clearOppTurnModifiers(P2) clears powerModifierOT from P2's cards
    const leaderPowerAfter = calculatePower(leaderId, s3);
    expect(leaderPowerAfter).toBe(5000); // OT boost cleared
  });
});

// ─── ST09-004 tests ────────────────────────────────────────────────────────────

describe('ST09 integration — ST09-004 Kaido : CannotBeKOdInBattle at StartOfOpponentTurn', () => {

  it('K1 — conditions met: Kaido has DON + P2 life ≤2 → CannotBeKOdInBattle gained', () => {
    let s = bootstrapGame();

    const kaido = makeChar('k1-kaido', P2, 5000, { cost: 4, name: 'Kaido', effects: [st09004Effect] });
    s = addToBoard(s, kaido, P2);

    // Attach 1 DON to Kaido
    const don = makeDon('k1-don', P2, { attachedTo: kaido.id });
    s = {
      ...s,
      cards: { ...s.cards, [don.id]: don },
      players: { ...s.players, [P2]: { ...s.players[P2]!, donArea: [...s.players[P2]!.donArea, don.id] } },
    };

    const p2Life = s.players[P2]!.life.slice(0, 2) as CardId[];
    s = { ...s, players: { ...s.players, [P2]: { ...s.players[P2]!, life: p2Life } } };

    const s2 = triggerP1TurnStart(s);

    // Kaido should have CannotBeKOdInBattle in temporaryKeywords
    const kaidoCard = s2.cards[kaido.id]!;
    const hasKw = (kaidoCard.temporaryKeywords ?? []).includes('CannotBeKOdInBattle');
    expect(hasKw).toBe(true);
  });

  it('K2 — conditions NOT met: no DON attached → Kaido does NOT get CannotBeKOdInBattle', () => {
    let s = bootstrapGame();

    const kaido = makeChar('k2-kaido', P2, 5000, { cost: 4, name: 'Kaido', effects: [st09004Effect] });
    s = addToBoard(s, kaido, P2);

    const p2Life = s.players[P2]!.life.slice(0, 2) as CardId[];
    s = { ...s, players: { ...s.players, [P2]: { ...s.players[P2]!, life: p2Life } } };

    const s2 = triggerP1TurnStart(s);

    const kaidoCard = s2.cards[kaido.id]!;
    const hasKw = (kaidoCard.temporaryKeywords ?? []).includes('CannotBeKOdInBattle');
    expect(hasKw).toBe(false);
  });

  it('K3 — Kaido with CannotBeKOdInBattle survives combat vs higher-power attacker', () => {
    let s = bootstrapGame();

    // Kaido must be tapped to be a valid attack target
    const kaido = makeChar('k3-kaido', P2, 5000, { cost: 4, name: 'Kaido', tapped: true, effects: [st09004Effect] });
    s = addToBoard(s, kaido, P2);

    const don = makeDon('k3-don', P2, { attachedTo: kaido.id });
    s = {
      ...s,
      cards: { ...s.cards, [don.id]: don },
      players: { ...s.players, [P2]: { ...s.players[P2]!, donArea: [...s.players[P2]!.donArea, don.id] } },
    };

    const p2Life = s.players[P2]!.life.slice(0, 2) as CardId[];
    s = { ...s, players: { ...s.players, [P2]: { ...s.players[P2]!, life: p2Life } } };

    // P1's turn starts → Kaido gets CannotBeKOdInBattle
    let s2 = triggerP1TurnStart(s);
    expect((s2.cards[kaido.id]!.temporaryKeywords ?? []).includes('CannotBeKOdInBattle')).toBe(true);

    // Advance to Main phase so attacks are allowed
    s2 = { ...s2, phase: 'Main' as const };

    // P1 attacks Kaido with a 10000-power attacker
    const p1Atk = makeChar('k3-atk', P1, 10000);
    s2 = addToBoard(s2, p1Atk, P1);

    s2 = applyAction(s2, { type: 'DeclareAttack', playerId: P1, attackerId: p1Atk.id, targetId: kaido.id }) as GameState;
    expect(isGameError(s2)).toBe(false);

    s2 = applyAction(s2, { type: 'ResolveCombat', playerId: P1 }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // Kaido must still be on P2's board (CannotBeKOdInBattle protects it)
    expect(s2.players[P2]!.board).toContain(kaido.id);
    expect(s2.players[P2]!.trash ?? []).not.toContain(kaido.id);
  });

  it('K4 — CannotBeKOdInBattle cleared after end of turn (clearTemporaryKeywords)', () => {
    let s = bootstrapGame();

    const kaido = makeChar('k4-kaido', P2, 5000, { cost: 4, name: 'Kaido', effects: [st09004Effect] });
    s = addToBoard(s, kaido, P2);

    const don = makeDon('k4-don', P2, { attachedTo: kaido.id });
    s = {
      ...s,
      cards: { ...s.cards, [don.id]: don },
      players: { ...s.players, [P2]: { ...s.players[P2]!, donArea: [...s.players[P2]!.donArea, don.id] } },
    };

    const p2Life = s.players[P2]!.life.slice(0, 2) as CardId[];
    s = { ...s, players: { ...s.players, [P2]: { ...s.players[P2]!, life: p2Life } } };

    // P1's turn starts → Kaido has CannotBeKOdInBattle
    const s2 = triggerP1TurnStart(s);
    expect((s2.cards[kaido.id]!.temporaryKeywords ?? []).includes('CannotBeKOdInBattle')).toBe(true);

    // P1's turn ends → clearTemporaryKeywords removes CannotBeKOdInBattle
    const s3 = applyAction({ ...s2, phase: 'End' as const, activePlayerId: P1, turnNumber: 5 }, { type: 'EndPhase', playerId: P1 }) as GameState;
    if (isGameError(s3)) throw new Error((s3 as { message: string }).message);

    const hasKw = (s3.cards[kaido.id]?.temporaryKeywords ?? []).includes('CannotBeKOdInBattle');
    expect(hasKw).toBe(false);
  });
});
