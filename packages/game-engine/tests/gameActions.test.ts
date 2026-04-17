import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
} from '../src/index.js';
import type { Card, GameState, PlayerSetup, PlayerState } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCard(id: string, type: Card['type'] = 'Character', cost = 2): Card {
  return {
    id: makeCardId(id),
    name: `Card-${id}`,
    cost,
    power: 2000,
    color: 'Red',
    type,
    zone: 'deck',
    ownerId: makePlayerId('placeholder'),
    tapped: false,
    attachedTo: null,
  };
}

function makePlayerSetup(idStr: string, deckSize = 20): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: makeCard(`${idStr}-leader`, 'Leader'),
    deckCards: Array.from({ length: deckSize }, (_, i) =>
      makeCard(`${idStr}-deck-${i}`)
    ),
    donCards: Array.from({ length: 10 }, (_, i) =>
      makeCard(`${idStr}-don-${i}`, 'DON')
    ),
  };
}

/** Bootstrap a full game state via StartGame + both mulligans, then override phase if needed */
function bootstrapGame(phase: GameState['phase'] = 'Main'): GameState {
  const p1 = makePlayerId('p1');
  const p2 = makePlayerId('p2');
  const seed = makeEmptyState(p1, p2);

  let result = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId: p1,
  });
  if (isGameError(result)) throw new Error(`StartGame failed: ${result.message}`);

  result = applyAction(result, { type: 'Mulligan', playerId: p1, keep: true });
  if (isGameError(result)) throw new Error(`Mulligan p1 failed: ${result.message}`);

  result = applyAction(result, { type: 'Mulligan', playerId: p2, keep: true });
  if (isGameError(result)) throw new Error(`Mulligan p2 failed: ${result.message}`);

  return { ...result, phase };
}

// ─── DrawPhase ────────────────────────────────────────────────────────────────

describe('DrawPhase', () => {
  it('le joueur actif pioche 1 carte', () => {
    // Use turnNumber 2 — first player skips draw on their very first turn (turn 1)
    const state = { ...bootstrapGame('Draw'), turnNumber: 2 };
    const p1 = makePlayerId('p1');
    const deckBefore = state.players[p1]!.deck.length;
    const handBefore = state.players[p1]!.hand.length;

    const result = applyAction(state, { type: 'DrawPhase', playerId: p1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[p1]!.deck.length).toBe(deckBefore - 1);
      expect(result.players[p1]!.hand.length).toBe(handBefore + 1);
    }
  });

  it('la phase passe à DON après DrawPhase', () => {
    const state = bootstrapGame('Draw');
    const p1 = makePlayerId('p1');

    const result = applyAction(state, { type: 'DrawPhase', playerId: p1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.phase).toBe('DON');
    }
  });

  it("retourne WRONG_PHASE si la phase n'est pas Draw", () => {
    const state = bootstrapGame('Main');
    const p1 = makePlayerId('p1');

    const result = applyAction(state, { type: 'DrawPhase', playerId: p1 });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('WRONG_PHASE');
    }
  });

  it("retourne NOT_ACTIVE_PLAYER si ce n'est pas son tour", () => {
    const state = bootstrapGame('Draw');
    const p2 = makePlayerId('p2');

    const result = applyAction(state, { type: 'DrawPhase', playerId: p2 });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('NOT_ACTIVE_PLAYER');
    }
  });
});

// ─── PlayCharacterFromHand ────────────────────────────────────────────────────

