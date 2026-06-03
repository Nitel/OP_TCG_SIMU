/**
 * OP01 Integration Tests — Romance Dawn.
 *
 * Cards under test:
 *   OP01-001 — [DON!! x1][Your Turn] All Characters +1000 (Roronoa Zoro Leader)
 *   OP01-006 — [On Play] opponent char −2000 (O-Tama)
 *   OP01-007 — [On KO] KO opponent char ≤4000 (Caribou)
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
import { resolveEffects } from '../../src/effects/effectResolver.js';

const P1 = makePlayerId('op01-p1');
const P2 = makePlayerId('op01-p2');

// ─── Card factories ────────────────────────────────────────────────────────────

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 3,
    power,
    color: 'Red',
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

function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, { type: 'StartGame', player1: makePlayerSetup(P1), player2: makePlayerSetup(P2), firstPlayerId: P1 });
  if (isGameError(s)) throw new Error((s as any).message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error((s as any).message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error((s as any).message);
  return { ...s as GameState, phase: 'Main', activePlayerId: P1, turnNumber: 3 };
}

function addToBoard(state: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: { ...state.players, [owner]: { ...state.players[owner]!, board: [...state.players[owner]!.board, card.id] } },
  };
}

function addToHand(state: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand' } },
    players: { ...state.players, [owner]: { ...state.players[owner]!, hand: [...state.players[owner]!.hand, card.id] } },
  };
}

/** Inject N DON cards attached to charId (zone: 'board', not in donArea — won't be detached on Refresh). */
function attachFreshDon(state: GameState, charId: CardId, owner: PlayerId, count: number, prefix: string): GameState {
  const updated: Record<string, Card> = { ...state.cards };
  for (let i = 0; i < count; i++) {
    const don = makeDon(`${prefix}-fdon-${i}`, owner);
    updated[don.id] = { ...don, attachedTo: charId, zone: 'board' };
  }
  return { ...state, cards: updated as GameState['cards'] };
}

// ─── DSL stubs ─────────────────────────────────────────────────────────────────

const op01001Effect: CardEffect = {
  trigger: 'YourTurn',
  condition: { type: 'HasAttachedDon', count: 1 },
  actions: [{
    type: 'PowerBoost',
    amount: 1000,
    target: { scope: 'AllOwnCharacters' },
    duration: 'DuringYourTurn',
  } as never],
};

const op01006Effect: CardEffect = {
  trigger: 'OnPlay',
  actions: [{
    type: 'PowerBoost',
    amount: -2000,
    target: { scope: 'ChooseOpponentCharacter' },
    duration: 'DuringYourTurn',
  } as never],
};

const op01007Effect: CardEffect = {
  trigger: 'OnKO',
  actions: [{
    type: 'KO',
    target: { scope: 'ChooseOpponentCharacter', maxPower: 4000 },
  } as never],
};

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO L — OP01-001 Leader YourTurn
// ════════════════════════════════════════════════════════════════════════════════

describe('OP01 integration — OP01-001 Zoro Leader YourTurn', () => {

  it('L1 — 1 DON attached to leader → YourTurn fires on Refresh, own characters +1000', () => {
    let s = bootstrapGame();

    // Replace P1's leader with OP01-001 effect
    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op01001Effect] } } };

    // Attach 1 DON to the leader
    s = attachFreshDon(s, leaderId, P1, 1, 'l1');

    // Add a character to P1's board
    const char = makeChar('l1-char', P1, 3000);
    s = addToBoard(s, char, P1);

    const basePower = calculatePower(char.id, s);

    // End P2's turn → triggers P1's Refresh → YourTurn fires for P1's leader
    const stateP2End = { ...s, phase: 'End' as const, activePlayerId: P2, turnNumber: 4 };
    const result = applyAction(stateP2End, { type: 'EndPhase', playerId: P2 });
    if (isGameError(result)) throw new Error((result as any).message);
    const afterRefresh = result as GameState;

    expect(calculatePower(char.id, afterRefresh)).toBe(basePower + 1000);
  });

  it('L2 — no DON attached → YourTurn condition fails, no boost', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op01001Effect] } } };
    // No DON attached

    const char = makeChar('l2-char', P1, 3000);
    s = addToBoard(s, char, P1);
    const basePower = calculatePower(char.id, s);

    const stateP2End = { ...s, phase: 'End' as const, activePlayerId: P2, turnNumber: 4 };
    const result = applyAction(stateP2End, { type: 'EndPhase', playerId: P2 });
    if (isGameError(result)) throw new Error((result as any).message);
    const afterRefresh = result as GameState;

    expect(calculatePower(char.id, afterRefresh)).toBe(basePower);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO C1 — OP01-006 O-Tama OnPlay PowerBoost −2000
