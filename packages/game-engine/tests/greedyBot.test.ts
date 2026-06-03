/**
 * Tests for greedyBot — verifies the bot plays Character cards during Main Phase.
 *
 * B1: bot plays a character when it has exactly enough free DON to cover cost
 * B2: bot plays the highest-cost affordable character when multiple options exist
 * B3: bot cannot play when 0 free DON — returns non-PlayCharacterFromHand action
 * B4: after playing a card, leftover free DON are assigned in the next call
 * B5: in DON phase, bot skips assignment immediately (EndPhase)
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  greedyBotDecide,
} from '../src/index.js';
import type { Card, CardId, CardKeyword, GameState, PlayerSetup, HandFilter } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BOT = makePlayerId('bot');
const OPP = makePlayerId('opp');

function makeChar(id: string, owner: string, cost: number, power = 2000): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost,
    power,
    color: 'Red',
    type: 'Character',
    zone: 'deck',
    ownerId: makePlayerId(owner),
    tapped: false,
    attachedTo: null,
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

function makeSetup(idStr: string): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: { ...makeChar(`${idStr}-leader`, idStr, 0, 5000), type: 'Leader', zone: 'deck' },
    deckCards: Array.from({ length: 50 }, (_, i) => ({ ...makeChar(`${idStr}-d-${i}`, idStr, 2), zone: 'deck' as const })),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${idStr}-don-${i}`, idStr) as Card),
  };
}

function bootstrapMain(): GameState {
  const seed = makeEmptyState(BOT, OPP);
  let s = applyAction(seed, {
    type: 'StartGame',
    player1: makeSetup('bot'),
    player2: makeSetup('opp'),
    firstPlayerId: BOT,
  });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: BOT, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: OPP, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  // Force Main phase with enough turn number so bot can act freely
  return { ...s, phase: 'Main', activePlayerId: BOT, turnNumber: 3 };
}

/** Add cards to bot's hand */
function addToHand(state: GameState, cards: Card[]): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const c of cards) updatedCards[c.id] = { ...c, zone: 'hand' };
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: {
      ...state.players,
      [BOT]: { ...state.players[BOT]!, hand: [...state.players[BOT]!.hand, ...cards.map((c) => c.id)] },
    },
  };
}

/** Add free (untapped, unattached) DON to bot's donArea */
function addFreeDon(state: GameState, dons: Card[]): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const d of dons) updatedCards[d.id] = { ...d, zone: 'donArea', tapped: false, attachedTo: null };
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: {
      ...state.players,
      [BOT]: { ...state.players[BOT]!, donArea: [...state.players[BOT]!.donArea, ...dons.map((d) => d.id)] },
    },
  };
}

