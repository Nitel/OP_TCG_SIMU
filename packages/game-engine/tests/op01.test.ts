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
import { resolveEffects } from '../src/effects/effectResolver.js';

// ─── Helpers (mirrored from effects.test.ts) ──────────────────────────────────

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

/** Add untapped, unattached DON cards to P1's donArea. */
function addFreeDon(state: GameState, dons: Card[]): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const d of dons) {
    updatedCards[d.id] = { ...d, zone: 'donArea', tapped: false, attachedTo: null };
  }
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: {
      ...state.players,
      [P1]: {
        ...state.players[P1]!,
        donArea: [...state.players[P1]!.donArea, ...dons.map((d) => d.id)],
      },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// ── 1. Cavendish OP01-008 — TakeLifeToHand ────────────────────────────────────

describe('OP01-008 Cavendish: OnPlay TakeLifeToHand', () => {
  it('jouer Cavendish retire 1 carte de la zone Life et la place dans la main de P1', () => {
    const base = bootstrapGame();

    const cavendishEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [
        { type: 'TakeLifeToHand', count: 1 },
        { type: 'GainKeyword', keyword: 'Rush', target: { scope: 'Self' }, duration: 'EndOfTurn' },
      ],
    };
    const cavendish = makeChar('OP01-008', 'p1', 5000, {
      zone: 'hand',
      cost: 0,
      effects: [cavendishEffect],
    });

    const state = addToHand(base, cavendish);
    const lifeBefore = state.players[P1]!.life.length;
    const handBefore = state.players[P1]!.hand.length; // includes cavendish

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: cavendish.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Life zone shrank by 1
    expect(result.players[P1]!.life.length).toBe(lifeBefore - 1);
    // Hand: -1 (played cavendish) +1 (life card taken) → net 0
    expect(result.players[P1]!.hand.length).toBe(handBefore);
    // Cavendish itself is on the board
    expect(result.players[P1]!.board.includes(cavendish.id)).toBe(true);
  });
});

// ── 2. Cavendish OP01-008 — GainKeyword Rush ──────────────────────────────────

describe('OP01-008 Cavendish: OnPlay GainKeyword Rush', () => {
  it('après OnPlay, Cavendish a Rush dans temporaryKeywords', () => {
    const base = bootstrapGame();

    const cavendishEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [
        { type: 'TakeLifeToHand', count: 1 },
        { type: 'GainKeyword', keyword: 'Rush', target: { scope: 'Self' }, duration: 'EndOfTurn' },
      ],
    };
    const cavendish = makeChar('OP01-008', 'p1', 5000, {
      zone: 'hand',
      cost: 0,
      effects: [cavendishEffect],
    });
    const state = addToHand(base, cavendish);

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: cavendish.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const card = result.cards[cavendish.id];
    expect(card?.temporaryKeywords).toContain('Rush');
  });

  it('temporaryKeywords est vidé après EndPhase', () => {
    const base = bootstrapGame();

    const cavendishEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [
        { type: 'GainKeyword', keyword: 'Rush', target: { scope: 'Self' }, duration: 'EndOfTurn' },
      ],
    };
    const cavendish = makeChar('OP01-008', 'p1', 5000, {
      zone: 'hand',
      cost: 0,
      effects: [cavendishEffect],
    });
    let state = addToHand(base, cavendish);

    // Play the card
    let result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: cavendish.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Advance to End phase and trigger EndPhase (applyReturnDon clears temporaryKeywords)
    result = { ...result, phase: 'End' };
    result = applyAction(result, { type: 'EndPhase', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // After EndPhase, temporaryKeywords should be cleared
    const card = result.cards[cavendish.id];
    expect(card?.temporaryKeywords ?? []).toHaveLength(0);
  });
});

// ── 3. Sanji OP01-013 — Activated: TakeLifeToHand + PowerBoost + AttachDon ───

