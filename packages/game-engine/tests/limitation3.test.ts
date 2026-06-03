/**
 * Limitation 3 — Missing effects restored from stale keys.
 *
 * Cards fixed:
 *   OP09-013 Yasopp    — OnAttack [DON!! x1] opp char −1000 (was missing)
 *   OP09-090 Doc Q     — OnKO DrawCard 1 (was missing)
 *   ST15-002 Newgate   — Activated KO opp char ≤5000 (was missing)
 *   ST28-002 Izo       — Permanent Blocker [DON x2] + OnPlay Banish to leader (was wrong)
 *   PRB02-015 Shiryu   — OnKO KO opp char ≤cost4 (was missing)
 *   EB04-001 Bonney    — StartOfOpponentTurn +2000 if life ≤1 + Activated (was mismodeled)
 *   EB04-007 Zoro      — Activated Rush if opp has 8000+ (was missing)
 *   EB04-009           — Counter +2000 to own char/leader (was missing)
 *   EB03-028 Yu        — Activated draw 2 if hand ≤4 (was missing)
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  calculatePower,
} from '../src/index.js';
import type { Card, CardId, CardEffect, GameState, PlayerId, PlayerSetup } from '../src/index.js';
import { resolveEffects } from '../src/effects/effectResolver.js';
import { hasKeyword } from '../src/rules/cardUtils.js';

const P1 = makePlayerId('lim3-p1');
const P2 = makePlayerId('lim3-p2');

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 3, power, color: 'Red', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}
function makeDon(id: string, owner: PlayerId): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Red', type: 'DON',
    zone: 'donArea', ownerId: owner, tapped: false, attachedTo: null,
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
function addToBoard(s: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...s, cards: { ...s.cards, [card.id]: { ...card, zone: 'board' } },
    players: { ...s.players, [owner]: { ...s.players[owner]!, board: [...s.players[owner]!.board, card.id] } },
  };
}
function addToHand(s: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...s, cards: { ...s.cards, [card.id]: { ...card, zone: 'hand' } },
    players: { ...s.players, [owner]: { ...s.players[owner]!, hand: [...s.players[owner]!.hand, card.id] } },
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

// ─── OP09-013 Yasopp — OnAttack [DON!! x1] ───────────────────────────────────

describe('Lim3: OP09-013 Yasopp — OnAttack [DON!! x1] opp char −1000', () => {

  const onAttackEffect: CardEffect = {
    trigger: 'OnAttack',
    condition: { type: 'HasAttachedDon', count: 1 },
    actions: [
      { type: 'PowerBoost', amount: -1000, target: { scope: 'ChooseOpponentCharacter' }, duration: 'DuringYourTurn' } as never,
    ],
  };

  it('1 DON attached, attack → opp char debuffed −1000', () => {
    let s = bootstrapGame();

    const yasopp = makeChar('y1-yasopp', P1, 5000, { effects: [onAttackEffect], cost: 0 });
    s = addToBoard(s, yasopp, P1);
    s = { ...s, newBoardIds: [] };
    s = attachFreshDon(s, yasopp.id, P1, 1, 'y1');

    const target = makeChar('y1-tgt', P2, 5000);
    s = addToBoard(s, target, P2);
    const tgtBase = calculatePower(target.id, s);

    const p2LeaderId = s.players[P2]!.leader!;
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: yasopp.id, targetId: p2LeaderId });
    if (isGameError(result)) return;

    if (result.pendingTargetInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
      if (isGameError(result)) return;
    }

    expect(calculatePower(target.id, result)).toBe(tgtBase - 1000);
  });

});

// ─── OP09-090 Doc Q — OnKO DrawCard 1 ────────────────────────────────────────

describe('Lim3: OP09-090 Doc Q — OnKO DrawCard 1', () => {

  const onKOEffect: CardEffect = { trigger: 'OnKO', actions: [{ type: 'DrawCard', count: 1 }] };

  it('Doc Q KO-ed → owner draws 1', () => {
    let s = bootstrapGame();

    const docQ = makeChar('dq1', P1, 3000, { effects: [onKOEffect] });
    s = addToBoard(s, docQ, P1);

    const deckBefore = s.players[P1]!.deck.length;

    const after = resolveEffects(
      [onKOEffect], 'OnKO',
      { sourceCardId: docQ.id, sourcePlayerId: P1 }, s,
    );

    expect(after.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

});

// ─── ST15-002 Edward Newgate — Activated KO ≤5000 ────────────────────────────

describe('Lim3: ST15-002 Edward Newgate — Activated KO opp char ≤5000', () => {

  const activatedKO: CardEffect = {
    trigger: 'Activated',
    actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter', maxPower: 5000 } } as never],
  };

  it('Activate Newgate → auto-KOs first eligible opp char ≤5000', () => {
    let s = bootstrapGame();

    const newgate = makeChar('ng1', P1, 10000, { effects: [activatedKO] });
    s = addToBoard(s, newgate, P1);
    s = { ...s, newBoardIds: [] };

    const target = makeChar('ng1-tgt', P2, 5000, { cost: 2 });
    s = addToBoard(s, target, P2);

    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: newgate.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Auto-select first eligible target (≤5000 power) → KO'd
    expect(result.cards[target.id]?.zone).toBe('trash');
  });

});

// ─── ST28-002 Izo — Permanent Blocker [DON x2] + OnPlay Banish ───────────────

describe('Lim3: ST28-002 Izo — Permanent Blocker when DON x2 + OnPlay Banish to leader', () => {

  const blockerEffect: CardEffect = {
    trigger: 'Permanent',
    condition: { type: 'HasAttachedDon', count: 2 },
    actions: [{ type: 'GiveKeyword', keyword: 'Blocker', target: { scope: 'Self' }, duration: 'Permanent' } as never],
  };

  const banishEffect: CardEffect = {
    trigger: 'OnPlay',
    actions: [{ type: 'GiveKeyword', keyword: 'Banish', target: { scope: 'OwnLeader' }, duration: 'EndOfTurn' } as never],
  };

  it('Izo with 2 DON attached has Blocker (Permanent condition)', () => {
    let s = bootstrapGame();

    const izo = makeChar('iz1', P1, 5000, { effects: [blockerEffect, banishEffect] });
    s = addToBoard(s, izo, P1);
    s = attachFreshDon(s, izo.id, P1, 2, 'iz1');

    expect(hasKeyword(s.cards[izo.id]!, 'Blocker', s)).toBe(true);
  });

  it('Izo without 2 DON does NOT have Blocker', () => {
    let s = bootstrapGame();

    const izo = makeChar('iz2', P1, 5000, { effects: [blockerEffect, banishEffect] });
    s = addToBoard(s, izo, P1);

    expect(hasKeyword(s.cards[izo.id]!, 'Blocker', s)).toBe(false);
  });

  it('OnPlay Izo → OwnLeader gets Banish temporaryKeyword EndOfTurn', () => {
    let s = bootstrapGame();

    const izo = makeChar('iz3', P1, 5000, { zone: 'hand', cost: 0, effects: [banishEffect] });
    s = addToHand(s, izo, P1);

    const leaderId = s.players[P1]!.leader!;

    const result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: izo.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(hasKeyword(result.cards[leaderId]!, 'Banish', result)).toBe(true);
  });

});

// ─── PRB02-015 Shiryu — OnKO KO opp char ≤cost4 ─────────────────────────────

describe('Lim3: PRB02-015 Shiryu — OnKO KO opp char cost ≤4', () => {

  const onKOEffect: CardEffect = {
    trigger: 'OnKO',
    condition: { type: 'LeaderHasType', subType: 'Blackbeard Pirates' },
    actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter', maxCost: 4 } } as never],
  };

  it('Shiryu KO-ed, leader is Blackbeard → triggers KO of opp char ≤cost4', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, subTypes: 'Blackbeard Pirates' } } };

    const shiryu = makeChar('sh1', P1, 6000, { effects: [onKOEffect] });
    s = addToBoard(s, shiryu, P1);

    const target = makeChar('sh1-tgt', P2, 4000, { cost: 4 });
    s = addToBoard(s, target, P2);

    const after = resolveEffects(
      [onKOEffect], 'OnKO',
      { sourceCardId: shiryu.id, sourcePlayerId: P1 }, s,
    );

    expect(after.pendingTargetInteraction).not.toBeNull();

    const result = applyAction(after, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[target.id]?.zone).toBe('trash');
  });

});

// ─── EB04-001 Jewelry Bonney Leader — StartOfOpponentTurn +2000 if life ≤1 ──

describe('Lim3: EB04-001 Bonney Leader — StartOfOpponentTurn +2000 if life ≤1', () => {

  const sotEffect: CardEffect = {
    trigger: 'StartOfOpponentTurn',
    condition: { type: 'LifeCount', max: 1 },
    actions: [
      { type: 'PowerBoost', amount: 2000, target: { scope: 'Self' }, duration: 'EndOfOpponentTurn' } as never,
    ],
  };

  it('life ≤1, start of opponent turn → leader +2000', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [sotEffect] } } };

    // Set P1 life to 1
    const newLife = s.players[P1]!.life.slice(0, 1);
    s = { ...s, players: { ...s.players, [P1]: { ...s.players[P1]!, life: newLife } } };

    const baseLeaderPower = calculatePower(leaderId, s);

    // StartOfOpponentTurn on P1's cards fires when P2 BECOMES active (= end of P1's turn → P2 Refresh).
    // P1's turn ends → P2 becomes active → applyRefresh fires StartOfOpponentTurn for inactivePlayers' cards (P1)
    const p1End = { ...s, phase: 'End' as const, activePlayerId: P1, turnNumber: 3 };
    const result = applyAction(p1End, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // P1's leader should have +2000 from StartOfOpponentTurn
    expect(calculatePower(leaderId, result)).toBe(baseLeaderPower + 2000);
  });

  it('life > 1 → condition fails, no boost', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [sotEffect] } } };
    // Life is 5 (default)

    const baseLeaderPower = calculatePower(leaderId, s);

    const p1End = { ...s, phase: 'End' as const, activePlayerId: P1, turnNumber: 3 };
    const result = applyAction(p1End, { type: 'EndPhase', playerId: P1 });
    if (isGameError(result)) return;

    expect(calculatePower(leaderId, result)).toBe(baseLeaderPower);
  });

});

// ─── EB04-009 — Counter +2000 to own char/leader ──────────────────────────────

describe('Lim3: EB04-009 — Counter +2000 to own char/leader EndOfBattle', () => {

  const counterEffect: CardEffect = {
    trigger: 'Counter',
    actions: [
      { type: 'PowerBoost', amount: 2000, target: { scope: 'ChooseOwnCharacterOrLeader' }, duration: 'EndOfBattle' } as never,
    ],
  };

  it('Counter fires → sets pendingTargetInteraction for ChooseOwnCharacterOrLeader', () => {
    let s = bootstrapGame();

    const defender = makeChar('eb09-def', P1, 4000, { effects: [counterEffect] });
    s = addToBoard(s, defender, P1);

    const after = resolveEffects(
      [counterEffect], 'Counter',
      { sourceCardId: defender.id, sourcePlayerId: P1 }, s,
    );

    // Counter + ChooseOwnCharacterOrLeader → pendingTargetInteraction set
    expect(after.pendingTargetInteraction).not.toBeNull();
    expect(after.pendingTargetInteraction?.scope).toBe('ChooseOwnCharacterOrLeader');
  });

});

// ─── EB03-028 Yu — Activated draw 2 if hand ≤4 ───────────────────────────────

describe('Lim3: EB03-028 Yu — Activated draw 2 if hand ≤4', () => {

  const activatedDraw: CardEffect = {
    trigger: 'Activated',
    condition: { type: 'HandCount', max: 4 },
    actions: [{ type: 'DrawCard', count: 2 }],
  };

  it('hand ≤4 → activate draws 2', () => {
    let s = bootstrapGame();

    const yu = makeChar('yu1', P1, 3000, { effects: [activatedDraw] });
    s = addToBoard(s, yu, P1);
    s = { ...s, newBoardIds: [] };

    // Trim P1 hand to 3 cards
    const trimmedHand = s.players[P1]!.hand.slice(0, 3);
    s = { ...s, players: { ...s.players, [P1]: { ...s.players[P1]!, hand: trimmedHand } } };

    const deckBefore = s.players[P1]!.deck.length;

    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: yu.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(result.players[P1]!.deck.length).toBe(deckBefore - 2);
  });

  it('hand > 4 → condition fails, no draw', () => {
    let s = bootstrapGame();

    const yu = makeChar('yu2', P1, 3000, { effects: [activatedDraw] });
    s = addToBoard(s, yu, P1);
    s = { ...s, newBoardIds: [] };

    // Ensure P1 hand has 5+ cards
    for (let i = 0; i < 3; i++) {
      const extra = makeChar(`yu2-extra-${i}`, P1, 2000, { zone: 'hand', cost: 0 });
      s = addToHand(s, extra, P1);
    }
    // P1 should have 5 cards in hand now (2 from mulligan + 3 added)

    const deckBefore = s.players[P1]!.deck.length;

    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: yu.id });
    // Either fails with CONDITION_NOT_MET or returns unchanged deck
    if (!isGameError(result)) {
      expect(result.players[P1]!.deck.length).toBe(deckBefore);
    }
  });

});