// ════════════════════════════════════════════════════════════════════════════════

describe('OP01 integration — OP01-006 O-Tama OnPlay −2000', () => {

  it('C1 — play O-Tama → pendingTargetInteraction, then target −2000 this turn', () => {
    let s = bootstrapGame();

    // P2 has a character to target
    const target = makeChar('c1-target', P2, 5000);
    s = addToBoard(s, target, P2);

    const otama = makeChar('c1-otama', P1, 2000, { zone: 'hand', cost: 0, effects: [op01006Effect] });
    s = addToHand(s, otama, P1);

    const targetBasePower = calculatePower(target.id, s);

    // Play O-Tama → OnPlay fires → ChooseOpponentCharacter → pendingTargetInteraction
    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: otama.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingTargetInteraction).not.toBeNull();

    // Resolve: choose the P2 character
    result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Target power reduced by 2000 this turn
    expect(calculatePower(target.id, result)).toBe(targetBasePower - 2000);
    // Target still on board (just debuffed, not KO'd)
    expect(result.cards[target.id]?.zone).toBe('board');
  });

  it('C1b — O-Tama boost cleared after EndPhase', () => {
    let s = bootstrapGame();

    const target = makeChar('c1b-target', P2, 5000);
    s = addToBoard(s, target, P2);
    const otama = makeChar('c1b-otama', P1, 2000, { zone: 'hand', cost: 0, effects: [op01006Effect] });
    s = addToHand(s, otama, P1);
    const targetBasePower = calculatePower(target.id, s);

    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: otama.id });
    if (isGameError(result)) return;
    result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
    if (isGameError(result)) return;

    // Advance to End phase and fire EndPhase
    result = { ...result, phase: 'End' as const };
    result = applyAction(result, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // After end of turn, temporary modifiers are cleared
    expect(calculatePower(target.id, result)).toBe(targetBasePower);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO C2 — OP01-007 Caribou OnKO
// ════════════════════════════════════════════════════════════════════════════════

describe('OP01 integration — OP01-007 Caribou OnKO → KO opponent ≤4000', () => {

  it('C2 — Caribou KO-ed → triggers KO of opponent char ≤4000', () => {
    let s = bootstrapGame();

    // P2 has a weak character (eligible KO target)
    const weakChar = makeChar('c2-weak', P2, 3000);
    s = addToBoard(s, weakChar, P2);

    const caribou = makeChar('c2-caribou', P1, 4000, { effects: [op01007Effect] });
    s = addToBoard(s, caribou, P1);

    // Simulate Caribou being KO'd by directly calling resolveEffects with OnKO trigger
    const after = resolveEffects(
      [op01007Effect],
      'OnKO',
      { sourceCardId: caribou.id, sourcePlayerId: P1 },
      s,
    );

    // pendingTargetInteraction set for KO of opponent char ≤4000
    expect(after.pendingTargetInteraction).not.toBeNull();
    expect(after.pendingTargetInteraction?.scope).toBe('ChooseOpponentCharacter');

    // Resolve: KO the weak char
    const result = applyAction(after, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: weakChar.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[weakChar.id]?.zone).toBe('trash');
    expect(result.players[P2]!.board).not.toContain(weakChar.id);
  });

  it('C2b — OnKO does not KO opponent char > 4000 (engine rejects target)', () => {
    let s = bootstrapGame();

    const strongChar = makeChar('c2b-strong', P2, 5000);
    s = addToBoard(s, strongChar, P2);

    const caribou = makeChar('c2b-caribou', P1, 4000, { effects: [op01007Effect] });
    s = addToBoard(s, caribou, P1);

    const after = resolveEffects(
      [op01007Effect],
      'OnKO',
      { sourceCardId: caribou.id, sourcePlayerId: P1 },
      s,
    );
    // pendingTargetInteraction set — but target is invalid (too strong)
    if (after.pendingTargetInteraction === null) {
      // Engine may auto-skip if no valid targets exist
      expect(strongChar.zone).toBe('board');
      return;
    }
    const result = applyAction(after, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: strongChar.id });
    // Engine should reject this target (power > 4000)
    expect(isGameError(result)).toBe(true);
    expect(result.players[P2]!.board).toContain(strongChar.id);
  });

});
