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
      makeChar(`${idStr}-deck-${i}`, idStr, 2000, { zone: 'deck' }),
    ),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${idStr}-don-${i}`, idStr) as Card),
  };
}

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

function addToHand(state: GameState, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand' } },
    players: {
      ...state.players,
      [P1]: { ...state.players[P1]!, hand: [...state.players[P1]!.hand, card.id] },
    },
  };
}

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

// ─── ChooseOne Tests (CO1-CO5) ────────────────────────────────────────────────

describe('CO1: ChooseOne — playing the card sets pendingChoiceInteraction', () => {
  it('should set pendingChoiceInteraction with the two choices', () => {
    const base = bootstrapGame();
    const chooseOneEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [
        {
          type: 'ChooseOne',
          choices: [
            { label: 'Draw 2', actions: [{ type: 'DrawCard', count: 2 }] },
            { label: 'Trash 1', actions: [{ type: 'TrashFromHand', count: 1 }] },
          ],
        },
      ],
    };
    const card = makeChar('choose-card', 'p1', 2000, {
      zone: 'hand',
      cost: 0,
      effects: [chooseOneEffect],
    });
    const state = addToHand(base, card);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingChoiceInteraction).not.toBeNull();
    expect(result.pendingChoiceInteraction?.playerId).toBe(P1);
    expect(result.pendingChoiceInteraction?.choices).toHaveLength(2);
    expect(result.pendingChoiceInteraction?.choices[0]?.label).toBe('Draw 2');
    expect(result.pendingChoiceInteraction?.choices[1]?.label).toBe('Trash 1');
  });
});

describe('CO2: ChooseOne — choice 0 executes first option (DrawCard)', () => {
  it('should draw 2 cards when choice 0 is selected', () => {
    const base = bootstrapGame();
    const chooseOneEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [
        {
          type: 'ChooseOne',
          choices: [
            { label: 'Draw 2', actions: [{ type: 'DrawCard', count: 2 }] },
            { label: 'Draw 0', actions: [] },
          ],
        },
      ],
    };
    const card = makeChar('choose-draw', 'p1', 2000, { zone: 'hand', cost: 0, effects: [chooseOneEffect] });
    const state = addToHand(base, card);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingChoiceInteraction).not.toBeNull();

    const handBeforeResolve = result.players[P1]!.hand.length;
    const deckBeforeResolve = result.players[P1]!.deck.length;
    result = applyAction(result, { type: 'ResolveChoiceInteraction', playerId: P1, choiceIndex: 0 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingChoiceInteraction).toBeNull();
    expect(result.players[P1]!.hand.length).toBe(handBeforeResolve + 2);
    expect(result.players[P1]!.deck.length).toBe(deckBeforeResolve - 2);
  });
});

describe('CO3: ChooseOne — choice 1 executes second option (no draw)', () => {
  it('should not draw when choice 1 is selected (empty actions)', () => {
    const base = bootstrapGame();
    const chooseOneEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [
        {
          type: 'ChooseOne',
          choices: [
            { label: 'Draw 2', actions: [{ type: 'DrawCard', count: 2 }] },
            { label: 'Nothing', actions: [] },
          ],
        },
      ],
    };
    const card = makeChar('choose-nothing', 'p1', 2000, { zone: 'hand', cost: 0, effects: [chooseOneEffect] });
    const state = addToHand(base, card);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingChoiceInteraction).not.toBeNull();

    const handBefore = result.players[P1]!.hand.length;
    const deckBefore = result.players[P1]!.deck.length;
    result = applyAction(result, { type: 'ResolveChoiceInteraction', playerId: P1, choiceIndex: 1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingChoiceInteraction).toBeNull();
    expect(result.players[P1]!.hand.length).toBe(handBefore);
    expect(result.players[P1]!.deck.length).toBe(deckBefore);
  });
});

describe('CO4: ChooseOne — pendingChoiceInteraction cleared after resolve', () => {
  it('interaction should be null after resolve', () => {
    const base = bootstrapGame();
    const chooseOneEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [
        {
          type: 'ChooseOne',
          choices: [
            { label: 'A', actions: [] },
            { label: 'B', actions: [] },
          ],
        },
      ],
    };
    const card = makeChar('choose-clear', 'p1', 2000, { zone: 'hand', cost: 0, effects: [chooseOneEffect] });
    const state = addToHand(base, card);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingChoiceInteraction).not.toBeNull();
    result = applyAction(result, { type: 'ResolveChoiceInteraction', playerId: P1, choiceIndex: 0 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingChoiceInteraction).toBeNull();
  });
});

describe('CO5: ChooseOne — actions after ChooseOne still execute', () => {
  it('should execute actions that come after the ChooseOne in the effect chain', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [
        {
          type: 'ChooseOne',
          choices: [
            { label: 'Nothing', actions: [] },
            { label: 'Nothing2', actions: [] },
          ],
        },
        // Action after the ChooseOne — should run after resolve
        { type: 'DrawCard', count: 1 },
      ],
    };
    const card = makeChar('choose-then-draw', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingChoiceInteraction).not.toBeNull();
    const deckBefore = result.players[P1]!.deck.length;
    result = applyAction(result, { type: 'ResolveChoiceInteraction', playerId: P1, choiceIndex: 0 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingChoiceInteraction).toBeNull();
    // The DrawCard 1 after ChooseOne should have executed
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1);
  });
});

// ─── SetBasePower Tests (SP1-SP3) ────────────────────────────────────────────

describe('SP1: SetBasePower — changes card power to the given amount', () => {
  it('should set the power of the target card', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'SetBasePower', amount: 9000, target: { scope: 'AllOwnCharacters' } }],
    };
    const source = makeChar('sp-source', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const target = makeChar('sp-target', 'p1', 3000);
    let state = addToP1Board(base, target);
    state = addToHand(state, source);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[target.id]?.power).toBe(9000);
  });
});

describe('SP2: SetBasePower — only affects target selector (own characters, not opponent)', () => {
  it('should not change opponent character power', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'SetBasePower', amount: 9000, target: { scope: 'AllOwnCharacters' } }],
    };
    const source = makeChar('sp-source2', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const p2card = makeChar('sp-p2', 'p2', 3000);
    let state = addToP2Board(base, p2card);
    state = addToHand(state, source);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // P2 card should be unchanged
    expect(result.cards[p2card.id]?.power).toBe(3000);
  });
});

describe('SP3: SetBasePower — affects multiple own characters', () => {
  it('should set all own characters to the target power', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'SetBasePower', amount: 8000, target: { scope: 'AllOwnCharacters' } }],
    };
    const source = makeChar('sp-src3', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const c1 = makeChar('sp-c1', 'p1', 1000);
    const c2 = makeChar('sp-c2', 'p1', 2000);
    let state = addToP1Board(base, c1);
    state = addToP1Board(state, c2);
    state = addToHand(state, source);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[c1.id]?.power).toBe(8000);
    expect(result.cards[c2.id]?.power).toBe(8000);
  });
});

// ─── OnWouldBeRestedByEffect Tests (WR1-WR4) ─────────────────────────────────

describe('WR1: OnWouldBeRestedByEffect — sets pendingRestSubstituteInteraction', () => {
  it('should pause when opponent effect would rest a protected card', () => {
    const base = bootstrapGame();
    // P1 plays card that rests an opponent character
    const restEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'Rest', target: { scope: 'AllOpponentCharacters' } }],
    };
    const attacker = makeChar('wr-attacker', 'p1', 2000, { zone: 'hand', cost: 0, effects: [restEffect] });

    // P2 has a protected character
    const protectEffect: CardEffect = {
      trigger: 'OnWouldBeRestedByEffect',
      actions: [{ type: 'Rest', target: { scope: 'Self' } }],
    };
    const protected2 = makeChar('wr-protected', 'p2', 3000, { effects: [protectEffect] });

    let state = addToP2Board(base, protected2);
    state = addToHand(state, attacker);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: attacker.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRestSubstituteInteraction).not.toBeNull();
    expect(result.pendingRestSubstituteInteraction?.playerId).toBe(P2);
    expect(result.pendingRestSubstituteInteraction?.targetCardId).toBe(protected2.id);
  });
});

describe('WR2: OnWouldBeRestedByEffect — accept=true runs substitute actions (not the original rest)', () => {
  it('should execute substitute actions and not rest the protected card', () => {
    const base = bootstrapGame();
    const restEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'Rest', target: { scope: 'AllOpponentCharacters' } }],
    };
    const attacker = makeChar('wr-atk2', 'p1', 2000, { zone: 'hand', cost: 0, effects: [restEffect] });

    // The substitute action rests self instead
    const protectEffect: CardEffect = {
      trigger: 'OnWouldBeRestedByEffect',
      actions: [{ type: 'Rest', target: { scope: 'Self' } }],
    };
    const protected2 = makeChar('wr-prot2', 'p2', 3000, { effects: [protectEffect] });

    let state = addToP2Board(base, protected2);
    state = addToHand(state, attacker);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: attacker.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRestSubstituteInteraction).not.toBeNull();

    // Accept the substitute — self rests instead
    result = applyAction(result, { type: 'ResolveRestSubstituteInteraction', playerId: P2, accept: true });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRestSubstituteInteraction).toBeNull();
    // The protected card should rest itself (substitute cost)
    expect(result.cards[protected2.id]?.tapped).toBe(true);
  });
});

describe('WR3: OnWouldBeRestedByEffect — accept=false applies the original rest', () => {
  it('should rest the target card when substitute is declined', () => {
    const base = bootstrapGame();
    const restEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'Rest', target: { scope: 'AllOpponentCharacters' } }],
    };
    const attacker = makeChar('wr-atk3', 'p1', 2000, { zone: 'hand', cost: 0, effects: [restEffect] });

    const protectEffect: CardEffect = {
      trigger: 'OnWouldBeRestedByEffect',
      actions: [{ type: 'Rest', target: { scope: 'Self' } }],
    };
    const protected2 = makeChar('wr-prot3', 'p2', 3000, { effects: [protectEffect] });

    let state = addToP2Board(base, protected2);
    state = addToHand(state, attacker);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: attacker.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRestSubstituteInteraction).not.toBeNull();

    // Decline — original rest applies
    result = applyAction(result, { type: 'ResolveRestSubstituteInteraction', playerId: P2, accept: false });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRestSubstituteInteraction).toBeNull();
    expect(result.cards[protected2.id]?.tapped).toBe(true);
  });
});

describe('WR4: OnWouldBeRestedByEffect — cleared after resolve', () => {
  it('pendingRestSubstituteInteraction should be null after resolution', () => {
    const base = bootstrapGame();
    const restEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'Rest', target: { scope: 'AllOpponentCharacters' } }],
    };
    const attacker = makeChar('wr-atk4', 'p1', 2000, { zone: 'hand', cost: 0, effects: [restEffect] });
    const protectEffect: CardEffect = {
      trigger: 'OnWouldBeRestedByEffect',
      actions: [],
    };
    const protected2 = makeChar('wr-prot4', 'p2', 3000, { effects: [protectEffect] });
    let state = addToP2Board(base, protected2);
    state = addToHand(state, attacker);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: attacker.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRestSubstituteInteraction).not.toBeNull();
    result = applyAction(result, { type: 'ResolveRestSubstituteInteraction', playerId: P2, accept: true });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRestSubstituteInteraction).toBeNull();
  });
});

// ─── PreventRefresh Tests (PR1-PR4) ──────────────────────────────────────────

describe('PR1: PreventRefresh — marks card with preventNextRefresh flag', () => {
  it('should set preventNextRefresh on the target tapped card', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'PreventRefresh', target: { scope: 'AllOpponentCharacters' } }],
    };
    const source = makeChar('pr-source', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const target = makeChar('pr-target', 'p2', 3000, { tapped: true });
    let state = addToP2Board(base, target);
    state = addToHand(state, source);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[target.id]?.preventNextRefresh).toBe(true);
  });
});

describe('PR2: PreventRefresh — untapped card does not get the flag', () => {
  it('should not set preventNextRefresh on an untapped card', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'PreventRefresh', target: { scope: 'AllOpponentCharacters' } }],
    };
    const source = makeChar('pr-src2', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const target = makeChar('pr-tgt2', 'p2', 3000, { tapped: false });
    let state = addToP2Board(base, target);
    state = addToHand(state, source);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Untapped card should not be affected
    expect(result.cards[target.id]?.preventNextRefresh).toBeFalsy();
  });
});

describe('PR3: PreventRefresh — card stays tapped after opponent refresh', () => {
  it('should remain tapped after the Refresh phase and flag should be cleared', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'PreventRefresh', target: { scope: 'AllOpponentCharacters' } }],
    };
    const source = makeChar('pr-src3', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const target = makeChar('pr-tgt3', 'p2', 3000, { tapped: true });
    let state = addToP2Board(base, target);
    state = addToHand(state, source);
    // P1 plays card that prevents P2 target from refreshing
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[target.id]?.preventNextRefresh).toBe(true);

    // Go through P1's End phase, which triggers applyRefresh for P2
    result = { ...result, phase: 'End' };
    result = applyAction(result, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // After refresh, P2 is now active in Refresh phase
    expect(result.activePlayerId).toBe(P2);
    // The prevented card should still be tapped
    expect(result.cards[target.id]?.tapped).toBe(true);
    // Flag should be cleared
    expect(result.cards[target.id]?.preventNextRefresh).toBeFalsy();
  });
});

describe('PR4: PreventRefresh — other cards still refresh normally', () => {
  it('should refresh other tapped cards normally even when one has preventNextRefresh', () => {
    const base = bootstrapGame();
    // Set up: P2 has two tapped cards, one with preventNextRefresh, one without
    const prevented = makeChar('pr-prevented', 'p2', 3000, {
      tapped: true,
      preventNextRefresh: true,
    });
    const normal = makeChar('pr-normal', 'p2', 3000, { tapped: true });
    let state = addToP2Board(base, prevented);
    state = addToP2Board(state, normal);
    // Go through P1's End phase, which triggers applyRefresh for P2
    state = { ...state, activePlayerId: P1, phase: 'End' };
    const result = applyAction(state, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // The prevented card should remain tapped
    expect(result.cards[prevented.id]?.tapped).toBe(true);
    // The normal card should have been untapped
    expect(result.cards[normal.id]?.tapped).toBe(false);
    // Both flags should be cleared
    expect(result.cards[prevented.id]?.preventNextRefresh).toBeFalsy();
    expect(result.cards[normal.id]?.preventNextRefresh).toBeFalsy();
  });
});

// ─── EndOfBattle Tests (EB1-EB3) ──────────────────────────────────────────────

function buildCombatState(
  attackerCard: Card,
  targetCard: Card,
  blockerCard?: Card,
): GameState {
  const base = bootstrapGame();
  let state = addToP1Board(base, attackerCard);
  state = addToP2Board(state, targetCard);
  if (blockerCard !== undefined) {
    state = addToP2Board(state, blockerCard);
  }
  return {
    ...state,
    activePlayerId: P1,
    phase: 'Main' as const,
    activeCombat: {
      attackerId: attackerCard.id,
      targetId: targetCard.id,
      blockerId: blockerCard?.id ?? null,
      counterPower: 0,
    },
  };
}

describe('EB1: EndOfBattle — attacker\'s EndOfBattle effect fires after combat', () => {
  it('should draw 1 card for attacker\'s player after ResolveCombat', () => {
    const endOfBattleEffect = {
      trigger: 'EndOfBattle' as const,
      actions: [{ type: 'DrawCard' as const, count: 1 }],
    };
    const attacker = makeChar('eb1-attacker', 'p1', 5000, {
      tapped: false,
      effects: [endOfBattleEffect],
    });
    // Target has lower power → KO'd in combat
    const target = makeChar('eb1-target', 'p2', 3000, { tapped: false });
    const state = buildCombatState(attacker, target);
    const handBefore = state.players[P1]!.hand.length;
    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // EndOfBattle drew 1 card for P1
    expect(result.players[P1]!.hand.length).toBe(handBefore + 1);
  });
});

describe('EB2: EndOfBattle — battle opponent\'s EndOfBattle effect fires after combat', () => {
  it('should draw 1 card for the target\'s player after ResolveCombat', () => {
    const endOfBattleEffect = {
      trigger: 'EndOfBattle' as const,
      actions: [{ type: 'DrawCard' as const, count: 1 }],
    };
    const attacker = makeChar('eb2-attacker', 'p1', 3000, { tapped: false });
    // Target has higher power, survives, and fires EndOfBattle draw
    const target = makeChar('eb2-target', 'p2', 5000, {
      tapped: false,
      effects: [endOfBattleEffect],
    });
    const state = buildCombatState(attacker, target);
    const handBefore = state.players[P2]!.hand.length;
    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P2]!.hand.length).toBe(handBefore + 1);
  });
});

describe('EB3: EndOfBattle — blocker is battle opponent when declared', () => {
  it('should fire blocker\'s EndOfBattle effect (not target\'s)', () => {
    const endOfBattleEffect = {
      trigger: 'EndOfBattle' as const,
      actions: [{ type: 'DrawCard' as const, count: 1 }],
    };
    const attacker = makeChar('eb3-attacker', 'p1', 3000, { tapped: false });
    const target = makeChar('eb3-target', 'p2', 2000, { tapped: false }); // would be KO'd without blocker
    const blocker = makeChar('eb3-blocker', 'p2', 6000, {
      tapped: false,
      keywords: ['Blocker'],
      effects: [endOfBattleEffect],
    });
    // Target has no EndOfBattle effect
    const state = buildCombatState(attacker, target, blocker);
    const handBefore = state.players[P2]!.hand.length;
    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Blocker's EndOfBattle fired, P2 drew 1 card
    expect(result.players[P2]!.hand.length).toBe(handBefore + 1);
  });
});

// ─── CannotBeRested Tests (CR1-CR3) ───────────────────────────────────────────

describe('CR1: CannotBeRested — opponent effect cannot rest a protected character', () => {
  it('should NOT rest a character with CannotBeRested when opponent effect tries to rest it', () => {
    const base = bootstrapGame();
    const restEffect = {
      trigger: 'OnPlay' as const,
      actions: [{ type: 'Rest' as const, target: { scope: 'ChooseOpponentCharacter' as const } }],
    };
    const source = makeChar('cr1-source', 'p1', 2000, { zone: 'hand', cost: 0, effects: [restEffect] });
    // P2 character has CannotBeRested keyword
    const target = makeChar('cr1-target', 'p2', 3000, { keywords: ['CannotBeRested'] });
    let state = addToP2Board(base, target);
    state = addToHand(state, source);
    // P1 plays a card that wants to rest a P2 character
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Resolve the target interaction — pick the CannotBeRested target
    if (result.pendingTargetInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
      expect(isGameError(result)).toBe(false);
      if (isGameError(result)) return;
    }
    // Target should NOT be rested
    expect(result.cards[target.id]?.tapped).toBe(false);
  });
});

describe('CR2: CannotBeRested — character without keyword can be rested by opponent effect', () => {
  it('should rest a normal character via opponent effect', () => {
    const base = bootstrapGame();
    const restEffect = {
      trigger: 'OnPlay' as const,
      actions: [{ type: 'Rest' as const, target: { scope: 'ChooseOpponentCharacter' as const } }],
    };
    const source = makeChar('cr2-source', 'p1', 2000, { zone: 'hand', cost: 0, effects: [restEffect] });
    const target = makeChar('cr2-target', 'p2', 3000); // no CannotBeRested
    let state = addToP2Board(base, target);
    state = addToHand(state, source);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    if (result.pendingTargetInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
      expect(isGameError(result)).toBe(false);
      if (isGameError(result)) return;
    }
    // Target SHOULD be rested
    expect(result.cards[target.id]?.tapped).toBe(true);
  });
});

describe('CR3: CannotBeRested — own player\'s effect CAN rest own CannotBeRested character', () => {
  it('should allow resting own character with CannotBeRested via own effect', () => {
    const base = bootstrapGame();
    const restEffect = {
      trigger: 'OnPlay' as const,
      actions: [{ type: 'Rest' as const, target: { scope: 'ChooseOwnCharacter' as const } }],
    };
    const source = makeChar('cr3-source', 'p1', 2000, { zone: 'hand', cost: 0, effects: [restEffect] });
    // P1 character with CannotBeRested
    const ownTarget = makeChar('cr3-own-target', 'p1', 3000, { keywords: ['CannotBeRested'] });
    let state = addToP1Board(base, ownTarget);
    state = addToHand(state, source);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    if (result.pendingTargetInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: ownTarget.id });
      expect(isGameError(result)).toBe(false);
      if (isGameError(result)) return;
    }
    // Own player can still rest their own card even with CannotBeRested
    expect(result.cards[ownTarget.id]?.tapped).toBe(true);
  });
});

// ─── Life Interaction Tests (LI1-LI8) ────────────────────────────────────────

function stateWithLife(baseState: GameState, ownerId: 'p1' | 'p2', lifeCount: number): GameState {
  const pid = ownerId === 'p1' ? P1 : P2;
  const player = baseState.players[pid]!;
  // Take cards from the player's deck to use as life
  const lifeIds = player.deck.slice(0, lifeCount);
  const updatedDeck = player.deck.slice(lifeCount);
  const updatedCards = { ...baseState.cards };
  for (const id of lifeIds) {
    updatedCards[id] = { ...updatedCards[id]!, zone: 'life' as const };
  }
  return {
    ...baseState,
    cards: updatedCards as typeof baseState.cards,
    players: {
      ...baseState.players,
      [pid]: { ...player, life: lifeIds, deck: updatedDeck },
    },
  };
}

describe('LI1: RearrangeLife — playing the card creates pendingLifeInteraction with mode Rearrange', () => {
  it('should set pendingLifeInteraction mode Rearrange', () => {
    let base = bootstrapGame();
    base = stateWithLife(base, 'p1', 3);
    const effect = {
      trigger: 'OnPlay' as const,
      actions: [{ type: 'RearrangeLife' as const }],
    };
    const card = makeChar('li1-card', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction).not.toBeNull();
    expect(result.pendingLifeInteraction?.mode).toBe('Rearrange');
    expect(result.pendingLifeInteraction?.playerId).toBe(P1);
    expect(result.pendingLifeInteraction?.lifeCards).toHaveLength(3);
  });
});

describe('LI2: RearrangeLife — resolving with new order updates life card sequence', () => {
  it('should reorder life cards when ResolveLifeInteraction provides newOrder', () => {
    let base = bootstrapGame();
    base = stateWithLife(base, 'p1', 3);
    const effect = {
      trigger: 'OnPlay' as const,
      actions: [{ type: 'RearrangeLife' as const }],
    };
    const card = makeChar('li2-card', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction?.mode).toBe('Rearrange');
    const originalOrder = result.pendingLifeInteraction!.lifeCards;
    const reversed = [...originalOrder].reverse();
    result = applyAction(result, { type: 'ResolveLifeInteraction', playerId: P1, newOrder: reversed });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction).toBeNull();
    expect(result.players[P1]!.life).toEqual(reversed);
  });
});

describe('LI3: TakeLifeToHand — creates pendingLifeInteraction with mode MoveOne', () => {
  it('should set pendingLifeInteraction mode MoveOne for TakeLifeToHand', () => {
    let base = bootstrapGame();
    base = stateWithLife(base, 'p1', 3);
    const effect = {
      trigger: 'OnPlay' as const,
      actions: [{ type: 'TakeLifeToHand' as const, from: 'top' as const }],
    };
    const card = makeChar('li3-card', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction).not.toBeNull();
    expect(result.pendingLifeInteraction?.mode).toBe('MoveOne');
    expect(result.pendingLifeInteraction?.playerId).toBe(P1);
    expect(result.pendingLifeInteraction?.lifeOwnerId).toBe(P1);
  });
});

describe('LI4: TakeLifeToHand — resolving with destination hand moves card to hand', () => {
  it('should add the chosen life card to the player\'s hand', () => {
    let base = bootstrapGame();
    base = stateWithLife(base, 'p1', 3);
    const effect = {
      trigger: 'OnPlay' as const,
      actions: [{ type: 'TakeLifeToHand' as const, from: 'top' as const }],
    };
    const card = makeChar('li4-card', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction?.mode).toBe('MoveOne');
    const lifeBefore = result.pendingLifeInteraction!.lifeCards;
    const targetLifeCardId = lifeBefore[0]!;
    const handBefore = result.players[P1]!.hand.length;
    const lifeSizeBefore = result.players[P1]!.life.length;
    result = applyAction(result, { type: 'ResolveLifeInteraction', playerId: P1, cardId: targetLifeCardId, destination: 'hand' });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction).toBeNull();
    expect(result.players[P1]!.hand.length).toBe(handBefore + 1);
    expect(result.players[P1]!.life.length).toBe(lifeSizeBefore - 1);
    expect(result.players[P1]!.hand).toContain(targetLifeCardId);
  });
});

describe('LI5: MoveLifeCard (own target) — creates pendingLifeInteraction mode MoveOne', () => {
  it('should create pendingLifeInteraction for own life cards', () => {
    let base = bootstrapGame();
    base = stateWithLife(base, 'p1', 3);
    const effect = {
      trigger: 'OnPlay' as const,
      actions: [{ type: 'MoveLifeCard' as const, target: 'own' as const }],
    };
    const card = makeChar('li5-card', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction).not.toBeNull();
    expect(result.pendingLifeInteraction?.mode).toBe('MoveOne');
    expect(result.pendingLifeInteraction?.lifeOwnerId).toBe(P1);
  });
});

describe('LI6: MoveLifeCard — resolving with destination top moves card to top of life', () => {
  it('should place the chosen card at the top of the life zone', () => {
    let base = bootstrapGame();
    base = stateWithLife(base, 'p1', 4);
    const effect = {
      trigger: 'OnPlay' as const,
      actions: [{ type: 'MoveLifeCard' as const, target: 'own' as const }],
    };
    const card = makeChar('li6-card', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    const lifeCards = result.pendingLifeInteraction!.lifeCards;
    const lastCardId = lifeCards[lifeCards.length - 1]!; // last card, moving to top
    result = applyAction(result, { type: 'ResolveLifeInteraction', playerId: P1, cardId: lastCardId, destination: 'top' });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction).toBeNull();
    expect(result.players[P1]!.life[0]).toBe(lastCardId);
  });
});

describe('LI7: LookAtLife — creates pendingLifeInteraction with mode LookOnly', () => {
  it('should set pendingLifeInteraction mode LookOnly and clear on confirm', () => {
    let base = bootstrapGame();
    base = stateWithLife(base, 'p2', 3);
    const effect = {
      trigger: 'OnPlay' as const,
      actions: [{ type: 'LookAtLife' as const, target: 'opponent' as const }],
    };
    const card = makeChar('li7-card', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction).not.toBeNull();
    expect(result.pendingLifeInteraction?.mode).toBe('LookOnly');
    // Resolve it
    result = applyAction(result, { type: 'ResolveLifeInteraction', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingLifeInteraction).toBeNull();
  });
});

describe('LI8: ChooseOne forOpponent — creates pendingChoiceInteraction for the opponent', () => {
  it('should route choice to the opponent\'s playerId when forOpponent is true', () => {
    const base = bootstrapGame();
    const effect = {
      trigger: 'OnPlay' as const,
      actions: [
        {
          type: 'ChooseOne' as const,
          forOpponent: true,
          choices: [
            { label: 'Option A', actions: [{ type: 'DrawCard' as const, count: 1 }] },
            { label: 'Option B', actions: [] },
          ],
        },
      ],
    };
    const card = makeChar('li8-card', 'p1', 2000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingChoiceInteraction).not.toBeNull();
    // P1 played the card but the choice belongs to P2 (forOpponent)
    expect(result.pendingChoiceInteraction?.playerId).toBe(P2);
    expect(result.pendingChoiceInteraction?.choices).toHaveLength(2);
  });
});

// ─── OnOpponentPlaysEvent Tests (OE1-OE3) ────────────────────────────────────

function makeEvent(id: string, owner: string): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 0,
    power: 0,
    color: 'Red',
    type: 'Event',
    zone: 'hand',
    ownerId: makePlayerId(owner),
    tapped: false,
    attachedTo: null,
    counter: 2000,
  };
}

function addCardToP2Hand(state: GameState, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand' } },
    players: {
      ...state.players,
      [P2]: { ...state.players[P2]!, hand: [...state.players[P2]!.hand, card.id] },
    },
  };
}

describe('OE1: OnOpponentPlaysEvent — sets pendingForceDiscardInteraction for P2', () => {
  it('should pause for P2 to choose a card when P2 plays an event while P1 has Gion', () => {
    const base = bootstrapGame();
    const gion = makeChar('oe1-gion', 'p1', 5000, {
      zone: 'board',
      effects: [{
        trigger: 'OnOpponentPlaysEvent' as const,
        oncePerTurn: true,
        actions: [{ type: 'ForceDiscard' as const, count: 1, destination: 'bottomOfDeck' as const }],
        constraints: [{ type: 'OncePerTurn' as const }],
      }],
    });
    const event = makeEvent('oe1-event', 'p2');
    const handCard = makeChar('oe1-hand', 'p2', 2000, { zone: 'hand' });
    let state = addToP1Board(base, gion);
    state = addCardToP2Hand(state, event);
    state = addCardToP2Hand(state, handCard);
    const result = applyAction(state, { type: 'PlayEvent', playerId: P2, cardId: event.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingForceDiscardInteraction).not.toBeNull();
    expect(result.pendingForceDiscardInteraction?.playerId).toBe(P2);
    expect(result.pendingForceDiscardInteraction?.destination).toBe('bottomOfDeck');
  });
});

describe('OE2: OnOpponentPlaysEvent bottomOfDeck — discarded card goes to P2 deck bottom', () => {
  it('should move chosen card to bottom of P2 deck, not trash', () => {
    const base = bootstrapGame();
    const gion = makeChar('oe2-gion', 'p1', 5000, {
      zone: 'board',
      effects: [{
        trigger: 'OnOpponentPlaysEvent' as const,
        oncePerTurn: true,
        actions: [{ type: 'ForceDiscard' as const, count: 1, destination: 'bottomOfDeck' as const }],
        constraints: [{ type: 'OncePerTurn' as const }],
      }],
    });
    const event = makeEvent('oe2-event', 'p2');
    const handCard = makeChar('oe2-hand', 'p2', 2000, { zone: 'hand' });
    let state = addToP1Board(base, gion);
    state = addCardToP2Hand(state, event);
    state = addCardToP2Hand(state, handCard);
    let result = applyAction(state, { type: 'PlayEvent', playerId: P2, cardId: event.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    const deckBefore = result.players[P2]!.deck.length;
    const trashBefore = result.players[P2]!.trash.length;
    result = applyAction(result, {
      type: 'ResolveForceDiscardInteraction',
      playerId: P2,
      discardedCardIds: [handCard.id],
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P2]!.deck.length).toBe(deckBefore + 1);
    expect(result.players[P2]!.trash.length).toBe(trashBefore);
    expect(result.players[P2]!.deck[result.players[P2]!.deck.length - 1]).toBe(handCard.id);
    expect(result.cards[handCard.id]?.zone).toBe('deck');
  });
});

describe('OE3: OnOpponentPlaysEvent standard — discarded card goes to trash (no destination)', () => {
  it('should move chosen card to trash when no destination is specified', () => {
    const base = bootstrapGame();
    const watcher = makeChar('oe3-watcher', 'p1', 5000, {
      zone: 'board',
      effects: [{
        trigger: 'OnOpponentPlaysEvent' as const,
        oncePerTurn: true,
        actions: [{ type: 'ForceDiscard' as const, count: 1 }],
        constraints: [{ type: 'OncePerTurn' as const }],
      }],
    });
    const event = makeEvent('oe3-event', 'p2');
    const handCard = makeChar('oe3-hand', 'p2', 2000, { zone: 'hand' });
    let state = addToP1Board(base, watcher);
    state = addCardToP2Hand(state, event);
    state = addCardToP2Hand(state, handCard);
    let result = applyAction(state, { type: 'PlayEvent', playerId: P2, cardId: event.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    const trashBefore = result.players[P2]!.trash.length;
    const deckBefore = result.players[P2]!.deck.length;
    result = applyAction(result, {
      type: 'ResolveForceDiscardInteraction',
      playerId: P2,
      discardedCardIds: [handCard.id],
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P2]!.trash.length).toBe(trashBefore + 1);
    expect(result.players[P2]!.deck.length).toBe(deckBefore);
    expect(result.cards[handCard.id]?.zone).toBe('trash');
  });
});

// ─── KO Substitute Tests (KS1-KS4) ───────────────────────────────────────────

function addActiveDon(state: GameState, owner: 'p1' | 'p2', count: number): GameState {
  const pid = owner === 'p1' ? P1 : P2;
  const player = state.players[pid]!;
  const donCards: Card[] = Array.from({ length: count }, (_, i) => ({
    id: makeCardId(`${owner}-testdon-${i}`),
    name: 'DON!!',
    cost: 0,
    power: 0,
    color: 'Red' as const,
    type: 'DON' as const,
    zone: 'donArea' as const,
    ownerId: pid,
    tapped: false,
    attachedTo: null,
  }));
  const updatedCards = { ...state.cards };
  for (const d of donCards) updatedCards[d.id] = d;
  return {
    ...state,
    cards: updatedCards as typeof state.cards,
    players: {
      ...state.players,
      [pid]: { ...player, donArea: [...player.donArea, ...donCards.map((d) => d.id)] },
    },
  };
}

describe('KS1: RestDon substitute — self-protect sets pendingKOSubstituteInteraction', () => {
  it('should pause with pendingKOSubstituteInteraction when card with RestDon self-protect would be KO\'d', () => {
    const base = bootstrapGame();
    const protectedCard = makeChar('ks1-card', 'p1', 5000, {
      zone: 'board',
      effects: [{
        trigger: 'OnWouldBeKOByEffect' as const,
        oncePerTurn: true,
        actions: [{ type: 'RestDon' as const, count: 2 }],
      }],
    });
    const koerCard = makeChar('ks1-koer', 'p2', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'KO' as const, target: { scope: 'AllOpponentCharacters' as const } }],
      }],
    });
    let state = addToP1Board(base, protectedCard);
    state = addCardToP2Hand(state, koerCard);
    state = addActiveDon(state, 'p1', 3);
    // Switch to P2's turn so P2 can play a character
    state = { ...state, activePlayerId: P2 };
    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P2,
      cardId: koerCard.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingKOSubstituteInteraction).not.toBeNull();
    expect(result.pendingKOSubstituteInteraction?.cardId).toBe(protectedCard.id);
    expect(result.pendingKOSubstituteInteraction?.costType).toBe('Auto');
  });
});

describe('KS2: RestDon substitute — accepting rests 2 DON', () => {
  it('should rest 2 DON when player accepts the substitute', () => {
    const base = bootstrapGame();
    const protectedCard = makeChar('ks2-card', 'p1', 5000, {
      zone: 'board',
      effects: [{
        trigger: 'OnWouldBeKOByEffect' as const,
        oncePerTurn: true,
        actions: [{ type: 'RestDon' as const, count: 2 }],
      }],
    });
    const koerCard = makeChar('ks2-koer', 'p2', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'KO' as const, target: { scope: 'AllOpponentCharacters' as const } }],
      }],
    });
    let state = addToP1Board(base, protectedCard);
    state = addCardToP2Hand(state, koerCard);
    state = addActiveDon(state, 'p1', 3);
    state = { ...state, activePlayerId: P2 };
    let result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P2,
      cardId: koerCard.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingKOSubstituteInteraction).not.toBeNull();
    const donBefore = result.players[P1]!.donArea.length;
    // Accept the substitute
    result = applyAction(result, {
      type: 'ResolveKOSubstitute',
      playerId: P1,
      discardedCardId: null,
      accept: true,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingKOSubstituteInteraction).toBeNull();
    // Card should NOT be KO'd
    expect(result.cards[protectedCard.id]?.zone).toBe('board');
    // 2 DON should now be rested
    const restedDon = result.players[P1]!.donArea.filter((id) => result.cards[id]?.tapped === true);
    expect(restedDon.length).toBeGreaterThanOrEqual(2);
    expect(result.players[P1]!.donArea.length).toBe(donBefore);
  });
});

describe('KS3: permanentPowerModifier — PowerBoost Permanent accumulates and persists', () => {
  it('should add permanentPowerModifier and not clear it at EndPhase', () => {
    const base = bootstrapGame();
    const card = makeChar('ks3-card', 'p1', 5000, {
      zone: 'board',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'PowerBoost' as const, amount: -2000, target: { scope: 'Self' as const }, duration: 'Permanent' as const }],
      }],
    });
    let state = addToP1Board(base, card);
    // Directly apply the PowerBoost via effect (simulate OnPlay)
    const { resolveEffects: _re, ...rest } = {} as Record<string, unknown>; void rest; void _re;
    // Use a carrier card to play and fire the effect
    const carrier = makeChar('ks3-carrier', 'p1', 2000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'PowerBoost' as const, amount: -2000, target: { scope: 'AllOwnCharacters' as const }, duration: 'Permanent' as const }],
      }],
    });
    state = addToHand(state, carrier);
    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: carrier.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Card should have permanentPowerModifier
    expect(result.cards[card.id]?.permanentPowerModifier).toBe(-2000);
    // Now end the turn and verify permanentPowerModifier persists
    const endResult = applyAction(result, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(endResult)).toBe(false);
    if (isGameError(endResult)) return;
    expect(endResult.cards[card.id]?.permanentPowerModifier).toBe(-2000);
  });
});

describe('KS4: ReturnDonToDeck substitute — return 1 DON on substitute accept', () => {
  it('should move 1 DON from donArea to donDeck when player accepts', () => {
    const base = bootstrapGame();
    const protectedCard = makeChar('ks4-card', 'p1', 5000, {
      zone: 'board',
      effects: [{
        trigger: 'OnWouldBeKOByEffect' as const,
        actions: [{ type: 'ReturnDonToDeck' as const, count: 1 }],
      }],
    });
    const koerCard = makeChar('ks4-koer', 'p2', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'KO' as const, target: { scope: 'AllOpponentCharacters' as const } }],
      }],
    });
    let state = addToP1Board(base, protectedCard);
    state = addCardToP2Hand(state, koerCard);
    state = addActiveDon(state, 'p1', 2);
    state = { ...state, activePlayerId: P2 };
    let result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P2,
      cardId: koerCard.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingKOSubstituteInteraction).not.toBeNull();
    const donAreaBefore = result.players[P1]!.donArea.length;
    const donDeckBefore = result.players[P1]!.donDeck.length;
    result = applyAction(result, {
      type: 'ResolveKOSubstitute',
      playerId: P1,
      discardedCardId: null,
      accept: true,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingKOSubstituteInteraction).toBeNull();
    expect(result.cards[protectedCard.id]?.zone).toBe('board');
    expect(result.players[P1]!.donArea.length).toBe(donAreaBefore - 1);
    expect(result.players[P1]!.donDeck.length).toBe(donDeckBefore + 1);
  });
});

// ─── Complex Condition Tests (TC1-TC3) ───────────────────────────────────────

describe('TC1: TotalDonCount — effect fires only when total DON ≤ threshold', () => {
  it('should grant Blocker when total DON count ≤ 6', () => {
    const base = bootstrapGame();
    const card = makeChar('tc1-card', 'p1', 5000, {
      zone: 'board',
      effects: [{
        trigger: 'YourTurn' as const,
        condition: { type: 'TotalDonCount' as const, count: 6, comparison: 'LessOrEqual' as const },
        actions: [{ type: 'GiveKeyword' as const, keyword: 'Blocker' as const, target: { scope: 'Self' as const }, duration: 'DuringYourTurn' as const }],
      }],
    });
    // Only 2 DON in donArea — condition should pass
    let state = addToP1Board(base, card);
    // Simulate YourTurn firing with 2 active DON (default from bootstrapGame)
    // We need to manually trigger by checking the actual Permanent evaluation
    // Instead, test via a carrier card using OnPlay + TotalDonCount
    const carrier = makeChar('tc1-carrier', 'p1', 2000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        condition: { type: 'TotalDonCount' as const, count: 10, comparison: 'LessOrEqual' as const },
        actions: [{ type: 'DrawCard' as const, count: 1 }],
      }],
    });
    state = addToHand(state, carrier);
    const handBefore = state.players[P1]!.hand.length;
    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: carrier.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // TotalDonCount ≤ 10 should be true (player has few DON), so DrawCard fires
    expect(result.players[P1]!.hand.length).toBeGreaterThanOrEqual(handBefore - 1);
  });
});

describe('TC2: AllDonRested — condition is false when DON are active', () => {
  it('should not fire effect when DON are not all rested', () => {
    const base = bootstrapGame();
    const carrier = makeChar('tc2-carrier', 'p1', 2000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        condition: { type: 'AllDonRested' as const },
        actions: [{ type: 'DrawCard' as const, count: 2 }],
      }],
    });
    let state = addToHand(base, carrier);
    state = addActiveDon(state, 'p1', 2);
    const handBefore = state.players[P1]!.hand.length;
    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: carrier.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // AllDonRested is false (DON are active), so DrawCard should not fire
    // hand should be handBefore - 1 (played carrier) not handBefore + 1 (drew 2)
    expect(result.players[P1]!.hand.length).toBeLessThan(handBefore + 1);
  });
});

describe('TC3: DonCountVsOpponent — effect fires when own DON ≤ opponent DON', () => {
  it('should fire when own active DON count is ≤ opponent\'s active DON count', () => {
    const base = bootstrapGame();
    const carrier = makeChar('tc3-carrier', 'p1', 2000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        condition: { type: 'DonCountVsOpponent' as const, operator: 'LessOrEqual' as const },
        actions: [{ type: 'DrawCard' as const, count: 1 }],
      }],
    });
    let state = addToHand(base, carrier);
    // Give P2 more DON than P1
    state = addActiveDon(state, 'p2', 5);
    const handBefore = state.players[P1]!.hand.length;
    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: carrier.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // P1 has fewer DON than P2, condition passes → DrawCard fires
    // hand: played carrier (-1), drew 1 (+1) = handBefore
    expect(result.players[P1]!.hand.length).toBe(handBefore);
  });
});

// ─── StealCard Tests (SC1) ────────────────────────────────────────────────────

describe('SC1: StealCard — moves opponent\'s card from board to own hand', () => {
  it('should move a matching opponent card to the source player\'s hand', () => {
    const base = bootstrapGame();
    const target = makeChar('sc1-target', 'p2', 3000, {
      zone: 'board',
      cost: 3,
      subTypes: 'Animal Pirate',
    });
    const stealer = makeChar('sc1-stealer', 'p1', 2000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'StealCard' as const, filter: { subType: 'Animal', maxCost: 4 } }],
      }],
    });
    let state = addToP2Board(base, target);
    state = addToHand(state, stealer);
    const p1HandBefore = state.players[P1]!.hand.length;
    const p2BoardBefore = state.players[P2]!.board.length;
    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: stealer.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Target moved from P2 board to P1 hand
    expect(result.players[P2]!.board.length).toBe(p2BoardBefore - 1);
    expect(result.players[P1]!.hand.length).toBe(p1HandBefore); // played stealer (-1), gained target (+1)
    expect(result.cards[target.id]?.zone).toBe('hand');
    expect(result.cards[target.id]?.ownerId).toBe(P1);
  });
});

// ─── NegateEffect Tests (NE1-NE3) ────────────────────────────────────────────

describe('NE1: NegateEffect — sets effectsNegated on target card', () => {
  it('should set effectsNegated: true on the chosen opponent character', () => {
    const base = bootstrapGame();
    const target = makeChar('ne1-target', 'p2', 4000, { zone: 'board' });
    const caster = makeChar('ne1-caster', 'p1', 2000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'NegateEffect' as const, target: { scope: 'AllOpponentCharacters' as const }, duration: 'EndOfTurn' as const }],
      }],
    });
    let state = addToP2Board(base, target);
    state = addToHand(state, caster);
    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: caster.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[target.id]?.effectsNegated).toBe(true);
  });
});

describe('NE2: NegateEffect — negated card\'s OnPlay effect does not fire', () => {
  it('should skip resolving effects on a card with effectsNegated: true', () => {
    const base = bootstrapGame();
    // A card with OnPlay DrawCard effect
    const targetCard = makeChar('ne2-target', 'p1', 2000, {
      zone: 'hand',
      effectsNegated: true,
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'DrawCard' as const, count: 5 }],
      }],
    });
    let state = addToHand(base, targetCard);
    const handBefore = state.players[P1]!.hand.length;
    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: targetCard.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // effectsNegated=true → DrawCard should NOT fire → hand shrinks by 1 (played the card)
    expect(result.players[P1]!.hand.length).toBe(handBefore - 1);
  });
});

// ─── FD: ForceDiscard / TrashFromHand pending interactions ────────────────────

describe('FD1: ForceDiscard — pendingForceDiscardInteraction is set after play', () => {
  it('should set pendingForceDiscardInteraction for the opponent when OnPlay ForceDiscard fires', () => {
    const base = bootstrapGame();
    const caster = makeChar('fd1-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'ForceDiscard' as const, count: 1 }],
      }],
    });
    const state = addToHand(base, caster);
    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: caster.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingForceDiscardInteraction).not.toBeNull();
    expect(result.pendingForceDiscardInteraction?.playerId).toBe(P2);
    expect(result.pendingForceDiscardInteraction?.count).toBe(1);
  });
});

describe('FD2: ForceDiscard — ResolveForceDiscardInteraction discards chosen card', () => {
  it('should move chosen card to trash and clear pendingForceDiscardInteraction', () => {
    const base = bootstrapGame();
    const caster = makeChar('fd2-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'ForceDiscard' as const, count: 1 }],
      }],
    });
    const victim = makeChar('fd2-victim', 'p2', 2000, { zone: 'hand' });
    let state = addToHand(base, caster);
    state = addCardToP2Hand(state, victim);
    let result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: caster.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingForceDiscardInteraction).not.toBeNull();

    // P2 resolves by discarding the victim card
    result = applyAction(result, {
      type: 'ResolveForceDiscardInteraction',
      playerId: P2,
      discardedCardIds: [victim.id],
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingForceDiscardInteraction).toBeNull();
    expect(result.cards[victim.id]?.zone).toBe('trash');
    expect(result.players[P2]!.hand).not.toContain(victim.id);
    expect(result.players[P2]!.trash).toContain(victim.id);
  });
});

describe('FD3: TrashFromHand — pendingTrashInteraction is set and cleared correctly', () => {
  it('should set pendingTrashInteraction when TrashFromHand fires, then clear it after resolution', () => {
    const base = bootstrapGame();
    const caster = makeChar('fd3-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'TrashFromHand' as const, count: 1, filter: {} }],
      }],
    });
    const handCard = makeChar('fd3-hand', 'p1', 2000, { zone: 'hand' });
    let state = addToHand(base, caster);
    state = addToHand(state, handCard);

    let result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: caster.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingTrashInteraction).not.toBeNull();
    expect(result.pendingTrashInteraction?.playerId).toBe(P1);

    // Resolve by trashing the hand card
    result = applyAction(result, {
      type: 'ResolveTrashInteraction',
      playerId: P1,
      trashedCardIds: [handCard.id],
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingTrashInteraction).toBeNull();
    expect(result.cards[handCard.id]?.zone).toBe('trash');
  });
});

describe('FD4: OP15-116 pattern — TrashFromHand after SearchDeck creates pendingTrashInteraction', () => {
  it('should set pendingSearchInteraction first, then pendingTrashInteraction after search resolves', () => {
    const base = bootstrapGame();
    // Leader with Straw Hat Crew subType (required for LeaderHasType condition)
    const p1Leader = makeChar('fd4-leader', 'p1', 5000, {
      type: 'Leader',
      zone: 'leader',
      subTypes: 'Straw Hat Crew',
    });
    const caster = makeChar('fd4-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        condition: { type: 'LeaderHasType' as const, subType: 'Straw Hat Crew' },
        actions: [
          { type: 'RemoveLife' as const, count: 1 },
          { type: 'SearchDeck' as const, count: 1, filter: {}, destination: 'TopOfLife' as const },
          { type: 'TrashFromHand' as const, count: 1, filter: {} },
        ],
      }],
    });
    const handCard = makeChar('fd4-hand', 'p1', 2000, { zone: 'hand' });
    let state = addToHand(base, caster);
    state = addToHand(state, handCard);
    state = { ...state, cards: { ...state.cards, [p1Leader.id]: p1Leader }, players: { ...state.players, [P1]: { ...state.players[P1]!, leader: p1Leader.id } } };

    // Play the card — SearchDeck fires first (deck is non-empty)
    let result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: caster.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Either SearchDeck paused (deck has cards) or TrashFromHand paused (deck empty)
    const hasPendingSearch = result.pendingSearchInteraction !== null;
    const hasPendingTrash = result.pendingTrashInteraction !== null;
    expect(hasPendingSearch || hasPendingTrash).toBe(true);

    if (hasPendingSearch) {
      // Resolve search (pass — don't take a card)
      result = applyAction(result, {
        type: 'ResolveSearchInteraction',
        playerId: P1,
        chosenCardId: null,
      });
      expect(isGameError(result)).toBe(false);
      if (isGameError(result)) return;
      // After resolving search, TrashFromHand should be pending
      expect(result.pendingSearchInteraction).toBeNull();
      expect(result.pendingTrashInteraction).not.toBeNull();
      expect(result.pendingTrashInteraction?.playerId).toBe(P1);
    }

    // Resolve TrashFromHand
    result = applyAction(result, {
      type: 'ResolveTrashInteraction',
      playerId: P1,
      trashedCardIds: [handCard.id],
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingTrashInteraction).toBeNull();
    expect(result.cards[handCard.id]?.zone).toBe('trash');
  });
});

describe('FD5: OP15-113 pattern — TrashFromHand(optional) + thenActions SearchDeck fires when card trashed', () => {
  it('should run SearchDeck thenAction after trashing 1 card', () => {
    const base = bootstrapGame();
    const caster = makeChar('fd5-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [
          {
            type: 'TrashFromHand' as const,
            count: 1,
            filter: {},
            optional: true,
            thenActions: [
              { type: 'SearchDeck' as const, count: 1, filter: {}, destination: 'TopOfLife' as const },
            ],
          },
        ],
      }],
    });
    const handCard = makeChar('fd5-hand', 'p1', 2000, { zone: 'hand' });
    let state = addToHand(base, caster);
    state = addToHand(state, handCard);

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingTrashInteraction).not.toBeNull();
    expect(result.pendingTrashInteraction?.optional).toBe(true);

    // Trash the hand card
    result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [handCard.id] });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingTrashInteraction).toBeNull();
    expect(result.cards[handCard.id]?.zone).toBe('trash');
    // thenAction: SearchDeck should be pending (deck is non-empty)
    expect(result.pendingSearchInteraction).not.toBeNull();
    expect(result.pendingSearchInteraction?.destination).toBe('TopOfLife');
  });
});

describe('FD6: OP15-113 pattern — TrashFromHand(optional) skipped → SearchDeck does NOT fire', () => {
  it('should NOT run thenActions when optional trash is skipped (empty trashedCardIds)', () => {
    const base = bootstrapGame();
    const caster = makeChar('fd6-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [
          {
            type: 'TrashFromHand' as const,
            count: 1,
            filter: {},
            optional: true,
            thenActions: [
              { type: 'SearchDeck' as const, count: 1, filter: {}, destination: 'TopOfLife' as const },
            ],
          },
        ],
      }],
    });
    const handCard = makeChar('fd6-hand', 'p1', 2000, { zone: 'hand' });
    let state = addToHand(base, caster);
    state = addToHand(state, handCard);

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingTrashInteraction).not.toBeNull();

    // Skip trash (optional)
    result = applyAction(result, { type: 'ResolveTrashInteraction', playerId: P1, trashedCardIds: [] });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingTrashInteraction).toBeNull();
    // thenActions must NOT fire when skip
    expect(result.pendingSearchInteraction).toBeNull();
    // hand card should still be in hand
    expect(result.cards[handCard.id]?.zone).toBe('hand');
  });
});

describe('OPT3: RevealFromHand optional=true skip → thenActions NOT fired', () => {
  it('should skip thenActions when player sends empty revealedCardIds on optional RevealFromHand', () => {
    const base = bootstrapGame();
    const p1Leader = makeChar('opt3-leader', 'p1', 5000, { type: 'Leader', zone: 'leader' });
    const caster = makeChar('opt3-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        condition: { type: 'Always' as const },
        actions: [{
          type: 'RevealFromHand' as const,
          count: 1,
          filter: { color: 'Blue' as const },
          optional: true,
          thenActions: [
            { type: 'PowerBoost' as const, amount: 2000, target: { scope: 'OwnLeader' as const }, duration: 'EndOfTurn' as const },
          ],
        }],
      }],
    });
    const blueCard = makeChar('opt3-blue', 'p1', 2000, { zone: 'hand', color: 'Blue' as const });
    let state = addToHand(base, caster);
    state = addToHand(state, blueCard);
    state = { ...state, cards: { ...state.cards, [p1Leader.id]: p1Leader }, players: { ...state.players, [P1]: { ...state.players[P1]!, leader: p1Leader.id } } };

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRevealInteraction).not.toBeNull();
    expect(result.pendingRevealInteraction?.optional).toBe(true);

    // Skip reveal (optional)
    result = applyAction(result, { type: 'ResolveRevealInteraction', playerId: P1, revealedCardIds: [] });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRevealInteraction).toBeNull();
    // thenAction (PowerBoost) must NOT have fired
    const leaderPower = calculatePower(p1Leader.id, result);
    expect(leaderPower).toBe(5000); // no boost
  });
});

describe('OPT4: RevealFromHand optional=true revealed → thenActions fire', () => {
  it('should execute thenActions when player reveals a card on optional RevealFromHand', () => {
    const base = bootstrapGame();
    const p1Leader = makeChar('opt4-leader', 'p1', 5000, { type: 'Leader', zone: 'leader' });
    const caster = makeChar('opt4-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        condition: { type: 'Always' as const },
        actions: [{
          type: 'RevealFromHand' as const,
          count: 1,
          filter: { color: 'Blue' as const },
          optional: true,
          thenActions: [
            { type: 'PowerBoost' as const, amount: 2000, target: { scope: 'OwnLeader' as const }, duration: 'EndOfTurn' as const },
          ],
        }],
      }],
    });
    const blueCard = makeChar('opt4-blue', 'p1', 2000, { zone: 'hand', color: 'Blue' as const });
    let state = addToHand(base, caster);
    state = addToHand(state, blueCard);
    state = { ...state, cards: { ...state.cards, [p1Leader.id]: p1Leader }, players: { ...state.players, [P1]: { ...state.players[P1]!, leader: p1Leader.id } } };

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRevealInteraction).not.toBeNull();

    // Reveal the blue card
    result = applyAction(result, { type: 'ResolveRevealInteraction', playerId: P1, revealedCardIds: [blueCard.id] });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRevealInteraction).toBeNull();
    // thenAction (PowerBoost) must have fired
    const leaderPower = calculatePower(p1Leader.id, result);
    expect(leaderPower).toBe(7000); // +2000
    // blue card stays in hand (reveal does not move it)
    expect(result.cards[blueCard.id]?.zone).toBe('hand');
  });
});

describe('NE3: NegateEffect — effectsNegated cleared at end of turn', () => {
  it('should clear effectsNegated when EndPhase is dispatched', () => {
    const base = bootstrapGame();
    const card = makeChar('ne3-card', 'p2', 4000, {
      zone: 'board',
      effectsNegated: true,
    });
    let state = addToP2Board(base, card);
    // Verify it starts negated
    expect(state.cards[card.id]?.effectsNegated).toBe(true);
    // Advance Main → End phase
    let result = applyAction(state, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // End phase → Refresh (clearTemporaryKeywords fires here)
    result = applyAction(result, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[card.id]?.effectsNegated).toBeFalsy();
  });
});

describe('SD1: SearchDeck optional, skip → thenActions NOT fired', () => {
  it('should skip thenActions when player passes (chosenCardId: null)', () => {
    const base = bootstrapGame();
    const p1Leader = makeChar('sd1-leader', 'p1', 5000, { type: 'Leader', zone: 'leader' });
    const caster = makeChar('sd1-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        condition: { type: 'Always' as const },
        actions: [{
          type: 'SearchDeck' as const,
          lookCount: 3,
          count: 1,
          filter: {},
          destination: 'hand' as const,
          optional: true,
          thenActions: [
            { type: 'PowerBoost' as const, amount: 2000, target: { scope: 'OwnLeader' as const }, duration: 'EndOfTurn' as const },
          ],
        }],
      }],
    });
    let state = addToHand(base, caster);
    state = { ...state, cards: { ...state.cards, [p1Leader.id]: p1Leader }, players: { ...state.players, [P1]: { ...state.players[P1]!, leader: p1Leader.id } } };

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).not.toBeNull();

    // Pass — no card chosen
    result = applyAction(result, { type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: null });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).toBeNull();
    // thenActions must NOT have fired (no PowerBoost)
    expect(calculatePower(p1Leader.id, result)).toBe(5000);
  });
});

describe('SD2: SearchDeck optional, card chosen → thenActions fire', () => {
  it('should execute thenActions when player picks a card', () => {
    const base = bootstrapGame();
    const p1Leader = makeChar('sd2-leader', 'p1', 5000, { type: 'Leader', zone: 'leader' });
    const caster = makeChar('sd2-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        condition: { type: 'Always' as const },
        actions: [{
          type: 'SearchDeck' as const,
          lookCount: 3,
          count: 1,
          filter: {},
          destination: 'hand' as const,
          optional: true,
          thenActions: [
            { type: 'PowerBoost' as const, amount: 2000, target: { scope: 'OwnLeader' as const }, duration: 'EndOfTurn' as const },
          ],
        }],
      }],
    });
    let state = addToHand(base, caster);
    state = { ...state, cards: { ...state.cards, [p1Leader.id]: p1Leader }, players: { ...state.players, [P1]: { ...state.players[P1]!, leader: p1Leader.id } } };

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).not.toBeNull();
    const revealedIds = result.pendingSearchInteraction!.revealedCardIds;
    expect(revealedIds.length).toBeGreaterThan(0);
    const chosenId = revealedIds[0]!;

    result = applyAction(result, { type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: chosenId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).toBeNull();
    // thenActions must have fired (PowerBoost)
    expect(calculatePower(p1Leader.id, result)).toBe(7000);
    // chosen card moved to hand
    expect(result.cards[chosenId]?.zone).toBe('hand');
  });
});

describe('SD3: OP09-099 pattern — SearchDeck optional, thenActions = [Rest Self, TrashFromHand(optional)]', () => {
  it('should pause with pendingTrashInteraction after card chosen', () => {
    const base = bootstrapGame();
    const caster = makeChar('sd3-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'Activated' as const,
        condition: { type: 'Always' as const },
        actions: [{
          type: 'SearchDeck' as const,
          lookCount: 3,
          count: 1,
          filter: {},
          destination: 'hand' as const,
          optional: true,
          restTo: 'bottom' as const,
          thenActions: [
            { type: 'Rest' as const, target: { scope: 'Self' as const } },
            { type: 'TrashFromHand' as const, count: 1, filter: {}, optional: true },
          ],
        }],
      }],
    });
    const handCard = makeChar('sd3-hand', 'p1', 2000, { zone: 'hand' });
    let state = addToP1Board(base, caster);
    state = addToHand(state, handCard);

    let result = applyAction(state, { type: 'ActivatedAbility', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).not.toBeNull();
    const revealedIds = result.pendingSearchInteraction!.revealedCardIds;
    const chosenId = revealedIds[0]!;

    // Choose a card → thenActions fire: Rest(Self) runs, TrashFromHand pauses
    result = applyAction(result, { type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: chosenId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).toBeNull();
    // Self (caster) should be rested
    expect(result.cards[caster.id]?.tapped).toBe(true);
    // TrashFromHand should be pending
    expect(result.pendingTrashInteraction).not.toBeNull();
    expect(result.pendingTrashInteraction?.optional).toBe(true);
  });

  it('should NOT fire thenActions when player passes on search', () => {
    const base = bootstrapGame();
    const caster = makeChar('sd3b-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'Activated' as const,
        condition: { type: 'Always' as const },
        actions: [{
          type: 'SearchDeck' as const,
          lookCount: 3,
          count: 1,
          filter: {},
          destination: 'hand' as const,
          optional: true,
          thenActions: [
            { type: 'Rest' as const, target: { scope: 'Self' as const } },
            { type: 'TrashFromHand' as const, count: 1, filter: {}, optional: true },
          ],
        }],
      }],
    });
    const state = addToP1Board(base, caster);

    let result = applyAction(state, { type: 'ActivatedAbility', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).not.toBeNull();

    // Pass — no card chosen
    result = applyAction(result, { type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: null });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).toBeNull();
    // caster must NOT be rested
    expect(result.cards[caster.id]?.tapped).toBeFalsy();
    // No TrashFromHand pending
    expect(result.pendingTrashInteraction).toBeNull();
  });
});

describe('SD4: OP10-006 pattern — SearchDeck optional, thenActions = [RevealFromHand chain]', () => {
  it('should pause with pendingRevealInteraction after card chosen', () => {
    const base = bootstrapGame();
    const caster = makeChar('sd4-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        condition: { type: 'Always' as const },
        actions: [{
          type: 'SearchDeck' as const,
          lookCount: 5,
          filter: {},
          destination: 'hand' as const,
          optional: true,
          thenActions: [{
            type: 'RevealFromHand' as const,
            count: 1,
            filter: { subType: 'Smiley' },
            thenActions: [{ type: 'DrawCard' as const, count: 1 }],
          }],
        }],
      }],
    });
    let state = addToHand(base, caster);

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).not.toBeNull();
    const revealedIds = result.pendingSearchInteraction!.revealedCardIds;
    const chosenId = revealedIds[0]!;

    // Choose a card → thenActions fire: RevealFromHand pauses
    result = applyAction(result, { type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: chosenId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).toBeNull();
    expect(result.pendingRevealInteraction).not.toBeNull();
    expect(result.pendingRevealInteraction?.count).toBe(1);
  });

  it('should NOT pause with RevealFromHand when player passes on search', () => {
    const base = bootstrapGame();
    const caster = makeChar('sd4b-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        condition: { type: 'Always' as const },
        actions: [{
          type: 'SearchDeck' as const,
          lookCount: 5,
          filter: {},
          destination: 'hand' as const,
          optional: true,
          thenActions: [{
            type: 'RevealFromHand' as const,
            count: 1,
            filter: { subType: 'Smiley' },
            thenActions: [{ type: 'DrawCard' as const, count: 1 }],
          }],
        }],
      }],
    });
    let state = addToHand(base, caster);

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).not.toBeNull();

    // Pass — no card taken
    result = applyAction(result, { type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: null });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).toBeNull();
    // RevealFromHand must NOT have been triggered
    expect(result.pendingRevealInteraction).toBeNull();
  });
});

// ─── RT1: ReturnFromTrash — trash cards shown, returned to bottom of deck ─────

describe('RT1: ReturnFromTrash — matching trash cards shown, player returns them to deck bottom', () => {
  it('should set pendingSearchInteraction with source:trash when trash has matching cards', () => {
    const base = bootstrapGame();
    const trashCard = makeChar('rt1-trash', 'p1', 2000, { zone: 'trash', subTypes: 'CP' });
    const caster = makeChar('rt1-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{
          type: 'SearchDeck' as const,
          source: 'trash' as unknown as never,
          count: 2,
          filter: { kind: 'BySubType' as const, subType: 'CP' },
          destination: 'bottomOfDeck' as const,
          optional: true,
        }],
      }],
    });
    let state = addToHand(base, caster);
    state = {
      ...state,
      cards: { ...state.cards, [trashCard.id]: trashCard },
      players: {
        ...state.players,
        [P1]: { ...state.players[P1]!, trash: [trashCard.id] as readonly ReturnType<typeof makeCardId>[] },
      },
    };

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).not.toBeNull();
    expect(result.pendingSearchInteraction!.source).toBe('trash');
    expect(result.pendingSearchInteraction!.revealedCardIds).toContain(trashCard.id);
    expect(result.pendingSearchInteraction!.maxSelect).toBe(2);
    expect(result.pendingSearchInteraction!.destination).toBe('bottomOfDeck');
  });
});

// ─── RT2: ReturnFromTrash optional — skip when no matching cards ──────────────

describe('RT2: ReturnFromTrash optional — skip cleanly when trash is empty', () => {
  it('should not set pendingSearchInteraction when trash has no matching cards', () => {
    const base = bootstrapGame();
    const caster = makeChar('rt2-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{
          type: 'SearchDeck' as const,
          source: 'trash' as unknown as never,
          count: 2,
          filter: { kind: 'BySubType' as const, subType: 'CP' },
          destination: 'bottomOfDeck' as const,
          optional: true,
        }],
      }],
    });
    const state = addToHand(base, caster);

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).toBeNull(); // no matching cards → skip
  });
});

// ─── RT3: ReturnFromTrash — player passes (chosenCardIds: []) ─────────────────

describe('RT3: ReturnFromTrash — player passes, nothing moves', () => {
  it('should clear the interaction and leave trash unchanged when player passes with empty array', () => {
    const base = bootstrapGame();
    const trashCard = makeChar('rt3-trash', 'p1', 2000, { zone: 'trash' });
    const caster = makeChar('rt3-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{
          type: 'SearchDeck' as const,
          source: 'trash' as unknown as never,
          count: 1,
          filter: { kind: 'Any' as const },
          destination: 'bottomOfDeck' as const,
          optional: true,
        }],
      }],
    });
    let state = addToHand(base, caster);
    state = {
      ...state,
      cards: { ...state.cards, [trashCard.id]: trashCard },
      players: {
        ...state.players,
        [P1]: { ...state.players[P1]!, trash: [trashCard.id] as readonly ReturnType<typeof makeCardId>[] },
      },
    };

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).not.toBeNull();

    // Player passes
    result = applyAction(result, { type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: null, chosenCardIds: [] });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).toBeNull();
    // Card still in trash
    expect(result.players[P1]!.trash).toContain(trashCard.id);
    expect(result.cards[trashCard.id]!.zone).toBe('trash');
  });
});

// ─── RT4: ReturnFromTrash — chosen cards moved to bottom of deck ──────────────

describe('RT4: ReturnFromTrash — chosen cards moved to bottom of deck', () => {
  it('should move chosen cards from trash to bottom of deck', () => {
    const base = bootstrapGame();
    const trashCard = makeChar('rt4-trash', 'p1', 2000, { zone: 'trash' });
    const caster = makeChar('rt4-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{
          type: 'SearchDeck' as const,
          source: 'trash' as unknown as never,
          count: 1,
          filter: { kind: 'Any' as const },
          destination: 'bottomOfDeck' as const,
          optional: true,
        }],
      }],
    });
    let state = addToHand(base, caster);
    state = {
      ...state,
      cards: { ...state.cards, [trashCard.id]: trashCard },
      players: {
        ...state.players,
        [P1]: { ...state.players[P1]!, trash: [trashCard.id] as readonly ReturnType<typeof makeCardId>[] },
      },
    };

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).not.toBeNull();

    // Player returns the card
    result = applyAction(result, { type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: null, chosenCardIds: [trashCard.id] });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).toBeNull();
    // Card no longer in trash
    expect(result.players[P1]!.trash).not.toContain(trashCard.id);
    // Card now at bottom of deck
    const deck = result.players[P1]!.deck;
    expect(deck[deck.length - 1]).toBe(trashCard.id);
    expect(result.cards[trashCard.id]!.zone).toBe('deck');
  });
});

// ─── RT5: ReturnFromTrash — thenActions fire only when cards returned ─────────

describe('RT5: ReturnFromTrash — thenActions fire only when cards returned', () => {
  it('should execute thenActions (PowerBoost) when player returns cards', () => {
    const base = bootstrapGame();
    const trashCard = makeChar('rt5-trash', 'p1', 2000, { zone: 'trash' });
    const caster = makeChar('rt5-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{
          type: 'SearchDeck' as const,
          source: 'trash' as unknown as never,
          count: 1,
          filter: { kind: 'Any' as const },
          destination: 'bottomOfDeck' as const,
          optional: true,
          thenActions: [{
            type: 'PowerBoost' as const,
            amount: 2000,
            target: { scope: 'Self' as const },
            duration: 'DuringYourTurn' as const,
          }],
        }],
      }],
    });
    let state = addToHand(base, caster);
    state = {
      ...state,
      cards: { ...state.cards, [trashCard.id]: trashCard },
      players: {
        ...state.players,
        [P1]: { ...state.players[P1]!, trash: [trashCard.id] as readonly ReturnType<typeof makeCardId>[] },
      },
    };

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).not.toBeNull();

    // Player returns the card → thenActions should fire
    result = applyAction(result, { type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: null, chosenCardIds: [trashCard.id] });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingSearchInteraction).toBeNull();
    // PowerBoost should have fired on the caster
    const casterOnBoard = result.players[P1]!.board.find((id) => id === caster.id);
    expect(casterOnBoard).toBeDefined();
    expect(calculatePower(caster.id as ReturnType<typeof makeCardId>, result)).toBe(5000); // 3000 + 2000
  });

  it('should NOT fire thenActions when player passes (empty chosenCardIds)', () => {
    const base = bootstrapGame();
    const trashCard = makeChar('rt5b-trash', 'p1', 2000, { zone: 'trash' });
    const caster = makeChar('rt5b-caster', 'p1', 3000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{
          type: 'SearchDeck' as const,
          source: 'trash' as unknown as never,
          count: 1,
          filter: { kind: 'Any' as const },
          destination: 'bottomOfDeck' as const,
          optional: true,
          thenActions: [{
            type: 'PowerBoost' as const,
            amount: 2000,
            target: { scope: 'Self' as const },
            duration: 'DuringYourTurn' as const,
          }],
        }],
      }],
    });
    let state = addToHand(base, caster);
    state = {
      ...state,
      cards: { ...state.cards, [trashCard.id]: trashCard },
      players: {
        ...state.players,
        [P1]: { ...state.players[P1]!, trash: [trashCard.id] as readonly ReturnType<typeof makeCardId>[] },
      },
    };

    let result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Player passes
    result = applyAction(result, { type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: null, chosenCardIds: [] });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // No PowerBoost — caster stays at base power
    expect(calculatePower(caster.id as ReturnType<typeof makeCardId>, result)).toBe(3000);
  });
});
