/**
 * ST10 Integration Tests — Fish-Man Island conditional effects.
 *
 * Cards under test:
 *   ST10-001 — Leader Activated: PlaceAtBottomOfDeck opponent char ≤3000 + PlayFromHand char ≤4
 *   ST10-005 — OnAttack + HasAttachedDon:1 → opponent char -2000 DuringYourTurn (Jinbe)
 *   ST10-006 — OnOpponentBlock → KO opponent char ≤8000 (Jinbe Rush)
 *   ST10-015 — Counter: own char/leader +2000 + KO opponent char ≤2000 (event)
 *   ST10-017 — OnPlay: Rest opponent char ≤cost2 + GiveDon:1 rested
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

const P1 = makePlayerId('s10-p1');
const P2 = makePlayerId('s10-p2');

// ─── Card factories ────────────────────────────────────────────────────────────

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 3,
    power,
    color: 'Blue',
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

/**
 * Inject N DON cards with `attachedTo: charId` directly into state.cards.
 * Used for HasAttachedDon condition checks without going through DON phase.
 */
function attachFreshDon(state: GameState, charId: CardId, owner: PlayerId, count: number, prefix: string): GameState {
  const updated: Record<string, Card> = { ...state.cards };
  for (let i = 0; i < count; i++) {
    const don = makeDon(`${prefix}-fdon-${i}`, owner);
    updated[don.id] = { ...don, attachedTo: charId, zone: 'board' };
  }
  return { ...state, cards: updated as GameState['cards'] };
}

// ─── DSL stubs ─────────────────────────────────────────────────────────────────

const st10005Effect: CardEffect = {
  trigger: 'OnAttack',
  condition: { type: 'HasAttachedDon', count: 1 },
  actions: [{ type: 'PowerBoost', amount: -2000, target: { scope: 'ChooseOpponentCharacter', maxCount: 1 }, duration: 'DuringYourTurn' } as never],
};

const st10006Effect: CardEffect = {
  trigger: 'OnOpponentBlock',
  oncePerTurn: true,
  actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter', maxPower: 8000 } } as never],
};

const st10015Effect: CardEffect = {
  trigger: 'Counter',
  actions: [
    { type: 'PowerBoost', target: { scope: 'ChooseOwnCharacterOrLeader' }, duration: 'EndOfBattle', amount: 2000 } as never,
    { type: 'KO', target: { scope: 'ChooseOpponentCharacter', maxCount: 1, maxPower: 2000 } } as never,
  ],
};

