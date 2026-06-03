/**
 * OP02 Integration Tests — Paramount War.
 *
 * Cards under test:
 *   OP02-001 — [End of Turn] Add 1 life card to hand (Edward Newgate Leader)
 *   OP02-004 — [On Play] Leader +2000, [On Attack] [DON!! x2] KO opponent ≤3000 (Edward Newgate)
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

const P1 = makePlayerId('op02-p1');
const P2 = makePlayerId('op02-p2');

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

/** Inject N DON cards attached to charId (zone: 'board', not in donArea). */
function attachFreshDon(state: GameState, charId: CardId, owner: PlayerId, count: number, prefix: string): GameState {
  const updated: Record<string, Card> = { ...state.cards };
  for (let i = 0; i < count; i++) {
    const don = makeDon(`${prefix}-fdon-${i}`, owner);
    updated[don.id] = { ...don, attachedTo: charId, zone: 'board' };
  }
  return { ...state, cards: updated as GameState['cards'] };
}

// ─── DSL stubs ─────────────────────────────────────────────────────────────────

const op02001Effect: CardEffect = {
  trigger: 'EndOfTurn',
  actions: [{ type: 'TakeLifeToHand', count: 1 } as never],
};

const op02004OnPlayEffect: CardEffect = {
  trigger: 'OnPlay',
  actions: [{
    type: 'PowerBoost',
    amount: 2000,
    target: { scope: 'OwnLeader' },
    duration: 'EndOfTurn',
  } as never],
};

const op02004OnAttackEffect: CardEffect = {
  trigger: 'OnAttack',
  condition: { type: 'HasAttachedDon', count: 2 },
  actions: [{
    type: 'KO',
    target: { scope: 'ChooseOpponentCharacter', maxPower: 3000 },
  } as never],
};

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO L — OP02-001 Leader EndOfTurn → TakeLifeToHand
// ════════════════════════════════════════════════════════════════════════════════

describe('OP02 integration — OP02-001 Whitebeard Leader EndOfTurn TakeLifeToHand', () => {

  it('L1 — EndPhase into End phase fires EndOfTurn → pendingLifeInteraction set', () => {
    let s = bootstrapGame();

    // Replace P1's leader with OP02-001 effect
    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op02001Effect] } } };

    // Ensure P1 has life cards
    expect(s.players[P1]!.life.length).toBeGreaterThan(0);

    // Advance from Main to End phase
    const stateMain = { ...s, phase: 'Main' as const };
    const afterMainEnd = applyAction(stateMain, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(afterMainEnd)).toBe(false);
    if (isGameError(afterMainEnd)) return;

    // Entering End phase fires EndOfTurn → TakeLifeToHand → pendingLifeInteraction
    expect(afterMainEnd.pendingLifeInteraction).not.toBeNull();
    expect(afterMainEnd.pendingLifeInteraction?.mode).toBe('MoveOne');
    expect(afterMainEnd.pendingLifeInteraction?.playerId).toBe(P1);
  });

  it('L2 — resolving life interaction moves life card to hand', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op02001Effect] } } };

    const lifeBefore = s.players[P1]!.life.length;
    const handBefore = s.players[P1]!.hand.length;

    // Enter End phase → pendingLifeInteraction
    const stateMain = { ...s, phase: 'Main' as const };
    let result = applyAction(stateMain, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction).not.toBeNull();

    // Choose top life card to move to hand
    const lifeCardId = result.players[P1]!.life[0]!;
    result = applyAction(result, { type: 'ResolveLifeInteraction', playerId: P1, cardId: lifeCardId, destination: 'hand' });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Life -1, hand +1
    expect(result.players[P1]!.life.length).toBe(lifeBefore - 1);
    expect(result.players[P1]!.hand.length).toBe(handBefore + 1);
    expect(result.players[P1]!.hand).toContain(lifeCardId);
    expect(result.pendingLifeInteraction).toBeNull();
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO C — OP02-004 Edward Newgate
// ════════════════════════════════════════════════════════════════════════════════