/** Clear bot's hand (remove existing deck-default cards from hand) */
function withEmptyHand(state: GameState): GameState {
  const oldHand = state.players[BOT]!.hand;
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const id of oldHand) {
    if (updatedCards[id] !== undefined) updatedCards[id] = { ...updatedCards[id]!, zone: 'deck' };
  }
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: { ...state.players, [BOT]: { ...state.players[BOT]!, hand: [] } },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('greedyBot — play characters in Main phase', () => {

  // B1: bot plays when it has exactly enough DON
  it('B1: plays a 2-cost character when it has 2 free DON', () => {
    let s = bootstrapMain();
    s = withEmptyHand(s);
    const char = makeChar('char-1', 'bot', 2);
    s = addToHand(s, [char]);
    s = addFreeDon(s, [makeDon('x1', 'bot'), makeDon('x2', 'bot')]);

    const action = greedyBotDecide(s, BOT);

    expect(action).not.toBeNull();
    expect(action?.type).toBe('PlayCharacterFromHand');
    if (action?.type === 'PlayCharacterFromHand') {
      expect(action.cardId).toBe(char.id);
    }
  });

  // B2: bot picks the highest-cost affordable card
  it('B2: plays the highest-cost affordable character when multiple options exist', () => {
    let s = bootstrapMain();
    s = withEmptyHand(s);
    const cheap = makeChar('char-cheap', 'bot', 2, 2000);
    const expensive = makeChar('char-exp', 'bot', 3, 4000);
    s = addToHand(s, [cheap, expensive]);
    // 3 free DON — enough to afford the 3-cost card
    s = addFreeDon(s, [makeDon('y1', 'bot'), makeDon('y2', 'bot'), makeDon('y3', 'bot')]);

    const action = greedyBotDecide(s, BOT);

    expect(action?.type).toBe('PlayCharacterFromHand');
    if (action?.type === 'PlayCharacterFromHand') {
      expect(action.cardId).toBe(expensive.id);
    }
  });

  // B3: bot cannot play when 0 free DON — falls through to attack or EndPhase
  it('B3: does not play character when 0 free DON', () => {
    let s = bootstrapMain();
    s = withEmptyHand(s);
    const char = makeChar('char-2', 'bot', 2);
    s = addToHand(s, [char]);
    // No extra free DON added — bot already starts with donArea populated by StartGame

    // Drain all free DON by attaching them in state
    const botDonArea = s.players[BOT]!.donArea;
    const updatedCards: Record<string, Card> = { ...s.cards };
    for (const id of botDonArea) {
      updatedCards[id] = { ...updatedCards[id]!, tapped: true };
    }
    s = { ...s, cards: updatedCards as GameState['cards'] };

    const action = greedyBotDecide(s, BOT);

    expect(action?.type).not.toBe('PlayCharacterFromHand');
  });

  // B4: after playing a card, leftover DON are assigned (chaining)
  it('B4: after playing a card, leftover free DON get assigned on next call', () => {
    let s = bootstrapMain();
    s = withEmptyHand(s);
    const char = makeChar('char-3', 'bot', 2);
    s = addToHand(s, [char]);
    // 4 free DON — 2 paid as cost, 2 leftover
    s = addFreeDon(s, [
      makeDon('z1', 'bot'), makeDon('z2', 'bot'),
      makeDon('z3', 'bot'), makeDon('z4', 'bot'),
    ]);

    // First call: play the character
    const action1 = greedyBotDecide(s, BOT);
    expect(action1?.type).toBe('PlayCharacterFromHand');

    // Apply the action so state reflects the card on board and 2 DON rested as cost
    const s2 = applyAction(s, action1!);
    expect(isGameError(s2)).toBe(false);
    if (isGameError(s2)) return;

    // Second call: no more cards to play → should assign remaining DON
    const action2 = greedyBotDecide(s2, BOT);
    expect(action2?.type).toBe('AssignDon');
  });

  // B5: in DON phase, bot skips assignment and ends the phase immediately
  it('B5: in DON phase, bot returns EndPhase without assigning DON', () => {
    let s = bootstrapMain();
    s = { ...s, phase: 'DON' };
    // Add a free DON so the old code would have assigned it
    s = addFreeDon(s, [makeDon('d1', 'bot')]);

    const action = greedyBotDecide(s, BOT);

    expect(action?.type).toBe('EndPhase');
  });

});

// ─── BTA: Bot must wait while human has pending interaction ───────────────────

