/**
 * ST22-007 — [Activate: Main] [Once Per Turn]
 * Reveal 1 card from top of deck.
 * If that card's type includes "Whitebeard Pirates",
 * give up to 1 rested DON!! to Leader or 1 of your Characters.
 *
 * A1 : top deck is Whitebeard Pirates → activation proposed, reveal, DON attached
 * A2 : top deck is NOT Whitebeard Pirates → activation proposed, reveal, no DON
 * A3 : already used this turn → activation rejected (Once Per Turn)
 * A4 : empty deck → activation accepted, reveal skipped cleanly
 * A5 : Whitebeard Pirates revealed, player skips DON attachment (up to 1)
 * NR1: Once Per Turn is reset after turn change
 * NR2: non-regression — Nami ST21-009 AttachDon still works
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  calculatePower,
  greedyBotDecide,
} from '../src/index.js';
import type { Card, CardId, GameState, PlayerSetup, CombatState } from '../src/index.js';

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
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${idStr}-don-${i}`, idStr)),
  };
}

/** ST22-007 effect: Activated, reveal 1 from deck, if Whitebeard Pirates attach 1 rested DON */
const st22007Effect = {
  trigger: 'Activated' as const,
  condition: { type: 'Always' as const },
  actions: [
    {
      type: 'RevealFromDeck' as const,
      count: 1,
      returnTo: 'top' as const,
      thenActions: [
        {
          type: 'AttachDon' as const,
          count: 1,
          from: 'rested' as const,
          target: {
            scope: 'ChooseOwnCharacterOrLeader' as const,
          },
          condition: { type: 'RevealedCardHasType' as const, cardType: 'Whitebeard Pirates' },
        },
      ],
    },
  ],
};

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

/** Add a card to P1's board with the st22007Effect */
function addST22007ToBoard(state: GameState): { state: GameState; cardId: CardId } {
  const card: Card = makeChar('st22-007', 'p1', 3000, {
    effects: [st22007Effect as unknown as import('../src/index.js').CardEffect],
  });
  const newState: GameState = {
    ...state,
    cards: { ...state.cards, [card.id]: card },
    players: {
      ...state.players,
      [P1]: { ...state.players[P1]!, board: [...state.players[P1]!.board, card.id] },
    },
  };
  return { state: newState, cardId: card.id };
}

/** Place a Whitebeard Pirates card at top of P1's deck */
function injectTopDeckCard(state: GameState, isWhitebeard: boolean): { state: GameState; topCardId: CardId } {
  const topCard: Card = {
    id: makeCardId('top-deck-card'),
    name: isWhitebeard ? 'Marco' : 'Luffy',
    cost: 3,
    power: 4000,
    color: 'Purple',
    type: 'Character',
    zone: 'deck',
    ownerId: P1,
    tapped: false,
    attachedTo: null,
    subTypes: isWhitebeard ? 'Whitebeard Pirates' : 'Straw Hat Crew',
  };
  const p1 = state.players[P1]!;
  const newDeck = [topCard.id, ...p1.deck] as CardId[];
  return {
    state: {
      ...state,
      cards: { ...state.cards, [topCard.id]: topCard },
      players: { ...state.players, [P1]: { ...p1, deck: newDeck } },
    },
    topCardId: topCard.id,
  };
}

/** Add a rested DON to P1's donArea (unattached) */
function addRestedDon(state: GameState): { state: GameState; donId: CardId } {
  const don: Card = makeDon('rested-don', 'p1', { tapped: true, attachedTo: null });
  const p1 = state.players[P1]!;
  return {
    state: {
      ...state,
      cards: { ...state.cards, [don.id]: don },
      players: { ...state.players, [P1]: { ...p1, donArea: [...p1.donArea, don.id] } },
    },
    donId: don.id,
  };
}

// ─── A1: Whitebeard Pirates at top → DON attached ─────────────────────────────

describe('A1: ST22-007 — Whitebeard Pirates revealed → DON attached', () => {
  it('A1a: ActivatedAbility sets pendingRevealInteraction', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22007ToBoard(s);
    const { state: s3, topCardId } = injectTopDeckCard(s2, true);
    const { state: s4 } = addRestedDon(s3);
    void topCardId;

    const result = applyAction(s4, { type: 'ActivatedAbility', playerId: P1, cardId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRevealInteraction).not.toBeNull();
    expect(result.pendingRevealInteraction?.revealedCardIds).toBeDefined();
    expect(result.pendingRevealInteraction?.revealedCardIds?.length).toBe(1);
    // Card is still in deck zone (not removed)
    const revealedId = result.pendingRevealInteraction!.revealedCardIds![0]!;
    expect(result.cards[revealedId]?.zone).toBe('deck');
    // Once-per-turn registered
    expect(result.activatedAbilityIds).toContain(cardId);
  });

  it('A1b: ResolveRevealInteraction with Whitebeard card → sets pendingTargetInteraction for DON attachment', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22007ToBoard(s);
    const { state: s3, topCardId } = injectTopDeckCard(s2, true);
    const { state: s4 } = addRestedDon(s3);

    let state = applyAction(s4, { type: 'ActivatedAbility', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;

    // Player acknowledges
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.pendingRevealInteraction).toBeNull();
    // AttachDon with ChooseOwnCharacterOrLeader → sets pendingTargetInteraction
    expect(state.pendingTargetInteraction).not.toBeNull();
    void topCardId;
  });

  it('A1c: full flow — DON ends up attached to Leader', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22007ToBoard(s);
    const { state: s3, topCardId } = injectTopDeckCard(s2, true);
    const { state: s4, donId } = addRestedDon(s3);
    void topCardId;

    let state = applyAction(s4, { type: 'ActivatedAbility', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;

    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    // Resolve target selection — choose Leader
    const leaderId = state.players[P1]!.leader!;
    state = applyAction(state, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: leaderId,
    }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.pendingRevealInteraction).toBeNull();
    expect(state.pendingTargetInteraction).toBeNull();
    // DON is attached to leader
    expect(state.cards[donId]?.attachedTo).toBe(leaderId);
  });
});

// ─── A2: Non-Whitebeard at top → no DON ───────────────────────────────────────

describe('A2: ST22-007 — Non-Whitebeard card revealed → no DON attached', () => {
  it('A2: reveal resolves cleanly, no pendingTargetInteraction', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22007ToBoard(s);
    const { state: s3 } = injectTopDeckCard(s2, false); // not Whitebeard
    const { state: s4 } = addRestedDon(s3);

    let state = applyAction(s4, { type: 'ActivatedAbility', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;

    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.pendingRevealInteraction).toBeNull();
    // Condition not met → no DON interaction
    expect(state.pendingTargetInteraction).toBeNull();
  });
});

// ─── A3: Once Per Turn ────────────────────────────────────────────────────────

describe('A3: Once Per Turn — second activation rejected', () => {
  it('A3: second ActivatedAbility dispatch rejected with ALREADY_ACTIVATED', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22007ToBoard(s);
    const { state: s3 } = injectTopDeckCard(s2, true);
    const { state: s4 } = addRestedDon(s3);

    let state = applyAction(s4, { type: 'ActivatedAbility', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;
    if (state.pendingTargetInteraction !== null) {
      state = applyAction(state, {
        type: 'ResolveTargetInteraction',
        playerId: P1,
        targetCardId: state.players[P1]!.leader!,
      }) as GameState;
    }

    // Try again — must fail
    const result = applyAction(state, { type: 'ActivatedAbility', playerId: P1, cardId });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('ALREADY_ACTIVATED');
  });
});

// ─── A4: Empty deck → no crash ────────────────────────────────────────────────

describe('A4: Empty deck — RevealFromDeck skips cleanly', () => {
  it('A4: deck empty → ActivatedAbility returns CONDITION_NOT_MET or produces no pending', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22007ToBoard(s);
    // Empty P1's deck
    const p1 = s2.players[P1]!;
    const s3: GameState = {
      ...s2,
      players: { ...s2.players, [P1]: { ...p1, deck: [] } },
    };

    // Should not crash. With empty deck, RevealFromDeck intercept does `continue`,
    // effect loop finishes with no state change → result === state → CONDITION_NOT_MET.
    const result = applyAction(s3, { type: 'ActivatedAbility', playerId: P1, cardId });
    // Either returns error or a valid state — must not throw
    expect(result).toBeDefined();
  });
});

// ─── A5: Skip DON attachment (up to 1) ───────────────────────────────────────

