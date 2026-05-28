/**
 * ST22 Integration Tests
 *
 * Each scenario exercises a complete multi-action flow using the public
 * applyAction() interface — exactly as the UI would.
 *
 * Scénario A — OnPlay + Activate + Counter (ST22-002, ST22-007, ST22-016)
 * Scénario B — Blocker + KO Substitute (ST22-009, ST22-012)
 * Scénario C — ForceDiscard + RevealFromHand (ST22-006, ST22-011)
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

// ─── Player IDs (prefixed to avoid collision with st22.test.ts) ───────────────

const P1 = makePlayerId('s22-p1');
const P2 = makePlayerId('s22-p2');

// ─── Card factories ────────────────────────────────────────────────────────────

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 0,
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
    deckCards: Array.from({ length: 50 }, (_, i) =>
      makeChar(`${s}-dk-${i}`, id, 2000, { zone: 'deck' }),
    ),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${s}-dn-${i}`, id) as Card),
  };
}

// ─── Bootstrap helpers ─────────────────────────────────────────────────────────

function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, { type: 'StartGame', player1: makePlayerSetup(P1), player2: makePlayerSetup(P2), firstPlayerId: P1 });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  return { ...s, phase: 'Main', activePlayerId: P1, turnNumber: 3 };
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

/** Inject cards at the TOP of a player's deck (index 0 = top). */
function injectDeckTop(state: GameState, cards: Card[], owner: PlayerId): GameState {
  const updated: Record<string, Card> = { ...state.cards };
  const newIds: CardId[] = [];
  for (const c of cards) {
    updated[c.id] = { ...c, zone: 'deck', ownerId: owner };
    newIds.push(c.id);
  }
  const player = state.players[owner]!;
  return {
    ...state,
    cards: updated as GameState['cards'],
    players: { ...state.players, [owner]: { ...player, deck: [...newIds, ...player.deck] } },
  };
}

// ─── Shared effect DSL stubs ───────────────────────────────────────────────────

const wbSubType = 'Whitebeard Pirates';

/** ST22-002: OnPlay → SearchDeck (top 5, pick ≤1 WB Pirate, rest to bottom). */
const st22002Effect: CardEffect = {
  trigger: 'OnPlay',
  actions: [{
    type: 'SearchDeck',
    lookCount: 5,
    count: 1,
    filter: { kind: 'BySubType', subType: wbSubType, excludeNames: ['Izo'] },
    destination: 'hand',
    restTo: 'bottom',
  } as never],
};

/** ST22-006: OnPlay → RevealFromDeck (1 card); if WB: draw 2 + opponent discards 1. */
const st22006Effect: CardEffect = {
  trigger: 'OnPlay',
  actions: [{
    type: 'RevealFromDeck',
    count: 1,
    returnTo: 'top',
    thenActions: [
      { type: 'DrawCard', count: 2, condition: { type: 'RevealedCardHasType', cardType: wbSubType } },
      { type: 'ForceDiscard', count: 1, condition: { type: 'RevealedCardHasType', cardType: wbSubType } },
    ],
  } as never],
};

/** ST22-007: Activated → RevealFromDeck (1 card); if WB: attach 1 rested DON to chosen char/leader. */
const st22007Effect: CardEffect = {
  trigger: 'Activated',
  condition: { type: 'Always' },
  actions: [{
    type: 'RevealFromDeck',
    count: 1,
    returnTo: 'top',
    thenActions: [{
      type: 'AttachDon',
      count: 1,
      from: 'rested',
      target: { scope: 'ChooseOwnCharacterOrLeader' },
      condition: { type: 'RevealedCardHasType', cardType: wbSubType },
    }],
  } as never],
};

/** ST22-011: OnPlay → RevealFromHand (2 WB optional); if revealed → leader +2000 until end of turn. */
const st22011Effect: CardEffect = {
  trigger: 'OnPlay',
  condition: { type: 'Always' },
  actions: [{
    type: 'RevealFromHand',
    count: 2,
    filter: { subType: wbSubType },
    optional: true,
    thenActions: [{ type: 'PowerBoost', amount: 2000, target: { scope: 'OwnLeader' }, duration: 'EndOfTurn' }],
  } as never],
};

