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
    deckCards: Array.from({ length: 20 }, (_, i) =>
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

// ─── Tests ────────────────────────────────────────────────────────────────────

// ── 1. OnPlay — Draw 1 ────────────────────────────────────────────────────────

describe('OnPlay: Draw 1', () => {
  it('jouer une carte avec effet OnPlay Draw 1 fait piocher 1 carte', () => {
    const base = bootstrapGame();
    const drawEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'Draw', count: 1 }],
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

describe('OnPlay: TrashCard — opponent discards 1', () => {
  it("l'adversaire défausse 1 carte quand la carte est jouée", () => {
    const base = bootstrapGame();
    const trashEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'TrashCard', count: 1, from: 'OpponentHand' }],
    };
    const playCard = makeChar('sniper', 'p1', 2000, {
      zone: 'hand',
      cost: 0,
      effects: [trashEffect],
    });
    const state = addToHand(base, playCard);

    const p2HandBefore = state.players[P2]!.hand.length;

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(result.players[P2]!.hand.length).toBe(p2HandBefore - 1);
    expect(result.players[P2]!.trash.length).toBe(1);
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
      actions: [{ type: 'Draw', count: 1 }],
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
      actions: [{ type: 'Draw', count: 1 }],
    };
    // Put victim on P2's board (P1 will KO it)
    const victim = makeChar('martyr', 'p2', 1000, { zone: 'board', effects: [koEffect] });

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

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playCard.id,
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