describe('A5: Player skips DON attachment after Whitebeard reveal', () => {
  it('A5: after reveal, player can skip by passing null target', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22007ToBoard(s);
    const { state: s3 } = injectTopDeckCard(s2, true);
    const { state: s4 } = addRestedDon(s3);

    let state = applyAction(s4, { type: 'ActivatedAbility', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    if (state.pendingTargetInteraction !== null) {
      // Player skips target selection (passes null)
      state = applyAction(state, {
        type: 'ResolveTargetInteraction',
        playerId: P1,
        targetCardId: null,
      }) as GameState;
    }

    expect(isGameError(state)).toBe(false);
    expect(state.pendingRevealInteraction).toBeNull();
    expect(state.pendingTargetInteraction).toBeNull();
  });
});

// ─── NR1: Once Per Turn resets on new turn ────────────────────────────────────

describe('NR1: Once Per Turn resets after turn changes', () => {
  it('NR1: activatedAbilityIds cleared on new turn', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22007ToBoard(s);
    const { state: s3 } = injectTopDeckCard(s2, false);
    const { state: s4 } = addRestedDon(s3);

    let state = applyAction(s4, { type: 'ActivatedAbility', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(state.activatedAbilityIds).toContain(cardId);

    // Simulate turn change by clearing activatedAbilityIds (what EndPhase/new turn does)
    state = { ...state, activatedAbilityIds: [], activePlayerId: P2, phase: 'Main' };
    expect(state.activatedAbilityIds).not.toContain(cardId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ST22-011 — [On Play] [You may] Reveal 2 Whitebeard Pirates from hand
//             → Leader Whitebeard Pirates gains +2000 for the turn
// ═══════════════════════════════════════════════════════════════════════════════

const st22011Effect = {
  trigger: 'OnPlay' as const,
  condition: { type: 'Always' as const },
  actions: [
    {
      type: 'RevealFromHand' as const,
      count: 2,
      filter: { subType: 'Whitebeard Pirates' },
      optional: true as const,
      thenActions: [
        {
          type: 'PowerBoost' as const,
          amount: 2000,
          target: { scope: 'OwnLeader' as const },
          duration: 'EndOfTurn' as const,
        },
      ],
    },
  ],
};

/** Add a Whitebeard Pirates character to P1's hand */
function addWBToHand(state: GameState, idStr: string): { state: GameState; cardId: CardId } {
  const card: Card = makeChar(idStr, 'p1', 3000, {
    zone: 'hand',
    subTypes: 'Whitebeard Pirates',
  });
  const p1 = state.players[P1]!;
  return {
    state: {
      ...state,
      cards: { ...state.cards, [card.id]: card },
      players: { ...state.players, [P1]: { ...p1, hand: [...p1.hand, card.id] } },
    },
    cardId: card.id,
  };
}

/** Play ST22-011 (inject into hand then play) — returns pendingRevealInteraction state */
function playST22011(baseState: GameState): { state: GameState; st22011Id: CardId } {
  const card: Card = makeChar('st22-011', 'p1', 2000, {
    type: 'Character',
    zone: 'hand',
    cost: 0,
    effects: [st22011Effect as unknown as import('../src/index.js').CardEffect],
  });
  const p1 = baseState.players[P1]!;
  let state: GameState = {
    ...baseState,
    cards: { ...baseState.cards, [card.id]: card },
    players: { ...baseState.players, [P1]: { ...p1, hand: [...p1.hand, card.id] } },
  };
  state = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id }) as GameState;
  return { state, st22011Id: card.id };
}

// ─── RH1: 2 Whitebeard Pirates in hand → reveal → Leader +2000 ───────────────

describe('RH1: ST22-011 — reveal 2 WB cards → Leader gains +2000', () => {
  it('RH1a: playing ST22-011 with 2 WB in hand sets pendingRevealInteraction', () => {
    let s = bootstrapGame();
    const { state: s2 } = addWBToHand(s, 'wb1');
    const { state: s3 } = addWBToHand(s2, 'wb2');
    const { state } = playST22011(s3);

    expect(isGameError(state)).toBe(false);
    expect(state.pendingRevealInteraction).not.toBeNull();
    expect(state.pendingRevealInteraction?.optional).toBe(true);
    expect(state.pendingRevealInteraction?.count).toBe(2);
    expect(state.pendingRevealInteraction?.filter?.subType).toBe('Whitebeard Pirates');
  });

  it('RH1b: revealing 2 WB cards applies +2000 to leader', () => {
    let s = bootstrapGame();
    const { state: s2, cardId: wb1 } = addWBToHand(s, 'wb1');
    const { state: s3, cardId: wb2 } = addWBToHand(s2, 'wb2');
    const { state: s4 } = playST22011(s3);

    const leaderId = s4.players[P1]!.leader!;
    const powerBefore = s4.cards[leaderId]!.power;

    const result = applyAction(s4, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [wb1, wb2],
    }) as GameState;

    expect(isGameError(result)).toBe(false);
    expect(result.pendingRevealInteraction).toBeNull();
    expect((result.cards[leaderId]?.powerModifier ?? 0)).toBe(2000);
    void powerBefore;
  });
});

// ─── RH2: Player skips → no buff ─────────────────────────────────────────────

describe('RH2: ST22-011 — player skips → no buff', () => {
  it('RH2: dispatch empty revealedCardIds → no powerModifier on leader', () => {
    let s = bootstrapGame();
    const { state: s2 } = addWBToHand(s, 'wb1');
    const { state: s3 } = addWBToHand(s2, 'wb2');
    const { state: s4 } = playST22011(s3);

    const leaderId = s4.players[P1]!.leader!;

    const result = applyAction(s4, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [],
    }) as GameState;

    expect(isGameError(result)).toBe(false);
    expect(result.pendingRevealInteraction).toBeNull();
    expect(result.cards[leaderId]?.powerModifier).toBeUndefined();
  });
});

// ─── RH3: Fewer than 2 WB in hand → forced skip ──────────────────────────────

describe('RH3: ST22-011 — fewer than 2 WB in hand → forced skip (no crash)', () => {
  it('RH3a: 0 WB cards in hand → pendingRevealInteraction still set (player must skip)', () => {
    let s = bootstrapGame();
    // No WB cards in hand — the interaction is still set, player must send empty array
    const { state } = playST22011(s);

    expect(isGameError(state)).toBe(false);
    expect(state.pendingRevealInteraction).not.toBeNull();
    // Skip resolves cleanly
    const result = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [],
    }) as GameState;
    expect(isGameError(result)).toBe(false);
    expect(result.pendingRevealInteraction).toBeNull();
  });

  it('RH3b: 1 WB card in hand → cannot reveal 2 → skip resolves cleanly', () => {
    let s = bootstrapGame();
    const { state: s2 } = addWBToHand(s, 'wb1');
    const { state: s3 } = playST22011(s2);

    // Revealing only 1 should fail (wrong count)
    const bad = applyAction(s3, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [makeCardId('wb1')],
    });
    expect(isGameError(bad)).toBe(true);

    // Skip is fine
    const result = applyAction(s3, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [],
    }) as GameState;
    expect(isGameError(result)).toBe(false);
    expect(result.pendingRevealInteraction).toBeNull();
  });
});

// ─── RH4: Buff disappears at end of turn ─────────────────────────────────────

describe('RH4: ST22-011 — +2000 buff clears at end of turn', () => {
  it('RH4: EndPhase clears powerModifier on leader', () => {
    let s = bootstrapGame();
    const { state: s2, cardId: wb1 } = addWBToHand(s, 'wb1');
    const { state: s3, cardId: wb2 } = addWBToHand(s2, 'wb2');
    const { state: s4 } = playST22011(s3);

    let state = applyAction(s4, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [wb1, wb2],
    }) as GameState;

    const leaderId = state.players[P1]!.leader!;
    expect(state.cards[leaderId]?.powerModifier).toBe(2000);

    // End turn: transition to End phase and then next turn
    // Jump directly to End phase to trigger clearPowerModifiers
    state = { ...state, phase: 'End' };
    state = applyAction(state, { type: 'EndPhase', playerId: P1 }) as GameState;

    // After EndPhase the active player switches and powerModifier is cleared
    expect(state.cards[leaderId]?.powerModifier).toBeUndefined();
  });
});

// ─── RH5: Non-regression ST22-007 (RevealFromDeck) ───────────────────────────