const st10017Effect: CardEffect = {
  trigger: 'OnPlay',
  actions: [
    { type: 'Rest', target: { scope: 'ChooseOpponentCharacter', maxCost: 2, maxCount: 1 } } as never,
    { type: 'AddDon', count: 1, active: false } as never,
  ],
};

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO D — OnAttack + HasAttachedDon (ST10-005)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST10 integration — OnAttack HasAttachedDon (ST10-005 Jinbe)', () => {

  it('D1 — ST10-005: 1 DON attached + attack → pendingTargetInteraction for -2000 to opponent char', () => {
    let s = bootstrapGame();

    const jinbe = makeChar('d1-jinbe', P1, 4000, { cost: 2, effects: [st10005Effect] });
    s = addToBoard(s, jinbe, P1);
    s = attachFreshDon(s, jinbe.id, P1, 1, 'd1');

    const p2Char = makeChar('d1-p2c', P2, 5000, { tapped: true });
    const leaderP2 = { ...s.cards[s.players[P2]!.leader!]!, tapped: true };
    s = addToBoard(s, p2Char, P2);
    s = { ...s, cards: { ...s.cards, [leaderP2.id]: leaderP2 } };

    const result = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: jinbe.id, targetId: leaderP2.id,
    }) as GameState;
    expect(isGameError(result)).toBe(false);

    // OnAttack fires → pendingTargetInteraction for -2000 power
    expect(result.pendingTargetInteraction).not.toBeNull();
  });

  it('D2 — ST10-005: no DON attached → attack does not trigger -2000 effect', () => {
    let s = bootstrapGame();

    const jinbe = makeChar('d2-jinbe', P1, 4000, { cost: 2, effects: [st10005Effect] });
    s = addToBoard(s, jinbe, P1);
    // No DON attached

    const leaderP2 = { ...s.cards[s.players[P2]!.leader!]!, tapped: true };
    s = { ...s, cards: { ...s.cards, [leaderP2.id]: leaderP2 } };

    const result = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: jinbe.id, targetId: leaderP2.id,
    }) as GameState;
    expect(isGameError(result)).toBe(false);

    expect(result.pendingTargetInteraction).toBeNull();
  });

  it('D3 — ST10-005: -2000 applied → target power reduces by 2000', () => {
    let s = bootstrapGame();

    const jinbe = makeChar('d3-jinbe', P1, 4000, { cost: 2, effects: [st10005Effect] });
    s = addToBoard(s, jinbe, P1);
    s = attachFreshDon(s, jinbe.id, P1, 1, 'd3');

    const p2Char = makeChar('d3-p2c', P2, 5000, { tapped: true });
    const leaderP2 = { ...s.cards[s.players[P2]!.leader!]!, tapped: true };
    s = addToBoard(s, p2Char, P2);
    s = { ...s, cards: { ...s.cards, [leaderP2.id]: leaderP2 } };

    const basePower = calculatePower(p2Char.id, s);

    let s2 = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: jinbe.id, targetId: leaderP2.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingTargetInteraction).not.toBeNull();

    s2 = applyAction(s2, {
      type: 'ResolveTargetInteraction', playerId: P1, targetCardId: p2Char.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingTargetInteraction).toBeNull();

    expect(calculatePower(p2Char.id, s2)).toBe(basePower - 2000);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO B — OnOpponentBlock KO (ST10-006)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST10 integration — OnOpponentBlock KO (ST10-006)', () => {

  it('B1 — ST10-006: P2 uses blocker → pendingTargetInteraction to KO opponent char ≤8000', () => {
    let s = bootstrapGame();

    // P1 has ST10-006 Rush character (OnOpponentBlock KO)
    const jinbeRush = makeChar('b1-jr', P1, 6000, { keywords: ['Rush'], effects: [st10006Effect] });
    s = addToBoard(s, jinbeRush, P1);

    // P2 has a blocker and a target
    const p2Blocker = makeChar('b1-blocker', P2, 3000, { keywords: ['Blocker'] });
    const p2Target = makeChar('b1-target', P2, 4000, { tapped: true });
    s = addToBoard(s, p2Blocker, P2);
    s = addToBoard(s, p2Target, P2);

    // P1 attacks p2Target
    s = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: jinbeRush.id, targetId: p2Target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // P2 declares block with p2Blocker
    const s2 = applyAction(s, {
      type: 'DeclareBlock', playerId: P2, blockerId: p2Blocker.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // OnOpponentBlock fires → pendingTargetInteraction for KO of opponent char ≤8000
    expect(s2.pendingTargetInteraction).not.toBeNull();
    expect(s2.pendingTargetInteraction!.playerId).toBe(P1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO C — Counter PowerBoost + KO (ST10-015)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST10 integration — Counter PowerBoost + KO (ST10-015)', () => {

  it('C1 — ST10-015 Counter: own char +2000 + KO opp char ≤2000', () => {
    let s = bootstrapGame();

    const counterCard = makeChar('c1-counter', P1, 0, {
      cost: 0,
      type: 'Event',
      zone: 'hand',
      effects: [st10015Effect],
    });

    const p1Defender = makeChar('c1-def', P1, 4000, { tapped: true });
    const p2Atk = makeChar('c1-atk', P2, 6000);
    const p2WeakChar = makeChar('c1-weak', P2, 2000);

    s = addToHand(s, counterCard, P1);
    s = addToBoard(s, p1Defender, P1);
    s = addToBoard(s, p2Atk, P2);
    s = addToBoard(s, p2WeakChar, P2);
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    // P2 attacks p1Defender
    s = applyAction(s, {
      type: 'DeclareAttack', playerId: P2, attackerId: p2Atk.id, targetId: p1Defender.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // P1 plays counter
    let s2 = applyAction(s, {
      type: 'PlayCounter', playerId: P1, cardId: counterCard.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // First interaction: choose own char/leader to boost +2000
    expect(s2.pendingTargetInteraction).not.toBeNull();
    const basePower = calculatePower(p1Defender.id, s2);

    s2 = applyAction(s2, {
      type: 'ResolveTargetInteraction', playerId: P1, targetCardId: p1Defender.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(calculatePower(p1Defender.id, s2)).toBe(basePower + 2000);

    // Second interaction: choose opp char ≤2000 to KO
    expect(s2.pendingTargetInteraction).not.toBeNull();

    s2 = applyAction(s2, {
      type: 'ResolveTargetInteraction', playerId: P1, targetCardId: p2WeakChar.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingTargetInteraction).toBeNull();

    expect(s2.players[P2]!.board).not.toContain(p2WeakChar.id);
    expect(s2.players[P2]!.trash).toContain(p2WeakChar.id);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO G — OnPlay Rest + GiveDon (ST10-017)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST10 integration — OnPlay Rest + GiveDon (ST10-017)', () => {

  it('G1 — ST10-017 OnPlay: rests opponent char ≤cost2 + P1 gains 1 DON', () => {
    let s = bootstrapGame();

    const cheapChar = makeChar('g1-cheap', P2, 2000, { cost: 2 });
    s = addToBoard(s, cheapChar, P2);

    const src = makeChar('g1-src', P1, 2000, { cost: 0, zone: 'hand', effects: [st10017Effect] });
    s = addToHand(s, src, P1);

    const donCountBefore = s.players[P1]!.donArea.length;

    let s2 = applyAction(s, {
      type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // First interaction: choose opponent char ≤cost2 to rest
    expect(s2.pendingTargetInteraction).not.toBeNull();

    s2 = applyAction(s2, {
      type: 'ResolveTargetInteraction', playerId: P1, targetCardId: cheapChar.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingTargetInteraction).toBeNull();

    // cheapChar is now rested
    expect(s2.cards[cheapChar.id]!.tapped).toBe(true);

    // P1 gained 1 DON (rested) from GiveDon
    expect(s2.players[P1]!.donArea.length).toBe(donCountBefore + 1);
  });
});
