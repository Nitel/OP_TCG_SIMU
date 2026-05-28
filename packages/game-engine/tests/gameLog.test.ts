import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
} from '../src/index.js';
import type { Card, GameState, PlayerSetup, CardEffect } from '../src/index.js';

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

function makeDon(id: string, owner: string): Card {
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
    attachedTo: null,
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

function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let result = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId: P1,
  });
  if (isGameError(result)) throw new Error(`StartGame: ${result.message}`);
  result = applyAction(result, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(result)) throw new Error(`Mulligan P1: ${result.message}`);
  result = applyAction(result, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(result)) throw new Error(`Mulligan P2: ${result.message}`);
  return { ...result, phase: 'Main', turnNumber: 3 };
}

function logsBefore(state: GameState): number {
  return state.gameLog.length;
}

function newLogs(before: number, after: GameState) {
  return after.gameLog.slice(before);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GameLog', () => {
  // L1 — CARD_PLAYED emitted when a character is played from hand
  it('L1 — CARD_PLAYED emitted on PlayCharacterFromHand', () => {
    const base = bootstrapGame();
    const card = makeChar('log-char', 'p1', 3000, { zone: 'hand', cost: 0 });
    const state: GameState = {
      ...base,
      cards: { ...base.cards, [card.id]: card },
      players: { ...base.players, [P1]: { ...base.players[P1]!, hand: [...base.players[P1]!.hand, card.id] } },
    };

    const before = logsBefore(state);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const logs = newLogs(before, result);
    const played = logs.find((e) => e.event === 'CARD_PLAYED');
    expect(played).toBeDefined();
    expect(played?.cardName).toBe('log-char');
    expect(played?.playerId).toBe(P1);
    expect(played?.turn).toBe(3);
  });

  // L2 — ATTACK_DECLARED emitted on DeclareAttack
  it('L2 — ATTACK_DECLARED emitted on DeclareAttack', () => {
    const base = bootstrapGame();
    // P1 leader attacks P2 leader
    const p1Leader = base.players[P1]!.leader!;
    const p2Leader = base.players[P2]!.leader!;

    const before = logsBefore(base);
    const result = applyAction(base, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: p1Leader,
      targetId: p2Leader,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const logs = newLogs(before, result);
    const attackLog = logs.find((e) => e.event === 'ATTACK_DECLARED');
    expect(attackLog).toBeDefined();
    expect(attackLog?.playerId).toBe(P1);
    expect(attackLog?.cardId).toBe(p1Leader);
  });

  // L3 — COMBAT_RESOLVED + DAMAGE_DEALT emitted on ResolveCombat against leader
  it('L3 — COMBAT_RESOLVED and DAMAGE_DEALT emitted on ResolveCombat (leader damage)', () => {
    const base = bootstrapGame();
    const p1Leader = base.players[P1]!.leader!;
    const p2Leader = base.players[P2]!.leader!;

    let state = applyAction(base, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: p1Leader,
      targetId: p2Leader,
    });
    expect(isGameError(state)).toBe(false);
    if (isGameError(state)) return;

    const before = logsBefore(state);
    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const logs = newLogs(before, result);
    expect(logs.some((e) => e.event === 'COMBAT_RESOLVED')).toBe(true);
    expect(logs.some((e) => e.event === 'DAMAGE_DEALT')).toBe(true);

    const dmg = logs.find((e) => e.event === 'DAMAGE_DEALT');
    expect(dmg?.playerId).toBe(P2);
  });

  // L4 — ABILITY_ACTIVATED emitted on ActivatedAbility
  it('L4 — ABILITY_ACTIVATED emitted on ActivatedAbility', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'Activated',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const card = makeChar('activ-log', 'p1', 3000, { effects: [effect] });
    const state: GameState = {
      ...base,
      cards: { ...base.cards, [card.id]: card },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, card.id] },
      },
    };

    const before = logsBefore(state);
    const result = applyAction(state, { type: 'ActivatedAbility', playerId: P1, cardId: card.id });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const logs = newLogs(before, result);
    const activated = logs.find((e) => e.event === 'ABILITY_ACTIVATED');
    expect(activated).toBeDefined();
    expect(activated?.cardName).toBe('activ-log');
    expect(activated?.playerId).toBe(P1);
  });

  // L5 — TURN_ENDED emitted when the End phase concludes
  it('L5 — TURN_ENDED emitted at end of End phase', () => {
    // Drive through all phases to End
    const base = bootstrapGame();
    // Already in Main, go to End
    let state = applyAction(base, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(state)).toBe(false);
    if (isGameError(state)) return;
    // Now in End phase
    expect(state.phase).toBe('End');

    const before = logsBefore(state);
    const result = applyAction(state, { type: 'EndPhase', playerId: P1 });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const logs = newLogs(before, result);
    const turnEnded = logs.find((e) => e.event === 'TURN_ENDED');
    expect(turnEnded).toBeDefined();
    expect(turnEnded?.playerId).toBe(P1);
    expect(turnEnded?.turn).toBe(3);
  });

  // L6 — POWER_BOOST_APPLIED emitted when a PowerBoost effect resolves
  it('L6 — POWER_BOOST_APPLIED emitted when PowerBoost effect fires', () => {
    const base = bootstrapGame();
    const target = makeChar('boost-target', 'p2', 5000, { zone: 'board' });
    const effect: CardEffect = {
      trigger: 'Activated',
      actions: [{ type: 'PowerBoost', amount: -2000, target: { scope: 'ChooseOpponentCharacter' }, duration: 'EndOfTurn' }],
    };
    const source = makeChar('boost-source', 'p1', 3000, { effects: [effect] });

    let state: GameState = {
      ...base,
      cards: { ...base.cards, [source.id]: source, [target.id]: target },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, source.id] },
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, target.id] },
      },
    };

    const before = logsBefore(state);
    const result = applyAction(state, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: source.id,
      chosenTargetId: target.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const logs = newLogs(before, result);
    const boostLog = logs.find((e) => e.event === 'POWER_BOOST_APPLIED');
    expect(boostLog).toBeDefined();
    expect(boostLog?.details?.amount).toBe(-2000);
  });
});
