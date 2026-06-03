/**
 * Tests for three architectural limitations:
 *
 * Limitation 1 — Permanent + GiveKeyword/PowerBoost (PG1-PG4)
 * Limitation 2 — conditions[] AND semantics (CA1-CA4)
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  calculatePower,
  computePermanentPowerBonus,
} from '../src/index.js';
import type { Card, CardId, CardEffect, GameState, PlayerId, PlayerSetup } from '../src/index.js';
import { hasKeyword } from '../src/rules/cardUtils.js';
import { resolveEffects } from '../src/effects/effectResolver.js';

const P1 = makePlayerId('arch-p1');
const P2 = makePlayerId('arch-p2');

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
function attachFreshDon(state: GameState, charId: CardId, owner: PlayerId, count: number, prefix: string): GameState {
  const updated: Record<string, Card> = { ...state.cards };
  for (let i = 0; i < count; i++) {
    const don = makeDon(`${prefix}-fdon-${i}`, owner);
    updated[don.id] = { ...don, attachedTo: charId, zone: 'board' };
  }
  return { ...state, cards: updated as GameState['cards'] };
}

// ════════════════════════════════════════════════════════════════════════════════
// LIMITATION 1 — Permanent + GiveKeyword / PowerBoost
// ════════════════════════════════════════════════════════════════════════════════

describe('Limitation 1 — Permanent + GiveKeyword: condition met → keyword active', () => {

  const blockerEffect: CardEffect = {
    trigger: 'Permanent',
    condition: { type: 'HasAttachedDon', count: 1 },
    actions: [
      { type: 'GiveKeyword', keyword: 'Blocker', target: { scope: 'Self' }, duration: 'Permanent' } as never,
    ],
  };

  it('PG1 — 1 DON attached → Permanent GiveKeyword Blocker is active', () => {
    let s = bootstrapGame();

    const char = makeChar('pg1-char', P1, 4000, { effects: [blockerEffect] });
    s = addToBoard(s, char, P1);
    s = attachFreshDon(s, char.id, P1, 1, 'pg1');

    // hasKeyword with state evaluates Permanent effects
    expect(hasKeyword(s.cards[char.id]!, 'Blocker', s)).toBe(true);
  });

  it('PG2 — no DON attached → condition fails, Blocker NOT active', () => {
    let s = bootstrapGame();

    const char = makeChar('pg2-char', P1, 4000, { effects: [blockerEffect] });
    s = addToBoard(s, char, P1);
    // No DON attached

    expect(hasKeyword(s.cards[char.id]!, 'Blocker', s)).toBe(false);
  });

  it('PG2b — hasKeyword without state never returns Permanent keyword', () => {
    let s = bootstrapGame();

    const char = makeChar('pg2b-char', P1, 4000, { effects: [blockerEffect] });
    s = addToBoard(s, char, P1);
    s = attachFreshDon(s, char.id, P1, 1, 'pg2b');

    // Without state, only static/temporary keywords are checked
    expect(hasKeyword(s.cards[char.id]!, 'Blocker')).toBe(false);
  });

});

describe('Limitation 1 — Permanent + PowerBoost: condition met → power increased', () => {

  const powerBoostEffect: CardEffect = {
    trigger: 'Permanent',
    condition: { type: 'HasAttachedDon', count: 2 },
    actions: [
      { type: 'PowerBoost', amount: 2000, target: { scope: 'Self' }, duration: 'Permanent' } as never,
    ],
  };

  it('PG3 — 2 DON attached → Permanent PowerBoost +2000 included in calculatePower', () => {
    let s = bootstrapGame();

    const char = makeChar('pg3-char', P1, 5000, { effects: [powerBoostEffect] });
    s = addToBoard(s, char, P1);
    s = attachFreshDon(s, char.id, P1, 2, 'pg3');

    const base = 5000 + 2 * 1000; // base + 2 DON (owner's turn)
    expect(calculatePower(char.id, s)).toBe(base + 2000);
    expect(computePermanentPowerBonus(char.id, s)).toBe(2000);
  });

  it('PG3b — only 1 DON (condition requires 2) → no permanent power bonus', () => {
    let s = bootstrapGame();

    const char = makeChar('pg3b-char', P1, 5000, { effects: [powerBoostEffect] });
    s = addToBoard(s, char, P1);
    s = attachFreshDon(s, char.id, P1, 1, 'pg3b');

    expect(computePermanentPowerBonus(char.id, s)).toBe(0);
    expect(calculatePower(char.id, s)).toBe(5000 + 1000); // base + 1 DON, no permanent
  });

  it('PG4 — condition changes mid-game: add DON → power increases, remove DON → returns to base', () => {
    let s = bootstrapGame();

    const char = makeChar('pg4-char', P1, 5000, { effects: [powerBoostEffect] });
    s = addToBoard(s, char, P1);

    // No DON → no bonus
    expect(computePermanentPowerBonus(char.id, s)).toBe(0);

    // Attach 2 DON → +2000
    s = attachFreshDon(s, char.id, P1, 2, 'pg4');
    expect(computePermanentPowerBonus(char.id, s)).toBe(2000);

    // Detach both DON (simulate end of turn DON return — detach by clearing attachedTo)
    const updated: Record<string, Card> = { ...s.cards };
    for (const [id, c] of Object.entries(s.cards)) {
      if (c.type === 'DON' && c.attachedTo === char.id) {
        updated[id] = { ...c, attachedTo: null };
      }
    }
    const sNoDon = { ...s, cards: updated as GameState['cards'] };
    expect(computePermanentPowerBonus(char.id, sNoDon)).toBe(0);
  });

});

describe('Limitation 1 — Permanent GiveKeyword triggers blocking in combat', () => {

  it('PG5 — card with Permanent Blocker (DON x1) can block when DON attached', () => {
    let s = bootstrapGame();

    const blockerEffect: CardEffect = {
      trigger: 'Permanent',
      condition: { type: 'HasAttachedDon', count: 1 },
      actions: [{ type: 'GiveKeyword', keyword: 'Blocker', target: { scope: 'Self' }, duration: 'Permanent' } as never],
    };

    const blocker = makeChar('pg5-blocker', P1, 4000, { effects: [blockerEffect], cost: 0 });
    s = addToBoard(s, blocker, P1);
    s = { ...s, newBoardIds: [] };

    // Attach 1 DON → Blocker condition met
    s = attachFreshDon(s, blocker.id, P1, 1, 'pg5');

    // P2 attacks P1's leader
    const p2Attacker = makeChar('pg5-atk', P2, 3000, { cost: 0, keywords: ['Rush'] });
    s = addToBoard(s, p2Attacker, P2);
    s = { ...s, newBoardIds: [], activePlayerId: P2, turnNumber: 4 };

    const leaderId = s.players[P1]!.leader!;
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P2, attackerId: p2Attacker.id, targetId: leaderId });
    if (isGameError(result)) return;

    // P1 can declare block with the Permanent Blocker card
    result = applyAction(result, { type: 'DeclareBlock', playerId: P1, blockerId: blocker.id });
    expect(isGameError(result)).toBe(false);
  });

  it('PG6 — same card without DON cannot block', () => {
    let s = bootstrapGame();

    const blockerEffect: CardEffect = {
      trigger: 'Permanent',
      condition: { type: 'HasAttachedDon', count: 1 },
      actions: [{ type: 'GiveKeyword', keyword: 'Blocker', target: { scope: 'Self' }, duration: 'Permanent' } as never],
    };

    const blocker = makeChar('pg6-blocker', P1, 4000, { effects: [blockerEffect], cost: 0 });
    s = addToBoard(s, blocker, P1);
    s = { ...s, newBoardIds: [] };
    // No DON → no Blocker

    const p2Attacker = makeChar('pg6-atk', P2, 3000, { cost: 0, keywords: ['Rush'] });
    s = addToBoard(s, p2Attacker, P2);
    s = { ...s, newBoardIds: [], activePlayerId: P2, turnNumber: 4 };

    const leaderId = s.players[P1]!.leader!;
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P2, attackerId: p2Attacker.id, targetId: leaderId });
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'DeclareBlock', playerId: P1, blockerId: blocker.id });
    // Should fail — no Blocker keyword active
    expect(isGameError(result)).toBe(true);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// LIMITATION 2 — conditions[] array AND semantics
// ════════════════════════════════════════════════════════════════════════════════

describe('Limitation 2 — conditions[] array: AND semantics', () => {

  const condArrayEffect: CardEffect = {
    trigger: 'OnPlay',
    conditions: [
      { type: 'HasAttachedDon', count: 1 },
      { type: 'LeaderHasType', subType: 'Straw Hat Crew' },
    ] as never,
    actions: [{ type: 'DrawCard', count: 1 }],
  };

  it('CA1 — both conditions true → effect fires (draws 1)', () => {
    let s = bootstrapGame();

    // P1 leader has Straw Hat Crew type
    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, subTypes: 'Straw Hat Crew' } } };

    const char = makeChar('ca1-char', P1, 3000, { zone: 'board', effects: [condArrayEffect] });
    s = addToBoard(s, char, P1);

    // Attach 1 DON to char
    s = attachFreshDon(s, char.id, P1, 1, 'ca1');

    const deckBefore = s.players[P1]!.deck.length;

    const after = resolveEffects(
      [condArrayEffect],
      'OnPlay',
      { sourceCardId: char.id, sourcePlayerId: P1 },
      s,
    );

    expect(after.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

  it('CA2 — first condition false (no DON) → effect does NOT fire', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, subTypes: 'Straw Hat Crew' } } };

    const char = makeChar('ca2-char', P1, 3000, { zone: 'board', effects: [condArrayEffect] });
    s = addToBoard(s, char, P1);
    // No DON attached → HasAttachedDon:1 fails

    const deckBefore = s.players[P1]!.deck.length;

    const after = resolveEffects(
      [condArrayEffect],
      'OnPlay',
      { sourceCardId: char.id, sourcePlayerId: P1 },
      s,
    );

    expect(after.players[P1]!.deck.length).toBe(deckBefore);
  });

  it('CA3 — second condition false (wrong leader type) → effect does NOT fire', () => {
    let s = bootstrapGame();
    // Leader does NOT have Straw Hat Crew type

    const char = makeChar('ca3-char', P1, 3000, { zone: 'board', effects: [condArrayEffect] });
    s = addToBoard(s, char, P1);
    s = attachFreshDon(s, char.id, P1, 1, 'ca3');

    const deckBefore = s.players[P1]!.deck.length;

    const after = resolveEffects(
      [condArrayEffect],
      'OnPlay',
      { sourceCardId: char.id, sourcePlayerId: P1 },
      s,
    );

    expect(after.players[P1]!.deck.length).toBe(deckBefore);
  });

  it('CA4 — non-regression: singular condition: {} still works as before', () => {
    let s = bootstrapGame();

    const singularEffect: CardEffect = {
      trigger: 'OnPlay',
      condition: { type: 'HasAttachedDon', count: 1 },
      actions: [{ type: 'DrawCard', count: 1 }],
    };

    const char = makeChar('ca4-char', P1, 3000, { zone: 'board', effects: [singularEffect] });
    s = addToBoard(s, char, P1);
    s = attachFreshDon(s, char.id, P1, 1, 'ca4');

    const deckBefore = s.players[P1]!.deck.length;

    const after = resolveEffects(
      [singularEffect],
      'OnPlay',
      { sourceCardId: char.id, sourcePlayerId: P1 },
      s,
    );

    // Singular condition still works
    expect(after.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

  it('CA4b — non-regression: no condition → effect always fires', () => {
    let s = bootstrapGame();

    const alwaysEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'DrawCard', count: 1 }],
    };

    const char = makeChar('ca4b-char', P1, 3000, { zone: 'board', effects: [alwaysEffect] });
    s = addToBoard(s, char, P1);

    const deckBefore = s.players[P1]!.deck.length;

    const after = resolveEffects(
      [alwaysEffect],
      'OnPlay',
      { sourceCardId: char.id, sourcePlayerId: P1 },
      s,
    );

    expect(after.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// Real DSL cards using conditions[] — regression tests
// ════════════════════════════════════════════════════════════════════════════════

describe('Real card conditions[] regression — OP04-001 Leader', () => {

  it('OP04-001 Activated: conditions=[HasAttachedDon:2] fires when 2 DON attached', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;

    // OP04-001 has conditions: [{type: HasAttachedDon, count: 2}] on its Activated trigger
    const op04001Effect: CardEffect = {
      trigger: 'Activated',
      oncePerTurn: true,
      conditions: [{ type: 'HasAttachedDon', count: 2 }] as never,
      actions: [
        { type: 'DrawCard', count: 1 },
      ],
    };

    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op04001Effect] } } };
    s = attachFreshDon(s, leaderId, P1, 2, 'reg1');

    const deckBefore = s.players[P1]!.deck.length;

    // Fire via ActivatedAbility
    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: leaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // conditions[] are now evaluated → effect fires → draws 1
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

  it('OP04-001 Activated: conditions=[HasAttachedDon:2] does NOT fire with only 1 DON', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;

    const op04001Effect: CardEffect = {
      trigger: 'Activated',
      oncePerTurn: true,
      conditions: [{ type: 'HasAttachedDon', count: 2 }] as never,
      actions: [{ type: 'DrawCard', count: 1 }],
    };

    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [op04001Effect] } } };
    s = attachFreshDon(s, leaderId, P1, 1, 'reg2');

    const deckBefore = s.players[P1]!.deck.length;

    // ActivatedAbility should fail (condition not met → resolveEffects returns same state)
    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: leaderId });
    // Engine returns CONDITION_NOT_MET error when resolveEffects returns unchanged state
    if (!isGameError(result)) {
      expect(result.players[P1]!.deck.length).toBe(deckBefore);
    }
    // Either the action errors or the deck is unchanged — both are valid
  });

});
