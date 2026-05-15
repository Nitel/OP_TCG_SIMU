/**
 * Tests for pending interactions that must be resolved by the inactive player
 * (e.g. Zoro [On K.O.] triggered during the opponent's attack turn).
 *
 * OT1 : Zoro KO'd during bot's attack → pendingOnKOInteraction created for P1
 * OT2 : engine rejects EndPhase from bot while P1 has pendingOnKOInteraction
 * OT3 : after P1 resolves OnKO, EndPhase is accepted and bot's turn resumes
 * OT4 : engine rejects EndPhase from bot while P1 has pendingTargetInteraction
 * OT-BOT1 : greedyBotDecide returns null while human has pendingOnKOInteraction
 * OT-BOT2 : greedyBotDecide returns null while human has pendingTargetInteraction
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  greedyBotDecide,
} from '../src/index.js';
import type { Card, CardId, GameState, PlayerSetup, CardEffect, HandFilter } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const P1 = makePlayerId('p1');  // human
const P2 = makePlayerId('p2');  // bot

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
    deckCards: Array.from({ length: 50 }, (_, i) => makeChar(`${idStr}-d-${i}`, idStr, 2000, { zone: 'deck' })),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${idStr}-don-${i}`, idStr) as Card),
  };
}

function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId: P2,
  });
  if (isGameError(s)) throw new Error((s as { message: string }).message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true }) as GameState;
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true }) as GameState;
  // Start in P2's Main phase (bot is active player)
  return { ...s, phase: 'Main', activePlayerId: P2, turnNumber: 3 };
}

function addToP1Board(state: GameState, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: { ...state.players, [P1]: { ...state.players[P1]!, board: [...state.players[P1]!.board, card.id] } },
  };
}

function addToP2Board(state: GameState, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: { ...state.players, [P2]: { ...state.players[P2]!, board: [...state.players[P2]!.board, card.id] } },
  };
}

/** Zoro-style OnKO effect: play a Red character from hand (cost 0, max power ∞). */
const zoroEffect: CardEffect = {
  trigger: 'OnKO',
  actions: [{ type: 'PlayFromHand', filter: { color: 'Red', cardType: 'Character' } }],
};

// ─── Build a state where P2 just attacked P1's Zoro and the combat is in progress ──

function buildCombatWithZoro(): { state: GameState; zoro: Card; attacker: Card } {
  const base = bootstrapGame();
  const zoro = makeChar('zoro', 'p1', 2000, { effects: [zoroEffect], tapped: true }); // rested — valid attack target
  const attacker = makeChar('p2-atk', 'p2', 5000);

  let s = addToP1Board(base, zoro);
  s = addToP2Board(s, attacker);

  // P2 declares attack on P1's Zoro
  s = applyAction(s, {
    type: 'DeclareAttack',
    playerId: P2,
    attackerId: attacker.id,
    targetId: zoro.id,
  }) as GameState;
  expect(isGameError(s)).toBe(false);
  return { state: s, zoro, attacker };
}

// ─── OT1–OT3: OnKO during bot's attack ───────────────────────────────────────

