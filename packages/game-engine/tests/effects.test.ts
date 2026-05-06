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

/** Full game bootstrapped to Main phase (mulligans done, life cards placed). */
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

/** Place a card in P1's hand and return the updated state. */
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

/** Place a card on P1's board and return the updated state. */
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

/** Place a card on P2's board and return the updated state. */
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

/** Place a card in P1's trash and return the updated state. */
function addToP1Trash(state: GameState, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'trash' } },
    players: {
      ...state.players,
      [P1]: { ...state.players[P1]!, trash: [...state.players[P1]!.trash, card.id] },
    },
  };
}

/** Add untapped (active) DON!! cards to P1's donArea. */
function addFreeDon(state: GameState, dons: Card[]): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const d of dons) updatedCards[d.id] = { ...d, zone: 'donArea', tapped: false, attachedTo: null };
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: {
      ...state.players,
      [P1]: { ...state.players[P1]!, donArea: [...state.players[P1]!.donArea, ...dons.map((d) => d.id)] },
    },
  };
}

/** Add DON!! cards (with their tapped/attachedTo as-is) to P1's donArea. */
function addDonCards(state: GameState, dons: Card[]): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const d of dons) updatedCards[d.id] = { ...d, zone: 'donArea' };
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: {
      ...state.players,
      [P1]: { ...state.players[P1]!, donArea: [...state.players[P1]!.donArea, ...dons.map((d) => d.id)] },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// ── 1. OnPlay — Draw 1 ────────────────────────────────────────────────────────

describe('OnPlay: Draw 1', () => {
  it('jouer une carte avec effet OnPlay Draw 1 fait piocher 1 carte', () => {
    const base = bootstrapGame();
    const drawEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const playCard = makeChar('draw-card', 'p1', 2000, {
      zone: 'hand',
      cost: 0,
      effects: [drawEffect],
    });
    const state = addToHand(base, playCard);

    const p1Before = state.players[P1]!;
    const deckBefore = p1Before.deck.length;
    const handBefore = p1Before.hand.length; // includes playCard

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const p1After = result.players[P1]!;
    // Card left hand (−1), Draw triggered (+1) → net 0 change in hand size
    expect(p1After.hand.length).toBe(handBefore); // net 0: -1 play +1 draw
    expect(p1After.deck.length).toBe(deckBefore - 1);
    expect(p1After.board.includes(playCard.id)).toBe(true);
  });
});

// ── 2. DoubleAttack — 2 dégâts au leader ─────────────────────────────────────

describe('DoubleAttack: 2 dégâts au leader', () => {
  it('attaque non bloquée sur le leader → 2 cartes Life révélées', () => {
    const base = bootstrapGame();
    const attackerId = makeCardId('double-attacker');
    const attacker = makeChar('double-attacker', 'p1', 9999, {
      keywords: ['DoubleAttack'],
    });

    const state: GameState = {
      ...base,
      cards: { ...base.cards, [attackerId]: attacker },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attackerId] },
      },
    };

    const p2LifeBefore = state.players[P2]!.life.length;

    let result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId,
      targetId: state.players[P2]!.leader!,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Should have taken 2 life damage (5 → 3)
    expect(result.players[P2]!.life.length).toBe(p2LifeBefore - 2);
  });
});

// ── 3. OnPlay — TrashCard (opponent discards 1) ───────────────────────────────

describe('OnPlay: TrashFromHand — joueur défausse depuis sa main', () => {
  it('crée une pendingTrashInteraction quand la carte est jouée', () => {
    const base = bootstrapGame();
    const trashEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'TrashFromHand', filter: {}, count: 1, thenActions: [] }],
    };
    const playCard = makeChar('sniper', 'p1', 2000, {
      zone: 'hand',
      cost: 0,
      effects: [trashEffect],
    });
    const state = addToHand(base, playCard);

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // TrashFromHand pauses and sets pendingTrashInteraction
    expect(result.pendingTrashInteraction).not.toBeNull();
    expect(result.pendingTrashInteraction?.playerId).toBe(P1);
  });
});

// ── 4. Unblockable — bloquer rejeté ──────────────────────────────────────────

describe('Unblockable: DeclareBlock rejeté', () => {
  it("tenter de bloquer un attaquant Unblockable → erreur UNBLOCKABLE", () => {
    const base = bootstrapGame();
    const attackerId = makeCardId('shadow');
    const blockerId  = makeCardId('blocker');
    const attacker = makeChar('shadow', 'p1', 3000, { keywords: ['Unblockable'] });
    const blocker  = makeChar('blocker', 'p2', 2000, { keywords: ['Blocker'] });

    const state: GameState = {
      ...base,
      cards: { ...base.cards, [attackerId]: attacker, [blockerId]: blocker },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attackerId] },
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, blockerId] },
      },
    };

    const afterAttack = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId,
      targetId: state.players[P2]!.leader!,
    });
    expect(isGameError(afterAttack)).toBe(false);
    if (isGameError(afterAttack)) return;

    const blockResult = applyAction(afterAttack, {
      type: 'DeclareBlock',
      playerId: P2,
      blockerId,
    });
    expect(isGameError(blockResult)).toBe(true);
    if (!isGameError(blockResult)) return;
    expect(blockResult.code).toBe('UNBLOCKABLE');
  });
});

// ── 5. OnAttack — PowerBoost self +2000 EndOfBattle ──────────────────────────

describe('OnAttack: PowerBoost self +2000 jusqu\'à fin de combat', () => {
  it('calculatePower inclut +2000 pendant le combat', () => {
    const base = bootstrapGame();
    const attackerId = makeCardId('berserker');
    const boostEffect: CardEffect = {
      trigger: 'OnAttack',
      actions: [{ type: 'PowerBoost', amount: 2000, target: { scope: 'Self' }, duration: 'EndOfBattle' }],
    };
    const attacker = makeChar('berserker', 'p1', 4000, { effects: [boostEffect] });

    const state: GameState = {
      ...base,
      cards: { ...base.cards, [attackerId]: attacker },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attackerId] },
      },
    };

    const afterAttack = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId,
      targetId: state.players[P2]!.leader!,
    });
    expect(isGameError(afterAttack)).toBe(false);
    if (isGameError(afterAttack)) return;

    // Power should include the boost
    expect(calculatePower(attackerId, afterAttack)).toBe(6000);

    // After combat resolves, EndOfBattle boost is cleared
    const afterCombat = applyAction(afterAttack, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(afterCombat)).toBe(false);
    if (isGameError(afterCombat)) return;
    expect(calculatePower(attackerId, afterCombat)).toBe(4000);
  });
});

// ── 6. Trigger — révélé depuis Life → Draw 1 ─────────────────────────────────

describe('Trigger: révélé depuis Life zone → Draw 1', () => {
  it('quand la carte Trigger est révélée, le défenseur pioche 1 carte', () => {
    const base = bootstrapGame();
    const triggerCardId = makeCardId('trigger-card');
    const triggerEffect: CardEffect = {
      trigger: 'Trigger',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const triggerCard = makeChar('trigger-card', 'p2', 2000, {
      zone: 'life',
      effects: [triggerEffect],
    });

    // Replace P2's top life card with our Trigger card
    const p2 = base.players[P2]!;
    const oldTopLife = p2.life[0]!;
    const newLife = [triggerCardId, ...p2.life.slice(1)];

    const state: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [triggerCardId]: triggerCard,
        [oldTopLife]: { ...base.cards[oldTopLife]!, zone: 'deck' }, // remove old top life
      },
      players: {
        ...base.players,
        [P2]: { ...p2, life: newLife },
      },
    };

    const p2HandBefore = state.players[P2]!.hand.length;
    const p2DeckBefore = state.players[P2]!.deck.length;

    // P1 attacks P2's leader with enough power to deal damage
    const attackerId = makeCardId('p1-leader'); // use P1's leader
    let result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: state.players[P1]!.leader!,
      targetId: state.players[P2]!.leader!,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // trigger-card was revealed from life → should be in P2's hand
    expect(result.cards[triggerCardId]?.zone).toBe('hand');
    expect(result.players[P2]!.hand.length).toBe(p2HandBefore + 2); // +1 revealed + 1 drawn
    expect(result.players[P2]!.deck.length).toBe(p2DeckBefore - 1);
  });
});

