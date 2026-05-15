/**
 * Tests for the countAttachedDon helper and the [DON!! xN] condition rule.
 *
 * Official OPTCG rule: [DON!! xN] = "this card has at least N DON!! cards attached to it".
 * The tapped/untapped state of attached DON is irrelevant for this condition.
 *
 * Unit tests (H1-H6): test countAttachedDon directly with minimal card maps.
 * Integration tests (I1-I3): one test per effect family that uses countAttachedDon.
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  calculatePower,
  countAttachedDon,
} from '../src/index.js';
import type { Card, CardId, GameState, PlayerSetup, CardEffect } from '../src/index.js';

// ─── Helpers for unit tests ───────────────────────────────────────────────────

function makeDonCard(id: string, attachedTo: CardId | null, tapped: boolean): Card {
  return {
    id: makeCardId(id),
    name: 'DON!!',
    cost: 0,
    power: 0,
    color: 'Red',
    type: 'DON',
    zone: 'donArea',
    ownerId: makePlayerId('p1'),
    tapped,
    attachedTo,
  };
}

function makeCharCard(id: string): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 0,
    power: 2000,
    color: 'Red',
    type: 'Character',
    zone: 'board',
    ownerId: makePlayerId('p1'),
    tapped: false,
    attachedTo: null,
  };
}

// ─── H: Unit tests for countAttachedDon ──────────────────────────────────────

describe('countAttachedDon — unit tests', () => {
  const TARGET = makeCardId('target');

  it('H1: 2 DON rested (tapped) attached → returns 2', () => {
    const d1 = makeDonCard('d1', TARGET, true);
    const d2 = makeDonCard('d2', TARGET, true);
    const cards = { [d1.id]: d1, [d2.id]: d2 } as Record<CardId, Card>;
    expect(countAttachedDon(cards, TARGET)).toBe(2);
  });

  it('H2: 2 DON actifs (untapped) attached → returns 2', () => {
    const d1 = makeDonCard('d3', TARGET, false);
    const d2 = makeDonCard('d4', TARGET, false);
    const cards = { [d1.id]: d1, [d2.id]: d2 } as Record<CardId, Card>;
    expect(countAttachedDon(cards, TARGET)).toBe(2);
  });

  it('H3: 1 DON actif + 1 DON rested attached → returns 2', () => {
    const d1 = makeDonCard('d5', TARGET, false);
    const d2 = makeDonCard('d6', TARGET, true);
    const cards = { [d1.id]: d1, [d2.id]: d2 } as Record<CardId, Card>;
    expect(countAttachedDon(cards, TARGET)).toBe(2);
  });

  it('H4: 1 DON attached → returns 1 (below threshold of 2)', () => {
    const d1 = makeDonCard('d7', TARGET, true);
    const cards = { [d1.id]: d1 } as Record<CardId, Card>;
    expect(countAttachedDon(cards, TARGET)).toBe(1);
  });

  it('H5: 0 DON attached → returns 0', () => {
    const char = makeCharCard('c1');
    const cards = { [char.id]: char } as Record<CardId, Card>;
    expect(countAttachedDon(cards, TARGET)).toBe(0);
  });

  it('H6: 3 DON rested attached — countAttachedDon(cards, target) >= 2 → true', () => {
    const d1 = makeDonCard('d8', TARGET, true);
    const d2 = makeDonCard('d9', TARGET, true);
    const d3 = makeDonCard('d10', TARGET, true);
    const cards = { [d1.id]: d1, [d2.id]: d2, [d3.id]: d3 } as Record<CardId, Card>;
    expect(countAttachedDon(cards, TARGET) >= 2).toBe(true);
  });

  it('H-iso: DON attached to another card are NOT counted', () => {
    const OTHER = makeCardId('other');
    const d1 = makeDonCard('d11', OTHER, true);
    const d2 = makeDonCard('d12', OTHER, false);
    const cards = { [d1.id]: d1, [d2.id]: d2 } as Record<CardId, Card>;
    expect(countAttachedDon(cards, TARGET)).toBe(0);
  });
});

// ─── Integration helpers ──────────────────────────────────────────────────────

const P1 = makePlayerId('p1');
const P2 = makePlayerId('p2');

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

function makeDon(id: string, owner: string, opts: Partial<Card> = {}): Card {
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
    ...opts,
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
    firstPlayerId: P1,
  });
  if (isGameError(s)) throw new Error((s as { message: string }).message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true }) as GameState;
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true }) as GameState;
  return { ...s, phase: 'Main', activePlayerId: P1, turnNumber: 3 };
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

/** Attach DON cards (tapped=true) to a target card, adding them to P1's donArea. */
function attachDon(state: GameState, dons: Card[], targetCardId: CardId): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const d of dons) {
    updatedCards[d.id] = { ...d, zone: 'donArea', tapped: true, attachedTo: targetCardId };
  }
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: {
      ...state.players,
      [P1]: { ...state.players[P1]!, donArea: [...state.players[P1]!.donArea, ...dons.map((d) => d.id)] },
    },
  };
}

// ─── I1: [When Attacking] — Robin-style OnAttack with HasRestingDon ────────────