describe('OP01-013 Sanji: Activated TakeLifeToHand + PowerBoost + AttachDon', () => {
  it('résoudre Activated de Sanji : life -1, pouvoir +2000, 2 DON attachés', () => {
    const base = bootstrapGame();

    // Add 2 free DON to P1's donArea
    const don1 = makeDon('test-don-1', 'p1');
    const don2 = makeDon('test-don-2', 'p1');
    let state = addFreeDon(base, [don1, don2]);

    const sanji = makeChar('OP01-013', 'p1', 3000, { zone: 'board' });
    const sanjiId = sanji.id;
    state = {
      ...state,
      cards: { ...state.cards, [sanjiId]: sanji },
      players: {
        ...state.players,
        [P1]: { ...state.players[P1]!, board: [...state.players[P1]!.board, sanjiId] },
      },
    };

    const sanjiEffects: CardEffect[] = [
      {
        trigger: 'Activated',
        actions: [
          { type: 'TakeLifeToHand', count: 1 },
          { type: 'PowerBoost', amount: 2000, target: { scope: 'Self' }, duration: 'EndOfTurn' },
          { type: 'AttachDon', count: 2, target: { scope: 'Self' } },
        ],
      },
    ];

    const lifeBefore = state.players[P1]!.life.length;
    const handBefore = state.players[P1]!.hand.length;
    const powerBefore = calculatePower(sanjiId, state);

    // Activated effects have no dedicated GameAction — call resolveEffects directly
    const after = resolveEffects(
      sanjiEffects,
      'Activated',
      { sourceCardId: sanjiId, sourcePlayerId: P1 },
      state,
    );

    // TakeLifeToHand: life -1, hand +1
    expect(after.players[P1]!.life.length).toBe(lifeBefore - 1);
    expect(after.players[P1]!.hand.length).toBe(handBefore + 1);

    // PowerBoost: +2000
    expect(calculatePower(sanjiId, after)).toBe(powerBefore + 2000 + 2 * 1000); // +2000 boost + 2 DON

    // AttachDon: 2 DON attached to Sanji
    const attachedDon = Object.values(after.cards).filter(
      (c) => c.type === 'DON' && c.attachedTo === sanjiId,
    );
    expect(attachedDon).toHaveLength(2);
    for (const don of attachedDon) {
      expect(don.tapped).toBe(true);
    }
  });

  it("AttachDon sans DON libre ne modifie pas l'état", () => {
    const base = bootstrapGame();
    const sanji = makeChar('OP01-013', 'p1', 3000, { zone: 'board' });
    const sanjiId = sanji.id;
    const state: GameState = {
      ...base,
      cards: { ...base.cards, [sanjiId]: sanji },
      players: {
        ...base.players,
        [P1]: {
          ...base.players[P1]!,
          board: [...base.players[P1]!.board, sanjiId],
          donArea: [], // no DON available
        },
      },
    };

    const effects: CardEffect[] = [
      {
        trigger: 'Activated',
        actions: [{ type: 'AttachDon', count: 2, target: { scope: 'Self' } }],
      },
    ];

    const after = resolveEffects(effects, 'Activated', { sourceCardId: sanjiId, sourcePlayerId: P1 }, state);
    expect(calculatePower(sanjiId, after)).toBe(3000);
  });
});

// ── 4. Elephant's Marchoo OP01-115 — OnPlay: KO(maxCost:2) + GiveDon ─────────