// ── 7. OnKO — Draw 1 quand KO'd ──────────────────────────────────────────────

describe('OnKO: Draw 1 quand la carte est KO', () => {
  it("le propriétaire pioche 1 carte quand sa carte est KO", () => {
    const base = bootstrapGame();
    const victimId = makeCardId('martyr');
    const koEffect: CardEffect = {
      trigger: 'OnKO',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    // Put victim on P2's board (P1 will KO it)
    const victim = makeChar('martyr', 'p2', 1000, { zone: 'board', tapped: true, effects: [koEffect] });

    const state: GameState = {
      ...base,
      cards: { ...base.cards, [victimId]: victim },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, victimId] },
      },
    };

    const p2HandBefore = state.players[P2]!.hand.length;

    // P1 attacks victim with overwhelming power (use leader: 5000 vs 1000)
    let result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: state.players[P1]!.leader!,
      targetId: victimId,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // victim KO'd → P2 draws 1
    expect(result.cards[victimId]?.zone).toBe('trash');
    expect(result.players[P2]!.hand.length).toBe(p2HandBefore + 1);
  });
});

// ── 8. Blocker keyword — bloquer valide ───────────────────────────────────────

describe('Blocker: DeclareBlock accepté', () => {
  it('une carte avec Blocker peut intercepter une attaque', () => {
    const base = bootstrapGame();
    const blockerId  = makeCardId('shield');
    const blockerCard = makeChar('shield', 'p2', 3000, { keywords: ['Blocker'] });

    const state: GameState = {
      ...base,
      cards: { ...base.cards, [blockerId]: blockerCard },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, blockerId] },
      },
    };

    let result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: state.players[P1]!.leader!,
      targetId: state.players[P2]!.leader!,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, {
      type: 'DeclareBlock',
      playerId: P2,
      blockerId,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.activeCombat?.blockerId).toBe(blockerId);
  });
});

// ── 9. OnPlay — ReturnToHand adversaire ──────────────────────────────────────

describe('OnPlay: ReturnToHand (personnage adverse)', () => {
  it("jouer la carte renvoie le premier personnage adverse dans la main", () => {
    const base = bootstrapGame();
    const targetId = makeCardId('opponent-char');
    const opponentChar = makeChar('opponent-char', 'p2', 2000);
    const returnEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'ReturnToHand', target: { scope: 'ChooseOpponentCharacter' } }],
    };
    const playCard = makeChar('tactician', 'p1', 3000, {
      zone: 'hand',
      cost: 0,
      effects: [returnEffect],
    });

    let state = addToHand(base, playCard);
    state = addToP2Board(state, opponentChar);

    const p2BoardBefore = state.players[P2]!.board.length;
    const p2HandBefore  = state.players[P2]!.hand.length;

    // OnPlay with ChooseOpponentCharacter goes through engine-side pendingTargetInteraction
    const afterPlay = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;
    expect(afterPlay.pendingTargetInteraction).not.toBeNull();

    const result = applyAction(afterPlay, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: targetId,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(result.players[P2]!.board.length).toBe(p2BoardBefore - 1);
    expect(result.players[P2]!.hand.length).toBe(p2HandBefore + 1);
    expect(result.cards[targetId]?.zone).toBe('hand');
  });
});

// ── 10. OnPlay — AddLife +1 ───────────────────────────────────────────────────

describe('OnPlay: AddLife +1', () => {
  it("jouer la carte ajoute 1 carte en zone Life", () => {
    const base = bootstrapGame();
    const addLifeEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'AddLife', count: 1 }],
    };
    const playCard = makeChar('healer', 'p1', 1000, {
      zone: 'hand',
      cost: 0,
      effects: [addLifeEffect],
    });
    const state = addToHand(base, playCard);

    const p1LifeBefore = state.players[P1]!.life.length;
    const p1DeckBefore = state.players[P1]!.deck.length;

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(result.players[P1]!.life.length).toBe(p1LifeBefore + 1);
    expect(result.players[P1]!.deck.length).toBe(p1DeckBefore - 1);
  });
});

// ── 11. PlayEvent — effet résolu + carte en trash ─────────────────────────────

describe('PlayEvent', () => {
  it('jouer un Event résout ses effets et envoie la carte en trash', () => {
    const base = bootstrapGame();
    const drawEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const eventCard: Card = {
      id: makeCardId('event-draw'),
      name: 'Test Event',
      cost: 0,
      power: 0,
      color: 'Red',
      type: 'Event',
      zone: 'hand',
      ownerId: P1,
      tapped: false,
      attachedTo: null,
      effects: [drawEffect],
    };
    const state = addToHand(base, eventCard);
    const deckBefore  = state.players[P1]!.deck.length;
    const handBefore  = state.players[P1]!.hand.length; // includes eventCard
    const trashBefore = state.players[P1]!.trash.length;

    const result = applyAction(state, {
      type: 'PlayEvent',
      playerId: P1,
      cardId: eventCard.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Card removed from hand, sent to trash
    expect(result.players[P1]!.trash.length).toBe(trashBefore + 1);
    expect(result.players[P1]!.trash).toContain(eventCard.id);
    expect(result.cards[eventCard.id]?.zone).toBe('trash');
    // Effect resolved: drew 1 → hand: -1 (played) +1 (draw) = same size
    expect(result.players[P1]!.hand.length).toBe(handBefore);
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

  it('PlayEvent rejette si la carte est un Character (pas un Event)', () => {
    const base = bootstrapGame();
    const charCard = makeChar('not-an-event', 'p1', 2000, { zone: 'hand', cost: 0 });
    const state = addToHand(base, charCard);

    const result = applyAction(state, {
      type: 'PlayEvent',
      playerId: P1,
      cardId: charCard.id,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) {
      expect(result.code).toBe('INVALID_CARD_TYPE');
    }
  });
});

// ── 12. Condition HasRestingDon ───────────────────────────────────────────────

describe('Condition HasRestingDon', () => {
  it("l'effet ne se déclenche pas sans DON reposés suffisants", () => {
    const base = bootstrapGame();
    const condEffect: CardEffect = {
      trigger: 'OnPlay',
      condition: { type: 'HasRestingDon', count: 2 },
      actions: [{ type: 'DrawCard', count: 2 }],
    };
    const playCard = makeChar('cond-card', 'p1', 2000, {
      zone: 'hand',
      cost: 0,
      effects: [condEffect],
    });
    const state = addToHand(base, playCard);
    // No resting DON → condition fails
    const deckBefore = state.players[P1]!.deck.length;

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // No draw should have occurred
    expect(result.players[P1]!.deck.length).toBe(deckBefore);
  });

  it("l'effet se déclenche quand 2 DON reposés sont présents", () => {
    const base = bootstrapGame();
    const condEffect: CardEffect = {
      trigger: 'OnPlay',
      condition: { type: 'HasRestingDon', count: 2 },
      actions: [{ type: 'DrawCard', count: 2 }],
    };
    const playCard = makeChar('cond-card-2', 'p1', 2000, {
      zone: 'hand',
      cost: 0,
      effects: [condEffect],
    });

    // Inject 2 tapped (resting) DON into P1's donArea
    const don1 = makeDon('p1-resting-don-1', 'p1');
    const don2 = makeDon('p1-resting-don-2', 'p1');
    const tappedDon1 = { ...don1, tapped: true };
    const tappedDon2 = { ...don2, tapped: true };

    const p1 = base.players[P1]!;
    let state: GameState = {
      ...base,
      cards: { ...base.cards, [tappedDon1.id]: tappedDon1, [tappedDon2.id]: tappedDon2 },
      players: {
        ...base.players,
        [P1]: { ...p1, donArea: [...p1.donArea, tappedDon1.id, tappedDon2.id] },
      },
    };
    state = addToHand(state, playCard);
    const deckBefore = state.players[P1]!.deck.length;

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Condition met → drew 2
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 2);
  });
});

// ── 13. GiveDon négatif (OnKO retire des DON adverses) ───────────────────────

describe('GiveDon négatif : OnKO retire 2 DON adverses', () => {
  it("quand la carte est KO, l'adversaire perd 2 DON actifs", () => {
    const base = bootstrapGame();

    // Card on P2's board with OnKO: GiveDon -2 (removes 2 DON from opponent = P1)
    const onKoEffect: CardEffect = {
      trigger: 'OnKO',
      actions: [{ type: 'GiveDon', count: -2, target: { scope: 'OpponentLeader' } }],
    };
    const p2Card = makeChar('p2-magellan', 'p2', 1000, { effects: [onKoEffect] });
    const victimId = p2Card.id;

    // Give P1 two active (untapped) DON cards in donArea
    const don1 = makeDon('p1-free-don-1', 'p1');
    const don2 = makeDon('p1-free-don-2', 'p1');

    const state: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [victimId]: { ...p2Card, zone: 'board', tapped: true },
        [don1.id]: don1,
        [don2.id]: don2,
      },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, victimId] },
        [P1]: { ...base.players[P1]!, donArea: [...base.players[P1]!.donArea, don1.id, don2.id] },
      },
    };

    const p1DonBefore = state.players[P1]!.donArea.length; // 2

    // P1's leader (5000 power) attacks p2Card (1000 power) → p2Card is KO'd
    let result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: state.players[P1]!.leader!,
      targetId: victimId,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // p2Card KO'd → OnKO fires → removes 2 DON from P1's donArea
    expect(result.cards[victimId]?.zone).toBe('trash');
    expect(result.players[P1]!.donArea.length).toBe(p1DonBefore - 2);
    // Removed DON go back to P1's donDeck
    expect(result.players[P1]!.donDeck).toContain(don1.id);
    expect(result.players[P1]!.donDeck).toContain(don2.id);
  });
});