describe('PlayCharacterFromHand', () => {
  it('la carte quitte la main et arrive sur le board', () => {
    const p1 = makePlayerId('p1');
    const state = bootstrapGame('Main');

    // Add a cost-0 character to hand + active DON not needed
    const cardId = makeCardId('test-char');
    const char: Card = {
      id: cardId,
      name: 'TestChar',
      cost: 0,
      power: 1000,
      color: 'Red',
      type: 'Character',
      zone: 'hand',
      ownerId: p1,
      tapped: false,
      attachedTo: null,
    };

    const stateWithCard: GameState = {
      ...state,
      cards: { ...state.cards, [cardId]: char },
      players: {
        ...state.players,
        [p1]: {
          ...state.players[p1]!,
          hand: [...state.players[p1]!.hand, cardId],
        },
      },
    };

    const result = applyAction(stateWithCard, {
      type: 'PlayCharacterFromHand',
      playerId: p1,
      cardId,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[p1]!.hand).not.toContain(cardId);
      expect(result.players[p1]!.board).toContain(cardId);
      expect(result.cards[cardId]!.zone).toBe('board');
    }
  });

  it("retourne INSUFFICIENT_DON si le coût n'est pas couvrable", () => {
    const p1 = makePlayerId('p1');
    const state = bootstrapGame('Main');

    // Add a cost-5 character to hand, but no DON in donArea
    const cardId = makeCardId('expensive-char');
    const char: Card = {
      id: cardId,
      name: 'ExpensiveChar',
      cost: 5,
      power: 5000,
      color: 'Red',
      type: 'Character',
      zone: 'hand',
      ownerId: p1,
      tapped: false,
      attachedTo: null,
    };

    const stateWithCard: GameState = {
      ...state,
      cards: { ...state.cards, [cardId]: char },
      players: {
        ...state.players,
        [p1]: {
          ...state.players[p1]!,
          hand: [...state.players[p1]!.hand, cardId],
          donArea: [], // pas de DON actif
        },
      },
    };

    const result = applyAction(stateWithCard, {
      type: 'PlayCharacterFromHand',
      playerId: p1,
      cardId,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('INSUFFICIENT_DON');
    }
  });

  it('les DON sont tappés après le paiement du coût', () => {
    const p1 = makePlayerId('p1');
    const state = bootstrapGame('Main');

    // Construct DON cards in donArea (active)
    const don1Id = makeCardId('don-1');
    const don2Id = makeCardId('don-2');
    const don1: Card = { id: don1Id, name: 'DON', cost: 0, power: 0, color: 'Red', type: 'DON', zone: 'donArea', ownerId: p1, tapped: false, attachedTo: null };
    const don2: Card = { ...don1, id: don2Id };

    const cardId = makeCardId('char-2cost');
    const char: Card = { id: cardId, name: 'Char', cost: 2, power: 2000, color: 'Red', type: 'Character', zone: 'hand', ownerId: p1, tapped: false, attachedTo: null };

    const stateReady: GameState = {
      ...state,
      cards: { ...state.cards, [don1Id]: don1, [don2Id]: don2, [cardId]: char },
      players: {
        ...state.players,
        [p1]: {
          ...state.players[p1]!,
          hand: [...state.players[p1]!.hand, cardId],
          donArea: [don1Id, don2Id],
        },
      },
    };

    const result = applyAction(stateReady, {
      type: 'PlayCharacterFromHand',
      playerId: p1,
      cardId,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[don1Id]!.tapped).toBe(true);
      expect(result.cards[don2Id]!.tapped).toBe(true);
    }
  });

  it("retourne CARD_NOT_IN_HAND si la carte n'est pas en main", () => {
    const p1 = makePlayerId('p1');
    const state = bootstrapGame('Main');
    const cardId = makeCardId('ghost-card');

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: p1,
      cardId,
    });

    expect(isGameError(result)).toBe(true);
  });
});

// ─── AssignDon ────────────────────────────────────────────────────────────────

