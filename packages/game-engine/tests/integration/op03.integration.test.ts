/**
 * OP03 Integration Tests — Pillars of Strength.
 *
 * Cards under test:
 *   OP03-001 — [On Attack] / [When Opponent Attacks] trash Event/Stage → +1000/card (Portgas.D.Ace Leader)
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
import type { Card, CardEffect, GameState, PlayerId, PlayerSetup } from '../../src/index.js';

const P1 = makePlayerId('op03-p1');
const P2 = makePlayerId('op03-p2');

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

function makeDon(id: string, owner: PlayerId): Card {
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

// ─── DSL stubs ─────────────────────────────────────────────────────────────────

const op03001OnAttackEffect: CardEffect = {
  trigger: 'OnAttack',
  actions: [{
    type: 'TrashFromHand',
    filter: { cardTypes: ['Event', 'Stage'] },
    thenActions: [{
      type: 'PowerBoost',
      amount: 1000,
      perTrashedCard: true,
      target: { scope: 'Self' },
      duration: 'EndOfBattle',
    }],
  } as never],
};

const op03001OnAttackedEffect: CardEffect = {
  trigger: 'OnAttacked',
  actions: [{
    type: 'TrashFromHand',
    filter: { cardTypes: ['Event', 'Stage'] },
    thenActions: [{
      type: 'PowerBoost',
      amount: 1000,
      perTrashedCard: true,
      target: { scope: 'Self' },
      duration: 'EndOfBattle',
    }],
  } as never],
};

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO L — OP03-001 Ace Leader OnAttack
// ════════════════════════════════════════════════════════════════════════════════

describe('OP03 integration — OP03-001 Ace Leader OnAttack trash Event/Stage', () => {

  it('L1 — OnAttack: trash 2 Events → leader +2000 EndOfBattle', () => {
    let s = bootstrapGame();

    // Replace P1's leader with OP03-001 OnAttack effect
    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op03001OnAttackEffect] } } };

    const leaderBasePower = calculatePower(leaderId, s);

    // Add 2 Event cards to P1's hand
    const event1 = makeChar('l1-ev1', P1, 0, { zone: 'hand', type: 'Event', cost: 1 });
    const event2 = makeChar('l1-ev2', P1, 0, { zone: 'hand', type: 'Event', cost: 2 });
    s = addToHand(s, event1, P1);
    s = addToHand(s, event2, P1);

    // P1 leader attacks P2's leader
    const p2LeaderId = s.players[P2]!.leader!;
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: leaderId, targetId: p2LeaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // OnAttack fires → TrashFromHand → pendingTrashInteraction
    expect(result.pendingTrashInteraction).not.toBeNull();
    expect(result.pendingTrashInteraction?.filter.cardTypes).toContain('Event');

    // Trash both events
    result = applyAction(result, {
      type: 'ResolveTrashInteraction',
      playerId: P1,
      trashedCardIds: [event1.id, event2.id],
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // thenActions: +1000 * 2 = +2000 EndOfBattle
    expect(calculatePower(leaderId, result)).toBe(leaderBasePower + 2000);
    expect(result.cards[event1.id]?.zone).toBe('trash');
    expect(result.cards[event2.id]?.zone).toBe('trash');
  });

  it('L2 — OnAttack: trash 0 cards → no boost', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op03001OnAttackEffect] } } };

    const leaderBasePower = calculatePower(leaderId, s);

    // No Event/Stage in P1's hand (only character cards from deck)
    const p2LeaderId = s.players[P2]!.leader!;
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: leaderId, targetId: p2LeaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // TrashFromHand pauses even with empty-eligible hand (pendingTrashInteraction set)
    if (result.pendingTrashInteraction !== null) {
      // Resolve with no cards trashed (0 events to trash)
      result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [] });
      expect(isGameError(result)).toBe(false);
      if (isGameError(result)) return;
    }

    // No boost (0 cards trashed)
    expect(calculatePower(leaderId, result)).toBe(leaderBasePower);
  });

  it('L3 — leader boost cleared after ResolveCombat (EndOfBattle)', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op03001OnAttackEffect] } } };

    const leaderBasePower = calculatePower(leaderId, s);

    const event1 = makeChar('l3-ev1', P1, 0, { zone: 'hand', type: 'Event', cost: 1 });
    s = addToHand(s, event1, P1);

    const p2LeaderId = s.players[P2]!.leader!;
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: leaderId, targetId: p2LeaderId });
    if (isGameError(result)) return;

    if (result.pendingTrashInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [event1.id] });
      if (isGameError(result)) return;
    }

    // After trash: leader has +1000
    expect(calculatePower(leaderId, result)).toBe(leaderBasePower + 1000);

    // Resolve combat — EndOfBattle modifiers are cleared
    result = applyAction(result, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(calculatePower(leaderId, result)).toBe(leaderBasePower);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO L2 — OP03-001 Ace Leader OnAttacked
// ════════════════════════════════════════════════════════════════════════════════

describe('OP03 integration — OP03-001 Ace Leader OnAttacked trash Event/Stage', () => {

  it('L4 — OnAttacked: P2 attacks P1 leader → P1 trashes 1 Event → +1000', () => {
    let s = bootstrapGame();

    // P1's leader has OnAttacked effect (Ace fires when defending too)
    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op03001OnAttackedEffect] } } };

    const leaderBasePower = calculatePower(leaderId, s);

    // Add an Event to P1's hand
    const event = makeChar('l4-ev', P1, 0, { zone: 'hand', type: 'Event', cost: 1 });
    s = addToHand(s, event, P1);

    // Add a character to P2's board (as the attacker, not new-to-board)
    const p2Attacker = makeChar('l4-p2atk', P2, 3000, { cost: 0, keywords: ['Rush'] });
    s = addToBoard(s, p2Attacker, P2);
    s = { ...s, newBoardIds: [] };

    // Switch to P2's turn
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    // P2 attacks P1's leader
    const result = applyAction(s, { type: 'DeclareAttack', playerId: P2, attackerId: p2Attacker.id, targetId: leaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // OnAttacked fires for P1's leader → TrashFromHand → pendingTrashInteraction
    expect(result.pendingTrashInteraction).not.toBeNull();
    expect(result.pendingTrashInteraction?.playerId).toBe(P1);

    // P1 trashes the Event → +1000
    const afterTrash = applyAction(result, {
      type: 'ResolveTrashInteraction',
      playerId: P1,
      trashedCardIds: [event.id],
    });
    expect(isGameError(afterTrash)).toBe(false);
    if (isGameError(afterTrash)) return;

    expect(calculatePower(leaderId, afterTrash)).toBe(leaderBasePower + 1000);
    expect(afterTrash.cards[event.id]?.zone).toBe('trash');
  });

});