// ── 14. PowerBoost EndOfTurn → remis à 0 après EndPhase ──────────────────────

describe('PowerBoost EndOfTurn : boost effacé après EndPhase', () => {
  it('le boost +2000 est annulé après EndPhase', () => {
    const base = bootstrapGame();

    const boostEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'PowerBoost', amount: 2000, target: { scope: 'Self' }, duration: 'EndOfTurn' }],
    };
    const playCard = makeChar('boost-card', 'p1', 3000, {
      zone: 'hand',
      cost: 0,
      effects: [boostEffect],
    });

    const state = {
      ...base,
      cards: { ...base.cards, [playCard.id]: playCard },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, hand: [...base.players[P1]!.hand, playCard.id] },
      },
    };

    // Play the card → OnPlay fires → PowerBoost +2000 EndOfTurn
    const afterPlay = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });

    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;

    expect(calculatePower(playCard.id, afterPlay)).toBe(5000); // 3000 + 2000

    // EndPhase clears EndOfTurn boosts only when transitioning End → Refresh
    // (clearPowerModifiers is called inside applyReturnDon which runs on End phase)
    // Step 1: Main → End
    let afterEnd = applyAction(afterPlay, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(afterEnd)).toBe(false);
    if (isGameError(afterEnd)) return;

    // Boost still active during End phase
    expect(calculatePower(playCard.id, afterEnd)).toBe(5000);

    // Step 2: End → Refresh (this triggers applyReturnDon → clearPowerModifiers)
    afterEnd = applyAction(afterEnd, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(afterEnd)).toBe(false);
    if (isGameError(afterEnd)) return;

    expect(calculatePower(playCard.id, afterEnd)).toBe(3000); // boost gone
  });
});

// ── 15. HasAttachedDon Activated — ST21 mécanique (Zoro pattern) ──────────────

describe('HasAttachedDon Activated : Rush accordé quand 2 DON!! attachés (pattern ST21-015)', () => {
  it('HasAttachedDon:2 Activated → temporaryKeywords contient Rush', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'HasAttachedDon', count: 2 },
      actions: [{ type: 'GiveKeyword', keyword: 'Rush', target: { scope: 'Self' }, duration: 'EndOfTurn' }],
    };
    const card = makeChar('zoro-pattern', 'p1', 5000, { effects: [eff] });
    let s = addToP1Board(base, card);
    // Attach 2 DON!! to the card (simulates leader giving REST DON!! to a character)
    const don1 = makeDon('attached-1', 'p1');
    const don2 = makeDon('attached-2', 'p1');
    s = addDonCards(s, [
      { ...don1, tapped: true, attachedTo: card.id },
      { ...don2, tapped: true, attachedTo: card.id },
    ]);

    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[card.id]?.temporaryKeywords).toContain('Rush');
  });

  it('HasAttachedDon:2 Activated — échoue avec seulement 1 DON!! attaché', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'HasAttachedDon', count: 2 },
      actions: [{ type: 'GiveKeyword', keyword: 'Rush', target: { scope: 'Self' }, duration: 'EndOfTurn' }],
    };
    const card = makeChar('zoro-1don', 'p1', 5000, { effects: [eff] });
    let s = addToP1Board(base, card);
    const don = makeDon('attached-1', 'p1');
    s = addDonCards(s, [{ ...don, tapped: true, attachedTo: card.id }]);

    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(true);
    if (!isGameError(result)) return;
    expect(result.code).toBe('CONDITION_NOT_MET');
  });
});

// ── 16. Activated HasRestingDon — coût payé (DON!! actifs reposés) ────────────

describe('Activated HasRestingDon : coût DON!! payé après activation', () => {
  it('Activated HasRestingDon:1 — le DON!! actif est reposé après activation', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'HasRestingDon', count: 1 },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const card = makeChar('don-cost-card', 'p1', 3000, { effects: [eff] });
    let s = addToP1Board(base, card);
    const don = makeDon('free-don-1', 'p1');
    s = addFreeDon(s, [don]);
    const handBefore = s.players[P1]!.hand.length;

    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // DON!! actif doit être reposé (coût payé)
    expect(result.cards[don.id]?.tapped).toBe(true);
    // Et la pioche a eu lieu
    expect(result.players[P1]!.hand.length).toBe(handBefore + 1);
  });

  it('Activated HasRestingDon:2 — échoue si seulement 1 DON!! actif', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'HasRestingDon', count: 2 },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const card = makeChar('don-cost-fail', 'p1', 3000, { effects: [eff] });
    let s = addToP1Board(base, card);
    s = addFreeDon(s, [makeDon('only-one', 'p1')]);

    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(true);
    if (!isGameError(result)) return;
    expect(result.code).toBe('CONDITION_NOT_MET');
  });
});

// ── 17. SearchDeck — carte trouvée arrive en main ─────────────────────────────

describe('SearchDeck ByType Character → carte arrive en main', () => {
  it('OnPlay SearchDeck ByType Character → main +1, deck -1', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'SearchDeck', filter: { kind: 'ByType', cardType: 'Character' }, destination: 'hand' }],
    };
    const card = makeChar('search-card', 'p1', 2000, { zone: 'hand', cost: 0, effects: [eff] });
    const s = addToHand(base, card);
    const handBefore = s.players[P1]!.hand.length;
    const deckBefore = s.players[P1]!.deck.length;

    const result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Card was played (leaves hand) → hand -1 from play + 1 from search = handBefore - 1 + 1
    expect(result.players[P1]!.hand.length).toBe(handBefore - 1 + 1);
    // Deck decreased by 1 (card searched)
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1);
  });
});

// ── 18. Régression — OnKO+ReturnToHand scope=Self (ST27-005 Marshall D. Teach) ──
//    Bug: returnToHand refusait les cartes hors zone 'board' → carte restait en trash.