describe('OT: pendingOnKOInteraction during opponent\'s (bot\'s) turn', () => {

  it('OT1: Zoro KO\'d during bot\'s attack → pendingOnKOInteraction created for P1', () => {
    const { state } = buildCombatWithZoro();

    // P1 declines to block → combat resolves, Zoro is KO'd
    const afterResolve = applyAction(state, { type: 'ResolveCombat', playerId: P2 });
    expect(isGameError(afterResolve)).toBe(false);
    if (isGameError(afterResolve)) return;

    // Engine must create pendingOnKOInteraction for P1 (Zoro's owner)
    expect(afterResolve.pendingOnKOInteraction).not.toBeNull();
    expect(afterResolve.pendingOnKOInteraction?.playerId).toBe(P1);
    // activePlayerId is still P2 (bot)
    expect(afterResolve.activePlayerId).toBe(P2);
    // Zoro must be in P1's trash
    expect(afterResolve.players[P1]!.trash).toContain(makeCardId('zoro'));
  });

  it('OT2: engine rejects EndPhase from bot while P1 has pendingOnKOInteraction', () => {
    const { state } = buildCombatWithZoro();
    let s = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;
    expect(s.pendingOnKOInteraction).not.toBeNull();
    expect(s.activePlayerId).toBe(P2);

    // Bot tries to end the phase before P1 resolves OnKO → must be rejected
    const result = applyAction(s, { type: 'EndPhase', playerId: P2 });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('PENDING_INTERACTION');
  });

  it('OT3: after P1 resolves OnKO with null (skip), EndPhase from bot is accepted', () => {
    const { state } = buildCombatWithZoro();
    let s = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;
    expect(s.pendingOnKOInteraction).not.toBeNull();

    // P1 resolves OnKO (skips — no card to play or doesn't want to)
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: null }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingOnKOInteraction).toBeNull();

    // Now bot can end the phase
    const result = applyAction(s, { type: 'EndPhase', playerId: P2 });
    expect(isGameError(result)).toBe(false);
  });

  it('OT3b: after P1 resolves OnKO by playing a valid card, EndPhase is also accepted', () => {
    const { state } = buildCombatWithZoro();
    let s = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;
    expect(s.pendingOnKOInteraction).not.toBeNull();

    // Give P1 a Red Character in hand to play
    const handChar = makeChar('hand-char', 'p1', 2000, { zone: 'hand', cost: 0 });
    s = {
      ...s,
      cards: { ...s.cards, [handChar.id]: handChar },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, handChar.id] } },
    };

    // P1 plays the hand character via OnKO
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: handChar.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingOnKOInteraction).toBeNull();
    // Card is now on P1's board
    expect(s.players[P1]!.board).toContain(handChar.id);

    // Bot can now end the phase
    const result = applyAction(s, { type: 'EndPhase', playerId: P2 });
    expect(isGameError(result)).toBe(false);
  });
});

// ─── OT4: pendingTargetInteraction during bot's turn ─────────────────────────

describe('OT4: EndPhase blocked while P1 has pendingTargetInteraction', () => {
  it('OT4: engine rejects EndPhase while P1 has a pendingTargetInteraction', () => {
    const base = bootstrapGame();
    const dummyPendingAction: NonNullable<GameState['pendingTargetInteraction']>['pendingAction'] =
      { type: 'DrawCard', count: 1 };
    // Manually inject pendingTargetInteraction for P1 into the state
    const s: GameState = {
      ...base,
      pendingTargetInteraction: {
        playerId:           P1,
        scope:              'ChooseOpponentCharacter',
        sourceCardId:       makeCardId('some-card'),
        sourcePlayerId:     P1,
        pendingAction:      dummyPendingAction,
        pendingEffectActions: [],
        pendingEffects:     [],
        trigger:            'OnAttack',
      },
    };

    const result = applyAction(s, { type: 'EndPhase', playerId: P2 });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('PENDING_INTERACTION');
  });
});

// ─── OT-BOT: greedyBotDecide waits for human pending interactions ─────────────

describe('OT-BOT: greedyBotDecide returns null while human has pending interaction', () => {

  it('OT-BOT1: bot returns null when P1 has pendingOnKOInteraction (even during bot\'s turn)', () => {
    const { state } = buildCombatWithZoro();
    let s = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;
    expect(s.pendingOnKOInteraction?.playerId).toBe(P1);
    expect(s.activePlayerId).toBe(P2);

    // Bot must wait — human has an unresolved interaction
    const action = greedyBotDecide(s, P2);
    expect(action).toBeNull();
  });

  it('OT-BOT2: bot returns null when P1 has pendingTargetInteraction (during bot\'s turn)', () => {
    const base = bootstrapGame();
    const emptyFilter: HandFilter = {};
    const dummyPendingAction: NonNullable<GameState['pendingTargetInteraction']>['pendingAction'] =
      { type: 'DrawCard', count: 1 };
    const s: GameState = {
      ...base,
      activePlayerId: P2,
      pendingTargetInteraction: {
        playerId:           P1,
        scope:              'ChooseOpponentCharacter',
        sourceCardId:       makeCardId('some-card'),
        sourcePlayerId:     P1,
        pendingAction:      dummyPendingAction,
        pendingEffectActions: [],
        pendingEffects:     [],
        trigger:            'OnAttack',
      },
    };
    void emptyFilter;

    const action = greedyBotDecide(s, P2);
    expect(action).toBeNull();
  });

  it('OT-BOT3: once P1 resolves OnKO, bot acts normally again', () => {
    const { state } = buildCombatWithZoro();
    let s = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;

    // P1 resolves
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: null }) as GameState;
    expect(s.pendingOnKOInteraction).toBeNull();

    // Bot now acts (returns a non-null action)
    const action = greedyBotDecide(s, P2);
    expect(action).not.toBeNull();
  });
});