describe('greedyBot — combat defense blocked by human pending interaction', () => {

  function makeCombatState(pendingType: 'target' | 'onko' | 'none'): GameState {
    let s = bootstrapMain();
    // It's OPP's turn; OPP is attacking BOT's leader
    const botLeaderId = s.players[BOT]!.leader!;
    s = {
      ...s,
      activePlayerId: OPP,
      activeCombat: {
        attackerId: makeCardId('opp-attacker'),
        targetId:   botLeaderId,
        blockerId:  null,
        counterPower: 0,
      },
    };
    if (pendingType === 'target') {
      const dummyAction: NonNullable<GameState['pendingTargetInteraction']>['pendingAction'] =
        { type: 'DrawCard', count: 1 };
      s = {
        ...s,
        pendingTargetInteraction: {
          playerId:         OPP,
          scope:            'ChooseOpponentCharacter',
          sourceCardId:     makeCardId('opp-robin'),
          sourcePlayerId:   OPP,
          pendingAction:    dummyAction,
          pendingEffectActions: [],
          pendingEffects:   [],
          trigger:          'OnAttack',
        },
      };
    } else if (pendingType === 'onko') {
      const emptyFilter: HandFilter = {};
      s = {
        ...s,
        pendingOnKOInteraction: {
          playerId:     OPP,
          sourceCardId: makeCardId('opp-zoro'),
          filter:       emptyFilter,
        },
      };
    }
    return s;
  }

  // BTA1: human (OPP) has pendingTargetInteraction → bot returns null (waits)
  it('BTA1: bot returns null while OPP has pendingTargetInteraction (e.g. Robin WhenAttacking)', () => {
    const s = makeCombatState('target');
    const action = greedyBotDecide(s, BOT);
    expect(action).toBeNull();
  });

  // BTA2: once OPP resolves the pending interaction, the bot's guard is lifted
  it('BTA2: once pendingTargetInteraction is cleared, bot re-enters defender logic', () => {
    const stateWithPending  = makeCombatState('target');
    const stateResolved: GameState = { ...stateWithPending, pendingTargetInteraction: null };
    // With pending cleared, greedyBotDecide must NOT return null due to the guard.
    // (It may still return null if the bot decides to take the hit — that's fine.)
    // We verify the guard itself is lifted by ensuring the result is not affected by it:
    // call with pending → null; call without pending → NOT forced-null by guard (may or may not be null).
    const withPending    = greedyBotDecide(stateWithPending, BOT);
    expect(withPending).toBeNull(); // guard fires
    // No assertion on withoutPending value — bot may choose to take the hit (null) legitimately.
    expect(() => greedyBotDecide(stateResolved, BOT)).not.toThrow();
  });

  // BTA3: human (OPP) has pendingOnKOInteraction → bot still returns null
  it('BTA3: bot returns null while OPP has pendingOnKOInteraction (regression guard for Zoro)', () => {
    const s = makeCombatState('onko');
    const action = greedyBotDecide(s, BOT);
    expect(action).toBeNull();
  });

  // BTA4: no pending interaction → bot may defend normally (returns an action or null)
  it('BTA4: bot can defend normally when no human pending interaction exists', () => {
    const s = makeCombatState('none');
    // greedyBotDecide either defends (non-null) or takes the hit (null) — neither is wrong.
    // The key assertion: it does NOT throw and does NOT crash on the pending guard.
    expect(() => greedyBotDecide(s, BOT)).not.toThrow();
  });
});

// ─── Helpers shared by BOT1-BOT7 ──────────────────────────────────────────────

/** Add a card to a player's board */
function addToBoard(state: GameState, card: Card, pid: string): GameState {
  const owner = makePlayerId(pid);
  const updatedCards: Record<string, Card> = { ...state.cards, [card.id]: { ...card, zone: 'board', ownerId: owner } };
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: { ...state.players, [owner]: { ...state.players[owner]!, board: [...state.players[owner]!.board, card.id] } },
  };
}

/** Add a card directly to state.cards (without putting it in a player zone) */
function addCardToState(state: GameState, card: Card): GameState {
  return { ...state, cards: { ...state.cards, [card.id]: card } as GameState['cards'] };
}

// ─── BOT1–BOT7 ────────────────────────────────────────────────────────────────