describe('OnKO: ReturnToHand scope=Self — régression ST27-005 Teach', () => {
  it('la carte est en main après être KO en combat, pas en trash', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnKO',
      actions: [{ type: 'ReturnToHand', target: { scope: 'Self' } }],
    };
    // Carte faible sur le board de P2 (sera KO par le leader P1 en 5000)
    const victim = makeChar('teach-onko', 'p2', 1000, { effects: [eff], tapped: true });
    const state = addToP2Board(base, victim);

    const p2HandBefore  = state.players[P2]!.hand.length;
    const p2TrashBefore = state.players[P2]!.trash.length;

    let result = applyAction(state, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: state.players[P1]!.leader!,
      targetId: victim.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // OnKO devrait ramener la carte en main — pas en trash
    expect(result.cards[victim.id]?.zone).toBe('hand');
    expect(result.players[P2]!.hand.length).toBe(p2HandBefore + 1);
    expect(result.players[P2]!.trash.length).toBe(p2TrashBefore);
    expect(result.players[P2]!.board).not.toContain(victim.id);
  });
});

// ── 19. Régression — GainKeyword duration=Permanent vs EndOfTurn (OP02-008) ────
//    Bug: clearTemporaryKeywords effaçait tous les keywords y compris Permanent.

describe('GainKeyword: durée Permanent vs EndOfTurn', () => {
  it('EndOfTurn — keyword Rush effacé après fin de tour', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'GiveKeyword', keyword: 'Rush', target: { scope: 'Self' }, duration: 'EndOfTurn' }],
    };
    const card = makeChar('temp-rusher', 'p1', 2000, { zone: 'hand', cost: 0, effects: [eff] });
    const state = addToHand(base, card);

    const afterPlay = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;
    // Rush accordé dans temporaryKeywords
    expect(afterPlay.cards[card.id]?.temporaryKeywords).toContain('Rush');

    // Deux EndPhases pour déclencher clearTemporaryKeywords (Main → End → Refresh)
    let s = applyAction(afterPlay, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(s)).toBe(false);
    if (isGameError(s)) return;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(s)).toBe(false);
    if (isGameError(s)) return;

    expect((s.cards[card.id]?.temporaryKeywords ?? [])).not.toContain('Rush');
  });

  it('Permanent — keyword Blocker conservé après fin de tour', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'GiveKeyword', keyword: 'Blocker', target: { scope: 'Self' }, duration: 'Permanent' }],
    };
    const card = makeChar('perm-blocker', 'p1', 2000, { zone: 'hand', cost: 0, effects: [eff] });
    const state = addToHand(base, card);

    const afterPlay = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;
    // Blocker dans keywords (permanent), pas dans temporaryKeywords
    expect(afterPlay.cards[card.id]?.keywords).toContain('Blocker');
    expect(afterPlay.cards[card.id]?.temporaryKeywords ?? []).not.toContain('Blocker');

    // Deux EndPhases
    let s = applyAction(afterPlay, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(s)).toBe(false);
    if (isGameError(s)) return;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(s)).toBe(false);
    if (isGameError(s)) return;

    // Blocker toujours présent
    expect(s.cards[card.id]?.keywords).toContain('Blocker');
  });

  it('Permanent — keyword non présent dans temporaryKeywords (pas effacé par erreur)', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'GiveKeyword', keyword: 'DoubleAttack', target: { scope: 'Self' }, duration: 'Permanent' }],
    };
    const card = makeChar('perm-da', 'p1', 2000, { zone: 'hand', cost: 0, effects: [eff] });
    const state = addToHand(base, card);

    const afterPlay = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;
    // DoubleAttack dans keywords permanents, temporaryKeywords vide ou inexistant
    expect(afterPlay.cards[card.id]?.keywords).toContain('DoubleAttack');
    expect(afterPlay.cards[card.id]?.temporaryKeywords ?? []).toHaveLength(0);
  });
});

// ── 20. pendingTargetInteraction — ChooseOwnCharacter OnAttack ────────────────
// L'engine doit stocker pendingTargetInteraction et attendre ResolveTargetInteraction.

describe('pendingTargetInteraction : ChooseOwnCharacter OnAttack', () => {
  it('OnAttack ChooseOwnCharacter — set pendingTargetInteraction au lieu d\'auto-pick', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnAttack',
      actions: [{ type: 'PowerBoost', amount: 2000, target: { scope: 'ChooseOwnCharacter' }, duration: 'EndOfTurn' }],
    };
    const attacker = makeChar('atk-choose', 'p1', 5000, { effects: [eff] });
    const ally     = makeChar('ally-target', 'p1', 3000);
    const victim   = makeChar('victim', 'p2', 1000, { tapped: true });

    let s = addToP1Board(base, attacker);
    s = addToP1Board(s, ally);
    s = addToP2Board(s, victim);

    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: victim.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // pendingTargetInteraction doit être défini — pas d'auto-pick
    expect(result.pendingTargetInteraction).not.toBeNull();
    expect(result.pendingTargetInteraction?.playerId).toBe(P1);
    expect(result.pendingTargetInteraction?.scope).toBe('ChooseOwnCharacter');
    // L'allié ne doit PAS encore avoir de boost (en attente du choix)
    expect(calculatePower(ally.id, result)).toBe(3000);
  });

  it('ResolveTargetInteraction applique le boost sur la cible choisie', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnAttack',
      actions: [{ type: 'PowerBoost', amount: 2000, target: { scope: 'ChooseOwnCharacter' }, duration: 'EndOfTurn' }],
    };
    const attacker = makeChar('atk-choose2', 'p1', 5000, { effects: [eff] });
    const ally     = makeChar('ally-target2', 'p1', 3000);
    const victim   = makeChar('victim2', 'p2', 1000, { tapped: true });

    let s = addToP1Board(base, attacker);
    s = addToP1Board(s, ally);
    s = addToP2Board(s, victim);

    let result = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: victim.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    result = applyAction(result, {
      type: 'ResolveTargetInteraction', playerId: P1, targetCardId: ally.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(result.pendingTargetInteraction).toBeNull();
    expect(calculatePower(ally.id, result)).toBe(5000); // 3000 + 2000
  });
});

// ── 21. pendingTargetInteraction — mauvais joueur → erreur ───────────────────

describe('ResolveTargetInteraction : validations', () => {
  it('mauvais joueur → WRONG_PLAYER', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnAttack',
      actions: [{ type: 'PowerBoost', amount: 1000, target: { scope: 'ChooseOwnCharacter' }, duration: 'EndOfTurn' }],
    };
    const attacker = makeChar('atk-wrong', 'p1', 5000, { effects: [eff] });
    const ally     = makeChar('ally-wrong', 'p1', 3000);
    const victim   = makeChar('victim-wrong', 'p2', 1000, { tapped: true });

    let s = addToP1Board(base, attacker);
    s = addToP1Board(s, ally);
    s = addToP2Board(s, victim);

    let result = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: victim.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // P2 tries to resolve P1's pending
    const wrongResult = applyAction(result, {
      type: 'ResolveTargetInteraction', playerId: P2, targetCardId: ally.id,
    });
    expect(isGameError(wrongResult)).toBe(true);
    if (!isGameError(wrongResult)) return;
    expect(wrongResult.code).toBe('WRONG_PLAYER');
  });

  it('cible adverse pour ChooseOwnCharacter → INVALID_TARGET', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnAttack',
      actions: [{ type: 'PowerBoost', amount: 1000, target: { scope: 'ChooseOwnCharacter' }, duration: 'EndOfTurn' }],
    };
    const attacker = makeChar('atk-scope', 'p1', 5000, { effects: [eff] });
    const victim   = makeChar('victim-scope', 'p2', 1000, { tapped: true });

    let s = addToP1Board(base, attacker);
    s = addToP2Board(s, victim);

    let result = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: victim.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Try to target an opponent's card for ChooseOwnCharacter
    const wrongResult = applyAction(result, {
      type: 'ResolveTargetInteraction', playerId: P1, targetCardId: victim.id,
    });
    expect(isGameError(wrongResult)).toBe(true);
    if (!isGameError(wrongResult)) return;
    expect(wrongResult.code).toBe('INVALID_TARGET');
  });
});

// ── 22. pendingTargetInteraction — ChooseOpponentCharacter OnBlock ────────────