describe("OP01-115 Elephant's Marchoo: OnPlay KO(maxCost≤2) + GiveDon 1", () => {
  it('KO un personnage adverse de coût ≤ 2 et donne 1 DON!! à l\'adversaire', () => {
    const base = bootstrapGame();

    // Opponent character with cost 2 (eligible target)
    const target = makeChar('p2-target', 'p2', 3000, { cost: 2 });
    let state = addToP2Board(base, target);

    // Ensure P2 has a DON to give (the effect is GiveDon: give opponent DON from THEIR deck)
    const p2DonDeckBefore = state.players[P2]!.donDeck.length;
    const p2DonAreaBefore = state.players[P2]!.donArea.length;

    const marchooEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [
        { type: 'KO', target: { scope: 'ChooseOpponentCharacter', maxCost: 2 } },
        { type: 'GiveDon', count: 1 },
      ],
    };
    // Elephant's Marchoo is an Event (cost 4, power 0) — play as Character for test simplicity
    const marchoo = makeChar('OP01-115', 'p1', 0, {
      zone: 'hand',
      cost: 0,
      effects: [marchooEffect],
    });
    state = addToHand(state, marchoo);

    const p2BoardBefore = state.players[P2]!.board.length;

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: marchoo.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Target is KO'd
    expect(result.cards[target.id]?.zone).toBe('trash');
    expect(result.players[P2]!.board.length).toBe(p2BoardBefore - 1);

    // P2 gained 1 DON from their donDeck
    expect(result.players[P2]!.donDeck.length).toBe(p2DonDeckBefore - 1);
    expect(result.players[P2]!.donArea.length).toBe(p2DonAreaBefore + 1);
  });

  it('ne KO pas un personnage adverse de coût > 2', () => {
    const base = bootstrapGame();

    // Opponent character with cost 3 (ineligible)
    const expensiveTarget = makeChar('p2-expensive', 'p2', 4000, { cost: 3 });
    let state = addToP2Board(base, expensiveTarget);

    const marchooEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [
        { type: 'KO', target: { scope: 'ChooseOpponentCharacter', maxCost: 2 } },
      ],
    };
    const marchoo = makeChar('OP01-115', 'p1', 0, {
      zone: 'hand',
      cost: 0,
      effects: [marchooEffect],
    });
    state = addToHand(state, marchoo);

    const result = applyAction(state, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: marchoo.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // Expensive target survives
    expect(result.cards[expensiveTarget.id]?.zone).toBe('board');
  });
});

// ── 5. Elephant's Marchoo OP01-115 — Trigger from life ───────────────────────

describe("OP01-115 Elephant's Marchoo: Trigger depuis life", () => {
  it("révélée depuis la zone Life → KO un personnage adverse de coût ≤ 2", () => {
    const base = bootstrapGame();

    // P2 has a board character with cost 1
    const p2Char = makeChar('p2-char', 'p2', 2000, { cost: 1 });
    let state = addToP2Board(base, p2Char);

    // Place a Trigger copy of Marchoo in P2's life zone (top = first element)
    const marchooId = makeCardId('trigger-marchoo');
    const triggerEffect: CardEffect = {
      trigger: 'Trigger',
      actions: [
        { type: 'KO', target: { scope: 'ChooseOpponentCharacter', maxCost: 2 } },
      ],
    };
    // The life card belongs to P2, but its effect targets "opponent characters"
    // — from P2's perspective the opponent is P1, who has no board characters initially.
    // So we place it in P1's life instead (Trigger fires when P1 takes damage).
    // But actually: Trigger is resolved with sourcePlayerId = defending player (P2 here).
    // Let's re-wire: the card is in P2's life, P2's opponent is P1.
    // P1 is attacking, P2 is defending and takes damage → P2's life revealed.
    // Effect: KO an opponent's (P1's) character. P1 has no board characters in base game.
    // So we need P1 to have a board character with cost ≤ 2.

    const p1Char = makeChar('p1-char', 'p1', 2000, { cost: 1 });
    state = {
      ...state,
      cards: { ...state.cards, [p1Char.id]: p1Char },
      players: {
        ...state.players,
        [P1]: { ...state.players[P1]!, board: [...state.players[P1]!.board, p1Char.id] },
      },
    };

    // The Trigger card is in P2's life (it belongs to P2; its "opponent" is P1)
    const marchooCard = makeChar('trigger-marchoo', 'p2', 0, {
      zone: 'life',
      cost: 0,
      effects: [triggerEffect],
    });

    const p2 = state.players[P2]!;
    const oldTopLife = p2.life[0]!;
    const newLife = [marchooId, ...p2.life.slice(1)];

    state = {
      ...state,
      cards: {
        ...state.cards,
        [marchooId]: marchooCard,
        [oldTopLife]: { ...state.cards[oldTopLife]!, zone: 'deck' },
      },
      players: {
        ...state.players,
        [P2]: { ...p2, life: newLife },
      },
    };

    // P1 attacks P2's leader with enough power to deal damage
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

    // Marchoo was revealed → Trigger effect KO'd p1-char (P2's opponent's character)
    expect(result.cards[p1Char.id]?.zone).toBe('trash');
  });
});

