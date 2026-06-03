/**
 * OP06 Integration Tests — Wings of the Captain (FILM).
 *
 * Cards under test:
 *   OP06-001 — [When Attacking] trash 1 FILM → opp char −2000 DuringYourTurn + AddDon 1 rested (Uta Leader)
 *   OP06-006 — [DON!! x1][When Attacking] self +1000 EndOfOpponentTurn (Usopp)
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

const P1 = makePlayerId('op06-p1');
const P2 = makePlayerId('op06-p2');

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 3, power, color: 'Multi', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}

function makeDon(id: string, owner: PlayerId, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Red', type: 'DON',
    zone: 'donArea', ownerId: owner, tapped: false, attachedTo: null, ...opts,
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

function attachFreshDon(state: GameState, charId: CardId, owner: PlayerId, count: number, prefix: string): GameState {
  const updated: Record<string, Card> = { ...state.cards };
  for (let i = 0; i < count; i++) {
    const don = makeDon(`${prefix}-fdon-${i}`, owner);
    updated[don.id] = { ...don, attachedTo: charId, zone: 'board' };
  }
  return { ...state, cards: updated as GameState['cards'] };
}

// ─── DSL stubs ─────────────────────────────────────────────────────────────────

const op06001Effect: CardEffect = {
  trigger: 'OnAttack',
  actions: [
    {
      type: 'TrashFromHand',
      filter: { subType: 'FILM' },
      thenActions: [
        { type: 'PowerBoost', amount: -2000, target: { scope: 'ChooseOpponentCharacter' }, duration: 'DuringYourTurn' } as never,
        { type: 'AddDon', count: 1, active: false } as never,
      ],
    } as never,
  ],
};

const op06006Effect: CardEffect = {
  trigger: 'OnAttack',
  condition: { type: 'HasAttachedDon', count: 1 },
  actions: [
    { type: 'PowerBoost', amount: 1000, target: { scope: 'Self' }, duration: 'EndOfOpponentTurn' } as never,
  ],
};

// ════════════════════════════════════════════════════════════════════════════════
// OP06-001 Uta FILM Leader — OnAttack trash FILM → opp −2000 + AddDon rested
// ════════════════════════════════════════════════════════════════════════════════

describe('OP06 integration — OP06-001 Uta Leader OnAttack trash FILM', () => {

  it('L1 — trash 1 FILM card on attack → opp char −2000 DuringYourTurn + donArea +1', () => {
    let s = bootstrapGame();

    // Replace P1's leader with OP06-001 effect
    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op06001Effect] } } };

    // Add a FILM type card to P1's hand
    const filmCard = makeChar('l1-film', P1, 4000, { zone: 'hand', cost: 2, subTypes: 'FILM' });
    s = addToHand(s, filmCard, P1);

    // P2 has a character (target of debuff)
    const target = makeChar('l1-target', P2, 5000);
    s = addToBoard(s, target, P2);

    const targetBasePower = calculatePower(target.id, s);
    const donAreaBefore = s.players[P1]!.donArea.length;
    const donDeckBefore = s.players[P1]!.donDeck.length;

    // Declare attack: P1 leader → P2 leader
    const p2LeaderId = s.players[P2]!.leader!;
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: leaderId, targetId: p2LeaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // OnAttack → TrashFromHand {subType: FILM} → pendingTrashInteraction
    expect(result.pendingTrashInteraction).not.toBeNull();

    // Trash the FILM card
    result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [filmCard.id] });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // After trash, thenActions fire:
    // 1. PowerBoost -2000 → pendingTargetInteraction (ChooseOpponentCharacter)
    if (result.pendingTargetInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
      expect(isGameError(result)).toBe(false);
      if (isGameError(result)) return;
    }

    // Target debuffed by -2000
    expect(calculatePower(target.id, result)).toBe(targetBasePower - 2000);
    // FILM card trashed
    expect(result.cards[filmCard.id]?.zone).toBe('trash');
    // AddDon: donDeck -1, donArea +1
    expect(result.players[P1]!.donDeck.length).toBe(donDeckBefore - 1);
    expect(result.players[P1]!.donArea.length).toBe(donAreaBefore + 1);
  });

  it('L2 — no FILM in hand → TrashFromHand optional, no effect triggered', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op06001Effect] } } };

    const donDeckBefore = s.players[P1]!.donDeck.length;
    const donAreaBefore = s.players[P1]!.donArea.length;

    const p2LeaderId = s.players[P2]!.leader!;
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: leaderId, targetId: p2LeaderId });
    if (isGameError(result)) return;

    // TrashFromHand with FILM filter — no FILM cards in hand → optional, player may trash 0
    if (result.pendingTrashInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [] });
      if (isGameError(result)) return;
    }

    // No AddDon when nothing trashed
    expect(result.players[P1]!.donDeck.length).toBe(donDeckBefore);
    expect(result.players[P1]!.donArea.length).toBe(donAreaBefore);
  });

  it('L3 — debuff clears after turn ends (DuringYourTurn)', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op06001Effect] } } };

    const filmCard = makeChar('l3-film', P1, 4000, { zone: 'hand', cost: 2, subTypes: 'FILM' });
    s = addToHand(s, filmCard, P1);

    const target = makeChar('l3-target', P2, 5000);
    s = addToBoard(s, target, P2);
    const targetBasePower = calculatePower(target.id, s);

    const p2LeaderId = s.players[P2]!.leader!;
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: leaderId, targetId: p2LeaderId });
    if (isGameError(result)) return;

    if (result.pendingTrashInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [filmCard.id] });
      if (isGameError(result)) return;
    }
    if (result.pendingTargetInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
      if (isGameError(result)) return;
    }

    // Resolve combat
    result = applyAction(result, { type: 'ResolveCombat', playerId: P1 });
    if (isGameError(result)) return;

    // End P1's turn (Enter End phase then EndPhase)
    result = { ...result, phase: 'End' as const };
    result = applyAction(result, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // DuringYourTurn cleared at end of P1's turn
    expect(calculatePower(target.id, result)).toBe(targetBasePower);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// OP06-006 Usopp — [DON!! x1] OnAttack self +1000 EndOfOpponentTurn
// ════════════════════════════════════════════════════════════════════════════════

describe('OP06 integration — OP06-006 Usopp OnAttack [DON!! x1] +1000', () => {

  it('C1 — 1 DON attached, attack → self +1000 EndOfOpponentTurn', () => {
    let s = bootstrapGame();

    const usopp = makeChar('c1-usopp', P1, 5000, { effects: [op06006Effect], cost: 0 });
    s = addToBoard(s, usopp, P1);
    s = { ...s, newBoardIds: [] };

    // Attach 1 DON to satisfy HasAttachedDon:1
    s = attachFreshDon(s, usopp.id, P1, 1, 'c1');

    const basePower = calculatePower(usopp.id, s);
    const p2LeaderId = s.players[P2]!.leader!;

    const result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: usopp.id, targetId: p2LeaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // OnAttack with HasAttachedDon:1 satisfied → self +1000
    expect(calculatePower(usopp.id, result)).toBe(basePower + 1000);
  });

  it('C1b — no DON attached → condition fails, no boost', () => {
    let s = bootstrapGame();

    const usopp = makeChar('c1b-usopp', P1, 5000, { effects: [op06006Effect], cost: 0 });
    s = addToBoard(s, usopp, P1);
    s = { ...s, newBoardIds: [] };
    // No DON attached

    const basePower = calculatePower(usopp.id, s);
    const p2LeaderId = s.players[P2]!.leader!;

    const result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: usopp.id, targetId: p2LeaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(calculatePower(usopp.id, result)).toBe(basePower);
  });

  it('C1c — EndOfOpponentTurn boost cleared on P1 Refresh (start of P1 turn = after opponent turn)', () => {
    let s = bootstrapGame();

    const usopp = makeChar('c1c-usopp', P1, 5000, { effects: [op06006Effect], cost: 0 });
    s = addToBoard(s, usopp, P1);
    s = { ...s, newBoardIds: [] };
    s = attachFreshDon(s, usopp.id, P1, 1, 'c1c');

    const basePower = calculatePower(usopp.id, s);
    const p2LeaderId = s.players[P2]!.leader!;

    let result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: usopp.id, targetId: p2LeaderId });
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'ResolveCombat', playerId: P1 });
    if (isGameError(result)) return;

    // End P1's turn → P2's turn starts → then End P2's turn → P1 Refresh clears EndOfOpponentTurn
    result = { ...result, phase: 'End' as const };
    result = applyAction(result, { type: 'EndPhase', playerId: P1 }); // → P2 refresh
    if (isGameError(result)) return;
    result = { ...result, phase: 'End' as const, activePlayerId: P2 };
    result = applyAction(result, { type: 'EndPhase', playerId: P2 }); // → P1 refresh, clears OT mods
    if (isGameError(result)) return;

    // After P1's Refresh, EndOfOpponentTurn modifier cleared
    expect(calculatePower(usopp.id, result)).toBe(basePower);
  });

});