describe('pendingTargetInteraction : ChooseOpponentCharacter OnBlock', () => {
  it('OnBlock ChooseOpponentCharacter — set pending, puis résolution KO la cible', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnBlock',
      actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter' } }],
    };
    const blocker  = makeChar('blocker-ko', 'p2', 4000, { effects: [eff], keywords: ['Blocker'] });
    const attacker = makeChar('attacker-ko', 'p1', 5000);
    const p2ally   = makeChar('p2ally-ko', 'p2', 3000, { tapped: true });

    let s = addToP1Board(base, attacker);
    let s2 = addToP2Board(s, blocker);
    s2 = addToP2Board(s2, p2ally);

    // P1 declares attack on P2 leader
    const p2Leader = s2.players[P2]!.leader!;
    let result = applyAction(s2, {
      type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: p2Leader,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // P2 blocks
    result = applyAction(result, { type: 'DeclareBlock', playerId: P2, blockerId: blocker.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // pending must be set — P2 must choose an opponent (P1) character to KO
    expect(result.pendingTargetInteraction).not.toBeNull();
    expect(result.pendingTargetInteraction?.scope).toBe('ChooseOpponentCharacter');
    expect(result.pendingTargetInteraction?.playerId).toBe(P2);

    // Resolve: P2 chooses P1's attacker to KO
    result = applyAction(result, {
      type: 'ResolveTargetInteraction', playerId: P2, targetCardId: attacker.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(result.pendingTargetInteraction).toBeNull();
    expect(result.cards[attacker.id]?.zone).toBe('trash'); // P1's attacker got KO'd
  });
});

// ── 23. pendingTargetInteraction — chaîne d'effets : ChooseTarget + Draw ──────
// Vérifie que les actions suivant ChooseTarget (pendingEffectActions) sont bien
// exécutées après la résolution.

describe('pendingTargetInteraction : ChooseTarget suivi d\'autres actions', () => {
  it('PowerBoost sur cible + Draw 1 — les deux actions s\'appliquent', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnAttack',
      actions: [
        { type: 'PowerBoost', amount: 2000, target: { scope: 'ChooseOwnCharacter' }, duration: 'EndOfTurn' },
        { type: 'DrawCard', count: 1 },
      ],
    };
    const attacker = makeChar('chain-atk', 'p1', 5000, { effects: [eff] });
    const ally     = makeChar('chain-ally', 'p1', 3000);
    const victim   = makeChar('chain-victim', 'p2', 1000, { tapped: true });

    let s = addToP1Board(base, attacker);
    s = addToP1Board(s, ally);
    s = addToP2Board(s, victim);

    const handBefore = s.players[P1]!.hand.length;

    let result = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: victim.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Pending, no draw yet
    expect(result.pendingTargetInteraction).not.toBeNull();
    expect(result.players[P1]!.hand.length).toBe(handBefore);

    result = applyAction(result, {
      type: 'ResolveTargetInteraction', playerId: P1, targetCardId: ally.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(result.pendingTargetInteraction).toBeNull();
    expect(calculatePower(ally.id, result)).toBe(5000); // boost applied
    expect(result.players[P1]!.hand.length).toBe(handBefore + 1); // draw happened
  });
});

// ─── Tests #24–#27 : RevealFromHand ──────────────────────────���───────────────

describe('RevealFromHand', () => {
  function makeRevealState() {
    const blueCard: Card = {
      id: makeCardId('BLUE-001'), name: 'BlueCard', cost: 1, power: 1000,
      color: 'Blue', type: 'Character', zone: 'hand', ownerId: P1,
      tapped: false, attachedTo: null,
    };
    const redCard: Card = {
      id: makeCardId('RED-001'), name: 'RedCard', cost: 1, power: 1000,
      color: 'Red', type: 'Character', zone: 'hand', ownerId: P1,
      tapped: false, attachedTo: null,
    };
    const leader: Card = {
      id: makeCardId('LDR-001'), name: 'Leader', cost: 0, power: 5000,
      color: 'Blue', type: 'Leader', zone: 'leader', ownerId: P1,
      tapped: false, attachedTo: null,
    };
    const source: Card = {
      id: makeCardId('SRC-001'), name: 'Whitey Bay', cost: 1, power: 1000,
      color: 'Blue', type: 'Character', zone: 'hand', ownerId: P1,
      tapped: false, attachedTo: null,
      effects: [{
        trigger: 'OnPlay',
        condition: { type: 'Always' },
        actions: [{
          type: 'RevealFromHand',
          count: 1,
          filter: { color: 'Blue' },
          thenActions: [{
            type: 'PowerBoost', amount: 2000,
            target: { scope: 'OwnLeader' }, duration: 'EndOfTurn',
          }],
        }],
      }],
    };
    const don: Card = {
      id: makeCardId('DON-001'), name: 'DON', cost: 0, power: 0,
      color: 'Red', type: 'DON', zone: 'donArea', ownerId: P1,
      tapped: false, attachedTo: null,
    };
    let s = makeEmptyState(P1, P2);
    s = {
      ...s,
      phase: 'Main',
      activePlayerId: P1,
      cards: { ...s.cards, [blueCard.id]: blueCard, [redCard.id]: redCard, [leader.id]: leader, [source.id]: source, [don.id]: don },
      players: {
        ...s.players,
        [P1]: { ...s.players[P1]!, hand: [source.id, blueCard.id, redCard.id], board: [], leader: leader.id, donArea: [don.id] },
      },
    };
    return { s, blueCard, redCard, leader, source };
  }

  it('#24 — RevealFromHand sets pendingRevealInteraction; effect not yet applied', () => {
    const { s, source, leader } = makeRevealState();
    const result = applyAction(s, {
      type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRevealInteraction).not.toBeNull();
    expect(result.pendingRevealInteraction?.count).toBe(1);
    expect(result.pendingRevealInteraction?.filter.color).toBe('Blue');
    // thenActions not yet applied — leader power unchanged
    expect(calculatePower(leader.id, result)).toBe(5000);
  });

  it('#25 — ResolveRevealInteraction with valid card applies thenActions', () => {
    const { s, source, blueCard, leader } = makeRevealState();
    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    result = applyAction(result, {
      type: 'ResolveRevealInteraction', playerId: P1, revealedCardIds: [blueCard.id],
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRevealInteraction).toBeNull();
    expect(calculatePower(leader.id, result)).toBe(7000); // +2000 applied
    // blueCard stays in hand
    expect(result.cards[blueCard.id]?.zone).toBe('hand');
  });

  it('#26 — ResolveRevealInteraction skip (empty array) → no effect applied', () => {
    const { s, source, leader } = makeRevealState();
    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    if (isGameError(result)) return;
    result = applyAction(result, {
      type: 'ResolveRevealInteraction', playerId: P1, revealedCardIds: [],
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingRevealInteraction).toBeNull();
    expect(calculatePower(leader.id, result)).toBe(5000); // no boost
  });

  it('#27 — ResolveRevealInteraction with non-matching card → INVALID_TARGET', () => {
    const { s, source, redCard } = makeRevealState();
    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: source.id });
    if (isGameError(result)) return;
    const err = applyAction(result, {
      type: 'ResolveRevealInteraction', playerId: P1, revealedCardIds: [redCard.id],
    });
    expect(isGameError(err)).toBe(true);
    if (isGameError(err)) expect(err.code).toBe('INVALID_TARGET');
  });
});

// ── Régression : conditions leader (LeaderHasType / LeaderHasAnyType / LeaderIsName) ──────────

describe('Condition LeaderHasType', () => {
  it('effet ignoré quand le leader manque le subType → carte jouable sans blocage', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      condition: { type: 'LeaderHasType', subType: 'Revolutionary Army' },
      actions: [{ type: 'PowerBoost', amount: -3000, target: { scope: 'ChooseOpponentCharacter' }, duration: 'EndOfTurn' }],
    };
    const opponentChar = makeChar('op-char', 'p2', 3000);
    const playCard = makeChar('koala', 'p1', 3000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToHand(base, playCard);
    state = addToP2Board(state, opponentChar);

    // Leader has no subTypes → condition fails → card plays without pendingTargetInteraction
    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.pendingTargetInteraction).toBeNull();
    expect(result.cards[playCard.id]?.zone).toBe('board');
    // Opponent character untouched
    expect(result.cards[opponentChar.id]?.powerModifierOT).toBeUndefined();
  });

  it('effet déclenche pendingTargetInteraction quand le leader a le subType', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      condition: { type: 'LeaderHasType', subType: 'Revolutionary Army' },
      actions: [{ type: 'PowerBoost', amount: -3000, target: { scope: 'ChooseOpponentCharacter' }, duration: 'EndOfTurn' }],
    };
    const opponentChar = makeChar('op-char', 'p2', 3000);
    const playCard = makeChar('koala', 'p1', 3000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToHand(base, playCard);
    state = addToP2Board(state, opponentChar);

    // Patch P1 leader to have the required subType
    const leaderId = state.players[P1]!.leader!;
    state = { ...state, cards: { ...state.cards, [leaderId]: { ...state.cards[leaderId]!, subTypes: 'Revolutionary Army' } } };

    const afterPlay = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;
    expect(afterPlay.pendingTargetInteraction).not.toBeNull();

    const result = applyAction(afterPlay, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: opponentChar.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(calculatePower(opponentChar.id, result)).toBe(0); // 3000 - 3000
  });
});

describe('Condition LeaderHasAnyType', () => {
  it('effet déclenche si le leader a UN des types (OR)', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      condition: { type: 'LeaderHasAnyType', subTypes: ['Fish-Man', 'Merfolk'] },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const playCard = makeChar('fishman-helper', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToHand(base, playCard);

    // Leader has "Merfolk" → second type in OR list
    const leaderId = state.players[P1]!.leader!;
    state = { ...state, cards: { ...state.cards, [leaderId]: { ...state.cards[leaderId]!, subTypes: 'Merfolk' } } };

    const deckBefore = state.players[P1]!.deck.length;
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: playCard.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1); // drew 1
  });

  it('effet ignoré si le leader n\'a aucun des types', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      condition: { type: 'LeaderHasAnyType', subTypes: ['Fish-Man', 'Merfolk'] },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const playCard = makeChar('fishman-helper', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, playCard);

    const deckBefore = state.players[P1]!.deck.length;
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: playCard.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(deckBefore); // no draw
  });
});

describe('Condition LeaderIsName', () => {
  it('effet déclenche quand le nom du leader correspond', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      condition: { type: 'LeaderIsName', name: 'p1-leader' },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const playCard = makeChar('ace-helper', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, playCard);

    // P1 leader name is 'p1-leader' (from makePlayerSetup helper)
    const deckBefore = state.players[P1]!.deck.length;
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: playCard.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

  it('effet ignoré quand le nom du leader ne correspond pas', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      condition: { type: 'LeaderIsName', name: 'Portgas.D.Ace' },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const playCard = makeChar('ace-helper', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, playCard);

    const deckBefore = state.players[P1]!.deck.length;
    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: playCard.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(deckBefore); // no draw
  });
});

// ── Régression : OnPlay avec ChooseOpponentCharacter → engine-side (pas de blocage client) ─────

describe('TrashFromDeck', () => {
  it('#T1 — nominal : trash 3 cartes depuis le sommet du deck', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'TrashFromDeck', count: 3, thenActions: [] }],
    };
    const card = makeChar('trash-deck-src', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    const deckBefore = state.players[P1]!.deck.length;

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 3);
    expect(result.players[P1]!.trash.length).toBe(3);
  });

  it('#T2 — deck insuffisant : trash toutes les cartes restantes sans erreur', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'TrashFromDeck', count: 99, thenActions: [] }],
    };
    const card = makeChar('trash-deck-big', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    const deckBefore = state.players[P1]!.deck.length;

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(0);
    expect(result.players[P1]!.trash.length).toBe(deckBefore);
  });

  it('#T3 — thenActions exécutés après le trash', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'TrashFromDeck', count: 1, thenActions: [{ type: 'DrawCard', count: 1 }] }],
    };
    const card = makeChar('trash-then-draw', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, card);
    const handBefore = state.players[P1]!.hand.length;

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Card played from hand (-1) + DrawCard (+1) = net 0 change in hand size
    expect(result.players[P1]!.hand.length).toBe(handBefore - 1 + 1);
    expect(result.players[P1]!.trash.length).toBe(1);
  });
});