describe('AssignDon', () => {
  it('le DON est attaché à la carte cible', () => {
    const p1 = makePlayerId('p1');
    const state = bootstrapGame('Main');

    const don1Id = makeCardId('adon-1');
    const don1: Card = { id: don1Id, name: 'DON', cost: 0, power: 0, color: 'Red', type: 'DON', zone: 'donArea', ownerId: p1, tapped: false, attachedTo: null };

    const charId = makeCardId('char-on-board');
    const char: Card = { id: charId, name: 'Char', cost: 0, power: 2000, color: 'Red', type: 'Character', zone: 'board', ownerId: p1, tapped: false, attachedTo: null };

    const stateReady: GameState = {
      ...state,
      cards: { ...state.cards, [don1Id]: don1, [charId]: char },
      players: {
        ...state.players,
        [p1]: {
          ...state.players[p1]!,
          board: [...state.players[p1]!.board, charId],
          donArea: [don1Id],
        },
      },
    };

    const result = applyAction(stateReady, {
      type: 'AssignDon',
      playerId: p1,
      donCardId: don1Id,
      targetCardId: charId,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[don1Id]!.attachedTo).toBe(charId);
    }
  });

  it('le DON peut être attaché au leader', () => {
    const p1 = makePlayerId('p1');
    const state = bootstrapGame('Main');
    const leaderId = state.players[p1]!.leader!;

    const donId = makeCardId('don-leader');
    const don: Card = { id: donId, name: 'DON', cost: 0, power: 0, color: 'Red', type: 'DON', zone: 'donArea', ownerId: p1, tapped: false, attachedTo: null };

    const stateReady: GameState = {
      ...state,
      cards: { ...state.cards, [donId]: don },
      players: {
        ...state.players,
        [p1]: { ...state.players[p1]!, donArea: [donId] },
      },
    };

    const result = applyAction(stateReady, {
      type: 'AssignDon',
      playerId: p1,
      donCardId: donId,
      targetCardId: leaderId,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.cards[donId]!.attachedTo).toBe(leaderId);
    }
  });

  it('retourne DON_ALREADY_ATTACHED si le DON est déjà attaché', () => {
    const p1 = makePlayerId('p1');
    const state = bootstrapGame('Main');

    const charId = makeCardId('char-target');
    const char: Card = { id: charId, name: 'Char', cost: 0, power: 2000, color: 'Red', type: 'Character', zone: 'board', ownerId: p1, tapped: false, attachedTo: null };
    const donId = makeCardId('don-attached');
    const don: Card = { id: donId, name: 'DON', cost: 0, power: 0, color: 'Red', type: 'DON', zone: 'donArea', ownerId: p1, tapped: false, attachedTo: charId }; // already attached

    const stateReady: GameState = {
      ...state,
      cards: { ...state.cards, [donId]: don, [charId]: char },
      players: {
        ...state.players,
        [p1]: {
          ...state.players[p1]!,
          board: [...state.players[p1]!.board, charId],
          donArea: [donId],
        },
      },
    };

    const result = applyAction(stateReady, {
      type: 'AssignDon',
      playerId: p1,
      donCardId: donId,
      targetCardId: charId,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('DON_ALREADY_ATTACHED');
    }
  });

  it("retourne TARGET_NOT_ON_BOARD si la cible n'est pas sur le board", () => {
    const p1 = makePlayerId('p1');
    const state = bootstrapGame('Main');

    const donId = makeCardId('don-x');
    const don: Card = { id: donId, name: 'DON', cost: 0, power: 0, color: 'Red', type: 'DON', zone: 'donArea', ownerId: p1, tapped: false, attachedTo: null };
    const ghostId = makeCardId('ghost-char');
    const ghost: Card = { id: ghostId, name: 'Ghost', cost: 0, power: 0, color: 'Red', type: 'Character', zone: 'hand', ownerId: p1, tapped: false, attachedTo: null };

    const stateReady: GameState = {
      ...state,
      cards: { ...state.cards, [donId]: don, [ghostId]: ghost },
      players: {
        ...state.players,
        [p1]: { ...state.players[p1]!, donArea: [donId] },
      },
    };

    const result = applyAction(stateReady, {
      type: 'AssignDon',
      playerId: p1,
      donCardId: donId,
      targetCardId: ghostId,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('TARGET_NOT_ON_BOARD');
    }
  });
});

// ─── EndPhase ─────────────────────────────────────────────────────────────────

describe('EndPhase', () => {
  it('avance la phase de Refresh à Draw', () => {
    const state = bootstrapGame('Refresh');
    const p1 = makePlayerId('p1');

    const result = applyAction(state, { type: 'EndPhase', playerId: p1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.phase).toBe('Draw');
    }
  });

  it('avance la phase de Main à End', () => {
    const state = bootstrapGame('Main');
    const p1 = makePlayerId('p1');

    const result = applyAction(state, { type: 'EndPhase', playerId: p1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.phase).toBe('End');
    }
  });

  it('passe au joueur suivant et revient à Refresh après la phase End', () => {
    const state = bootstrapGame('End');
    const p1 = makePlayerId('p1');
    const p2 = makePlayerId('p2');

    const result = applyAction(state, { type: 'EndPhase', playerId: p1 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activePlayerId).toBe(p2);
      expect(result.phase).toBe('Refresh');
      expect(result.turnNumber).toBe(state.turnNumber + 1);
    }
  });

  it("retourne NOT_ACTIVE_PLAYER si ce n'est pas son tour", () => {
    const state = bootstrapGame('Main');
    const p2 = makePlayerId('p2');

    const result = applyAction(state, { type: 'EndPhase', playerId: p2 });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('NOT_ACTIVE_PLAYER');
    }
  });
});