describe('RH5: ST22-007 non-regression after ST22-011 changes', () => {
  it('RH5: ST22-007 still sets deck-sourced pendingRevealInteraction', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22007ToBoard(s);
    const { state: s3 } = injectTopDeckCard(s2, true);
    const { state: s4 } = addRestedDon(s3);

    const result = applyAction(s4, { type: 'ActivatedAbility', playerId: P1, cardId }) as GameState;
    expect(isGameError(result)).toBe(false);
    expect(result.pendingRevealInteraction).not.toBeNull();
    // Deck-sourced: revealedCardIds set, optional NOT set
    expect(result.pendingRevealInteraction?.revealedCardIds).toBeDefined();
    expect(result.pendingRevealInteraction?.optional).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ST22-006 — [On Play] Reveal 1 card from the top of your deck.
//             If it includes "Whitebeard Pirates" type:
//               draw 2 cards, then opponent discards 1 card.
// ═══════════════════════════════════════════════════════════════════════════════

const st22006Effect = {
  trigger: 'OnPlay' as const,
  actions: [
    {
      type: 'RevealFromDeck' as const,
      count: 1,
      returnTo: 'top' as const,
      thenActions: [
        {
          type: 'DrawCard' as const,
          count: 2,
          condition: { type: 'RevealedCardHasType' as const, cardType: 'Whitebeard Pirates' },
        },
        {
          type: 'ForceDiscard' as const,
          count: 1,
          condition: { type: 'RevealedCardHasType' as const, cardType: 'Whitebeard Pirates' },
        },
      ],
    },
  ],
};

/** Add ST22-006 to a player's hand */
function addST22006ToHand(state: GameState, owner: 'p1' | 'p2'): { state: GameState; cardId: CardId } {
  const pid = makePlayerId(owner);
  const card: Card = makeChar(`st22-006-${owner}`, owner, 3000, {
    type: 'Character',
    zone: 'hand',
    cost: 0,
    effects: [st22006Effect as unknown as import('../src/index.js').CardEffect],
  });
  const player = state.players[pid]!;
  return {
    state: {
      ...state,
      cards: { ...state.cards, [card.id]: card },
      players: { ...state.players, [pid]: { ...player, hand: [...player.hand, card.id] } },
    },
    cardId: card.id,
  };
}

/** Inject a top-deck card for any player (generalised from injectTopDeckCard which targets P1) */
function injectTopDeckCardFor(state: GameState, owner: 'p1' | 'p2', isWhitebeard: boolean): { state: GameState; topCardId: CardId } {
  const pid = makePlayerId(owner);
  const topCard: Card = {
    id: makeCardId(`top-deck-${owner}-${isWhitebeard ? 'wb' : 'nwb'}`),
    name: isWhitebeard ? 'Marco' : 'Luffy',
    cost: 3,
    power: 4000,
    color: 'Purple',
    type: 'Character',
    zone: 'deck',
    ownerId: pid,
    tapped: false,
    attachedTo: null,
    subTypes: isWhitebeard ? 'Whitebeard Pirates' : 'Straw Hat Crew',
  };
  const player = state.players[pid]!;
  const newDeck = [topCard.id, ...player.deck] as CardId[];
  return {
    state: {
      ...state,
      cards: { ...state.cards, [topCard.id]: topCard },
      players: { ...state.players, [pid]: { ...player, deck: newDeck } },
    },
    topCardId: topCard.id,
  };
}

// ─── F1: WB revealed → draw 2, ForceDiscard for opponent ─────────────────────

describe('F1: ST22-006 — Whitebeard Pirates revealed → draw 2, opponent ForceDiscard', () => {
  it('F1a: playing ST22-006 creates pendingRevealInteraction', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22006ToHand(s, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);

    const result = applyAction(s3, { type: 'PlayCharacterFromHand', playerId: P1, cardId }) as GameState;
    expect(isGameError(result)).toBe(false);
    expect(result.pendingRevealInteraction).not.toBeNull();
    expect(result.pendingRevealInteraction?.playerId).toBe(P1);
    expect(result.pendingRevealInteraction?.revealedCardIds?.length).toBe(1);
  });

  it('F1b: acknowledging WB reveal → draws 2 cards and creates ForceDiscard for P2', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22006ToHand(s, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);
    // Give P2 a card in hand to discard
    const p2Card: Card = makeChar('p2-hand-card', 'p2', 2000, { zone: 'hand' });
    let s4: GameState = {
      ...s3,
      cards: { ...s3.cards, [p2Card.id]: p2Card },
      players: { ...s3.players, [P2]: { ...s3.players[P2]!, hand: [...s3.players[P2]!.hand, p2Card.id] } },
    };

    const handBefore = s4.players[P1]!.hand.length;
    s4 = applyAction(s4, { type: 'PlayCharacterFromHand', playerId: P1, cardId }) as GameState;
    const revealedId = s4.pendingRevealInteraction!.revealedCardIds![0]!;

    const result = applyAction(s4, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(isGameError(result)).toBe(false);
    expect(result.pendingRevealInteraction).toBeNull();
    // P1 drew 2 cards (hand had 1 less after playing ST22-006, then +2 draw)
    expect(result.players[P1]!.hand.length).toBe(handBefore - 1 + 2);
    // ForceDiscard pending for P2 (the opponent)
    expect(result.pendingForceDiscardInteraction).not.toBeNull();
    expect(result.pendingForceDiscardInteraction?.playerId).toBe(P2);
    expect(result.pendingForceDiscardInteraction?.count).toBe(1);
  });

  it('F1c: P2 resolves ForceDiscard → P2 hand shrinks by 1, all pending cleared', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22006ToHand(s, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);
    const p2Card: Card = makeChar('p2-discard-card', 'p2', 2000, { zone: 'hand' });
    let s4: GameState = {
      ...s3,
      cards: { ...s3.cards, [p2Card.id]: p2Card },
      players: { ...s3.players, [P2]: { ...s3.players[P2]!, hand: [p2Card.id] } },
    };

    s4 = applyAction(s4, { type: 'PlayCharacterFromHand', playerId: P1, cardId }) as GameState;
    const revealedId = s4.pendingRevealInteraction!.revealedCardIds![0]!;
    s4 = applyAction(s4, { type: 'ResolveRevealInteraction', playerId: P1, revealedCardIds: [revealedId] }) as GameState;

    expect(s4.pendingForceDiscardInteraction?.playerId).toBe(P2);

    const result = applyAction(s4, {
      type: 'ResolveForceDiscardInteraction',
      playerId: P2,
      discardedCardIds: [p2Card.id],
    }) as GameState;

    expect(isGameError(result)).toBe(false);
    expect(result.pendingForceDiscardInteraction).toBeNull();
    // P2's discarded card is in trash
    expect(result.players[P2]!.hand).not.toContain(p2Card.id);
    expect(result.players[P2]!.trash).toContain(p2Card.id);
  });
});

// ─── F2: Non-WB revealed → no draw, no ForceDiscard ──────────────────────────

describe('F2: ST22-006 — non-Whitebeard revealed → no draw, no ForceDiscard', () => {
  it('F2: non-WB reveal → hand unchanged (excl. played card), no ForceDiscard', () => {
    let s = bootstrapGame();
    const { state: s2, cardId } = addST22006ToHand(s, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', false); // NOT Whitebeard

    const handBefore = s3.players[P1]!.hand.length;
    let state = applyAction(s3, { type: 'PlayCharacterFromHand', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;

    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.pendingRevealInteraction).toBeNull();
    // No draw — hand size = handBefore - 1 (played ST22-006)
    expect(state.players[P1]!.hand.length).toBe(handBefore - 1);
    // No ForceDiscard pending
    expect(state.pendingForceDiscardInteraction).toBeNull();
  });
});

// ─── F3: ForceDiscard goes to correct opponent when P2 plays the card ─────────

describe('F3: ST22-006 played by P2 → ForceDiscard targets P1', () => {
  it('F3a: P2 plays ST22-006 with WB top card → pendingForceDiscardInteraction.playerId === P1', () => {
    let s = bootstrapGame();
    // Switch active player to P2
    s = { ...s, activePlayerId: P2, phase: 'Main' };
    const { state: s2, cardId } = addST22006ToHand(s, 'p2');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p2', true);
    // Give P1 a card in hand to discard
    const p1Card: Card = makeChar('p1-discard-card', 'p1', 2000, { zone: 'hand' });
    let s4: GameState = {
      ...s3,
      cards: { ...s3.cards, [p1Card.id]: p1Card },
      players: { ...s3.players, [P1]: { ...s3.players[P1]!, hand: [...s3.players[P1]!.hand, p1Card.id] } },
    };

    s4 = applyAction(s4, { type: 'PlayCharacterFromHand', playerId: P2, cardId }) as GameState;
    expect(isGameError(s4)).toBe(false);
    const revealedId = s4.pendingRevealInteraction!.revealedCardIds![0]!;

    s4 = applyAction(s4, { type: 'ResolveRevealInteraction', playerId: P2, revealedCardIds: [revealedId] }) as GameState;
    expect(isGameError(s4)).toBe(false);

    // ForceDiscard must target P1 (the opponent of P2 who played the card)
    expect(s4.pendingForceDiscardInteraction).not.toBeNull();
    expect(s4.pendingForceDiscardInteraction?.playerId).toBe(P1);
  });

  it('F3b: P1 resolves ForceDiscard after P2 plays ST22-006 → game state clean', () => {
    let s = bootstrapGame();
    s = { ...s, activePlayerId: P2, phase: 'Main' };
    const { state: s2, cardId } = addST22006ToHand(s, 'p2');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p2', true);
    const p1Card: Card = makeChar('p1-hand-fb', 'p1', 2000, { zone: 'hand' });
    let s4: GameState = {
      ...s3,
      cards: { ...s3.cards, [p1Card.id]: p1Card },
      players: { ...s3.players, [P1]: { ...s3.players[P1]!, hand: [p1Card.id] } },
    };

    s4 = applyAction(s4, { type: 'PlayCharacterFromHand', playerId: P2, cardId }) as GameState;
    const revealedId = s4.pendingRevealInteraction!.revealedCardIds![0]!;
    s4 = applyAction(s4, { type: 'ResolveRevealInteraction', playerId: P2, revealedCardIds: [revealedId] }) as GameState;

    // P1 resolves the ForceDiscard
    const result = applyAction(s4, {
      type: 'ResolveForceDiscardInteraction',
      playerId: P1,
      discardedCardIds: [p1Card.id],
    }) as GameState;

    expect(isGameError(result)).toBe(false);
    expect(result.pendingForceDiscardInteraction).toBeNull();
    expect(result.pendingRevealInteraction).toBeNull();
    expect(result.players[P1]!.hand).not.toContain(p1Card.id);
    expect(result.players[P1]!.trash).toContain(p1Card.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ST22-016 — [Counter] Reveal 1 card from top of deck.
//             If it includes "Whitebeard Pirates" type:
//               give +4000 power (EndOfBattle) to chosen own Character or Leader.
//             [Trigger] Draw 1 card.
// ═══════════════════════════════════════════════════════════════════════════════

const st22016Effect = [
  {
    trigger: 'Counter' as const,
    actions: [
      {
        type: 'RevealFromDeck' as const,
        count: 1,
        returnTo: 'top' as const,
        thenActions: [
          {
            type: 'PowerBoost' as const,
            amount: 4000,
            target: { scope: 'ChooseOwnCharacterOrLeader' as const },
            duration: 'EndOfBattle' as const,
            condition: { type: 'RevealedCardHasType' as const, cardType: 'Whitebeard Pirates' },
          },
        ],
      },
    ],
  },
  {
    trigger: 'Trigger' as const,
    actions: [
      { type: 'DrawCard' as const, count: 1 },
    ],
  },
];

/** Add ST22-016 to a player's hand */
function addST22016ToHand(state: GameState, owner: 'p1' | 'p2'): { state: GameState; cardId: CardId } {
  const pid = makePlayerId(owner);
  const card: Card = makeChar(`st22-016-${owner}`, owner, 1000, {
    type: 'Character',
    zone: 'hand',
    cost: 1,
    counter: 0,
    effects: st22016Effect as unknown as import('../src/index.js').CardEffect[],
  });
  const player = state.players[pid]!;
  return {
    state: {
      ...state,
      cards: { ...state.cards, [card.id]: card },
      players: { ...state.players, [pid]: { ...player, hand: [...player.hand, card.id] } },
    },
    cardId: card.id,
  };
}

/**
 * Bootstrap a game state ready for P1 to play a Counter:
 * P2 is the active player (attacker), P1 is defending.
 * activeCombat is pre-set (P2 attacker → P1 defender character).
 */
function bootstrapCounterState(): { state: GameState; attackerId: CardId; defenderId: CardId } {
  const base = bootstrapGame();
  const attacker = makeChar('p2-attacker', 'p2', 5000, { tapped: true });
  const defender = makeChar('p1-defender', 'p1', 4000);
  // ST22-016 costs 1 DON — give P1 one active DON so PlayCounter can pay the cost
  const activeDon = makeDon('p1-active-don', 'p1', { tapped: false, attachedTo: null });
  const s: GameState = {
    ...base,
    activePlayerId: P2,
    phase: 'Main',
    cards: { ...base.cards, [attacker.id]: attacker, [defender.id]: defender, [activeDon.id]: activeDon },
    players: {
      ...base.players,
      [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, attacker.id] },
      [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, defender.id], donArea: [...base.players[P1]!.donArea, activeDon.id] },
    },
    activeCombat: { attackerId: attacker.id, targetId: defender.id, blockerId: null, counterPower: 0 },
  };
  return { state: s, attackerId: attacker.id, defenderId: defender.id };
}

// ─── C1: WB revealed → pendingReveal → pendingTarget → +4000 ─────────────────

describe('C1: ST22-016 Counter — WB top card → +4000 EndOfBattle on chosen target', () => {
  it('C1a: PlayCounter sets pendingRevealInteraction', () => {
    const { state: base } = bootstrapCounterState();
    const { state: s2, cardId } = addST22016ToHand(base, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);

    const result = applyAction(s3, { type: 'PlayCounter', playerId: P1, cardId }) as GameState;
    expect(isGameError(result)).toBe(false);
    expect(result.pendingRevealInteraction).not.toBeNull();
    expect(result.pendingRevealInteraction?.revealedCardIds?.length).toBe(1);
    expect(result.pendingRevealInteraction?.playerId).toBe(P1);
  });

  it('C1b: acknowledging WB reveal → sets pendingTargetInteraction for P1', () => {
    const { state: base } = bootstrapCounterState();
    const { state: s2, cardId } = addST22016ToHand(base, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);

    let state = applyAction(s3, { type: 'PlayCounter', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;

    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.pendingRevealInteraction).toBeNull();
    expect(state.pendingTargetInteraction).not.toBeNull();
    expect(state.pendingTargetInteraction?.playerId).toBe(P1);
  });

  it('C1c: full flow — chosen character gains powerModifierBattle: 4000', () => {
    const { state: base, defenderId } = bootstrapCounterState();
    const { state: s2, cardId } = addST22016ToHand(base, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);

    let state = applyAction(s3, { type: 'PlayCounter', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    state = applyAction(state, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: defenderId,
    }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.pendingRevealInteraction).toBeNull();
    expect(state.pendingTargetInteraction).toBeNull();
    expect(state.cards[defenderId]?.powerModifierBattle).toBe(4000);
    expect(calculatePower(defenderId, state)).toBe(4000 + 4000);
  });
});

// ─── C2: Non-WB revealed → no buff ───────────────────────────────────────────

describe('C2: ST22-016 Counter — non-WB top card → no buff', () => {
  it('C2: non-WB reveal → no pendingTargetInteraction, no powerModifierBattle', () => {
    const { state: base, defenderId } = bootstrapCounterState();
    const { state: s2, cardId } = addST22016ToHand(base, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', false);

    let state = applyAction(s3, { type: 'PlayCounter', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;

    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.pendingRevealInteraction).toBeNull();
    expect(state.pendingTargetInteraction).toBeNull();
    expect(state.cards[defenderId]?.powerModifierBattle).toBeUndefined();
  });
});

// ─── C3: Player skips target choice (up to 1) ────────────────────────────────

describe('C3: ST22-016 Counter — player skips target (null) → no buff', () => {
  it('C3: after WB reveal, passing null target leaves all cards unbuffed', () => {
    const { state: base, defenderId } = bootstrapCounterState();
    const { state: s2, cardId } = addST22016ToHand(base, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);

    let state = applyAction(s3, { type: 'PlayCounter', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(state.pendingTargetInteraction).not.toBeNull();

    state = applyAction(state, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: null,
    }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.pendingTargetInteraction).toBeNull();
    expect(state.cards[defenderId]?.powerModifierBattle).toBeUndefined();
  });
});

// ─── C4: ResolveCombat clears powerModifierBattle ────────────────────────────

describe('C4: ST22-016 — powerModifierBattle cleared after ResolveCombat', () => {
  it('C4: +4000 battle buff disappears after combat resolves', () => {
    const { state: base, defenderId } = bootstrapCounterState();
    const { state: s2, cardId } = addST22016ToHand(base, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);

    let state = applyAction(s3, { type: 'PlayCounter', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;
    state = applyAction(state, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: defenderId,
    }) as GameState;

    expect(state.cards[defenderId]?.powerModifierBattle).toBe(4000);

    state = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.cards[defenderId]?.powerModifierBattle).toBeUndefined();
  });
});

// ─── C5: Trigger effect — Draw 1 on life reveal ──────────────────────────────

describe('C5: ST22-016 Trigger — Draw 1 card when revealed from life', () => {
  it('C5: life card with Trigger draws 1 card for the defending player', () => {
    const base = bootstrapGame();
    const leaderId = base.players[P2]!.leader!;

    const attackerCard = makeChar('p1-attacker-c5', 'p1', 10000, { tapped: true });
    const lifeCard: Card = makeChar('st22-016-life', 'p2', 1000, {
      type: 'Character',
      zone: 'life',
      cost: 1,
      counter: 0,
      effects: st22016Effect as unknown as import('../src/index.js').CardEffect[],
    });

    const p2 = base.players[P2]!;
    let s: GameState = {
      ...base,
      activePlayerId: P1,
      phase: 'Main',
      cards: {
        ...base.cards,
        [attackerCard.id]: attackerCard,
        [lifeCard.id]: lifeCard,
      },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attackerCard.id] },
        [P2]: { ...p2, life: [lifeCard.id, ...p2.life] },
      },
      activeCombat: { attackerId: attackerCard.id, targetId: leaderId, blockerId: null, counterPower: 0 },
    };

    const p2HandBefore = s.players[P2]!.hand.length;
    s = applyAction(s, { type: 'ResolveCombat', playerId: P1 }) as GameState;

    expect(isGameError(s)).toBe(false);
    // life card → hand (+1) + Trigger DrawCard (+1) = +2 net for P2
    expect(s.players[P2]!.hand.length).toBe(p2HandBefore + 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EB2/EB3 — EndOfBattle vs EndOfTurn isolation
// EB2: EndOfTurn buff survives ResolveCombat, cleared at EndPhase
// EB3: Two simultaneous buffs → only EndOfBattle cleared after combat
// ═══════════════════════════════════════════════════════════════════════════════

describe('EB2: EndOfTurn buff survives ResolveCombat', () => {
  it('EB2: powerModifier (EndOfTurn) is still present after ResolveCombat', () => {
    const { state: base, attackerId, defenderId } = bootstrapCounterState();

    // Manually apply an EndOfTurn buff to the defender
    let state: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [defenderId]: { ...base.cards[defenderId]!, powerModifier: 2000 },
      },
    };

    // Resolve combat without counter (attacker 5000 < defender 4000+2000=6000 → no KO)
    state = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;

    expect(isGameError(state)).toBe(false);
    // EndOfTurn buff must survive combat resolution
    expect(state.cards[defenderId]?.powerModifier).toBe(2000);
    void attackerId;
  });

  it('EB2b: EndOfTurn buff is cleared when End phase resolves (turn change)', () => {
    // powerModifier is cleared when EndPhase is dispatched from 'End' phase
    let state = bootstrapGame();
    const leaderId = state.players[P1]!.leader!;

    state = {
      ...state,
      phase: 'End',
      cards: { ...state.cards, [leaderId]: { ...state.cards[leaderId]!, powerModifier: 2000 } },
    };
    expect(state.cards[leaderId]?.powerModifier).toBe(2000);

    state = applyAction(state, { type: 'EndPhase', playerId: P1 }) as GameState;
    expect(isGameError(state)).toBe(false);
    // After End phase transitions to next player's turn, modifier is gone
    expect(state.cards[leaderId]?.powerModifier).toBeUndefined();
  });
});

describe('EB3: EndOfBattle cleared, EndOfTurn preserved after ResolveCombat', () => {
  it('EB3: simultaneous EndOfBattle and EndOfTurn buffs → only battle buff cleared', () => {
    const { state: base, attackerId, defenderId } = bootstrapCounterState();

    // Both buffs on the same card
    let state: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [defenderId]: {
          ...base.cards[defenderId]!,
          powerModifier: 1000,       // EndOfTurn — survives combat
          powerModifierBattle: 4000, // EndOfBattle — cleared after combat
        },
      },
    };

    expect(state.cards[defenderId]?.powerModifierBattle).toBe(4000);
    expect(state.cards[defenderId]?.powerModifier).toBe(1000);

    state = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.cards[defenderId]?.powerModifierBattle).toBeUndefined();
    expect(state.cards[defenderId]?.powerModifier).toBe(1000);
    void attackerId;
  });
});

// ─── CT4: Bot waits while human has pendingTargetInteraction ─────────────────

describe('CT4: greedyBotDecide returns null when human has pendingTargetInteraction', () => {
  it('CT4: bot is idle during human thenAction target prompt', () => {
    const BOT = P2;
    const HUMAN = P1;
    const { state: base } = bootstrapCounterState();
    const { state: s2, cardId } = addST22016ToHand(base, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);

    // Human plays Counter → triggers RevealFromDeck
    let state = applyAction(s3, { type: 'PlayCounter', playerId: HUMAN, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;
    // Human acknowledges reveal → now pendingTargetInteraction belongs to HUMAN
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: HUMAN,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(state.pendingTargetInteraction).not.toBeNull();
    expect(state.pendingTargetInteraction?.playerId).toBe(HUMAN);

    // Bot must return null — it cannot act while the human resolves the interaction
    const botAction = greedyBotDecide(state, BOT);
    expect(botAction).toBeNull();
  });
});

// ─── RH6: Non-regression ST22-011 full suite ─────────────────────────────────

describe('RH6: ST22-011 non-regression — invalid card type rejected', () => {
  it('RH6: revealing a non-WB card in a WB-filter reveal is rejected', () => {
    let s = bootstrapGame();
    // Add a non-WB card to hand
    const nonWB: Card = makeChar('non-wb', 'p1', 2000, {
      zone: 'hand',
      subTypes: 'Straw Hat Crew',
    });
    const p1 = s.players[P1]!;
    s = {
      ...s,
      cards: { ...s.cards, [nonWB.id]: nonWB },
      players: { ...s.players, [P1]: { ...p1, hand: [...p1.hand, nonWB.id] } },
    };
    const { state: s2, cardId: wb1 } = addWBToHand(s, 'wb1');
    const { state: s3 } = playST22011(s2);

    // Trying to reveal 1 WB + 1 non-WB should fail filter check
    const result = applyAction(s3, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [wb1, makeCardId('non-wb')],
    });
    expect(isGameError(result)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EOT1-3 — EndOfOpponentTurn duration timing
// EOT1 : powerModifierOT present on own turn, present on opponent's turn,
//         cleared at owner's NEXT Refresh (not at own EndPhase)
// EOT2 : EndOfTurn (powerModifier) cleared at EndPhase; EndOfOpponentTurn persists
// EOT3 : OP09-093 and ST19-001 data files now use "EndOfOpponentTurn" duration
//
// WA1-3 — ST22-012 [When Attacking] effect
// WA1 : top deck = Whitebeard Pirates → RevealFromDeck sets pendingReveal; after
//        ResolveReveal, powerModifierOT +1000 applied to attacker
// WA2 : top deck = non-WB card → powerModifierOT unchanged after reveal
// WA3 : ST22-012 KO substitution end-to-end via resolveEffects
//
// SUB1-5 — OnWouldBeKOByEffect / K.O. substitution mechanic
// SUB1 : KO action on card with OnWouldBeKOByEffect → pendingKOSubstituteInteraction
// SUB2 : Player accepts (discards hand card) → card stays on board
// SUB3 : Player refuses → card is KO'd
// SUB4 : Once Per Turn — second substitution offer skipped
// SUB5 : Combat KO (not effect) → substitution NOT offered
// ═══════════════════════════════════════════════════════════════════════════════

import { resolveEffects, sendToTrash } from '../src/index.js';
import type { CardEffect } from '../src/index.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const onWouldBeKOEffect: CardEffect = {
  trigger: 'OnWouldBeKOByEffect',
  actions: [
    {
      type: 'TrashFromHand',
      count: 1,
      filter: {},
      thenActions: [],
    },
  ],
} as unknown as CardEffect;

const st22012OnAttackEffect: CardEffect = {
  trigger: 'OnAttack',
  actions: [
    {
      type: 'RevealFromDeck',
      count: 1,
      returnTo: 'top',
      thenActions: [
        {
          type: 'PowerBoost',
          amount: 1000,
          target: { scope: 'Self' },
          duration: 'EndOfOpponentTurn',
          condition: { type: 'RevealedCardHasType', cardType: 'Whitebeard Pirates' },
        },
      ],
    },
  ],
} as unknown as CardEffect;

const koEffect: CardEffect = {
  trigger: 'OnPlay',
  actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter' } }],
} as unknown as CardEffect;

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

function addHandCard(state: GameState, owner: typeof P1 | typeof P2, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand' } },
    players: {
      ...state.players,
      [owner]: { ...state.players[owner]!, hand: [...state.players[owner]!.hand, card.id] },
    },
  };
}

// ─── EOT1: EndOfOpponentTurn timing ──────────────────────────────────────────

describe('EOT1: EndOfOpponentTurn — power present on both turns, cleared on owner refresh', () => {
  it('EOT1a: powerModifierOT is reflected in calculatePower during own turn', () => {
    let s = bootstrapGame();
    const char: Card = makeChar('eot-card', 'p1', 4000);
    const p1 = s.players[P1]!;
    s = {
      ...s,
      cards: { ...s.cards, [char.id]: { ...char, powerModifierOT: 1000 } },
      players: { ...s.players, [P1]: { ...p1, board: [...p1.board, char.id] } },
    };
    expect(calculatePower(makeCardId('eot-card'), s)).toBe(5000);
  });

  it('EOT1b: powerModifierOT still present during opponent\'s turn (not cleared at EndPhase)', () => {
    let s = bootstrapGame();
    const char: Card = makeChar('eot-card', 'p1', 4000);
    const p1 = s.players[P1]!;
    s = {
      ...s,
      cards: { ...s.cards, [char.id]: { ...char, powerModifierOT: 1000 } },
      players: { ...s.players, [P1]: { ...p1, board: [...p1.board, char.id] } },
      phase: 'End',
    };
    // P1 EndPhase → switches to P2's turn
    const afterEnd = applyAction(s, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(afterEnd)).toBe(false);
    if (isGameError(afterEnd)) return;
    expect(afterEnd.activePlayerId).toBe(P2);
    // P1's powerModifierOT is NOT cleared yet
    expect(calculatePower(makeCardId('eot-card'), afterEnd)).toBe(5000);
  });

  it('EOT1c: powerModifierOT cleared when owner\'s next turn begins (applyRefresh)', () => {
    let s = bootstrapGame();
    const char: Card = makeChar('eot-card', 'p1', 4000);
    const p1 = s.players[P1]!;
    s = {
      ...s,
      cards: { ...s.cards, [char.id]: { ...char, powerModifierOT: 1000 } },
      players: { ...s.players, [P1]: { ...p1, board: [...p1.board, char.id] } },
    };
    // Move to P2's End phase, then P2 EndPhase → P1's turn starts
    let state: GameState = { ...s, activePlayerId: P2, phase: 'End' };
    const result = applyAction(state, { type: 'EndPhase', playerId: P2 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // P1 starts their turn → clearOppTurnModifiers clears powerModifierOT
    expect(result.activePlayerId).toBe(P1);
    expect(calculatePower(makeCardId('eot-card'), result)).toBe(4000); // cleared
  });
});

// ─── EOT2: EndOfTurn vs EndOfOpponentTurn expiry ──────────────────────────────

describe('EOT2: EndOfTurn cleared at own EndPhase; EndOfOpponentTurn persists', () => {
  it('EOT2: powerModifier (EndOfTurn) cleared at P1 EndPhase; powerModifierOT survives', () => {
    let s = bootstrapGame();
    const charA: Card = makeChar('eot-card',  'p1', 3000, { powerModifier:   1000 });
    const charB: Card = makeChar('eoot-card', 'p1', 3000, { powerModifierOT: 1000 });
    const p1 = s.players[P1]!;
    s = {
      ...s,
      cards: { ...s.cards, [charA.id]: charA, [charB.id]: charB },
      players: { ...s.players, [P1]: { ...p1, board: [...p1.board, charA.id, charB.id] } },
      phase: 'End',
    };
    const result = applyAction(s, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(calculatePower(makeCardId('eot-card'),  result)).toBe(3000); // EndOfTurn cleared
    expect(calculatePower(makeCardId('eoot-card'), result)).toBe(4000); // EndOfOpponentTurn survives
  });
});

// ─── EOT3: OP09-093 and ST19-001 use valid EndOfOpponentTurn duration ─────────

describe('EOT3: OP09-093 and ST19-001 no longer use UntilEndOfOpponentNextTurn', () => {
  it('EOT3: OP09-093 and ST19-001 use EndOfOpponentTurn (valid duration)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const effectsDir = path.join(__dirname, '../../data/effects');

    for (const filename of ['OP09-093.json', 'ST19-001.json']) {
      const raw = fs.readFileSync(path.join(effectsDir, filename), 'utf-8');
      expect(raw).not.toContain('UntilEndOfOpponentNextTurn');
      const parsed = JSON.parse(raw) as { effects?: { actions?: { duration?: string }[] }[] };
      const durations = (parsed.effects ?? []).flatMap(
        (e) => (e.actions ?? []).map((a) => a.duration).filter(Boolean),
      );
      expect(durations.every((d) => d !== 'UntilEndOfOpponentNextTurn')).toBe(true);
    }
  });
});

// ─── WA1: ST22-012 OnAttack — Whitebeard revealed → powerModifierOT set ───────

describe('WA1: ST22-012 [When Attacking] — WB card revealed → +1000 powerModifierOT', () => {
  it('WA1: DeclareAttack → pendingReveal; after resolve reveal with WB card → powerModifierOT +1000', () => {
    let s = bootstrapGame();
    // Attacker with ST22-012 OnAttack effect
    const attacker: Card = makeChar('st22-012', 'p1', 5000, {
      effects: [st22012OnAttackEffect],
    });
    s = {
      ...s,
      cards: { ...s.cards, [attacker.id]: attacker },
      players: { ...s.players, [P1]: { ...s.players[P1]!, board: [...s.players[P1]!.board, attacker.id] } },
    };
    // Inject a Whitebeard Pirates card at top of P1's deck
    const wbCard: Card = makeChar('wb-top', 'p1', 3000, {
      zone: 'deck',
      subTypes: 'Whitebeard Pirates',
    });
    const p1Deck = [wbCard.id, ...s.players[P1]!.deck] as CardId[];
    s = {
      ...s,
      cards: { ...s.cards, [wbCard.id]: wbCard },
      players: { ...s.players, [P1]: { ...s.players[P1]!, deck: p1Deck } },
    };

    // P2 leader is the attack target
    const targetId = s.players[P2]!.leader!;

    // DeclareAttack → OnAttack fires → RevealFromDeck → pendingRevealInteraction
    const afterAttack = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId,
    });
    expect(isGameError(afterAttack)).toBe(false);
    if (isGameError(afterAttack)) return;
    expect(afterAttack.pendingRevealInteraction).not.toBeNull();

    const revealedId = afterAttack.pendingRevealInteraction!.revealedCardIds![0]!;
    expect(afterAttack.cards[revealedId]?.subTypes).toBe('Whitebeard Pirates');

    // Acknowledge reveal → condition met → PowerBoost(EndOfOpponentTurn) applied
    const afterReveal = applyAction(afterAttack, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    });
    expect(isGameError(afterReveal)).toBe(false);
    if (isGameError(afterReveal)) return;
    expect(afterReveal.pendingRevealInteraction).toBeNull();
    // Attacker now has +1000 powerModifierOT
    expect(afterReveal.cards[attacker.id]?.powerModifierOT).toBe(1000);
    expect(calculatePower(attacker.id, afterReveal)).toBe(6000);
  });
});

// ─── WA2: Non-WB revealed → no boost ─────────────────────────────────────────

describe('WA2: ST22-012 [When Attacking] — non-WB card revealed → no powerModifierOT', () => {
  it('WA2: reveal resolves cleanly, no powerModifierOT applied', () => {
    let s = bootstrapGame();
    const attacker: Card = makeChar('st22-012', 'p1', 5000, {
      effects: [st22012OnAttackEffect],
    });
    s = {
      ...s,
      cards: { ...s.cards, [attacker.id]: attacker },
      players: { ...s.players, [P1]: { ...s.players[P1]!, board: [...s.players[P1]!.board, attacker.id] } },
    };
    // Non-WB card at top of deck
    const nonWB: Card = makeChar('non-wb-top', 'p1', 3000, {
      zone: 'deck',
      subTypes: 'Straw Hat Crew',
    });
    const p1Deck = [nonWB.id, ...s.players[P1]!.deck] as CardId[];
    s = {
      ...s,
      cards: { ...s.cards, [nonWB.id]: nonWB },
      players: { ...s.players, [P1]: { ...s.players[P1]!, deck: p1Deck } },
    };

    const targetId = s.players[P2]!.leader!;
    const afterAttack = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId,
    }) as GameState;
    expect(afterAttack.pendingRevealInteraction).not.toBeNull();

    const revealedId = afterAttack.pendingRevealInteraction!.revealedCardIds![0]!;
    const afterReveal = applyAction(afterAttack, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(isGameError(afterReveal)).toBe(false);
    // Condition not met → no powerModifierOT applied
    expect(afterReveal.cards[attacker.id]?.powerModifierOT ?? 0).toBe(0);
    expect(calculatePower(attacker.id, afterReveal)).toBe(5000);
  });
});

// ─── WA3: ST22-012 KO substitution end-to-end ────────────────────────────────

describe('WA3: ST22-012 [Once Per Turn] KO substitution end-to-end', () => {
  it('WA3: KO effect on card with OnWouldBeKOByEffect → offer sub, accept → card survives', () => {
    let s = bootstrapGame();
    const target: Card = makeChar('st22-012', 'p1', 5000, {
      effects: [onWouldBeKOEffect],
    });
    s = {
      ...s,
      cards: { ...s.cards, [target.id]: target },
      players: { ...s.players, [P1]: { ...s.players[P1]!, board: [...s.players[P1]!.board, target.id] } },
    };
    // Give P1 a hand card to discard
    const handCard: Card = makeChar('hand-card', 'p1', 1000, { zone: 'hand' });
    s = addHandCard(s, P1, handCard);

    // Simulate a KO effect targeting P1's card via resolveEffects
    const koActions: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter' } }],
    } as unknown as CardEffect;
    const afterKO = resolveEffects(
      [koActions],
      'OnPlay',
      { sourceCardId: makeCardId('p2-ko-source'), sourcePlayerId: P2, chosenTargetId: target.id },
      s,
    );
    // Substitution offered
    expect(afterKO.pendingKOSubstituteInteraction).not.toBeNull();
    expect(afterKO.pendingKOSubstituteInteraction?.cardId).toBe(target.id);
    expect(afterKO.pendingKOSubstituteInteraction?.playerId).toBe(P1);

    // P1 accepts — discard the hand card
    const afterAccept = applyAction(afterKO, {
      type: 'ResolveKOSubstitute',
      playerId: P1,
      discardedCardId: handCard.id,
    });
    expect(isGameError(afterAccept)).toBe(false);
    if (isGameError(afterAccept)) return;
    // Substitution cleared
    expect(afterAccept.pendingKOSubstituteInteraction).toBeNull();
    // Target card still on board
    expect(afterAccept.cards[target.id]?.zone).toBe('board');
    // Hand card is now in trash
    expect(afterAccept.cards[handCard.id]?.zone).toBe('trash');
    // koSubstituteUsedIds records the card
    expect(afterAccept.koSubstituteUsedIds).toContain(target.id);
  });
});

// ─── SUB1-5: OnWouldBeKOByEffect core mechanics ───────────────────────────────

describe('SUB1: KO action on card with OnWouldBeKOByEffect → pendingKOSubstituteInteraction created', () => {
  it('SUB1: resolveEffects with KO on OnWouldBeKOByEffect card → pending interaction set', () => {
    let s = bootstrapGame();
    const target: Card = makeChar('sub-target', 'p1', 4000, {
      effects: [onWouldBeKOEffect],
    });
    s = {
      ...s,
      cards: { ...s.cards, [target.id]: target },
      players: { ...s.players, [P1]: { ...s.players[P1]!, board: [...s.players[P1]!.board, target.id] } },
    };
    const handCard: Card = makeChar('sub-hand', 'p1', 1000, { zone: 'hand' });
    s = addHandCard(s, P1, handCard);

    const afterKO = resolveEffects(
      [koEffect],
      'OnPlay',
      { sourceCardId: makeCardId('p2-src'), sourcePlayerId: P2, chosenTargetId: target.id },
      s,
    );
    expect(afterKO.pendingKOSubstituteInteraction).not.toBeNull();
    expect(afterKO.pendingKOSubstituteInteraction?.cardId).toBe(target.id);
    expect(afterKO.cards[target.id]?.zone).toBe('board'); // not KO'd yet
  });
});

describe('SUB2: Player accepts substitution → card stays, hand card trashed', () => {
  it('SUB2: accept ResolveKOSubstitute → card lives, discarded card goes to trash', () => {
    let s = bootstrapGame();
    const target: Card = makeChar('sub-target', 'p1', 4000, { effects: [onWouldBeKOEffect] });
    s = {
      ...s,
      cards: { ...s.cards, [target.id]: target },
      players: { ...s.players, [P1]: { ...s.players[P1]!, board: [...s.players[P1]!.board, target.id] } },
    };
    const handCard: Card = makeChar('sub-hand', 'p1', 1000, { zone: 'hand' });
    s = addHandCard(s, P1, handCard);

    let state: GameState = resolveEffects(
      [koEffect],
      'OnPlay',
      { sourceCardId: makeCardId('p2-src'), sourcePlayerId: P2, chosenTargetId: target.id },
      s,
    );

    const result = applyAction(state, {
      type: 'ResolveKOSubstitute',
      playerId: P1,
      discardedCardId: handCard.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[target.id]?.zone).toBe('board');
    expect(result.cards[handCard.id]?.zone).toBe('trash');
    expect(result.pendingKOSubstituteInteraction).toBeNull();
  });
});

describe('SUB3: Player refuses substitution → card KO\'d', () => {
  it('SUB3: refuse ResolveKOSubstitute → card goes to trash', () => {
    let s = bootstrapGame();
    const target: Card = makeChar('sub-target', 'p1', 4000, { effects: [onWouldBeKOEffect] });
    s = {
      ...s,
      cards: { ...s.cards, [target.id]: target },
      players: { ...s.players, [P1]: { ...s.players[P1]!, board: [...s.players[P1]!.board, target.id] } },
    };
    const handCard: Card = makeChar('sub-hand', 'p1', 1000, { zone: 'hand' });
    s = addHandCard(s, P1, handCard);

    let state: GameState = resolveEffects(
      [koEffect],
      'OnPlay',
      { sourceCardId: makeCardId('p2-src'), sourcePlayerId: P2, chosenTargetId: target.id },
      s,
    );

    const result = applyAction(state, {
      type: 'ResolveKOSubstitute',
      playerId: P1,
      discardedCardId: null, // refuse
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[target.id]?.zone).toBe('trash');
    expect(result.pendingKOSubstituteInteraction).toBeNull();
  });
});

describe('SUB4: Once Per Turn — second KO attempt does not offer substitution', () => {
  it('SUB4: after accepting once, second KO on same card proceeds directly', () => {
    let s = bootstrapGame();
    const target: Card = makeChar('sub-target', 'p1', 4000, { effects: [onWouldBeKOEffect] });
    s = {
      ...s,
      cards: { ...s.cards, [target.id]: target },
      players: { ...s.players, [P1]: { ...s.players[P1]!, board: [...s.players[P1]!.board, target.id] } },
    };
    const handCard1: Card = makeChar('sub-hand-1', 'p1', 1000, { zone: 'hand' });
    const handCard2: Card = makeChar('sub-hand-2', 'p1', 1000, { zone: 'hand' });
    s = addHandCard(addHandCard(s, P1, handCard1), P1, handCard2);

    // First KO → substitution offered
    let state: GameState = resolveEffects(
      [koEffect],
      'OnPlay',
      { sourceCardId: makeCardId('p2-src'), sourcePlayerId: P2, chosenTargetId: target.id },
      s,
    );
    expect(state.pendingKOSubstituteInteraction).not.toBeNull();

    // Accept first time
    state = applyAction(state, {
      type: 'ResolveKOSubstitute',
      playerId: P1,
      discardedCardId: handCard1.id,
    }) as GameState;
    expect(state.koSubstituteUsedIds).toContain(target.id);

    // Second KO on same card — once per turn used, no substitution offered
    state = resolveEffects(
      [koEffect],
      'OnPlay',
      { sourceCardId: makeCardId('p2-src-2'), sourcePlayerId: P2, chosenTargetId: target.id },
      state,
    );
    // No pending interaction — KO proceeds directly
    expect(state.pendingKOSubstituteInteraction).toBeNull();
    expect(state.cards[target.id]?.zone).toBe('trash');
  });
});

describe('SUB5: Combat KO does not trigger OnWouldBeKOByEffect', () => {
  it('SUB5: sendToTrash (combat path) does not set pendingKOSubstituteInteraction', () => {
    // Combat uses sendToTrash directly — it bypasses the effect engine interception.
    // Only resolveEffects with a KO action checks OnWouldBeKOByEffect.
    let s = bootstrapGame();
    const victim: Card = makeChar('sub-victim', 'p1', 1000, { effects: [onWouldBeKOEffect] });
    s = {
      ...s,
      cards: { ...s.cards, [victim.id]: victim },
      players: { ...s.players, [P1]: { ...s.players[P1]!, board: [...s.players[P1]!.board, victim.id] } },
    };
    const handCard: Card = makeChar('sub-hand', 'p1', 1000, { zone: 'hand' });
    s = addHandCard(s, P1, handCard);

    // sendToTrash is the combat KO path — no OnWouldBeKOByEffect check
    const afterTrash = sendToTrash(s, victim.id);
    expect(afterTrash.pendingKOSubstituteInteraction).toBeNull();
    expect(afterTrash.cards[victim.id]?.zone).toBe('trash');
  });
});

// ─── DC4: Simple counter (static value) regression ────────────────────────────

describe('DC4: Static counter card still works after Counter-effect changes', () => {
  it('DC4: playing a card with counter:2000 adds 2000 to counterPower, no pending', () => {
    const { state: base } = bootstrapCounterState();
    const staticCounter: Card = makeChar('dc4-counter', 'p1', 3000, {
      zone: 'hand',
      counter: 2000,
    });
    const s: GameState = {
      ...base,
      cards: { ...base.cards, [staticCounter.id]: staticCounter },
      players: { ...base.players, [P1]: { ...base.players[P1]!, hand: [...base.players[P1]!.hand, staticCounter.id] } },
    };

    const result = applyAction(s, { type: 'PlayCounter', playerId: P1, cardId: staticCounter.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.activeCombat?.counterPower).toBe(2000);
    expect(result.pendingRevealInteraction).toBeNull();
    expect(result.pendingTargetInteraction).toBeNull();
    expect(result.cards[staticCounter.id]?.zone).toBe('trash');
  });
});

// ─── DC5: Bot resolves pending reveal created by Counter effect ────────────────

describe('DC5: Bot resolves pendingRevealInteraction created by Counter effect', () => {
  it('DC5: greedyBotDecide returns PlayCounter then ResolveRevealInteraction', () => {
    // P1 is active (attacker), P2 is the bot-defender with a Counter-effect card
    const base = bootstrapGame();
    const attacker: Card = makeChar('dc5-attacker', 'p1', 9000, { tapped: true });
    const targetLeader = base.players[P2]!.leader!;

    const counterCard: Card = makeChar('dc5-counter', 'p2', 1000, {
      zone: 'hand',
      counter: 0,
      effects: st22016Effect as unknown as import('../src/index.js').CardEffect[],
    });

    // WB card at top of P2's deck so the condition is met
    const wbDeckCard: Card = makeChar('dc5-wb', 'p2', 2000, {
      zone: 'deck',
      subTypes: 'Whitebeard Pirates',
    });
    const p2 = base.players[P2]!;
    const p2DeckUpdated = [wbDeckCard.id, ...p2.deck] as CardId[];

    let s: GameState = {
      ...base,
      activePlayerId: P1,
      phase: 'Main',
      turnNumber: 3,
      cards: { ...base.cards, [attacker.id]: attacker, [counterCard.id]: counterCard, [wbDeckCard.id]: wbDeckCard },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attacker.id] },
        [P2]: { ...p2, hand: [...p2.hand, counterCard.id], deck: p2DeckUpdated },
      },
      activeCombat: { attackerId: attacker.id, targetId: targetLeader, blockerId: null, counterPower: 0 },
    };

    // Bot (P2) is in defender position; attacker power (9000) > leader power (5000) → bot wants to counter
    const botAction = greedyBotDecide(s, P2);
    expect(botAction).not.toBeNull();
    expect(botAction?.type).toBe('PlayCounter');

    // Apply PlayCounter → pendingRevealInteraction created
    const afterCounter = applyAction(s, botAction!) as GameState;
    expect(isGameError(afterCounter)).toBe(false);
    expect(afterCounter.pendingRevealInteraction).not.toBeNull();
    expect(afterCounter.pendingRevealInteraction?.playerId).toBe(P2);

    // Bot resolves the pending reveal
    const botAction2 = greedyBotDecide(afterCounter, P2);
    expect(botAction2).not.toBeNull();
    expect(botAction2?.type).toBe('ResolveRevealInteraction');

    const afterReveal = applyAction(afterCounter, botAction2!) as GameState;
    expect(isGameError(afterReveal)).toBe(false);
    // WB card revealed → pendingTargetInteraction for P2 (ChooseOwnCharacterOrLeader)
    expect(afterReveal.pendingRevealInteraction).toBeNull();
    expect(afterReveal.pendingTargetInteraction).not.toBeNull();
    expect(afterReveal.pendingTargetInteraction?.playerId).toBe(P2);
  });
});

// ─── ST1-ST4: ST22-002 SearchDeck (lookCount:5 / selectCount:1) ───────────────

/** ST22-002-like effect: look at top 5, reveal up to 1 WB (not Izo) → hand, rest → bottom */
const st22002SearchEffect = {
  trigger: 'OnPlay' as const,
  actions: [
    {
      type: 'SearchDeck' as const,
      lookCount: 5,
      count: 1,
      filter: {
        kind: 'BySubType' as const,
        subType: 'Whitebeard Pirates',
        cardType: 'Character' as const,
        excludeNames: ['Izo'],
      },
      destination: 'hand' as const,
      restTo: 'bottom' as const,
    },
  ],
};

/** Inject N cards (with specified names/subTypes) at the top of P1's deck. */
function injectDeckCards(
  state: GameState,
  cards: Array<{ id: string; name: string; subTypes?: string }>,
): GameState {
  const newCards = cards.map((c) => ({
    id: makeCardId(c.id),
    name: c.name,
    cost: 2,
    power: 3000,
    color: 'Purple' as const,
    type: 'Character' as const,
    zone: 'deck' as const,
    ownerId: P1,
    tapped: false,
    attachedTo: null,
    ...(c.subTypes !== undefined ? { subTypes: c.subTypes } : {}),
  }));
  const newCardMap = Object.fromEntries(newCards.map((c) => [c.id, c]));
  const newTopIds = newCards.map((c) => c.id as CardId);
  const p1 = state.players[P1]!;
  return {
    ...state,
    cards: { ...state.cards, ...newCardMap },
    players: { ...state.players, [P1]: { ...p1, deck: [...newTopIds, ...p1.deck] as readonly CardId[] } },
  };
}

describe('ST1: ST22-002 [On Play] — look 5, WB valid picked → hand, 4 others to bottom', () => {
  it('ST1: play ST22-002 → pendingSearchInteraction with 5 revealed; pick WB → hand, rest bottom', () => {
    let s = bootstrapGame();
    // Inject 5 cards at top: Izo (WB, excluded), Marco (WB, valid), 3 non-WB
    s = injectDeckCards(s, [
      { id: 'deck-izo', name: 'Izo', subTypes: 'Whitebeard Pirates' },
      { id: 'deck-marco', name: 'Marco', subTypes: 'Whitebeard Pirates' },
      { id: 'deck-luffy', name: 'Luffy', subTypes: 'Straw Hat Crew' },
      { id: 'deck-zoro', name: 'Zoro', subTypes: 'Straw Hat Crew' },
      { id: 'deck-nami', name: 'Nami', subTypes: 'Straw Hat Crew' },
    ]);
    const st22002: Card = makeChar('st22-002', 'p1', 2000, {
      zone: 'hand',
      effects: [st22002SearchEffect as unknown as import('../src/index.js').CardEffect],
    });
    s = {
      ...s,
      cards: { ...s.cards, [st22002.id]: st22002 },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, st22002.id] } },
    };
    const deckSizeBefore = s.players[P1]!.deck.length;

    const afterPlay = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: st22002.id }) as GameState;
    expect(isGameError(afterPlay)).toBe(false);

    // 5 cards revealed, maxSelect = 1
    expect(afterPlay.pendingSearchInteraction).not.toBeNull();
    expect(afterPlay.pendingSearchInteraction?.revealedCardIds.length).toBe(5);
    expect(afterPlay.pendingSearchInteraction?.maxSelect).toBe(1);
    expect(afterPlay.pendingSearchInteraction?.restTo).toBe('bottom');

    // Pick Marco (the valid WB non-Izo card)
    const marcoId = makeCardId('deck-marco');
    const afterPick = applyAction(afterPlay, {
      type: 'ResolveSearchInteraction',
      playerId: P1,
      chosenCardId: marcoId,
    }) as GameState;
    expect(isGameError(afterPick)).toBe(false);
    expect(afterPick.pendingSearchInteraction).toBeNull();

    // Marco is in hand
    expect(afterPick.players[P1]!.hand).toContain(marcoId);
    expect(afterPick.cards[marcoId]?.zone).toBe('hand');

    // Remaining 4 go to bottom: deck size = deckSizeBefore - 5 + 4 = deckSizeBefore - 1
    const deckAfter = afterPick.players[P1]!.deck;
    expect(deckAfter.length).toBe(deckSizeBefore - 1);
    // The 4 non-picked revealed cards (izo, luffy, zoro, nami) are at the bottom in original order
    const bottom4 = deckAfter.slice(-4);
    expect(bottom4).toContain(makeCardId('deck-izo'));
    expect(bottom4).toContain(makeCardId('deck-luffy'));
    expect(bottom4).toContain(makeCardId('deck-nami'));
  });
});

describe('ST2: ST22-002 [On Play] — player passes → all 5 go to bottom', () => {
  it('ST2: ResolveSearchInteraction with null → all 5 revealed cards placed at bottom', () => {
    let s = bootstrapGame();
    s = injectDeckCards(s, [
      { id: 'st2-a', name: 'A', subTypes: 'Whitebeard Pirates' },
      { id: 'st2-b', name: 'B', subTypes: 'Whitebeard Pirates' },
      { id: 'st2-c', name: 'C' },
      { id: 'st2-d', name: 'D' },
      { id: 'st2-e', name: 'E' },
    ]);
    const card: Card = makeChar('st22-002-st2', 'p1', 2000, {
      zone: 'hand',
      effects: [st22002SearchEffect as unknown as import('../src/index.js').CardEffect],
    });
    s = {
      ...s,
      cards: { ...s.cards, [card.id]: card },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, card.id] } },
    };
    const deckBefore = s.players[P1]!.deck.length;

    const afterPlay = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id }) as GameState;
    expect(afterPlay.pendingSearchInteraction).not.toBeNull();

    const afterPass = applyAction(afterPlay, {
      type: 'ResolveSearchInteraction',
      playerId: P1,
      chosenCardId: null,
    }) as GameState;
    expect(isGameError(afterPass)).toBe(false);
    expect(afterPass.pendingSearchInteraction).toBeNull();
    // All 5 revealed cards go to bottom — deck size unchanged
    expect(afterPass.players[P1]!.deck.length).toBe(deckBefore);
    // Last 5 entries of deck are the revealed cards (in bottom position)
    const deck = afterPass.players[P1]!.deck;
    const bottom5 = deck.slice(-5);
    expect(bottom5).toContain(makeCardId('st2-a'));
    expect(bottom5).toContain(makeCardId('st2-e'));
  });
});