describe('OP02 integration — OP02-004 Edward Newgate OnPlay +2000 to Leader', () => {

  it('C1 — play Edward Newgate → OwnLeader +2000 EndOfTurn', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    const leaderBasePower = calculatePower(leaderId, s);

    const newgate = makeChar('c1-newgate', P1, 10000, {
      zone: 'hand',
      cost: 0,
      effects: [op02004OnPlayEffect],
    });
    s = addToHand(s, newgate, P1);

    const result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: newgate.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(calculatePower(leaderId, result)).toBe(leaderBasePower + 2000);
  });

  it('C1b — leader boost clears after EndPhase', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    const leaderBasePower = calculatePower(leaderId, s);

    const newgate = makeChar('c1b-newgate', P1, 10000, {
      zone: 'hand',
      cost: 0,
      effects: [op02004OnPlayEffect],
    });
    s = addToHand(s, newgate, P1);

    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: newgate.id });
    if (isGameError(result)) return;

    result = { ...result, phase: 'End' as const };
    result = applyAction(result, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(calculatePower(leaderId, result)).toBe(leaderBasePower);
  });

});

describe('OP02 integration — OP02-004 Edward Newgate OnAttack [DON!! x2] KO ≤3000', () => {

  it('C2 — 2 DON attached, attack → pendingTargetInteraction for KO ≤3000', () => {
    let s = bootstrapGame();

    // P2 has a weak character (eligible KO target)
    const weakChar = makeChar('c2-weak', P2, 2000);
    s = addToBoard(s, weakChar, P2);

    const newgate = makeChar('c2-newgate', P1, 10000, {
      effects: [op02004OnAttackEffect],
      cost: 0,
    });
    s = addToBoard(s, newgate, P1);
    // Remove from newBoardIds to allow attack (not played this turn)
    s = { ...s, newBoardIds: s.newBoardIds.filter((id) => id !== newgate.id) };

    // Attach 2 DON to Edward (satisfies HasAttachedDon:2 condition)
    s = attachFreshDon(s, newgate.id, P1, 2, 'c2');

    // Make P2 leader tapped (to allow attacking a board char instead)
    const p2Leader = s.players[P2]!.leader!;
    s = { ...s, cards: { ...s.cards, [p2Leader]: { ...s.cards[p2Leader]!, tapped: true } } };

    // DeclareAttack: Edward attacks P2's leader (untapped leaders are valid targets)
    const p2LeaderId = s.players[P2]!.leader!;
    const result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: newgate.id, targetId: p2LeaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // OnAttack fires with HasAttachedDon:2 satisfied → KO ChooseOpponentCharacter ≤3000
    expect(result.pendingTargetInteraction).not.toBeNull();
    expect(result.pendingTargetInteraction?.scope).toBe('ChooseOpponentCharacter');

    // Resolve: KO the weak char
    const afterKO = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: weakChar.id });
    expect(isGameError(afterKO)).toBe(false);
    if (isGameError(afterKO)) return;
    expect(afterKO.cards[weakChar.id]?.zone).toBe('trash');
  });

  it('C2b — fewer than 2 DON → OnAttack condition fails, no KO interaction', () => {
    let s = bootstrapGame();

    const weakChar = makeChar('c2b-weak', P2, 2000);
    s = addToBoard(s, weakChar, P2);

    const newgate = makeChar('c2b-newgate', P1, 10000, {
      effects: [op02004OnAttackEffect],
      cost: 0,
    });
    s = addToBoard(s, newgate, P1);
    s = { ...s, newBoardIds: s.newBoardIds.filter((id) => id !== newgate.id) };
    // Only 1 DON attached (condition requires 2)
    s = attachFreshDon(s, newgate.id, P1, 1, 'c2b');

    const p2LeaderId = s.players[P2]!.leader!;
    const result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: newgate.id, targetId: p2LeaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // No pending target interaction (condition not met)
    expect(result.pendingTargetInteraction).toBeNull();
  });

});
