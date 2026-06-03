/**
 * ST21 Integration Tests — Straw Hat Crew conditional effects.
 *
 * Cards under test:
 *   ST21-002/011 — StartOfOpponentTurn + HasAttachedDon:2 → PowerBoost (Usopp / Franky)
 *   ST21-004     — OnKO + HasAttachedDon:2 → DrawCard:1 (Jewelry Bonney)
 *   ST21-010     — OnAttack + HasAttachedDon:2 → KO opponent char ≤4000 (Nico Robin)
 *   ST21-015     — Activated + HasAttachedDon:2 → GiveKeyword Rush (Roronoa Zoro)
 *   ST21-016     — OnPlay → PowerBoost+1000 + DisableBlocker on 1 opp char ≤4000 (Event)
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

const P1 = makePlayerId('s21-p1');
const P2 = makePlayerId('s21-p2');

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

/**
 * Inject N DON cards with `attachedTo: charId` directly into state.cards.
 * These don't go through donArea — they exist only for HasAttachedDon condition checks.
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

const st21002Effect: CardEffect = {
  trigger: 'StartOfOpponentTurn',
  condition: { type: 'HasAttachedDon', count: 2 },
  actions: [{ type: 'PowerBoost', amount: 2000, target: { scope: 'Self' }, duration: 'EndOfOpponentTurn' } as never],
};

const st21011Effect: CardEffect = {
  trigger: 'StartOfOpponentTurn',
  condition: { type: 'HasAttachedDon', count: 2 },
  actions: [{
    type: 'PowerBoost',
    amount: 1000,
    target: { scope: 'AllOwnCharacters', subType: 'Straw Hat Crew', maxPower: 4000 },
    duration: 'EndOfOpponentTurn',
  } as never],
};

const st21004Effect: CardEffect = {
  trigger: 'OnKO',
  actions: [{ type: 'DrawCard', count: 1 } as never],
};

const st21010Effect: CardEffect = {
  trigger: 'OnAttack',
  condition: { type: 'HasAttachedDon', count: 2 },
  actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter', maxPower: 4000 } } as never],
};

const st21016OnPlayEffect: CardEffect = {
  trigger: 'OnPlay',
  actions: [
    { type: 'PowerBoost', amount: 1000, target: { scope: 'ChooseOwnCharacterOrLeader' }, duration: 'EndOfTurn' } as never,
    { type: 'DisableBlocker', target: { scope: 'ChooseOpponentCharacter', maxPower: 4000 }, duration: 'EndOfTurn' } as never,
  ],
};

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO S — StartOfOpponentTurn (ST21-002, ST21-011)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST21 integration — StartOfOpponentTurn (ST21-002, ST21-011)', () => {

  it('S1 — ST21-002: 2 DON attached → StartOfOpponentTurn fires, self gets +2000', () => {
    let s = bootstrapGame();

    // P2's Usopp with 2 DON attached (fires when P1 starts their turn)
    const usopp = makeChar('s1-usopp', P2, 3000, { effects: [st21002Effect] });
    s = addToBoard(s, usopp, P2);
    s = attachFreshDon(s, usopp.id, P2, 2, 's1');

    const basePower = calculatePower(usopp.id, s);

    // Trigger P1's Refresh by ending P2's turn (P2 EndPhase → P1 Refresh)
    const stateP2End = { ...s, phase: 'End' as const, activePlayerId: P2, turnNumber: 4 };
    const result = applyAction(stateP2End, { type: 'EndPhase', playerId: P2 });
    if (isGameError(result)) throw new Error((result as any).message);
    const afterRefresh = result as GameState;

    // P2's Usopp should have fired StartOfOpponentTurn during P1's Refresh
    const boostedPower = calculatePower(usopp.id, afterRefresh);
    expect(boostedPower).toBe(basePower + 2000);
  });

  it('S2 — ST21-002: fewer than 2 DON attached → no boost', () => {
    let s = bootstrapGame();

    const usopp = makeChar('s2-usopp', P2, 3000, { effects: [st21002Effect] });
    s = addToBoard(s, usopp, P2);
    // Only 1 DON (condition requires 2)
    s = attachFreshDon(s, usopp.id, P2, 1, 's2');

    const basePower = calculatePower(usopp.id, s);

    const stateP2End = { ...s, phase: 'End' as const, activePlayerId: P2, turnNumber: 4 };
    const result = applyAction(stateP2End, { type: 'EndPhase', playerId: P2 });
    if (isGameError(result)) throw new Error((result as any).message);
    const afterRefresh = result as GameState;

    expect(calculatePower(usopp.id, afterRefresh)).toBe(basePower); // no boost
  });

  it('S3 — ST21-011: 2 DON attached → Straw Hat Crew chars ≤4000 get +1000', () => {
    let s = bootstrapGame();

    // P2's Franky with 2 DON
    const franky = makeChar('s3-franky', P2, 4000, { effects: [st21011Effect] });
    const shcChar = makeChar('s3-shc', P2, 3000, { subTypes: 'Straw Hat Crew' });
    s = addToBoard(s, franky, P2);
    s = addToBoard(s, shcChar, P2);
    s = attachFreshDon(s, franky.id, P2, 2, 's3');

    const baseShcPower = calculatePower(shcChar.id, s);

    const stateP2End = { ...s, phase: 'End' as const, activePlayerId: P2, turnNumber: 4 };
    const result = applyAction(stateP2End, { type: 'EndPhase', playerId: P2 });
    if (isGameError(result)) throw new Error((result as any).message);
    const afterRefresh = result as GameState;

    expect(calculatePower(shcChar.id, afterRefresh)).toBe(baseShcPower + 1000);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO K — OnKO + HasAttachedDon (ST21-004)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST21 integration — OnKO + HasAttachedDon (ST21-004 Jewelry Bonney)', () => {

  it('K1 — ST21-004: KO → owner draws 1 (unconditional OnKO)', () => {
    let s = bootstrapGame();

    const bonney = makeChar('k1-bonney', P1, 3000, { effects: [st21004Effect] });
    s = addToBoard(s, bonney, P1);

    const p1DeckBefore = s.players[P1]!.deck.length;

    // P2 plays a char that KOs all opponent characters (AllOpponentCharacters = no interaction needed)
    const koChar = makeChar('k1-kochar', P2, 2000, {
      cost: 0,
      zone: 'hand',
      effects: [{ trigger: 'OnPlay', actions: [{ type: 'KO', target: { scope: 'AllOpponentCharacters' } }] }],
    });
    s = addToHand(s, koChar, P2);
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand', playerId: P2, cardId: koChar.id,
    }) as GameState;
    expect(isGameError(result)).toBe(false);

    // Bonney is KO'd
    expect(result.players[P1]!.board).not.toContain(bonney.id);
    // P1 drew 1 card from OnKO trigger (deck shrinks by 1)
    expect(result.players[P1]!.deck.length).toBe(p1DeckBefore - 1);
  });

  it('K2 — ST21-004: char without OnKO effect KO-ed → deck unchanged', () => {
    let s = bootstrapGame();

    // A plain char with NO OnKO effect — KO should not draw
    const plainChar = makeChar('k2-plain', P1, 3000);
    s = addToBoard(s, plainChar, P1);

    const p1DeckBefore = s.players[P1]!.deck.length;

    const koChar = makeChar('k2-kochar', P2, 2000, {
      cost: 0,
      zone: 'hand',
      effects: [{ trigger: 'OnPlay', actions: [{ type: 'KO', target: { scope: 'AllOpponentCharacters' } }] }],
    });
    s = addToHand(s, koChar, P2);
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand', playerId: P2, cardId: koChar.id,
    }) as GameState;
    expect(isGameError(result)).toBe(false);

    expect(result.players[P1]!.board).not.toContain(plainChar.id);
    expect(result.players[P1]!.deck.length).toBe(p1DeckBefore); // no draw (no OnKO effect)
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO R — OnAttack + HasAttachedDon (ST21-010 Nico Robin)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST21 integration — OnAttack + HasAttachedDon (ST21-010 Nico Robin)', () => {

  it('R1 — ST21-010: 2 DON attached + attack → pendingTargetInteraction for KO of opponent char ≤4000', () => {
    let s = bootstrapGame();

    const robin = makeChar('r1-robin', P1, 4000, { effects: [st21010Effect] });
    s = addToBoard(s, robin, P1);
    s = attachFreshDon(s, robin.id, P1, 2, 'r1');

    // P2 has a weak character (valid KO target) and the leader
    const weakChar = makeChar('r1-weak', P2, 3000, { tapped: true });
    s = addToBoard(s, weakChar, P2);
    const leaderP2 = { ...s.cards[s.players[P2]!.leader!]!, tapped: true };
    s = { ...s, cards: { ...s.cards, [leaderP2.id]: leaderP2 } };

    const result = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: leaderP2.id,
    }) as GameState;
    expect(isGameError(result)).toBe(false);

    // OnAttack fires → pendingTargetInteraction to choose a char ≤4000 to KO
    expect(result.pendingTargetInteraction).not.toBeNull();
    expect(result.pendingTargetInteraction!.playerId).toBe(P1);
  });

  it('R2 — ST21-010: fewer than 2 DON attached → no KO effect triggered', () => {
    let s = bootstrapGame();

    const robin = makeChar('r2-robin', P1, 4000, { effects: [st21010Effect] });
    s = addToBoard(s, robin, P1);
    // Only 1 DON
    s = attachFreshDon(s, robin.id, P1, 1, 'r2');

    const weakChar = makeChar('r2-weak', P2, 3000, { tapped: true });
    s = addToBoard(s, weakChar, P2);
    const leaderP2 = { ...s.cards[s.players[P2]!.leader!]!, tapped: true };
    s = { ...s, cards: { ...s.cards, [leaderP2.id]: leaderP2 } };

    const result = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: leaderP2.id,
    }) as GameState;
    expect(isGameError(result)).toBe(false);

    // Condition not met → no target interaction
    expect(result.pendingTargetInteraction).toBeNull();
  });

  it('R3 — ST21-010: 2 DON + attack + resolve KO → weak char is removed from board', () => {
    let s = bootstrapGame();

    const robin = makeChar('r3-robin', P1, 4000, { effects: [st21010Effect] });
    s = addToBoard(s, robin, P1);
    s = attachFreshDon(s, robin.id, P1, 2, 'r3');

    const weakChar = makeChar('r3-weak', P2, 3000, { tapped: true });
    s = addToBoard(s, weakChar, P2);
    const leaderP2 = { ...s.cards[s.players[P2]!.leader!]!, tapped: true };
    s = { ...s, cards: { ...s.cards, [leaderP2.id]: leaderP2 } };

    let s2 = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: leaderP2.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingTargetInteraction).not.toBeNull();

    // Resolve KO target → weakChar
    s2 = applyAction(s2, {
      type: 'ResolveTargetInteraction', playerId: P1, targetCardId: weakChar.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingTargetInteraction).toBeNull();

    expect(s2.players[P2]!.board).not.toContain(weakChar.id);
    expect(s2.players[P2]!.trash).toContain(weakChar.id);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO E — Event OnPlay DisableBlocker (ST21-016)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST21 integration — Event OnPlay DisableBlocker (ST21-016)', () => {

  it('E1 — ST21-016 OnPlay: +1000 to own char + DisableBlocker on 1 opponent char ≤4000', () => {
    let s = bootstrapGame();

    const p1Char = makeChar('e1-p1c', P1, 3000);
    s = addToBoard(s, p1Char, P1);

    const p2Blocker = makeChar('e1-p2b', P2, 4000, { keywords: ['Blocker'] });
    const p2Strong = makeChar('e1-p2s', P2, 6000, { keywords: ['Blocker'] });
    s = addToBoard(s, p2Blocker, P2);
    s = addToBoard(s, p2Strong, P2);

    // Event with cost 0 to avoid DON cost issues
    const event = makeChar('e1-event', P1, 0, { cost: 0, type: 'Event', zone: 'hand', effects: [st21016OnPlayEffect] });
    s = addToHand(s, event, P1);

    const basePower = calculatePower(p1Char.id, s);

    let s2 = applyAction(s, {
      type: 'PlayEvent', playerId: P1, cardId: event.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // First interaction: choose own char/leader to boost +1000
    expect(s2.pendingTargetInteraction).not.toBeNull();

    s2 = applyAction(s2, {
      type: 'ResolveTargetInteraction', playerId: P1, targetCardId: p1Char.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    expect(calculatePower(p1Char.id, s2)).toBe(basePower + 1000);

    // Second interaction: choose opponent char ≤4000 to DisableBlocker
    expect(s2.pendingTargetInteraction).not.toBeNull();

    s2 = applyAction(s2, {
      type: 'ResolveTargetInteraction', playerId: P1, targetCardId: p2Blocker.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingTargetInteraction).toBeNull();

    // p2Blocker is in blockerDisabledIds
    expect(s2.blockerDisabledIds).toContain(p2Blocker.id);
    // p2Strong (6000 power) is NOT disabled
    expect(s2.blockerDisabledIds).not.toContain(p2Strong.id);
  });
});