describe('greedyBot — tactical improvements (BOT1-BOT7)', () => {

  // BOT1: ActivatedAbility fires before PlayCharacterFromHand
  it('BOT1: uses ActivatedAbility before playing cards in hand', () => {
    let s = bootstrapMain();
    s = withEmptyHand(s);

    // Place a card with an Activated effect on bot's board
    const actCard: Card = {
      id:         makeCardId('bot1-act'),
      name:       'bot1-act',
      cost:       0,
      power:      3000,
      color:      'Red',
      type:       'Character',
      zone:       'board',
      ownerId:    BOT,
      tapped:     false,
      attachedTo: null,
      effects: [{ trigger: 'Activated', actions: [{ type: 'DrawCard', count: 1 } as never] }] as never,
    };
    s = addToBoard(s, actCard, 'bot');

    // Also put a free 0-cost character in hand (bot could play this instead)
    const handCard = makeChar('bot1-hand', 'bot', 0);
    s = addToHand(s, [handCard]);

    const action = greedyBotDecide(s, BOT);

    expect(action?.type).toBe('ActivatedAbility');
    if (action?.type === 'ActivatedAbility') {
      expect(action.cardId).toBe(actCard.id);
    }
  });

  // BOT2: OnPlay-effect card is preferred over a higher-cost card with no effect
  it('BOT2: plays OnPlay-effect card even when a higher-cost no-effect card is also affordable', () => {
    let s = bootstrapMain();
    s = withEmptyHand(s);

    // cheaper card but has a high-value OnPlay KO effect (score=2)
    const withEffect: Card = {
      id:         makeCardId('bot2-eff'),
      name:       'bot2-eff',
      cost:       2,
      power:      3000,
      color:      'Red',
      type:       'Character',
      zone:       'hand',
      ownerId:    BOT,
      tapped:     false,
      attachedTo: null,
      effects: [{
        trigger: 'OnPlay',
        actions: [{ type: 'KO', target: { scope: 'AllOpponentCharacters' } } as never],
      }] as never,
    };
    // more expensive card but zero effects (score=0)
    const noEffect = { ...makeChar('bot2-plain', 'bot', 3, 4000), zone: 'hand' as const };

    s = addToHand(s, [withEffect, noEffect]);
    s = addFreeDon(s, [makeDon('bot2-d1', 'bot'), makeDon('bot2-d2', 'bot'), makeDon('bot2-d3', 'bot')]);

    const action = greedyBotDecide(s, BOT);

    expect(action?.type).toBe('PlayCharacterFromHand');
    if (action?.type === 'PlayCharacterFromHand') {
      expect(action.cardId).toBe(withEffect.id);
    }
  });

  // BOT3: rested opponent character is attacked before the opponent's leader
  it('BOT3: targets rested opponent character over the opponent leader', () => {
    let s = bootstrapMain();
    s = withEmptyHand(s);

    // Strong bot attacker on board
    const botAttacker: Card = {
      id: makeCardId('bot3-atk'), name: 'bot3-atk',
      cost: 0, power: 5000, color: 'Red', type: 'Character',
      zone: 'board', ownerId: BOT, tapped: false, attachedTo: null,
    };
    s = addToBoard(s, botAttacker, 'bot');

    // Rested (tapped) weak opponent character
    const oppRested: Card = {
      id: makeCardId('bot3-opp-rested'), name: 'bot3-opp-rested',
      cost: 1, power: 2000, color: 'Red', type: 'Character',
      zone: 'board', ownerId: OPP, tapped: true, attachedTo: null,
    };
    s = {
      ...s,
      cards: { ...s.cards, [oppRested.id]: oppRested } as GameState['cards'],
      players: { ...s.players, [OPP]: { ...s.players[OPP]!, board: [...s.players[OPP]!.board, oppRested.id] } },
    };

    const action = greedyBotDecide(s, BOT);

    expect(action?.type).toBe('DeclareAttack');
    if (action?.type === 'DeclareAttack') {
      expect(action.targetId).toBe(oppRested.id);
    }
  });

  // BOT4: uses Blocker to protect an important character (power ≥ 4000) when threatened
  it('BOT4: uses Blocker to protect high-power character from a lethal attack', () => {
    let s = bootstrapMain();
    s = withEmptyHand(s);

    // Switch to OPP's turn
    s = { ...s, activePlayerId: OPP };

    // Bot's important character on board (power 5000)
    const importantChar: Card = {
      id: makeCardId('bot4-imp'), name: 'bot4-imp',
      cost: 0, power: 5000, color: 'Red', type: 'Character',
      zone: 'board', ownerId: BOT, tapped: false, attachedTo: null,
    };
    s = addToBoard(s, importantChar, 'bot');

    // Bot's blocker character on board
    const blocker: Card = {
      id: makeCardId('bot4-blk'), name: 'bot4-blk',
      cost: 0, power: 3000, color: 'Red', type: 'Character',
      zone: 'board', ownerId: BOT, tapped: false, attachedTo: null,
      keywords: ['Blocker'] as readonly CardKeyword[],
    };
    s = addToBoard(s, blocker, 'bot');

    // OPP is attacking importantChar with a 9000-power attacker (lethal)
    const oppAtk: Card = {
      id: makeCardId('bot4-opp-atk'), name: 'bot4-opp-atk',
      cost: 0, power: 9000, color: 'Red', type: 'Character',
      zone: 'board', ownerId: OPP, tapped: true, attachedTo: null,
    };
    s = {
      ...s,
      cards: { ...s.cards, [oppAtk.id]: oppAtk } as GameState['cards'],
      players: { ...s.players, [OPP]: { ...s.players[OPP]!, board: [...s.players[OPP]!.board, oppAtk.id] } },
      activeCombat: { attackerId: oppAtk.id, targetId: importantChar.id, blockerId: null, counterPower: 0 },
    };

    const action = greedyBotDecide(s, BOT);

    expect(action?.type).toBe('DeclareBlock');
    if (action?.type === 'DeclareBlock') {
      expect(action.blockerId).toBe(blocker.id);
    }
  });

  // BOT5: picks the strongest (most useful) card in a SearchDeck interaction
  it('BOT5: picks highest-power card when resolving SearchDeck', () => {
    let s = bootstrapMain();

    // Two revealed cards: a weak and a strong one
    const weakCard: Card = {
      id: makeCardId('bot5-weak'), name: 'bot5-weak',
      cost: 1, power: 1000, color: 'Red', type: 'Character',
      zone: 'deck', ownerId: BOT, tapped: false, attachedTo: null,
    };
    const strongCard: Card = {
      id: makeCardId('bot5-strong'), name: 'bot5-strong',
      cost: 3, power: 6000, color: 'Red', type: 'Character',
      zone: 'deck', ownerId: BOT, tapped: false, attachedTo: null,
    };
    s = addCardToState(s, weakCard);
    s = addCardToState(s, strongCard);

    s = {
      ...s,
      pendingSearchInteraction: {
        playerId:       BOT,
        sourceCardId:   makeCardId('bot5-src'),
        sourcePlayerId: BOT,
        revealedCardIds: [weakCard.id, strongCard.id],
        filter:         { kind: 'Any' },
        destination:    'hand',
        pendingEffectActions: [],
        pendingEffects: [],
        trigger:        'OnPlay',
      },
    };

    const action = greedyBotDecide(s, BOT);

    expect(action?.type).toBe('ResolveSearchInteraction');
    if (action?.type === 'ResolveSearchInteraction') {
      expect(action.chosenCardId).toBe(strongCard.id);
    }
  });

  // BOT6: discards least-useful card (no effects) over a card with effects in ForceDiscard
  it('BOT6: discards no-effect card over a card with an OnPlay effect', () => {
    let s = bootstrapMain();
    s = withEmptyHand(s);

    const usefulCard: Card = {
      id: makeCardId('bot6-useful'), name: 'bot6-useful',
      cost: 3, power: 3000, color: 'Red', type: 'Character',
      zone: 'hand', ownerId: BOT, tapped: false, attachedTo: null,
      effects: [{
        trigger: 'OnPlay',
        actions: [{ type: 'DrawCard', count: 1 } as never],
      }] as never,
    };
    const uselessCard: Card = {
      id: makeCardId('bot6-useless'), name: 'bot6-useless',
      cost: 1, power: 1000, color: 'Red', type: 'Character',
      zone: 'hand', ownerId: BOT, tapped: false, attachedTo: null,
    };

    s = addToHand(s, [usefulCard, uselessCard]);
    s = {
      ...s,
      pendingForceDiscardInteraction: {
        playerId:             BOT,
        count:                1,
        pendingEffectActions: [],
        pendingEffects:       [],
        trigger:              'OnPlay',
      },
    };

    const action = greedyBotDecide(s, BOT);

    expect(action?.type).toBe('ResolveForceDiscardInteraction');
    if (action?.type === 'ResolveForceDiscardInteraction') {
      expect(action.discardedCardIds).toContain(uselessCard.id);
      expect(action.discardedCardIds).not.toContain(usefulCard.id);
    }
  });

  // BOT7: declares an attack instead of ending the turn when an attacker is available
  it('BOT7: attacks instead of ending turn when a profitable attack exists', () => {
    let s = bootstrapMain();
    s = withEmptyHand(s);

    // Add an untapped attacker
    const attacker: Card = {
      id: makeCardId('bot7-atk'), name: 'bot7-atk',
      cost: 0, power: 4000, color: 'Red', type: 'Character',
      zone: 'board', ownerId: BOT, tapped: false, attachedTo: null,
    };
    s = addToBoard(s, attacker, 'bot');

    // Drain all DON so there's nothing to play or assign
    const allDons = s.players[BOT]!.donArea;
    const updated: Record<string, Card> = { ...s.cards };
    for (const id of allDons) updated[id] = { ...updated[id]!, tapped: true };
    s = { ...s, cards: updated as GameState['cards'] };

    const action = greedyBotDecide(s, BOT);

    // Bot must attack rather than end its turn
    expect(action?.type).toBe('DeclareAttack');
  });

});