describe('PlayFromTrash', () => {
  it('#P1 — nominal : carte en trash matchant le filtre est posée sur le board', () => {
    const base = bootstrapGame();
    const trashChar = makeChar('trash-char', 'p1', 3000, { zone: 'trash', cost: 4, type: 'Character' });
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'PlayFromTrash', filter: { cardType: 'Character', maxCost: 5 } }],
    };
    const src = makeChar('play-from-trash-src', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToP1Trash(base, trashChar);
    state = addToHand(state, src);

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[trashChar.id]?.zone).toBe('board');
    expect(result.players[P1]!.trash).not.toContain(trashChar.id);
    expect(result.players[P1]!.board).toContain(trashChar.id);
  });

  it('#P2 — aucun match dans la trash → state inchangé (carte reste en trash)', () => {
    const base = bootstrapGame();
    const trashChar = makeChar('trash-no-match', 'p1', 3000, { zone: 'trash', cost: 10, type: 'Character' });
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'PlayFromTrash', filter: { maxCost: 5 } }],
    };
    const src = makeChar('play-from-trash-src2', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToP1Trash(base, trashChar);
    state = addToHand(state, src);

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[trashChar.id]?.zone).toBe('trash');
  });

  it('#P3 — filtre subType : seule la carte avec le bon subType est sélectionnée', () => {
    const base = bootstrapGame();
    const wrongChar = makeChar('trash-wrong-type', 'p1', 3000, { zone: 'trash', cost: 3, subTypes: 'Navy' });
    const rightChar = makeChar('trash-right-type', 'p1', 2000, { zone: 'trash', cost: 3, subTypes: 'Straw Hat Crew' });
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'PlayFromTrash', filter: { subType: 'Straw Hat Crew' } }],
    };
    const src = makeChar('play-from-trash-src3', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToP1Trash(base, wrongChar);
    state = addToP1Trash(state, rightChar);
    state = addToHand(state, src);

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[rightChar.id]?.zone).toBe('board');
    expect(result.cards[wrongChar.id]?.zone).toBe('trash');
  });
});

describe('RevealFromDeck', () => {
  it('#R1 — returnTo=bottom : cartes révélées déplacées au fond, thenActions exécutés', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'RevealFromDeck', count: 2, returnTo: 'bottom', thenActions: [{ type: 'DrawCard', count: 1 }] }],
    };
    const src = makeChar('reveal-deck-src', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, src);
    const deckBefore = state.players[P1]!.deck.slice();
    const handBefore = state.players[P1]!.hand.length;
    // top2 revealed cards go to the bottom after the effect
    const top2 = deckBefore.slice(0, 2);

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    const deckAfter = result.players[P1]!.deck;
    // DrawCard thenAction consumed 1 card from top → deck length = N - 1
    expect(deckAfter.length).toBe(deckBefore.length - 1);
    // top2 are at the bottom (last 2 entries in deckAfter)
    expect(deckAfter.slice(-2)).toEqual(top2);
    // DrawCard thenAction executed: hand net = -1 (play) +1 (draw) = 0
    expect(result.players[P1]!.hand.length).toBe(handBefore - 1 + 1);
  });

  it('#R2 — deck vide → state inchangé (pas d\'erreur)', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'RevealFromDeck', count: 2, returnTo: 'bottom', thenActions: [] }],
    };
    const src = makeChar('reveal-empty-deck', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    // Empty P1's deck
    const emptyDeckState: GameState = {
      ...base,
      players: { ...base.players, [P1]: { ...base.players[P1]!, deck: [] } },
    };
    const state = addToHand(emptyDeckState, src);

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(0);
  });
});