/** ST22-012 OnAttack: reveal 1; if WB, self +1000 until end of opponent's turn. */
const st22012OnAttackEffect: CardEffect = {
  trigger: 'OnAttack',
  actions: [{
    type: 'RevealFromDeck',
    count: 1,
    returnTo: 'top',
    thenActions: [{
      type: 'PowerBoost',
      amount: 1000,
      target: { scope: 'Self' },
      duration: 'EndOfOpponentTurn',
      condition: { type: 'RevealedCardHasType', cardType: wbSubType },
    }],
  } as never],
};

/** ST22-012 OnWouldBeKOByEffect: trash 1 from hand to survive. */
const st22012KOSubEffect: CardEffect = {
  trigger: 'OnWouldBeKOByEffect',
  actions: [{ type: 'TrashFromHand', count: 1, filter: {} } as never],
};

/** ST22-016 Counter: reveal 1; if WB, +4000 to chosen own char/leader until end of battle. */
const st22016CounterEffect: CardEffect = {
  trigger: 'Counter',
  actions: [{
    type: 'RevealFromDeck',
    count: 1,
    returnTo: 'top',
    thenActions: [{
      type: 'PowerBoost',
      amount: 4000,
      target: { scope: 'ChooseOwnCharacterOrLeader' },
      duration: 'EndOfBattle',
      condition: { type: 'RevealedCardHasType', cardType: wbSubType },
    }],
  } as never],
};

// ─── WB character fixture for deck injection ─────────────────────────────────