describe('I1 — [When Attacking] with 2 DON rested attached (OnAttack + HasRestingDon)', () => {
  const robinEffect: CardEffect = {
    trigger: 'OnAttack',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter', maxPower: 4000 } }],
  };

  it('2 DON rested attached → countAttachedDon ≥ 2 → WhenAttacking effect fires', () => {
    const base = bootstrapGame();
    const robin = makeChar('i1-robin', 'p1', 4000, { effects: [robinEffect] });
    const victim = makeChar('i1-victim', 'p2', 3000, { tapped: true });
    const don1 = makeDon('i1-d1', 'p1');
    const don2 = makeDon('i1-d2', 'p1');

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, victim);
    s = attachDon(s, [don1, don2], robin.id); // tapped=true, confirming tapped state is irrelevant

    // Verify helper directly on this state
    expect(countAttachedDon(s.cards, robin.id)).toBe(2);

    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).not.toBeNull();
    expect(s.pendingTargetInteraction?.scope).toBe('ChooseOpponentCharacter');
  });

  it('0 DON attached → countAttachedDon = 0 → effect does NOT fire', () => {
    const base = bootstrapGame();
    const robin = makeChar('i1b-robin', 'p1', 4000, { effects: [robinEffect] });
    const victim = makeChar('i1b-victim', 'p2', 3000, { tapped: true });

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, victim);

    expect(countAttachedDon(s.cards, robin.id)).toBe(0);

    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).toBeNull();
  });
});

// ─── I2: [Opponent's Turn] — Usopp-style StartOfOpponentTurn with HasAttachedDon ──

describe('I2 — [Opponent\'s Turn] with 2 DON rested attached (StartOfOpponentTurn + HasAttachedDon)', () => {
  const usoppEffect: CardEffect = {
    trigger: 'StartOfOpponentTurn',
    condition: { type: 'HasAttachedDon', count: 2 },
    actions: [{ type: 'PowerBoost', amount: 2000, target: { scope: 'Self' }, duration: 'EndOfOpponentTurn' }],
  };

  it('2 DON rested attached → +2000 applied automatically when opponent\'s turn starts', () => {
    const base = bootstrapGame();
    const usopp = makeChar('i2-usopp', 'p1', 3000, { effects: [usoppEffect] });
    const don1 = makeDon('i2-d1', 'p1');
    const don2 = makeDon('i2-d2', 'p1');

    let s = addToP1Board(base, usopp);
    s = attachDon(s, [don1, don2], usopp.id); // tapped=true, confirming state is irrelevant

    expect(countAttachedDon(s.cards, usopp.id)).toBe(2);

    // End P1's turn → P2 Refresh fires StartOfOpponentTurn
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState; // Main → End
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState; // End → P2 Refresh

    expect(s.activePlayerId).toBe(P2);
    expect(s.cards[usopp.id]?.powerModifierOT).toBe(2000);
    // During opponent's turn DON bonus doesn't apply; +2000 OT mod does
    expect(calculatePower(usopp.id, s)).toBe(5000); // 3000 base + 2000 OT
  });

  it('1 DON attached → countAttachedDon = 1 < 2 → no +2000', () => {
    const base = bootstrapGame();
    const usopp = makeChar('i2b-usopp', 'p1', 3000, { effects: [usoppEffect] });
    const don1 = makeDon('i2b-d1', 'p1');

    let s = addToP1Board(base, usopp);
    s = attachDon(s, [don1], usopp.id);

    expect(countAttachedDon(s.cards, usopp.id)).toBe(1);

    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;

    expect(s.cards[usopp.id]?.powerModifierOT).toBeUndefined();
  });
});

// ─── I3: Rush auto-grant — [DON!! xN] This Character gains Rush ───────────────

describe('I3 — Rush auto-grant via AssignDon (Activated + HasRestingDon → Rush when threshold met)', () => {
  // "[DON!! x2] This Character gains Rush" — assigned via Activated trigger with GiveKeyword Rush.
  // The engine auto-grants Rush when countAttachedDon(card) >= threshold after each DON attachment.
  const rushEffect: CardEffect = {
    trigger: 'Activated',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [{ type: 'GiveKeyword', keyword: 'Rush', target: { scope: 'Self' } }],
  };

  it('attaching the 2nd DON triggers Rush auto-grant via countAttachedDon', () => {
    const base = bootstrapGame();
    const char = makeChar('i3-char', 'p1', 3000, { effects: [rushEffect] });
    const freeA = makeDon('i3-fa', 'p1');
    const freeB = makeDon('i3-fb', 'p1');

    let s = addToP1Board(base, char);
    // Inject 2 free (untapped, unattached) DON into P1's pool
    s = {
      ...s,
      cards: {
        ...s.cards,
        [freeA.id]: { ...freeA, tapped: false, attachedTo: null },
        [freeB.id]: { ...freeB, tapped: false, attachedTo: null },
      },
      players: { ...s.players, [P1]: { ...s.players[P1]!, donArea: [...s.players[P1]!.donArea, freeA.id, freeB.id] } },
    };

    expect(char.keywords ?? []).not.toContain('Rush');

    s = applyAction(s, { type: 'AssignDon', playerId: P1, donCardId: freeA.id, targetCardId: char.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    // 1 DON attached — below threshold, no Rush yet
    expect(countAttachedDon(s.cards, char.id)).toBe(1);
    expect(s.cards[char.id]?.keywords ?? []).not.toContain('Rush');

    s = applyAction(s, { type: 'AssignDon', playerId: P1, donCardId: freeB.id, targetCardId: char.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    // 2 DON attached — threshold met → Rush auto-granted
    expect(countAttachedDon(s.cards, char.id)).toBe(2);
    expect(s.cards[char.id]?.keywords).toContain('Rush');
  });
});