// ── 6. HasRestingDon condition — Activated skipped quand DON insuffisant ───────

describe('HasRestingDon condition: Activated ignoré si pas assez de DON resting', () => {
  it("l'effet Activated n'est pas résolu si la condition HasRestingDon n'est pas remplie", () => {
    const base = bootstrapGame();

    const conditionEffect: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'HasRestingDon', count: 3 },
      actions: [
        {
          type: 'PowerBoost',
          amount: 2000,
          target: { scope: 'AllOwnCharacters' },
          duration: 'EndOfTurn',
        },
      ],
    };

    const zoro = makeChar('OP01-001', 'p1', 5000, {
      zone: 'board',
      effects: [conditionEffect],
    });
    const zoroId = zoro.id;

    // Set up: P1 has only 1 resting DON (condition requires 3)
    const don = { ...makeDon('test-don-a', 'p1'), tapped: true, attachedTo: null as null };
    const state: GameState = {
      ...base,
      cards: { ...base.cards, [zoroId]: zoro, [don.id]: don },
      players: {
        ...base.players,
        [P1]: {
          ...base.players[P1]!,
          board: [...base.players[P1]!.board, zoroId],
          donArea: [...base.players[P1]!.donArea, don.id],
        },
      },
    };

    const powerBefore = calculatePower(zoroId, state);

    // Resolve Activated directly — condition not met → no change
    const after = resolveEffects(
      [conditionEffect],
      'Activated',
      { sourceCardId: zoroId, sourcePlayerId: P1 },
      state,
    );

    expect(calculatePower(zoroId, after)).toBe(powerBefore);
  });

  it("l'effet Activated se résout quand HasRestingDon est satisfaite", () => {
    const base = bootstrapGame();

    const conditionEffect: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'HasRestingDon', count: 2 },
      actions: [
        {
          type: 'PowerBoost',
          amount: 1000,
          target: { scope: 'Self' },
          duration: 'EndOfTurn',
        },
      ],
    };

    const zoro = makeChar('OP01-001', 'p1', 5000, {
      zone: 'board',
      effects: [conditionEffect],
    });
    const zoroId = zoro.id;

    // 2 resting DON (satisfies count: 2)
    const don1 = { ...makeDon('test-don-b1', 'p1'), tapped: true, attachedTo: null as null };
    const don2 = { ...makeDon('test-don-b2', 'p1'), tapped: true, attachedTo: null as null };
    const state: GameState = {
      ...base,
      cards: { ...base.cards, [zoroId]: zoro, [don1.id]: don1, [don2.id]: don2 },
      players: {
        ...base.players,
        [P1]: {
          ...base.players[P1]!,
          board: [...base.players[P1]!.board, zoroId],
          donArea: [...base.players[P1]!.donArea, don1.id, don2.id],
        },
      },
    };

    const powerBefore = calculatePower(zoroId, state);

    const after = resolveEffects(
      [conditionEffect],
      'Activated',
      { sourceCardId: zoroId, sourcePlayerId: P1 },
      state,
    );

    expect(calculatePower(zoroId, after)).toBe(powerBefore + 1000);
  });
});