function makeWBChar(id: string, owner: PlayerId): Card {
  return makeChar(id, owner, 3000, { subTypes: wbSubType, zone: 'deck' });
}

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO A — OnPlay (ST22-002) + Activate (ST22-007) + Counter (ST22-016)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST22 integration — Scénario A : ST22-002 OnPlay + ST22-007 Activate + ST22-016 Counter', () => {

  // ── A1: ST22-002 OnPlay → SearchDeck top 5, pick 1 WB card ─────────────────

  it('A1 — ST22-002 OnPlay: reveals top 5, player selects 1 WB Pirate → goes to hand, rest to bottom', () => {
    let s = bootstrapGame();

    // Inject 5 known cards at top of deck; first 2 are WB Pirates
    const wb1 = makeWBChar('a1-wb1', P1);
    const wb2 = makeWBChar('a1-wb2', P1);
    const plain1 = makeChar('a1-plain1', P1, 2000, { zone: 'deck' });
    const plain2 = makeChar('a1-plain2', P1, 2000, { zone: 'deck' });
    const plain3 = makeChar('a1-plain3', P1, 2000, { zone: 'deck' });
    s = injectDeckTop(s, [wb1, wb2, plain1, plain2, plain3], P1);

    const src = makeChar('a1-src', P1, 3000, { zone: 'hand', effects: [st22002Effect] });
    s = addToHand(s, src, P1);

    // Play the card → SearchDeck fires (lookCount: 5)
    let s2 = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingSearchInteraction).not.toBeNull();

    const revealed = s2.pendingSearchInteraction!.revealedCardIds;
    expect(revealed.length).toBe(5);
    expect(revealed).toContain(wb1.id);

    // Player picks wb1 → goes to hand
    s2 = applyAction(s2, {
      type: 'ResolveSearchInteraction',
      playerId: P1,
      chosenCardId: wb1.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingSearchInteraction).toBeNull();
    expect(s2.players[P1]!.hand).toContain(wb1.id);

    // The 4 unchosen cards go to bottom of deck (restTo: 'bottom')
    const deck = s2.players[P1]!.deck;
    const bottom4 = deck.slice(-4);
    expect(bottom4).toContain(wb2.id);
    expect(bottom4).toContain(plain1.id);
    expect(bottom4).toContain(plain2.id);
    expect(bottom4).toContain(plain3.id);
  });

  it('A2 — ST22-002 OnPlay: player passes → all 5 revealed cards go to bottom', () => {
    let s = bootstrapGame();

    const plain = Array.from({ length: 5 }, (_, i) =>
      makeChar(`a2-p${i}`, P1, 2000, { zone: 'deck' }),
    );
    s = injectDeckTop(s, plain, P1);

    const src = makeChar('a2-src', P1, 3000, { zone: 'hand', effects: [st22002Effect] });
    s = addToHand(s, src, P1);

    let s2 = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingSearchInteraction).not.toBeNull();

    // Pass (no selection)
    s2 = applyAction(s2, {
      type: 'ResolveSearchInteraction',
      playerId: P1,
      chosenCardId: null,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingSearchInteraction).toBeNull();

    // All 5 go to bottom
    const deck = s2.players[P1]!.deck;
    const bottom5 = deck.slice(-5);
    for (const p of plain) expect(bottom5).toContain(p.id);
  });

  // ── A3: ST22-007 Activate → RevealFromDeck (WB card revealed → DON attached) ─

  it('A3 — ST22-007 Activate: WB card revealed → pendingRevealInteraction, then pendingTargetInteraction for DON', () => {
    let s = bootstrapGame();

    // 1 rested DON in P1's pool
    const restDon = makeDon('a3-don', P1, { tapped: false });
    s = {
      ...s,
      cards: { ...s.cards, [restDon.id]: restDon },
      players: { ...s.players, [P1]: { ...s.players[P1]!, donArea: [...s.players[P1]!.donArea, restDon.id] } },
    };

    const wb = makeWBChar('a3-wb', P1);
    s = injectDeckTop(s, [wb], P1);

    const src = makeChar('a3-src', P1, 3000, { effects: [st22007Effect] });
    s = addToBoard(s, src, P1);

    let s2 = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: src.id }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingRevealInteraction).not.toBeNull();

    const revealedIds = s2.pendingRevealInteraction!.revealedCardIds ?? [];
    expect(revealedIds).toContain(wb.id);

    // Acknowledge reveal (WB card seen → engine evaluates conditional AttachDon)
    s2 = applyAction(s2, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [wb.id],
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // Condition RevealedCardHasType met → pendingTargetInteraction for DON attachment
    expect(s2.pendingTargetInteraction).not.toBeNull();
    expect(s2.pendingTargetInteraction!.playerId).toBe(P1);
  });

  it('A4 — ST22-007 Activate: non-WB card revealed → no DON attachment, no pending', () => {
    let s = bootstrapGame();

    const nonWB = makeChar('a4-nwb', P1, 2000, { zone: 'deck' });
    s = injectDeckTop(s, [nonWB], P1);

    const src = makeChar('a4-src', P1, 3000, { effects: [st22007Effect] });
    s = addToBoard(s, src, P1);

    let s2 = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: src.id }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingRevealInteraction).not.toBeNull();

    s2 = applyAction(s2, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: s2.pendingRevealInteraction!.revealedCardIds as CardId[],
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // Non-WB revealed → no target interaction
    expect(s2.pendingTargetInteraction).toBeNull();
    expect(s2.pendingRevealInteraction).toBeNull();
  });

  // ── A5: ST22-016 Counter during opponent attack → RevealFromDeck + PowerBoost ─

  it('A5 — ST22-016 Counter: P2 attacks P1 character, P1 plays ST22-016 Counter → reveal WB → +4000 to target', () => {
    let s = bootstrapGame();

    // P1 has ST22-016 in hand
    const st22016 = makeChar('a5-16', P1, 2000, {
      zone: 'hand',
      effects: [st22016CounterEffect, { trigger: 'Trigger', actions: [{ type: 'DrawCard', count: 1 } as never] }],
    });

    // P1 character that gets attacked (tapped = can be attacked)
    const p1Defender = makeChar('a5-def', P1, 4000, { tapped: true });

    // P2 attacker
    const p2Atk = makeChar('a5-atk', P2, 5000);

    // WB card on top of P1's deck
    const wb = makeWBChar('a5-wb', P1);

    s = addToHand(s, st22016, P1);
    s = addToBoard(s, p1Defender, P1);
    s = addToBoard(s, p2Atk, P2);
    s = injectDeckTop(s, [wb], P1);

    // Switch to P2's turn
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    // P2 declares attack on p1Defender
    s = applyAction(s, {
      type: 'DeclareAttack', playerId: P2, attackerId: p2Atk.id, targetId: p1Defender.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // P1 plays ST22-016 as Counter → RevealFromDeck fires
    let s2 = applyAction(s, {
      type: 'PlayCounter', playerId: P1, cardId: st22016.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingRevealInteraction).not.toBeNull();

    const revealedIds = s2.pendingRevealInteraction!.revealedCardIds ?? [];
    expect(revealedIds).toContain(wb.id);

    // Acknowledge: WB revealed → pendingTargetInteraction for +4000 boost
    s2 = applyAction(s2, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [wb.id],
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingTargetInteraction).not.toBeNull();

    // P1 chooses p1Defender as target for +4000
    s2 = applyAction(s2, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: p1Defender.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingTargetInteraction).toBeNull();

    // p1Defender has +4000 buff
    const defPower = calculatePower(p1Defender.id, s2);
    expect(defPower).toBeGreaterThanOrEqual(8000);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO B — Blocker (ST22-009) + KO Substitute (ST22-012)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST22 integration — Scénario B : Blocker + KO Substitute (ST22-009, ST22-012)', () => {

  // ── B1: ST22-009 Blocker intercepting an attack ─────────────────────────────

  it('B1 — ST22-009 Blocker: P2 attacks P1 character, P1 blocker intercepts attack', () => {
    let s = bootstrapGame();

    // P1 blocker (simulating ST22-009's Blocker keyword)
    const blocker = makeChar('b1-blocker', P1, 4000, {
      name: 'ST22-009 Blocker',
      keywords: ['Blocker'],
    });
    const p1Target = makeChar('b1-target', P1, 3000, { tapped: true });
    const p2Atk = makeChar('b1-atk', P2, 6000);

    s = addToBoard(s, blocker, P1);
    s = addToBoard(s, p1Target, P1);
    s = addToBoard(s, p2Atk, P2);
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    // P2 attacks p1Target
    s = applyAction(s, {
      type: 'DeclareAttack', playerId: P2, attackerId: p2Atk.id, targetId: p1Target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // P1 declares blocker
    const s2 = applyAction(s, {
      type: 'DeclareBlock', playerId: P1, blockerId: blocker.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.activeCombat?.blockerId).toBe(blocker.id);
    // Original target stays the same but block is now set
    expect(s2.activeCombat?.attackerId).toBe(p2Atk.id);
  });

  // ── B2: ST22-012 OnAttack → RevealFromDeck ──────────────────────────────────

  it('B2 — ST22-012 OnAttack: attack declared → RevealFromDeck, WB revealed → +1000 self-buff', () => {
    let s = bootstrapGame();

    const wb = makeWBChar('b2-wb', P1);
    s = injectDeckTop(s, [wb], P1);

    const src = makeChar('b2-src', P1, 5000, {
      name: 'ST22-012',
      effects: [st22012OnAttackEffect, st22012KOSubEffect],
    });
    const p2Target = makeChar('b2-p2t', P2, 3000, { tapped: true });

    s = addToBoard(s, src, P1);
    s = addToBoard(s, p2Target, P2);

    // P1 declares attack
    let s2 = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: src.id, targetId: p2Target.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingRevealInteraction).not.toBeNull();

    const revealedIds = s2.pendingRevealInteraction!.revealedCardIds ?? [];
    expect(revealedIds).toContain(wb.id);

    // Acknowledge → WB revealed → +1000 self-buff (no target interaction needed — Self scope)
    s2 = applyAction(s2, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [wb.id],
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // ST22-012's power is now 6000 (5000 base + 1000 buff)
    const srcPower = calculatePower(src.id, s2);
    expect(srcPower).toBeGreaterThanOrEqual(6000);
  });

  // ── B3: ST22-012 OnWouldBeKOByEffect → KO Substitute mechanic ───────────────

  it('B3 — ST22-012 OnWouldBeKOByEffect: KO effect targeting ST22-012 → pendingKOSubstituteInteraction', () => {
    let s = bootstrapGame();

    // ST22-012 on P1's board
    const src = makeChar('b3-src', P1, 5000, {
      name: 'ST22-012',
      effects: [st22012OnAttackEffect, st22012KOSubEffect],
    });
    // A hand card for P1 to discard as the substitute cost
    const handCard = makeChar('b3-hand', P1, 2000, { zone: 'hand' });

    // P2 has a KO event effect
    const koEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter' } } as never],
    };
    const koEvent = makeChar('b3-koevent', P2, 0, {
      name: 'KO Event',
      type: 'Event',
      zone: 'hand',
      effects: [koEffect],
    });

    s = addToBoard(s, src, P1);
    s = addToHand(s, handCard, P1);
    s = addToHand(s, koEvent, P2);
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    // P2 plays KO Event, targeting ST22-012
    let s2 = applyAction(s, {
      type: 'PlayEvent', playerId: P2, cardId: koEvent.id, chosenTargetId: src.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // ST22-012's OnWouldBeKOByEffect fires → pendingKOSubstituteInteraction
    expect(s2.pendingKOSubstituteInteraction).not.toBeNull();
    expect(s2.pendingKOSubstituteInteraction!.playerId).toBe(P1);
    expect(s2.pendingKOSubstituteInteraction!.cardId).toBe(src.id);

    // P1 discards handCard to save ST22-012
    s2 = applyAction(s2, {
      type: 'ResolveKOSubstitute', playerId: P1, discardedCardId: handCard.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingKOSubstituteInteraction).toBeNull();

    // ST22-012 survives on board
    expect(s2.players[P1]!.board).toContain(src.id);
    expect(s2.players[P1]!.trash).not.toContain(src.id);
    // handCard is in trash
    expect(s2.players[P1]!.trash).toContain(handCard.id);
  });

  it('B4 — ST22-012 KO Substitute: player refuses (discardedCardId null) → ST22-012 is KO\'d', () => {
    let s = bootstrapGame();

    const src = makeChar('b4-src', P1, 5000, {
      name: 'ST22-012',
      effects: [st22012OnAttackEffect, st22012KOSubEffect],
    });
    const handCard = makeChar('b4-hand', P1, 2000, { zone: 'hand' });

    const koEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter' } } as never],
    };
    const koEvent = makeChar('b4-koevent', P2, 0, {
      name: 'KO Event', type: 'Event', zone: 'hand', effects: [koEffect],
    });

    s = addToBoard(s, src, P1);
    s = addToHand(s, handCard, P1);
    s = addToHand(s, koEvent, P2);
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    let s2 = applyAction(s, {
      type: 'PlayEvent', playerId: P2, cardId: koEvent.id, chosenTargetId: src.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingKOSubstituteInteraction).not.toBeNull();

    // P1 refuses → null discardedCardId → ST22-012 is KO'd
    s2 = applyAction(s2, {
      type: 'ResolveKOSubstitute', playerId: P1, discardedCardId: null,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.players[P1]!.board).not.toContain(src.id);
    expect(s2.players[P1]!.trash).toContain(src.id);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCÉNARIO C — ForceDiscard (ST22-006) + RevealFromHand (ST22-011)
// ════════════════════════════════════════════════════════════════════════════════

describe('ST22 integration — Scénario C : ForceDiscard + RevealFromHand (ST22-006, ST22-011)', () => {

  // ── C1: ST22-006 OnPlay → RevealFromDeck (WB) → opponent ForceDiscard ────────

  it('C1 — ST22-006 OnPlay: WB card revealed → P1 draws 2, P2 must discard 1 (ForceDiscard)', () => {
    let s = bootstrapGame();

    // WB card on top of P1's deck
    const wb = makeWBChar('c1-wb', P1);
    s = injectDeckTop(s, [wb], P1);

    // Give P2 some hand cards so they can discard
    const p2h1 = makeChar('c1-p2h1', P2, 2000, { zone: 'hand' });
    const p2h2 = makeChar('c1-p2h2', P2, 2000, { zone: 'hand' });
    s = addToHand(s, p2h1, P2);
    s = addToHand(s, p2h2, P2);

    const src = makeChar('c1-src', P1, 3000, { zone: 'hand', effects: [st22006Effect] });
    s = addToHand(s, src, P1);
    const p1HandBefore = s.players[P1]!.hand.length; // includes src

    // P1 plays ST22-006 → RevealFromDeck fires
    let s2 = applyAction(s, {
      type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingRevealInteraction).not.toBeNull();

    const revealedIds = s2.pendingRevealInteraction!.revealedCardIds ?? [];
    expect(revealedIds).toContain(wb.id);

    // Acknowledge: WB revealed → DrawCard x2 + ForceDiscard
    s2 = applyAction(s2, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [wb.id],
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // P1 drew 2 cards (hand grew by 2, since src card was played → net +1)
    expect(s2.players[P1]!.hand.length).toBe(p1HandBefore + 1); // -1 (play src) +2 (draw)

    // ForceDiscard for P2
    expect(s2.pendingForceDiscardInteraction).not.toBeNull();
    expect(s2.pendingForceDiscardInteraction!.playerId).toBe(P2);
    expect(s2.pendingForceDiscardInteraction!.count).toBe(1);

    const p2HandBefore = s2.players[P2]!.hand.length;

    // P2 resolves ForceDiscard → discards p2h1
    s2 = applyAction(s2, {
      type: 'ResolveForceDiscardInteraction',
      playerId: P2,
      discardedCardIds: [p2h1.id],
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingForceDiscardInteraction).toBeNull();
    expect(s2.players[P2]!.hand.length).toBe(p2HandBefore - 1);
    expect(s2.players[P2]!.trash).toContain(p2h1.id);
  });

  it('C2 — ST22-006 OnPlay: non-WB card revealed → no draw, no ForceDiscard', () => {
    let s = bootstrapGame();

    const nonWB = makeChar('c2-nwb', P1, 2000, { zone: 'deck' });
    s = injectDeckTop(s, [nonWB], P1);

    const src = makeChar('c2-src', P1, 3000, { zone: 'hand', effects: [st22006Effect] });
    s = addToHand(s, src, P1);

    const p1HandBefore = s.players[P1]!.hand.length - 1; // -1 for src being played

    let s2 = applyAction(s, {
      type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingRevealInteraction).not.toBeNull();

    s2 = applyAction(s2, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: s2.pendingRevealInteraction!.revealedCardIds as CardId[],
    }) as GameState;
    expect(isGameError(s2)).toBe(false);

    // No draw (non-WB), no ForceDiscard
    expect(s2.players[P1]!.hand.length).toBe(p1HandBefore);
    expect(s2.pendingForceDiscardInteraction).toBeNull();
  });

  // ── C3: ST22-011 OnPlay → RevealFromHand (2 WB) → leader +2000 ───────────────

  it('C3 — ST22-011 OnPlay: P1 reveals 2 WB Pirates from hand → leader +2000 this turn', () => {
    let s = bootstrapGame();

    // 2 WB Pirates in P1's hand
    const wb1 = makeChar('c3-wb1', P1, 3000, { zone: 'hand', subTypes: wbSubType });
    const wb2 = makeChar('c3-wb2', P1, 3000, { zone: 'hand', subTypes: wbSubType });
    s = addToHand(s, wb1, P1);
    s = addToHand(s, wb2, P1);

    const leaderId = s.players[P1]!.leader!;
    const leaderBasePower = s.cards[leaderId]!.power;

    const src = makeChar('c3-src', P1, 3000, { zone: 'hand', effects: [st22011Effect] });
    s = addToHand(s, src, P1);

    // P1 plays ST22-011 → RevealFromHand interaction
    let s2 = applyAction(s, {
      type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingRevealInteraction).not.toBeNull();

    // P1 reveals wb1 + wb2 → triggers PowerBoost +2000 on leader
    s2 = applyAction(s2, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [wb1.id, wb2.id],
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingRevealInteraction).toBeNull();

    // Leader has +2000 buff
    const leaderPower = calculatePower(leaderId, s2);
    expect(leaderPower).toBe(leaderBasePower + 2000);
  });

  it('C4 — ST22-011 OnPlay: player passes reveal (optional) → no PowerBoost on leader', () => {
    let s = bootstrapGame();

    const wb1 = makeChar('c4-wb1', P1, 3000, { zone: 'hand', subTypes: wbSubType });
    const wb2 = makeChar('c4-wb2', P1, 3000, { zone: 'hand', subTypes: wbSubType });
    s = addToHand(s, wb1, P1);
    s = addToHand(s, wb2, P1);

    const leaderId = s.players[P1]!.leader!;
    const leaderBasePower = s.cards[leaderId]!.power;

    const src = makeChar('c4-src', P1, 3000, { zone: 'hand', effects: [st22011Effect] });
    s = addToHand(s, src, P1);

    let s2 = applyAction(s, {
      type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id,
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingRevealInteraction).not.toBeNull();

    // Player passes (optional = true, reveals nothing)
    s2 = applyAction(s2, {
      type: 'ResolveRevealInteraction',
      playerId: P1,
      revealedCardIds: [],
    }) as GameState;
    expect(isGameError(s2)).toBe(false);
    expect(s2.pendingRevealInteraction).toBeNull();

    // No boost
    const leaderPower = calculatePower(leaderId, s2);
    expect(leaderPower).toBe(leaderBasePower);
  });
});