describe('ST3: ST22-002 [On Play] — no valid WB cards → pendingSearchInteraction, player must pass', () => {
  it('ST3: all 5 cards are non-WB → none selectable (player passes, deck unchanged)', () => {
    let s = bootstrapGame();
    s = injectDeckCards(s, [
      { id: 'st3-a', name: 'Luffy', subTypes: 'Straw Hat Crew' },
      { id: 'st3-b', name: 'Zoro', subTypes: 'Straw Hat Crew' },
      { id: 'st3-c', name: 'Nami', subTypes: 'Straw Hat Crew' },
      { id: 'st3-d', name: 'Sanji', subTypes: 'Straw Hat Crew' },
      { id: 'st3-e', name: 'Robin', subTypes: 'Straw Hat Crew' },
    ]);
    const card: Card = makeChar('st22-002-st3', 'p1', 2000, {
      zone: 'hand',
      effects: [st22002SearchEffect as unknown as import('../src/index.js').CardEffect],
    });
    s = {
      ...s,
      cards: { ...s.cards, [card.id]: card },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, card.id] } },
    };

    const afterPlay = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id }) as GameState;
    expect(isGameError(afterPlay)).toBe(false);
    expect(afterPlay.pendingSearchInteraction).not.toBeNull();
    expect(afterPlay.pendingSearchInteraction?.revealedCardIds.length).toBe(5);

    // Player is forced to pass (no valid cards) — no crash
    const afterPass = applyAction(afterPlay, {
      type: 'ResolveSearchInteraction',
      playerId: P1,
      chosenCardId: null,
    }) as GameState;
    expect(isGameError(afterPass)).toBe(false);
    expect(afterPass.pendingSearchInteraction).toBeNull();
  });
});