describe('PlaceAtBottomOfDeck', () => {
  it('#RD1 — carte sur le board déplacée au fond du deck', () => {
    const base = bootstrapGame();
    const boardChar = makeChar('board-to-deck', 'p1', 2000);
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'PlaceAtBottomOfDeck', target: { scope: 'ChooseOwnCharacter' } }],
    };
    const src = makeChar('place-bottom-src', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToP1Board(base, boardChar);
    state = addToHand(state, src);
    const deckBefore = state.players[P1]!.deck.length;
    const boardBefore = state.players[P1]!.board.length;

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: src.id,
      chosenTargetId: boardChar.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[boardChar.id]?.zone).toBe('deck');
    expect(result.players[P1]!.deck.length).toBe(deckBefore + 1);
    expect(result.players[P1]!.deck[result.players[P1]!.deck.length - 1]).toBe(boardChar.id);
    expect(result.players[P1]!.board.length).toBe(boardBefore); // removed from board, +1 from src playing
  });
});

describe('SearchTrash', () => {
  it('#S1 — nominal : count=2, 2 cartes matchantes déplacées en main', () => {
    const base = bootstrapGame();
    const match1 = makeChar('st-match1', 'p1', 2000, { zone: 'trash', cost: 3, type: 'Character' });
    const match2 = makeChar('st-match2', 'p1', 1000, { zone: 'trash', cost: 4, type: 'Character' });
    const noMatch = makeChar('st-nomatch', 'p1', 2000, { zone: 'trash', cost: 10, type: 'Character' });
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'SearchTrash', filter: { cardType: 'Character', maxCost: 5 }, count: 2 }],
    };
    const src = makeChar('search-trash-src', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToP1Trash(base, match1);
    state = addToP1Trash(state, match2);
    state = addToP1Trash(state, noMatch);
    state = addToHand(state, src);
    const handBefore = state.players[P1]!.hand.length;

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[match1.id]?.zone).toBe('hand');
    expect(result.cards[match2.id]?.zone).toBe('hand');
    expect(result.cards[noMatch.id]?.zone).toBe('trash');
    // hand: -1 (play) +2 (search) = +1
    expect(result.players[P1]!.hand.length).toBe(handBefore - 1 + 2);
    expect(result.players[P1]!.trash.length).toBe(1);
  });

  it('#S2 — count=1 parmi plusieurs matches → prend 1 seul', () => {
    const base = bootstrapGame();
    const m1 = makeChar('st2-match1', 'p1', 2000, { zone: 'trash', cost: 2, type: 'Character' });
    const m2 = makeChar('st2-match2', 'p1', 2000, { zone: 'trash', cost: 3, type: 'Character' });
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'SearchTrash', filter: { cardType: 'Character' }, count: 1 }],
    };
    const src = makeChar('search-trash-src2', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToP1Trash(base, m1);
    state = addToP1Trash(state, m2);
    state = addToHand(state, src);

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    const movedToHand = [m1.id, m2.id].filter((id) => result.cards[id]?.zone === 'hand');
    expect(movedToHand.length).toBe(1);
    expect(result.players[P1]!.trash.length).toBe(1);
  });

  it('#S3 — aucun match → state inchangé', () => {
    const base = bootstrapGame();
    const noMatch = makeChar('st3-nomatch', 'p1', 2000, { zone: 'trash', cost: 8, type: 'Character' });
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'SearchTrash', filter: { maxCost: 3 }, count: 1 }],
    };
    const src = makeChar('search-trash-src3', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToP1Trash(base, noMatch);
    state = addToHand(state, src);

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[noMatch.id]?.zone).toBe('trash');
  });
});

describe('Activate', () => {
  it('#A1 — nominal : carte tapped=true devient tapped=false', () => {
    const base = bootstrapGame();
    const tappedChar = makeChar('act-target', 'p1', 2000, { tapped: true });
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'Activate', target: { scope: 'ChooseOwnCharacter' } }],
    };
    const src = makeChar('activate-src', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToP1Board(base, tappedChar);
    state = addToHand(state, src);

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: src.id,
      chosenTargetId: tappedChar.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[tappedChar.id]?.tapped).toBe(false);
  });

  it('#A2 — déjà active (tapped=false) → reste false sans erreur', () => {
    const base = bootstrapGame();
    const activeChar = makeChar('act-already', 'p1', 2000, { tapped: false });
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'Activate', target: { scope: 'ChooseOwnCharacter' } }],
    };
    const src = makeChar('activate-src2', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToP1Board(base, activeChar);
    state = addToHand(state, src);

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: src.id,
      chosenTargetId: activeChar.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[activeChar.id]?.tapped).toBe(false);
  });

  it('#A3 — cible introuvable (board vide) → state inchangé sans erreur', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'Activate', target: { scope: 'ChooseOwnCharacter' } }],
    };
    const src = makeChar('activate-src3', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    const state = addToHand(base, src);
    const deckBefore = state.players[P1]!.deck.length;

    const result = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: src.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(deckBefore);
  });
});

describe('Régression : OnPlay ChooseOpponentCharacter → pendingTargetInteraction engine-side', () => {
  it('PlayCharacterFromHand sans chosenTargetId → pendingTargetInteraction set (pas de blocage)', () => {
    const base = bootstrapGame();
    const effect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'ReturnToHand', target: { scope: 'ChooseOpponentCharacter' } }],
    };
    const opChar = makeChar('op-target', 'p2', 2000);
    const playCard = makeChar('tactician', 'p1', 1000, { zone: 'hand', cost: 0, effects: [effect] });
    let state = addToHand(base, playCard);
    state = addToP2Board(state, opChar);

    const afterPlay = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;
    // Engine sets pendingTargetInteraction instead of auto-resolving
    expect(afterPlay.pendingTargetInteraction).not.toBeNull();
    expect(afterPlay.pendingTargetInteraction?.scope).toBe('ChooseOpponentCharacter');
    // Card is already on the board
    expect(afterPlay.cards[playCard.id]?.zone).toBe('board');
  });
});

// ── DY1. PowerBoost DuringYourTurn → stored in powerModifier (not powerModifierOT) ──

describe('DuringYourTurn : PowerBoost stocké dans powerModifier', () => {
  it('PowerBoost DuringYourTurn → powerModifier set, powerModifierOT undefined', () => {
    const base = bootstrapGame();
    const boostEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'PowerBoost', amount: 2000, target: { scope: 'Self' }, duration: 'DuringYourTurn' }],
    };
    const card = makeChar('dyt-char', 'p1', 3000, { zone: 'hand', cost: 0, effects: [boostEffect] });
    const state = addToHand(base, card);

    const afterPlay = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;

    expect(afterPlay.cards[card.id]?.powerModifier).toBe(2000);
    expect(afterPlay.cards[card.id]?.powerModifierOT).toBeUndefined();
    expect(calculatePower(card.id, afterPlay)).toBe(5000);
  });
});

// ── DY2. DuringYourTurn → powerModifier cleared after EndPhase (End → Refresh) ──

describe('DuringYourTurn : boost effacé après EndPhase (End → Refresh)', () => {
  it('powerModifier DuringYourTurn est supprimé lors du passage End → Refresh', () => {
    const base = bootstrapGame();
    const boostEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'PowerBoost', amount: 2000, target: { scope: 'Self' }, duration: 'DuringYourTurn' }],
    };
    const card = makeChar('dyt-clear', 'p1', 3000, { zone: 'hand', cost: 0, effects: [boostEffect] });
    const state = addToHand(base, card);

    const afterPlay = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;
    expect(afterPlay.cards[card.id]?.powerModifier).toBe(2000);

    // Step 1: Main → End
    let s = applyAction(afterPlay, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(s)).toBe(false);
    if (isGameError(s)) return;
    expect(s.cards[card.id]?.powerModifier).toBe(2000); // still active during End phase

    // Step 2: End → Refresh (triggers applyReturnDon → clearPowerModifiers)
    s = applyAction(s, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(s)).toBe(false);
    if (isGameError(s)) return;
    expect(s.cards[card.id]?.powerModifier).toBeUndefined(); // cleared
    expect(calculatePower(card.id, s)).toBe(3000);
  });
});

