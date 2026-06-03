/**
 * uiLogic.test.ts — UL1–UL4
 * Pure function tests, no DOM rendering required.
 */

import { describe, it, expect } from 'vitest';
import {
  makeEmptyState,
  makePlayerId,
  makeCardId,
  computePlayCost,
  resolveEffects,
  applyAction,
  isGameError,
} from 'game-engine';
import type { GameState, Card, CardId, PlayerId, PlayerSetup } from 'game-engine';
import { getPendingMessage, computeIsCombatPaused } from '../ui/ActionPanel';

const P1 = makePlayerId('p1');
const P2 = makePlayerId('p2');

function makeState(overrides: Partial<GameState> = {}): GameState {
  const base = makeEmptyState(P1, P2);
  return { ...base, phase: 'Main', activePlayerId: P1, playerOrder: [P1, P2], turnNumber: 3, winner: null, ...overrides };
}

function makeChar(id: string, owner: PlayerId, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 2, power: 3000, color: 'Red', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}

function makeDon(id: string, owner: PlayerId): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Red', type: 'DON',
    zone: 'donArea', ownerId: owner, tapped: false, attachedTo: null,
  };
}

function makePlayerSetup(idStr: string): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: makeChar(`${idStr}-leader`, makePlayerId(idStr), { type: 'Leader', zone: 'deck' }),
    deckCards: Array.from({ length: 50 }, (_, i) => makeChar(`${idStr}-dk-${i}`, makePlayerId(idStr), { zone: 'deck' })),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${idStr}-don-${i}`, makePlayerId(idStr)) as Card),
  };
}

// ─── UL1 : getPendingMessage — chaque type de pending ────────────────────────

describe('UL1: getPendingMessage returns correct message per pending type', () => {
  it('null when no pending', () => {
    expect(getPendingMessage(makeState())).toBeNull();
  });

  it('TargetInteraction → Choisissez une cible', () => {
    const srcId = makeCardId('s1') as CardId;
    const s = makeState({
      pendingTargetInteraction: {
        playerId: P1, scope: 'ChooseOpponentCharacter', sourceCardId: srcId, sourcePlayerId: P1,
        pendingAction: { type: 'KO', target: { scope: 'ChooseOpponentCharacter' } } as never,
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    expect(getPendingMessage(s)).toContain('Choisissez une cible');
  });

  it('OnKOInteraction → choisissez une carte à jouer', () => {
    const srcId = makeCardId('s2') as CardId;
    const s = makeState({ pendingOnKOInteraction: { playerId: P1, filter: {}, sourceCardId: srcId } });
    expect(getPendingMessage(s)).toContain('choisissez une carte à jouer');
  });

  it('RevealInteraction (hand-sourced) → Révélez N carte(s)', () => {
    const srcId = makeCardId('s3') as CardId;
    const s = makeState({
      pendingRevealInteraction: {
        playerId: P1, count: 1, sourceCardId: srcId, sourcePlayerId: P1,
        thenActions: [], pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    const msg = getPendingMessage(s);
    expect(msg).toContain('Révélez');
    expect(msg).toContain('1');
  });

  it('RevealInteraction (deck-sourced, revealedCardIds set) → Carte révélée', () => {
    const srcId = makeCardId('s4') as CardId;
    const revId = makeCardId('rev') as CardId;
    const s = makeState({
      pendingRevealInteraction: {
        playerId: P1, count: 1, revealedCardIds: [revId], sourceCardId: srcId, sourcePlayerId: P1,
        thenActions: [], pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    expect(getPendingMessage(s)).toContain('révélée');
  });

  it('TrashFromHand (count=1) → Défaussez 1 carte', () => {
    const srcId = makeCardId('s5') as CardId;
    const s = makeState({
      pendingTrashInteraction: {
        playerId: P1, filter: {}, count: 1, sourceCardId: srcId, sourcePlayerId: P1,
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    expect(getPendingMessage(s)).toContain('Défaussez 1 carte');
  });

  it('TrashFromHand (no count) → Défaussez des cartes', () => {
    const srcId = makeCardId('s6') as CardId;
    const s = makeState({
      pendingTrashInteraction: {
        playerId: P1, filter: {}, sourceCardId: srcId, sourcePlayerId: P1,
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    expect(getPendingMessage(s)).toContain('Défaussez des cartes');
  });

  it('SearchInteraction → Cherchez une carte', () => {
    const s = makeState({
      pendingSearchInteraction: {
        playerId: P1, revealedCardIds: [], filter: { kind: 'Any' },
        destination: 'hand', sourceCardId: makeCardId('s7') as CardId, sourcePlayerId: P1,
      },
    });
    expect(getPendingMessage(s)).toContain('Cherchez une carte');
  });

  it('ForceDiscardInteraction (count=3) → défausser 3 cartes', () => {
    const s = makeState({
      pendingForceDiscardInteraction: {
        playerId: P2, count: 3, pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    const msg = getPendingMessage(s);
    expect(msg).toContain('défausser');
    expect(msg).toContain('3');
  });

  it('ChoiceInteraction → Choisissez une option', () => {
    const srcId = makeCardId('s8') as CardId;
    const s = makeState({
      pendingChoiceInteraction: {
        playerId: P1, choices: [{ label: 'A', actions: [] }], sourceCardId: srcId, sourcePlayerId: P1,
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    expect(getPendingMessage(s)).toContain('Choisissez');
  });
});

// ─── UL2 : computeIsCombatPaused ─────────────────────────────────────────────

describe('UL2: computeIsCombatPaused', () => {
  it('false when no pending interactions', () => {
    expect(computeIsCombatPaused(makeState())).toBe(false);
  });

  it('true when pendingTargetInteraction is set', () => {
    const srcId = makeCardId('ul2-s1') as CardId;
    const s = makeState({
      pendingTargetInteraction: {
        playerId: P1, scope: 'ChooseOpponentCharacter', sourceCardId: srcId, sourcePlayerId: P1,
        pendingAction: { type: 'KO', target: { scope: 'ChooseOpponentCharacter' } } as never,
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    expect(computeIsCombatPaused(s)).toBe(true);
  });

  it('true when pendingOnKOInteraction is set', () => {
    const srcId = makeCardId('ul2-s2') as CardId;
    const s = makeState({ pendingOnKOInteraction: { playerId: P1, filter: {}, sourceCardId: srcId } });
    expect(computeIsCombatPaused(s)).toBe(true);
  });

  it('true when pendingRevealInteraction is set', () => {
    const srcId = makeCardId('ul2-s3') as CardId;
    const s = makeState({
      pendingRevealInteraction: {
        playerId: P1, count: 1, sourceCardId: srcId, sourcePlayerId: P1,
        thenActions: [], pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    expect(computeIsCombatPaused(s)).toBe(true);
  });

  it('true when pendingForceDiscardInteraction is set', () => {
    const s = makeState({
      pendingForceDiscardInteraction: {
        playerId: P2, count: 1, pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    expect(computeIsCombatPaused(s)).toBe(true);
  });

  it('false with activeCombat set but no pending', () => {
    const s = makeState({
      activeCombat: { attackerId: makeCardId('a'), targetId: makeCardId('t'), blockerId: null, counterPower: 0 },
    });
    expect(computeIsCombatPaused(s)).toBe(false);
  });
});

// ─── UL3 : matchCard — filter matching via SearchDeck resolveEffects ──────────

describe('UL3: card filter matching (via SearchDeck resolveEffects)', () => {
  function buildSearchState(deckCard: Partial<Card> & { id: CardId }): { state: GameState; srcId: CardId } {
    const seed = makeEmptyState(P1, P2);
    let s = applyAction(seed, { type: 'StartGame', player1: makePlayerSetup('p1'), player2: makePlayerSetup('p2'), firstPlayerId: P1 });
    if (isGameError(s)) throw new Error((s as { message: string }).message);
    s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
    if (isGameError(s)) throw new Error((s as { message: string }).message);
    s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
    if (isGameError(s)) throw new Error((s as { message: string }).message);

    const gs = s as GameState;
    const fullCard: Card = makeChar('test-deck-card', P1, { zone: 'deck', ...deckCard as Partial<Card> });
    const srcCard: Card = makeChar('filter-src', P1, { zone: 'board', effects: [], cost: 0 });
    const state: GameState = {
      ...gs,
      phase: 'Main',
      activePlayerId: P1,
      turnNumber: 3,
      cards: { ...gs.cards, [fullCard.id]: fullCard, [srcCard.id]: srcCard },
      players: {
        ...gs.players,
        [P1]: {
          ...gs.players[P1]!,
          deck: [fullCard.id, ...gs.players[P1]!.deck],
          board: [...gs.players[P1]!.board, srcCard.id],
        },
      },
    };
    return { state, srcId: srcCard.id };
  }

  it('UL3a: ByType filter matches correct cardType', () => {
    const cardId = makeCardId('ul3a') as CardId;
    const { state, srcId } = buildSearchState({ id: cardId, type: 'Event', subTypes: 'Test' });
    const after = resolveEffects(
      [{ trigger: 'OnPlay', actions: [{ type: 'SearchDeck', filter: { kind: 'ByType', cardType: 'Event' }, destination: 'hand' }] }],
      'OnPlay',
      { sourceCardId: srcId, sourcePlayerId: P1 },
      state,
    );
    expect(after.players[P1]!.hand.includes(cardId)).toBe(true);
  });

  it('UL3b: BySubType filter matches card with matching subtype', () => {
    const cardId = makeCardId('ul3b') as CardId;
    const { state, srcId } = buildSearchState({ id: cardId, subTypes: 'Straw Hat Crew' });
    const after = resolveEffects(
      [{ trigger: 'OnPlay', actions: [{ type: 'SearchDeck', filter: { kind: 'BySubType', subType: 'Straw Hat Crew' }, destination: 'hand' }] }],
      'OnPlay',
      { sourceCardId: srcId, sourcePlayerId: P1 },
      state,
    );
    expect(after.players[P1]!.hand.includes(cardId)).toBe(true);
  });

  it('UL3c: ByName filter matches card by name', () => {
    const cardId = makeCardId('ul3c') as CardId;
    const { state, srcId } = buildSearchState({ id: cardId, name: 'Nami' });
    const after = resolveEffects(
      [{ trigger: 'OnPlay', actions: [{ type: 'SearchDeck', filter: { kind: 'ByName', name: 'Nami' }, destination: 'hand' }] }],
      'OnPlay',
      { sourceCardId: srcId, sourcePlayerId: P1 },
      state,
    );
    expect(after.players[P1]!.hand.includes(cardId)).toBe(true);
  });

  it('UL3d: ByCost filter matches cards within cost range', () => {
    const cardId = makeCardId('ul3d') as CardId;
    const { state, srcId } = buildSearchState({ id: cardId, cost: 3, type: 'Character' });
    const after = resolveEffects(
      [{ trigger: 'OnPlay', actions: [{ type: 'SearchDeck', filter: { kind: 'ByCost', maxCost: 4, cardType: 'Character' }, destination: 'hand' }] }],
      'OnPlay',
      { sourceCardId: srcId, sourcePlayerId: P1 },
      state,
    );
    expect(after.players[P1]!.hand.includes(cardId)).toBe(true);
  });

  it('UL3e: BySubType filter matches compound subtype ("Revolutionary Army" in "Dressrosa Revolutionary Army")', () => {
    const cardId = makeCardId('ul3e') as CardId;
    const { state, srcId } = buildSearchState({ id: cardId, subTypes: 'Dressrosa Revolutionary Army' });
    const after = resolveEffects(
      [{ trigger: 'OnPlay', actions: [{ type: 'SearchDeck', filter: { kind: 'BySubType', subType: 'Revolutionary Army' }, destination: 'hand' }] }],
      'OnPlay',
      { sourceCardId: srcId, sourcePlayerId: P1 },
      state,
    );
    expect(after.players[P1]!.hand.includes(cardId)).toBe(true);
  });
});

// ─── UL4 : computePlayCost ────────────────────────────────────────────────────

describe('UL4: computePlayCost', () => {
  function buildCostState(cardCost: number): { state: GameState; cardId: CardId } {
    const seed = makeEmptyState(P1, P2);
    let s = applyAction(seed, { type: 'StartGame', player1: makePlayerSetup('p1'), player2: makePlayerSetup('p2'), firstPlayerId: P1 });
    if (isGameError(s)) throw new Error((s as { message: string }).message);
    s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
    if (isGameError(s)) throw new Error((s as { message: string }).message);
    s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
    if (isGameError(s)) throw new Error((s as { message: string }).message);

    const gs = s as GameState;
    const card = makeChar('cost-card', P1, { zone: 'hand', cost: cardCost });
    const state: GameState = {
      ...gs,
      phase: 'Main',
      activePlayerId: P1,
      turnNumber: 3,
      cards: { ...gs.cards, [card.id]: card },
      players: { ...gs.players, [P1]: { ...gs.players[P1]!, hand: [card.id, ...gs.players[P1]!.hand] } },
    };
    return { state, cardId: card.id };
  }

  it('UL4a: normal cost returns card.cost', () => {
    const { state, cardId } = buildCostState(3);
    expect(computePlayCost(cardId, state, P1)).toBe(3);
  });

  it('UL4b: cost-0 card returns 0', () => {
    const { state, cardId } = buildCostState(0);
    expect(computePlayCost(cardId, state, P1)).toBe(0);
  });

  it('UL4c: with SetNextPlayCostReduction applied, cost is reduced', () => {
    const { state, cardId } = buildCostState(4);
    const reducedState: GameState = {
      ...state,
      nextPlayCostReduction: { reduction: 2 },
    };
    expect(computePlayCost(cardId, reducedState, P1)).toBe(2);
  });

  it('UL4d: cost reduction cannot go below 0', () => {
    const { state, cardId } = buildCostState(1);
    const reducedState: GameState = {
      ...state,
      nextPlayCostReduction: { reduction: 5 },
    };
    expect(computePlayCost(cardId, reducedState, P1)).toBe(0);
  });
});