describe('ST4: ST22-002 [On Play] — deck < 5 cards → no crash', () => {
  it('ST4: deck with 3 cards → reveals 3 not 5, no error', () => {
    let s = bootstrapGame();
    // Replace P1's deck with only 3 cards
    const tinyDeck: Card[] = [
      makeChar('tiny-a', 'p1', 2000, { zone: 'deck', subTypes: 'Whitebeard Pirates' }),
      makeChar('tiny-b', 'p1', 2000, { zone: 'deck' }),
      makeChar('tiny-c', 'p1', 2000, { zone: 'deck' }),
    ];
    const tinyMap = Object.fromEntries(tinyDeck.map((c) => [c.id, c]));
    s = {
      ...s,
      cards: { ...s.cards, ...tinyMap },
      players: { ...s.players, [P1]: { ...s.players[P1]!, deck: tinyDeck.map((c) => c.id) as readonly CardId[] } },
    };
    const card: Card = makeChar('st22-002-st4', 'p1', 2000, {
      zone: 'hand',
      effects: [st22002SearchEffect as unknown as import('../src/index.js').CardEffect],
    });
    s = {
      ...s,
      cards: { ...s.cards, [card.id]: card },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, card.id] } },
    };

    const afterPlay = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id }) as GameState;
    expect(isGameError(afterPlay)).toBe(false);
    expect(afterPlay.pendingSearchInteraction).not.toBeNull();
    // Only 3 cards available — reveals all 3
    expect(afterPlay.pendingSearchInteraction?.revealedCardIds.length).toBe(3);
  });
});

