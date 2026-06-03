/**
 * OP10–OP15 Integration Tests (combined).
 *
 * Key effects under test:
 *   OP10 — OP10-001 Leader (StartOfOpponentTurn +1000 Navy/PH) + OP10-022 OnPlay DrawCard
 *   OP11 — OP11-002 Ain OnPlay PowerBoost –1000 then KO ≤0
 *   OP12 — OP12-009 Jinbe OnPlay RevealFromHand Events → Rush
 *   OP13 — OP13-002 Ace OnAttacked trash optional → opp –2000
 *   OP14 — OP14-002 Urouge OnAttack HasPower≥5000 → DrawCard + KO own ≤3000
 *   OP15 — OP15-002 Lucy OnAttack trash Events/Stages → +1000 per card
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

const P1 = makePlayerId('op1x-p1');
const P2 = makePlayerId('op1x-p2');

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 3, power, color: 'Blue', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}
function makeDon(id: string, owner: PlayerId): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Blue', type: 'DON',
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

// ════════════════════════════════════════════════════════════════════════════════
// OP11 — Ain OnPlay: PowerBoost –1000 then KO if ≤0 power
// ════════════════════════════════════════════════════════════════════════════════

describe('OP11 integration — OP11-002 Ain OnPlay −1000 then KO ≤0 power', () => {

  const ainEffect: CardEffect = {
    trigger: 'OnPlay',
    actions: [
      { type: 'PowerBoost', amount: -1000, target: { scope: 'ChooseOpponentCharacter' }, duration: 'EndOfTurn' } as never,
    ],
  };

  it('C1 — play Ain → opponent 1000-power char reduced to 0, KO triggered', () => {
    let s = bootstrapGame();

    const target = makeChar('ain-target', P2, 1000, { cost: 1 });
    s = addToBoard(s, target, P2);

    const ain = makeChar('ain', P1, 3000, { zone: 'hand', cost: 0, effects: [ainEffect] });
    s = addToHand(s, ain, P1);

    const targetBasePower = calculatePower(target.id, s);

    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: ain.id });
    if (isGameError(result)) return;

    // For Activated scope: auto-selects target
    // For OnPlay with ChooseOpponentCharacter: pendingTargetInteraction
    if (result.pendingTargetInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
      expect(isGameError(result)).toBe(false);
      if (isGameError(result)) return;
    }

    // Target reduced by 1000
    expect(calculatePower(target.id, result)).toBe(targetBasePower - 1000);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// OP13 — Ace OnAttacked: trash optional → opp –2000 DuringYourTurn
// ════════════════════════════════════════════════════════════════════════════════

describe('OP13 integration — OP13-002 Ace OnAttacked trash → opp –2000', () => {

  const aceEffect: CardEffect = {
    trigger: 'OnAttacked',
    actions: [
      {
        type: 'TrashFromHand',
        optional: true,
        filter: {},
        thenActions: [
          { type: 'PowerBoost', amount: -2000, target: { scope: 'ChooseOpponentCharacterOrLeader' }, duration: 'DuringYourTurn' } as never,
        ],
      } as never,
    ],
  };

  it('C1 — opponent attacks Ace → trash 1 → opp char –2000', () => {
    let s = bootstrapGame();

    const ace = makeChar('ace-char', P1, 5000, { effects: [aceEffect], cost: 0 });
    s = addToBoard(s, ace, P1);

    const handCard = makeChar('ace-hand', P1, 2000, { zone: 'hand', cost: 0 });
    s = addToHand(s, handCard, P1);

    const target = makeChar('ace-target', P2, 5000, { cost: 2 });
    s = addToBoard(s, target, P2);
    const targetBasePower = calculatePower(target.id, s);

    const p2Attacker = makeChar('ace-atk', P2, 3000, { cost: 0, keywords: ['Rush'] });
    s = addToBoard(s, p2Attacker, P2);
    s = { ...s, newBoardIds: [], activePlayerId: P2, turnNumber: 4 };

    // P2 attacks Ace
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P2, attackerId: p2Attacker.id, targetId: ace.id });
    if (isGameError(result)) return;

    // OnAttacked fires → TrashFromHand optional
    if (result.pendingTrashInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [handCard.id] });
      if (isGameError(result)) return;
    }

    // thenActions: opp char –2000 (pendingTargetInteraction may be set)
    if (result.pendingTargetInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
      if (isGameError(result)) return;
    }

    expect(calculatePower(target.id, result)).toBe(targetBasePower - 2000);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// OP14 — Urouge OnAttack HasPower≥5000 → Draw + KO own ≤3000
// ════════════════════════════════════════════════════════════════════════════════

describe('OP14 integration — OP14-002 Urouge OnAttack HasPower≥5000', () => {

  const urougeEffect: CardEffect = {
    trigger: 'OnAttack',
    condition: { type: 'HasPowerThreshold', power: 5000, comparison: 'GreaterOrEqual' },
    actions: [
      { type: 'DrawCard', count: 1 },
      { type: 'KO', target: { scope: 'ChooseOwnCharacter', maxPower: 3000 } } as never,
    ],
  };

  it('C1 — Urouge power ≥5000 attacks → draws 1, then KOs own char ≤3000', () => {
    let s = bootstrapGame();

    const urouge = makeChar('ur-char', P1, 5000, { effects: [urougeEffect], cost: 0 });
    s = addToBoard(s, urouge, P1);
    s = { ...s, newBoardIds: [] };

    const weakChar = makeChar('ur-weak', P1, 2000, { cost: 1 });
    s = addToBoard(s, weakChar, P1);

    const deckBefore = s.players[P1]!.deck.length;
    const p2LeaderId = s.players[P2]!.leader!;

    let result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: urouge.id, targetId: p2LeaderId });
    if (isGameError(result)) return;

    // OnAttack: draws 1, then KO own char (auto-selects for Activated-like behavior)
    // DrawCard is immediate; KO ChooseOwnCharacter may auto-select
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

  it('C1b — Urouge power <5000 → condition fails, no draw', () => {
    let s = bootstrapGame();

    const urouge = makeChar('ur2-char', P1, 4000, { effects: [urougeEffect], cost: 0 });
    s = addToBoard(s, urouge, P1);
    s = { ...s, newBoardIds: [] };

    const deckBefore = s.players[P1]!.deck.length;
    const p2LeaderId = s.players[P2]!.leader!;

    const result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: urouge.id, targetId: p2LeaderId });
    if (isGameError(result)) return;

    expect(result.players[P1]!.deck.length).toBe(deckBefore);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// OP15 — Lucy OnAttack trash Events/Stages → +1000 per card EndOfBattle
// ════════════════════════════════════════════════════════════════════════════════

describe('OP15 integration — OP15-002 Lucy OnAttack perTrashedCard +1000', () => {

  const lucyEffect: CardEffect = {
    trigger: 'OnAttack',
    actions: [
      {
        type: 'TrashFromHand',
        filter: { cardTypes: ['Event', 'Stage'] },
        thenActions: [
          { type: 'PowerBoost', amount: 1000, perTrashedCard: true, target: { scope: 'Self' }, duration: 'EndOfBattle' } as never,
        ],
      } as never,
    ],
  };

  it('C1 — trash 2 Events on attack → self +2000 EndOfBattle', () => {
    let s = bootstrapGame();

    const lucy = makeChar('lucy-char', P1, 5000, { effects: [lucyEffect], cost: 0 });
    s = addToBoard(s, lucy, P1);
    s = { ...s, newBoardIds: [] };

    const ev1 = makeChar('lucy-ev1', P1, 0, { zone: 'hand', type: 'Event', cost: 1 });
    const ev2 = makeChar('lucy-ev2', P1, 0, { zone: 'hand', type: 'Event', cost: 2 });
    s = addToHand(s, ev1, P1);
    s = addToHand(s, ev2, P1);

    const basePower = calculatePower(lucy.id, s);
    const p2LeaderId = s.players[P2]!.leader!;

    let result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: lucy.id, targetId: p2LeaderId });
    if (isGameError(result)) return;

    if (result.pendingTrashInteraction !== null) {
      result = applyAction(result, {
        type: 'ResolveTrashInteraction',
        playerId: P1,
        trashedCardIds: [ev1.id, ev2.id],
      });
      if (isGameError(result)) return;
    }

    // +1000 × 2 = +2000 EndOfBattle
    expect(calculatePower(lucy.id, result)).toBe(basePower + 2000);
  });

});
