import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  calculatePower,
} from '../src/index.js';
import type { Card, GameState, PlayerSetup, CardEffect } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const P1 = makePlayerId('p1');
const P2 = makePlayerId('p2');

function makeChar(
  id: string,
  owner: string,
  power: number,
  opts: Partial<Card> = {},
): Card {
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

function makeDon(id: string, owner: string): Card {
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
  };
}

function makePlayerSetup(idStr: string): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: makeChar(`${idStr}-leader`, idStr, 5000, { type: 'Leader', zone: 'deck' }),
    deckCards: Array.from({ length: 50 }, (_, i) =>
      makeChar(`${idStr}-deck-${i}`, idStr, 2000, { zone: 'deck' })
    ),
    donCards: Array.from({ length: 10 }, (_, i) =>
      makeDon(`${idStr}-don-${i}`, idStr) as Card
    ),
  };
}

/** Full game bootstrapped to Main phase (mulligans done). */
function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let result = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId: P1,
  });
  if (isGameError(result)) throw new Error(`StartGame: ${result.message}`);
  result = applyAction(result, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(result)) throw new Error(`Mulligan P1: ${result.message}`);
  result = applyAction(result, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(result)) throw new Error(`Mulligan P2: ${result.message}`);
  return { ...result, phase: 'Main', turnNumber: 3 };
}

/** Add a card to P1's board. */
function addToP1Board(state: GameState, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: {
      ...state.players,
      [P1]: { ...state.players[P1]!, board: [...state.players[P1]!.board, card.id] },
    },
  };
}

/** Add a card to P2's board. */
function addToP2Board(state: GameState, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: {
      ...state.players,
      [P2]: { ...state.players[P2]!, board: [...state.players[P2]!.board, card.id] },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ActivatedAbility', () => {
  it('résout les effets Activated en phase Main', () => {
    const base = bootstrapGame();
    const activatedEffect: CardEffect = {
      trigger: 'Activated',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const card = makeChar('activ-draw', 'p1', 3000, { effects: [activatedEffect] });
    const state = addToP1Board(base, card);
    const deckBefore = state.players[P1]!.deck.length;
    const handBefore = state.players[P1]!.hand.length;

    const result = applyAction(state, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: card.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1);
    expect(result.players[P1]!.hand.length).toBe(handBefore + 1);
  });

  it('rejette si ce n\'est pas le joueur actif (NOT_ACTIVE_PLAYER)', () => {
    const base = bootstrapGame();
    const activatedEffect: CardEffect = {
      trigger: 'Activated',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const card = makeChar('activ-p2', 'p2', 3000, { effects: [activatedEffect] });
    const state = addToP2Board(base, card);

    // P2 tries to activate during P1's turn
    const result = applyAction(state, {
      type: 'ActivatedAbility',
      playerId: P2,
      cardId: card.id,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('NOT_ACTIVE_PLAYER');
    }
  });

  it('rejette si la phase n\'est pas Main (WRONG_PHASE)', () => {
    const base = bootstrapGame();
    const activatedEffect: CardEffect = {
      trigger: 'Activated',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const card = makeChar('activ-phase', 'p1', 3000, { effects: [activatedEffect] });
    const state = { ...addToP1Board(base, card), phase: 'DON' as const };

    const result = applyAction(state, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: card.id,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('WRONG_PHASE');
    }
  });

  it('rejette si la carte n\'a pas d\'effet Activated (NO_ACTIVATED_EFFECT)', () => {
    const base = bootstrapGame();
    const onPlayEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const card = makeChar('no-activ', 'p1', 3000, { effects: [onPlayEffect] });
    const state = addToP1Board(base, card);

    const result = applyAction(state, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: card.id,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('NO_ACTIVATED_EFFECT');
    }
  });

  it('chosenTargetId applique PowerBoost à la cible choisie', () => {
    const base = bootstrapGame();
    const target = makeChar('target-char', 'p2', 5000);
    const activatedEffect: CardEffect = {
      trigger: 'Activated',
      actions: [{ type: 'PowerBoost', amount: -3000, target: { scope: 'ChooseOpponentCharacter' }, duration: 'EndOfTurn' }],
    };
    const card = makeChar('activ-boost', 'p1', 3000, { effects: [activatedEffect] });
    let state = addToP1Board(base, card);
    state = addToP2Board(state, target);

    expect(calculatePower(target.id, state)).toBe(5000);

    const result = applyAction(state, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: card.id,
      chosenTargetId: target.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(calculatePower(target.id, result)).toBe(2000);
  });
});