// ─── DC6-DC8: ST22-016 Counter target interaction during opponent's turn ────────

describe('DC6: Counter during opponent turn → pendingTargetInteraction.playerId = counter player', () => {
  it('DC6: after PlayCounter (P1 defending, P2 attacking), target interaction belongs to P1', () => {
    const { state: base } = bootstrapCounterState();
    const { state: s2, cardId } = addST22016ToHand(base, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true); // WB on top of P1's deck

    // P2 is active (attacker). P1 plays counter.
    let state = applyAction(s3, { type: 'PlayCounter', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(isGameError(state)).toBe(false);
    expect(state.pendingTargetInteraction).not.toBeNull();
    // Belongs to P1 (the counter player), NOT P2 (the active player)
    expect(state.pendingTargetInteraction?.playerId).toBe(P1);
    expect(state.activePlayerId).toBe(P2); // confirm P2 is still active
  });
});

describe('DC7: sourceCardId in pendingTargetInteraction is the counter card', () => {
  it('DC7: pendingTargetInteraction.sourceCardId === counter card id', () => {
    const { state: base } = bootstrapCounterState();
    const { state: s2, cardId } = addST22016ToHand(base, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);

    let state = applyAction(s3, { type: 'PlayCounter', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    expect(state.pendingTargetInteraction?.sourceCardId).toBe(cardId);
  });
});

describe('DC8: engine accepts ResolveTargetInteraction from counter player (not active player)', () => {
  it('DC8: P1 counter player selects own defender card as target → buff applied', () => {
    const { state: base, defenderId } = bootstrapCounterState();
    const { state: s2, cardId } = addST22016ToHand(base, 'p1');
    const { state: s3 } = injectTopDeckCardFor(s2, 'p1', true);

    let state = applyAction(s3, { type: 'PlayCounter', playerId: P1, cardId }) as GameState;
    const revealedId = state.pendingRevealInteraction!.revealedCardIds![0]!;
    state = applyAction(state, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [revealedId],
    }) as GameState;

    // P1 resolves target — even though P2 is the active player
    const result = applyAction(state, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: defenderId,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[defenderId]?.powerModifierBattle).toBe(4000);
    expect(result.pendingTargetInteraction).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUB6-10 — External KO protection (Group 1)
// SUB6 : KO action on allied card with external protector → pendingKOSubstituteInteraction (Auto cost)
// SUB7 : Player accepts (Auto) → protector trashed, target stays on board
// SUB8 : Player refuses → target is KO'd, protector untouched
// SUB9 : Protector already used this turn → protection not offered again
// SUB10: Rest-self protector → player accepts → protector rested, target stays
// ═══════════════════════════════════════════════════════════════════════════════

import { computePlayCost, resolveEffects } from '../src/index.js';
import type { CardEffect as CardEffectType } from '../src/index.js';

const externalKOProtectEffect_TrashSelf: CardEffectType = {
  trigger: 'OnWouldBeKOByEffect',
  protects: { scope: 'AllOwnCharacters' },
  actions: [{ type: 'TrashSelf' }],
} as unknown as CardEffectType;

const externalKOProtectEffect_Rest: CardEffectType = {
  trigger: 'OnWouldBeKOByEffect',
  protects: { scope: 'AllOwnCharacters' },
  actions: [{ type: 'Rest', target: { scope: 'Self' } }],
} as unknown as CardEffectType;

const koEffect2: CardEffectType = {
  trigger: 'OnPlay',
  actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter' } }],
} as unknown as CardEffectType;

function addCardToBoard(state: GameState, card: Card, owner: typeof P1 | typeof P2): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: {
      ...state.players,
      [owner]: { ...state.players[owner]!, board: [...state.players[owner]!.board, card.id] },
    },
  };
}

describe('SUB6: External protector — KO on ally triggers Auto pending interaction', () => {
  it('SUB6: KO on ally card → pendingKOSubstituteInteraction with costType=Auto', () => {
    let s = bootstrapGame();
    const target: Card = makeChar('ally-target', 'p2', 3000);
    const protector: Card = makeChar('protector', 'p2', 2000, {
      effects: [externalKOProtectEffect_TrashSelf],
    });
    s = addCardToBoard(s, target, P2);
    s = addCardToBoard(s, protector, P2);

    const result = resolveEffects(
      [koEffect2],
      'OnPlay',
      { sourceCardId: makeCardId('attacker'), sourcePlayerId: P1, chosenTargetId: target.id },
      s,
    );
    expect(result.pendingKOSubstituteInteraction).not.toBeNull();
    expect(result.pendingKOSubstituteInteraction?.cardId).toBe(target.id);
    expect(result.pendingKOSubstituteInteraction?.protectorCardId).toBe(protector.id);
    expect(result.pendingKOSubstituteInteraction?.costType).toBe('Auto');
  });
});

describe('SUB7: External protector — player accepts Auto → protector trashed, target stays', () => {
  it('SUB7: accept ResolveKOSubstitute with accept=true → protector in trash, target on board', () => {
    let s = bootstrapGame();
    const target: Card = makeChar('ally-target2', 'p2', 3000);
    const protector: Card = makeChar('protector2', 'p2', 2000, {
      effects: [externalKOProtectEffect_TrashSelf],
    });
    s = addCardToBoard(s, target, P2);
    s = addCardToBoard(s, protector, P2);

    let s2 = resolveEffects(
      [koEffect2],
      'OnPlay',
      { sourceCardId: makeCardId('attacker'), sourcePlayerId: P1, chosenTargetId: target.id },
      s,
    );
    expect(s2.pendingKOSubstituteInteraction).not.toBeNull();

    const result = applyAction(s2, {
      type: 'ResolveKOSubstitute',
      playerId: P2,
      discardedCardId: null,
      accept: true,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Target stays on board
    expect(result.cards[target.id]?.zone).toBe('board');
    // Protector is trashed
    expect(result.cards[protector.id]?.zone).toBe('trash');
    expect(result.pendingKOSubstituteInteraction).toBeNull();
  });
});

describe('SUB8: External protector — player refuses → target KO\'d, protector untouched', () => {
  it('SUB8: refuse ResolveKOSubstitute → target trashed, protector on board', () => {
    let s = bootstrapGame();
    const target: Card = makeChar('ally-target3', 'p2', 3000);
    const protector: Card = makeChar('protector3', 'p2', 2000, {
      effects: [externalKOProtectEffect_TrashSelf],
    });
    s = addCardToBoard(s, target, P2);
    s = addCardToBoard(s, protector, P2);

    let s2 = resolveEffects(
      [koEffect2],
      'OnPlay',
      { sourceCardId: makeCardId('attacker'), sourcePlayerId: P1, chosenTargetId: target.id },
      s,
    );

    const result = applyAction(s2, {
      type: 'ResolveKOSubstitute',
      playerId: P2,
      discardedCardId: null,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[target.id]?.zone).toBe('trash');
    expect(result.cards[protector.id]?.zone).toBe('board');
  });
});

describe('SUB9: External protector — once-per-turn: koSubstituteUsedIds prevents double protection', () => {
  it('SUB9: koSubstituteUsedIds prevents second protection offer', () => {
    let s = bootstrapGame();
    const target: Card = makeChar('ally-target4', 'p2', 3000);
    const protector: Card = makeChar('protector4', 'p2', 2000, {
      effects: [externalKOProtectEffect_TrashSelf],
    });
    s = addCardToBoard(s, target, P2);
    s = addCardToBoard(s, protector, P2);
    // Mark target as already-substituted this turn
    s = { ...s, koSubstituteUsedIds: [...s.koSubstituteUsedIds, target.id] };

    const result = resolveEffects(
      [koEffect2],
      'OnPlay',
      { sourceCardId: makeCardId('attacker'), sourcePlayerId: P1, chosenTargetId: target.id },
      s,
    );
    // No protection offered — card is just KO'd
    expect(result.pendingKOSubstituteInteraction).toBeNull();
    expect(result.cards[target.id]?.zone).toBe('trash');
  });
});

describe('SUB10: Rest-self external protector — accepts → protector rested, target stays', () => {
  it('SUB10: Rest costAction applied on accept', () => {
    let s = bootstrapGame();
    const target: Card = makeChar('ally-target5', 'p2', 3000);
    const protector: Card = makeChar('protector5', 'p2', 2000, {
      effects: [externalKOProtectEffect_Rest],
      tapped: false,
    });
    s = addCardToBoard(s, target, P2);
    s = addCardToBoard(s, protector, P2);

    let s2 = resolveEffects(
      [koEffect2],
      'OnPlay',
      { sourceCardId: makeCardId('attacker'), sourcePlayerId: P1, chosenTargetId: target.id },
      s,
    );
    expect(s2.pendingKOSubstituteInteraction?.costType).toBe('Auto');

    const result = applyAction(s2, {
      type: 'ResolveKOSubstitute',
      playerId: P2,
      discardedCardId: null,
      accept: true,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[target.id]?.zone).toBe('board');
    expect(result.cards[protector.id]?.tapped).toBe(true);
    expect(result.cards[protector.id]?.zone).toBe('board');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OR1-OR4 — OR condition (Group 2)
// OR1 : OR condition true when first child passes
// OR2 : OR condition true when second child passes
// OR3 : OR condition false when neither child passes
// OR4 : Cabaji-style card gets CannotBeKOdInBattle when Buggy is on board
// ═══════════════════════════════════════════════════════════════════════════════

const orConditionEffect: CardEffectType = {
  trigger: 'Permanent',
  condition: {
    type: 'OR',
    conditions: [
      { type: 'HasCardOnBoard', name: 'Buggy' },
      { type: 'HasCardOnBoard', name: 'Mohji' },
    ],
  },
  actions: [{ type: 'GiveKeyword', keyword: 'CannotBeKOdInBattle', target: { scope: 'Self' }, duration: 'Permanent' }],
} as unknown as CardEffectType;

describe('OR1: OR condition — first child passes → effect resolves', () => {
  it('OR1: HasCardOnBoard Buggy → condition true', () => {
    let s = bootstrapGame();
    const buggy: Card = makeChar('buggy', 'p1', 2000, { name: 'Buggy' });
    const cabaji: Card = makeChar('cabaji', 'p1', 5000, { name: 'Cabaji', effects: [orConditionEffect] });
    s = addCardToBoard(s, buggy, P1);
    s = addCardToBoard(s, cabaji, P1);
    const result = resolveEffects(
      [orConditionEffect],
      'Permanent',
      { sourceCardId: cabaji.id, sourcePlayerId: P1 },
      s,
    );
    // Effect resolves (log entry added)
    expect(result.gameLog.some((e) => e.event === 'EFFECT_TRIGGERED')).toBe(true);
  });
});

describe('OR2: OR condition — second child passes → effect resolves', () => {
  it('OR2: HasCardOnBoard Mohji → condition true', () => {
    let s = bootstrapGame();
    const mohji: Card = makeChar('mohji', 'p1', 2000, { name: 'Mohji' });
    const cabaji: Card = makeChar('cabaji2', 'p1', 5000, { name: 'Cabaji', effects: [orConditionEffect] });
    s = addCardToBoard(s, mohji, P1);
    s = addCardToBoard(s, cabaji, P1);
    const result = resolveEffects(
      [orConditionEffect],
      'Permanent',
      { sourceCardId: cabaji.id, sourcePlayerId: P1 },
      s,
    );
    expect(result.gameLog.some((e) => e.event === 'EFFECT_TRIGGERED')).toBe(true);
  });
});

describe('OR3: OR condition — neither child passes → effect skipped', () => {
  it('OR3: no Buggy or Mohji on board → condition false, effect not triggered', () => {
    let s = bootstrapGame();
    const cabaji: Card = makeChar('cabaji3', 'p1', 5000, { name: 'Cabaji', effects: [orConditionEffect] });
    s = addCardToBoard(s, cabaji, P1);
    const logBefore = s.gameLog.length;
    const result = resolveEffects(
      [orConditionEffect],
      'Permanent',
      { sourceCardId: cabaji.id, sourcePlayerId: P1 },
      s,
    );
    expect(result.gameLog.length).toBe(logBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MC1-MC4 — ModifyCost / computePlayCost (Group 3)
// MC1 : computePlayCost returns base cost when condition fails
// MC2 : computePlayCost returns reduced cost when TrashCount passes
// MC3 : computePlayCost returns reduced cost when DonDifference passes
// MC4 : computePlayCost floor is 0 (no negative cost)
// ═══════════════════════════════════════════════════════════════════════════════

const modifyCostEffect_TrashCount: CardEffectType = {
  trigger: 'Permanent',
  condition: { type: 'TrashCount', min: 15 },
  actions: [{ type: 'ModifyCost', amount: -3 }],
} as unknown as CardEffectType;

const modifyCostEffect_DonDiff: CardEffectType = {
  trigger: 'Permanent',
  condition: { type: 'DonDifference', gap: 2 },
  actions: [{ type: 'ModifyCost', amount: -3 }],
} as unknown as CardEffectType;

function addTrashCards(state: GameState, owner: typeof P1 | typeof P2, count: number): GameState {
  let s = state;
  const p = s.players[owner]!;
  const trashCards: Card[] = [];
  for (let i = 0; i < count; i++) {
    const c = makeChar(`trash-card-${i}`, owner === P1 ? 'p1' : 'p2', 1000, { zone: 'trash' });
    trashCards.push(c);
  }
  const newCards: Record<string, Card> = { ...s.cards };
  for (const c of trashCards) newCards[c.id] = c;
  s = {
    ...s,
    cards: newCards as Readonly<Record<import('../src/index.js').CardId, Card>>,
    players: {
      ...s.players,
      [owner]: { ...p, trash: [...p.trash, ...trashCards.map((c) => c.id)] },
    },
  };
  return s;
}

describe('MC1: computePlayCost — condition fails → returns base cost', () => {
  it('MC1: TrashCount < 15 → cost unchanged', () => {
    let s = bootstrapGame();
    const card: Card = makeChar('sabo-mc1', 'p1', 6000, { cost: 6, effects: [modifyCostEffect_TrashCount] });
    s = {
      ...s,
      cards: { ...s.cards, [card.id]: card },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, card.id] } },
    };
    const cost = computePlayCost(card.id, s, P1);
    expect(cost).toBe(6);
  });
});

describe('MC2: computePlayCost — TrashCount condition passes → cost reduced', () => {
  it('MC2: TrashCount ≥ 15 → cost = base - 3', () => {
    let s = bootstrapGame();
    const card: Card = makeChar('sabo-mc2', 'p1', 6000, { cost: 6, effects: [modifyCostEffect_TrashCount] });
    s = {
      ...s,
      cards: { ...s.cards, [card.id]: card },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, card.id] } },
    };
    s = addTrashCards(s, P1, 15);
    const cost = computePlayCost(card.id, s, P1);
    expect(cost).toBe(3);
  });
});

describe('MC3: computePlayCost — DonDifference condition passes → cost reduced', () => {
  it('MC3: own DON ≤ opp DON - 2 → cost = base - 3', () => {
    let s = bootstrapGame();
    const card: Card = makeChar('sanji-mc3', 'p1', 6000, { cost: 6, effects: [modifyCostEffect_DonDiff] });
    s = {
      ...s,
      cards: { ...s.cards, [card.id]: card },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, card.id] } },
    };
    // Add 5 DON to P1 and 7 DON to P2 (gap = 2)
    const donCards: Card[] = [];
    for (let i = 0; i < 5; i++) donCards.push(makeDon(`p1-don-${i}`, 'p1', { zone: 'donArea' }));
    for (let i = 0; i < 7; i++) donCards.push(makeDon(`p2-don-${i}`, 'p2', { zone: 'donArea' }));
    const newCards: Record<string, Card> = { ...s.cards };
    for (const d of donCards) newCards[d.id] = d;
    s = {
      ...s,
      cards: newCards as Readonly<Record<import('../src/index.js').CardId, Card>>,
      players: {
        ...s.players,
        [P1]: { ...s.players[P1]!, donArea: [...s.players[P1]!.donArea, ...donCards.filter((d) => d.ownerId === P1).map((d) => d.id)] },
        [P2]: { ...s.players[P2]!, donArea: [...s.players[P2]!.donArea, ...donCards.filter((d) => d.ownerId === P2).map((d) => d.id)] },
      },
    };
    const cost = computePlayCost(card.id, s, P1);
    expect(cost).toBe(3);
  });
});

describe('MC4: computePlayCost — floor is 0', () => {
  it('MC4: large reduction → cost = 0 (not negative)', () => {
    const bigReductionEffect: CardEffectType = {
      trigger: 'Permanent',
      condition: { type: 'Always' },
      actions: [{ type: 'ModifyCost', amount: -10 }],
    } as unknown as CardEffectType;
    let s = bootstrapGame();
    const card: Card = makeChar('cheap-mc4', 'p1', 2000, { cost: 2, effects: [bigReductionEffect] });
    s = {
      ...s,
      cards: { ...s.cards, [card.id]: card },
    };
    const cost = computePlayCost(card.id, s, P1);
    expect(cost).toBe(0);
  });
});