// ── DY3. GiveKeyword DuringYourTurn → stored in temporaryKeywords ──

describe('DuringYourTurn : GiveKeyword stocké dans temporaryKeywords', () => {
  it('GiveKeyword Rush DuringYourTurn → temporaryKeywords contient Rush', () => {
    const base = bootstrapGame();
    const kwEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'GiveKeyword', keyword: 'Rush', target: { scope: 'Self' }, duration: 'DuringYourTurn' }],
    };
    const card = makeChar('dyt-kw', 'p1', 2000, { zone: 'hand', cost: 0, effects: [kwEffect] });
    const state = addToHand(base, card);

    const afterPlay = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: card.id });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;

    expect(afterPlay.cards[card.id]?.temporaryKeywords).toContain('Rush');
  });
});

// ── OPE1. OnOpponentPlaysEvent — DrawCard déclenché quand P2 joue un Event ──────

describe('OnOpponentPlaysEvent : nominal', () => {
  it("P2 joue un Event pendant le tour de P1 → DrawCard déclenché sur la carte de P1", () => {
    const base = bootstrapGame(); // activePlayerId = P1, phase = Main

    const watcherEffect: CardEffect = {
      trigger: 'OnOpponentPlaysEvent',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const watcher = makeChar('ope-watcher', 'p1', 2000, { effects: [watcherEffect] });

    const eventCard: Card = {
      id: makeCardId('p2-event'),
      name: 'P2 Counter Event',
      cost: 0,
      power: 0,
      color: 'Red',
      type: 'Event',
      zone: 'hand',
      ownerId: P2,
      tapped: false,
      attachedTo: null,
      effects: [],
    };

    let state = addToP1Board(base, watcher);
    // Add event card to P2's hand
    state = {
      ...state,
      cards: { ...state.cards, [eventCard.id]: eventCard },
      players: {
        ...state.players,
        [P2]: { ...state.players[P2]!, hand: [...state.players[P2]!.hand, eventCard.id] },
      },
    };

    const deckBefore = state.players[P1]!.deck.length;

    const result = applyAction(state, { type: 'PlayEvent', playerId: P2, cardId: eventCard.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // P1 drew a card from the OnOpponentPlaysEvent trigger
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1);
  });
});

// ── OPE2. OnOpponentPlaysEvent — pas déclenché quand c'est le tour de P2 ─────────

describe('OnOpponentPlaysEvent : mauvais tour', () => {
  it("P1 joue un Event pendant le tour de P2 → OnOpponentPlaysEvent de P2 ne se déclenche pas", () => {
    const base = bootstrapGame(); // activePlayerId = P1
    // Switch to P2's turn
    const p2TurnState: GameState = { ...base, activePlayerId: P2, phase: 'Main' };

    const watcherEffect: CardEffect = {
      trigger: 'OnOpponentPlaysEvent',
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const watcher = makeChar('ope-watcher-p2', 'p2', 2000, { effects: [watcherEffect] });

    const eventCard: Card = {
      id: makeCardId('p1-event'),
      name: 'P1 Event',
      cost: 0,
      power: 0,
      color: 'Red',
      type: 'Event',
      zone: 'hand',
      ownerId: P1,
      tapped: false,
      attachedTo: null,
      effects: [],
    };

    let state = addToP2Board(p2TurnState, watcher);
    state = addToHand(state, eventCard);

    const deckBefore = state.players[P2]!.deck.length;

    // P1 plays their Event during P2's turn — P1 is the NON-active player
    // OnOpponentPlaysEvent should fire on P2's cards (active player)
    // But P1 is NOT the non-active player in this case — P1 IS non-active → should NOT fire for P2
    // Wait: P2 is active, P1 plays Event → fires on P2's cards (active = P2, event by non-active P1) ✓
    // The test verifies the REVERSE: P2 is active, P1 plays Event → P2's watcher SHOULD fire
    // Actually this is the same as OPE1 but with roles reversed. Let me adjust the test.

    // Corrected intent: when P1 plays an Event and P2 is active, P2's watcher fires.
    // This test was meant to check the WRONG-TURN case. Let me re-do:
    // Wrong turn = P2 is active, P2 plays their OWN Event → OnOpponentPlaysEvent does NOT fire.
    const p2OwnEvent: Card = {
      id: makeCardId('p2-own-event'),
      name: 'P2 Own Event',
      cost: 0,
      power: 0,
      color: 'Red',
      type: 'Event',
      zone: 'hand',
      ownerId: P2,
      tapped: false,
      attachedTo: null,
      effects: [],
    };
    state = {
      ...p2TurnState,
      cards: { ...p2TurnState.cards, [watcher.id]: { ...watcher, zone: 'board' }, [p2OwnEvent.id]: p2OwnEvent },
      players: {
        ...p2TurnState.players,
        [P2]: {
          ...p2TurnState.players[P2]!,
          board: [...p2TurnState.players[P2]!.board, watcher.id],
          hand: [...p2TurnState.players[P2]!.hand, p2OwnEvent.id],
        },
      },
    };

    const p2DeckBefore = state.players[P2]!.deck.length;

    // P2 plays their OWN event (same player = active player) → should NOT trigger OnOpponentPlaysEvent
    const result = applyAction(state, { type: 'PlayEvent', playerId: P2, cardId: p2OwnEvent.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // P2's deck should NOT have changed from the watcher effect (no trigger)
    expect(result.players[P2]!.deck.length).toBe(p2DeckBefore);
  });
});

// ── OPE3. OnOpponentPlaysEvent — OncePerTurn: deuxième Event ignoré ──────────────

describe('OnOpponentPlaysEvent : OncePerTurn', () => {
  it("P2 joue deux Events → OnOpponentPlaysEvent de P1 ne se déclenche qu'une fois", () => {
    const base = bootstrapGame(); // activePlayerId = P1

    const watcherEffect: CardEffect = {
      trigger: 'OnOpponentPlaysEvent',
      actions: [{ type: 'DrawCard', count: 1 }],
      // TypeScript: cast to include constraints
    } as unknown as CardEffect;
    // Inject constraints onto the effect object directly
    (watcherEffect as Record<string, unknown>)['constraints'] = [{ type: 'OncePerTurn' }];

    const watcher = makeChar('ope-once-watcher', 'p1', 2000, { effects: [watcherEffect] });

    const makeP2Event = (suffix: string): Card => ({
      id: makeCardId(`p2-event-${suffix}`),
      name: `P2 Event ${suffix}`,
      cost: 0,
      power: 0,
      color: 'Red',
      type: 'Event',
      zone: 'hand',
      ownerId: P2,
      tapped: false,
      attachedTo: null,
      effects: [],
    });

    const event1 = makeP2Event('1');
    const event2 = makeP2Event('2');

    let state = addToP1Board(base, watcher);
    state = {
      ...state,
      cards: { ...state.cards, [event1.id]: event1, [event2.id]: event2 },
      players: {
        ...state.players,
        [P2]: { ...state.players[P2]!, hand: [...state.players[P2]!.hand, event1.id, event2.id] },
      },
    };

    const deckBefore = state.players[P1]!.deck.length;

    // P2 plays first event → P1 draws 1
    let s = applyAction(state, { type: 'PlayEvent', playerId: P2, cardId: event1.id });
    expect(isGameError(s)).toBe(false);
    if (isGameError(s)) return;
    expect(s.players[P1]!.deck.length).toBe(deckBefore - 1);

    // P2 plays second event → OncePerTurn: P1 should NOT draw again
    s = applyAction(s, { type: 'PlayEvent', playerId: P2, cardId: event2.id });
    expect(isGameError(s)).toBe(false);
    if (isGameError(s)) return;
    expect(s.players[P1]!.deck.length).toBe(deckBefore - 1); // still only -1
  });
});
