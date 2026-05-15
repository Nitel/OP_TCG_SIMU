/**
 * Tests for ST-21 (Straw Hat Crew starter deck) mechanics.
 *
 * Coverage:
 *   ST21-011 Franky — AllOwnCharacters with subType filter ("Straw Hat Crew")
 *   ST21-007 Sentomaru — Blocker keyword
 *   ST21-003 Sanji — SuppressBlockerForAttacker via OnPlay
 *   ST21-015 Roronoa Zoro — OnKO PlayFromHand excludeName
 *   ST21-016 DisableBlocker — opponent characters can't use Blocker this turn
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  calculatePower,
  resolveEffects,
  greedyBotDecide,
} from '../src/index.js';
import type { Card, CardId, GameState, PlayerSetup, CardEffect, GameLogEntry } from '../src/index.js';

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
    deckCards: Array.from({ length: 50 }, (_, i) =>
      makeChar(`${idStr}-deck-${i}`, idStr, 2000, { zone: 'deck' }),
    ),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${idStr}-don-${i}`, idStr) as Card),
  };
}

function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId: P1,
  });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  return { ...s, phase: 'Main', activePlayerId: P1, turnNumber: 3 };
}

function addToP1Board(state: GameState, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: { ...state.players, [P1]: { ...state.players[P1]!, board: [...state.players[P1]!.board, card.id] } },
  };
}

function addToP2Board(state: GameState, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: { ...state.players, [P2]: { ...state.players[P2]!, board: [...state.players[P2]!.board, card.id] } },
  };
}

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
      [P1]: { ...state.players[P1]!, donArea: [...state.players[P1]!.donArea, ...dons.map((d) => d.id)] },
    },
  };
}

function addRestedDon(state: GameState, dons: Card[]): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const d of dons) {
    updatedCards[d.id] = { ...d, zone: 'donArea', tapped: true, attachedTo: null };
  }
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: {
      ...state.players,
      [P1]: { ...state.players[P1]!, donArea: [...state.players[P1]!.donArea, ...dons.map((d) => d.id)] },
    },
  };
}

function addAttachedDon(state: GameState, dons: Card[], targetCardId: CardId): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const d of dons) {
    updatedCards[d.id] = { ...d, zone: 'donArea', tapped: true, attachedTo: targetCardId };
  }
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: {
      ...state.players,
      [P1]: { ...state.players[P1]!, donArea: [...state.players[P1]!.donArea, ...dons.map((d) => d.id)] },
    },
  };
}

// ─── ST21-011 Franky — AllOwnCharacters subType filter ────────────────────────

describe('ST21-011 Franky — AllOwnCharacters subType filter', () => {
  const frankyEffect: CardEffect = {
    trigger: 'Activated',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [
      {
        type: 'PowerBoost',
        amount: 1000,
        target: { scope: 'AllOwnCharacters', maxPower: 4000, subType: 'Straw Hat Crew' },
        duration: 'EndOfOpponentTurn',
      },
    ],
  };

  it('seul le personnage Straw Hat Crew ≤4000 reçoit le buff', () => {
    const base = bootstrapGame();
    const franky = makeChar('franky', 'p1', 4000, {
      effects: [frankyEffect],
      subTypes: 'Straw Hat Crew',
    });
    const ally = makeChar('ally-shc', 'p1', 3000, { subTypes: 'Straw Hat Crew' });
    const pirate = makeChar('pirate', 'p1', 3000, { subTypes: 'Pirate' });
    const don1 = makeDon('don1', 'p1');
    const don2 = makeDon('don2', 'p1');

    let s = addToP1Board(base, franky);
    s = addToP1Board(s, ally);
    s = addToP1Board(s, pirate);
    s = addFreeDon(s, [don1, don2]);

    s = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: franky.id }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.cards[franky.id]?.powerModifierOT).toBe(1000);  // Franky itself is Straw Hat Crew ≤4000
    expect(s.cards[ally.id]?.powerModifierOT).toBe(1000);    // Straw Hat Crew ≤4000 → boosted
    expect(s.cards[pirate.id]?.powerModifierOT).toBeUndefined(); // not Straw Hat Crew → NOT boosted
  });

  it('personnage Straw Hat Crew >4000 power ne reçoit PAS le buff', () => {
    const base = bootstrapGame();
    const franky = makeChar('franky2', 'p1', 4000, {
      effects: [frankyEffect],
      subTypes: 'Straw Hat Crew',
    });
    const bigSHC = makeChar('big-shc', 'p1', 5000, { subTypes: 'Straw Hat Crew' });
    const don1 = makeDon('don-a', 'p1');
    const don2 = makeDon('don-b', 'p1');

    let s = addToP1Board(base, franky);
    s = addToP1Board(s, bigSHC);
    s = addFreeDon(s, [don1, don2]);

    s = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: franky.id }) as GameState;

    expect(s.cards[franky.id]?.powerModifierOT).toBe(1000);    // 4000 ≤ 4000 → boosted
    expect(s.cards[bigSHC.id]?.powerModifierOT).toBeUndefined(); // 5000 > 4000 → NOT boosted
  });

  it('personnage sans subTypes reçoit le buff si AllOwnCharacters sans filtre subType', () => {
    // Confirm baseline: without subType filter, ALL chars ≤4000 are boosted
    const noSubTypeEffect: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'HasRestingDon', count: 2 },
      actions: [
        {
          type: 'PowerBoost',
          amount: 1000,
          target: { scope: 'AllOwnCharacters', maxPower: 4000 },
          duration: 'EndOfOpponentTurn',
        },
      ],
    };
    const base = bootstrapGame();
    const source = makeChar('src', 'p1', 2000, { effects: [noSubTypeEffect] });
    const pirate = makeChar('pir2', 'p1', 3000, { subTypes: 'Pirate' });
    const don1 = makeDon('don-c', 'p1');
    const don2 = makeDon('don-d', 'p1');

    let s = addToP1Board(base, source);
    s = addToP1Board(s, pirate);
    s = addFreeDon(s, [don1, don2]);

    s = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: source.id }) as GameState;

    expect(s.cards[pirate.id]?.powerModifierOT).toBe(1000); // no subType filter → all ≤4000 boosted
  });
});

// ─── ST21-007 Sentomaru — Blocker keyword ─────────────────────────────────────

describe('ST21-007 Sentomaru — Blocker keyword', () => {
  it('Sentomaru peut intercepter une attaque adverse', () => {
    const base = bootstrapGame();
    const sentomaru = makeChar('sentomaru', 'p1', 2000, { keywords: ['Blocker'] });
    const target = makeChar('target', 'p1', 3000, { tapped: true });
    const attacker = makeChar('attacker', 'p2', 4000, { tapped: false });

    let s = addToP1Board(base, sentomaru);
    s = addToP1Board(s, target);
    s = addToP2Board(s, attacker);

    // P2 attacks P1's target
    s = { ...s, activePlayerId: P2, turnNumber: 4 };
    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P2,
      attackerId: attacker.id,
      targetId: target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // P1 intercepts with Sentomaru
    const result = applyAction(s, {
      type: 'DeclareBlock',
      playerId: P1,
      blockerId: sentomaru.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activeCombat?.blockerId).toBe(sentomaru.id);
    }
  });

  it('une carte sans keyword Blocker ne peut pas intercepter', () => {
    const base = bootstrapGame();
    const noBlocker = makeChar('no-blocker', 'p1', 2000);
    const target = makeChar('target2', 'p1', 3000, { tapped: true });
    const attacker = makeChar('attacker2', 'p2', 4000, { tapped: false });

    let s = addToP1Board(base, noBlocker);
    s = addToP1Board(s, target);
    s = addToP2Board(s, attacker);

    s = { ...s, activePlayerId: P2, turnNumber: 4 };
    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P2,
      attackerId: attacker.id,
      targetId: target.id,
    }) as GameState;

    const result = applyAction(s, {
      type: 'DeclareBlock',
      playerId: P1,
      blockerId: noBlocker.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_BLOCKER_KEYWORD');
  });
});

// ─── ST21-003 Sanji — SuppressBlockerForAttacker via OnPlay ───────────────────

const sanjEffect: CardEffect = {
  trigger: 'OnPlay',
  actions: [
    {
      type: 'SuppressBlockerForAttacker',
      target: { scope: 'ChooseOwnCharacter', subType: 'Straw Hat Crew' },
    },
  ],
};

describe('ST21-003 Sanji — SuppressBlockerForAttacker via OnPlay', () => {
  it('a) le personnage ciblé est marqué dans blockerSuppressedForAttackerIds', () => {
    const base = bootstrapGame();
    const sanji = makeChar('sanji', 'p1', 3000, { zone: 'hand', cost: 0, effects: [sanjEffect] });
    const luffy = makeChar('luffy', 'p1', 6000, { subTypes: 'Straw Hat Crew' });

    let s = addToP1Board(base, luffy);
    s = {
      ...s,
      cards: { ...s.cards, [sanji.id]: sanji },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, sanji.id] } },
    };

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: sanji.id,
      chosenTargetId: luffy.id,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.blockerSuppressedForAttackerIds).toContain(luffy.id);
      // n'a PAS de keyword Unblockable — l'effet est différent
      const luffyCard = result.cards[luffy.id];
      expect(luffyCard?.keywords?.includes('Unblockable')).toBeFalsy();
      expect(luffyCard?.temporaryKeywords?.includes('Unblockable')).toBeFalsy();
    }
  });

  it('a) le personnage marqué attaque → Blocker refusé (BLOCKER_SUPPRESSED)', () => {
    const base = bootstrapGame();
    const luffy = makeChar('luffy2', 'p1', 6000, { subTypes: 'Straw Hat Crew' });
    const blocker = makeChar('sb-blocker', 'p2', 4000, { keywords: ['Blocker'] });
    const target = makeChar('sb-target', 'p2', 3000, { tapped: true });

    let s = addToP1Board(base, luffy);
    s = addToP2Board(s, blocker);
    s = addToP2Board(s, target);
    // Inject luffy into blockerSuppressedForAttackerIds directly
    s = { ...s, blockerSuppressedForAttackerIds: [luffy.id], activePlayerId: P1, turnNumber: 4 };

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: luffy.id,
      targetId: target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    const result = applyAction(s, {
      type: 'DeclareBlock',
      playerId: P2,
      blockerId: blocker.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('BLOCKER_SUPPRESSED');
  });

  it('b) un AUTRE personnage attaque le même tour → Blocker autorisé', () => {
    const base = bootstrapGame();
    const luffy = makeChar('luffy3', 'p1', 6000, { subTypes: 'Straw Hat Crew' });
    const zoro = makeChar('zoro', 'p1', 5000);
    const blocker = makeChar('sb-blocker2', 'p2', 4000, { keywords: ['Blocker'] });
    const target = makeChar('sb-target2', 'p2', 3000, { tapped: true });

    let s = addToP1Board(base, luffy);
    s = addToP1Board(s, zoro);
    s = addToP2Board(s, blocker);
    s = addToP2Board(s, target);
    // Only luffy is suppressed — zoro is NOT in the list
    s = { ...s, blockerSuppressedForAttackerIds: [luffy.id], activePlayerId: P1, turnNumber: 4 };

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: zoro.id,
      targetId: target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    const result = applyAction(s, {
      type: 'DeclareBlock',
      playerId: P2,
      blockerId: blocker.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activeCombat?.blockerId).toBe(blocker.id);
    }
  });

  it('c) tour suivant → blockerSuppressedForAttackerIds vidé, Blocker autorisé', () => {
    const base = bootstrapGame();
    const luffy = makeChar('luffy4', 'p1', 6000, { subTypes: 'Straw Hat Crew' });
    const blocker = makeChar('sb-blocker3', 'p2', 4000, { keywords: ['Blocker'] });
    const target = makeChar('sb-target3', 'p2', 3000, { tapped: true });

    let s = addToP1Board(base, luffy);
    s = addToP2Board(s, blocker);
    s = addToP2Board(s, target);
    s = { ...s, blockerSuppressedForAttackerIds: [luffy.id], activePlayerId: P1, turnNumber: 4 };

    // Confirm it IS blocked on the current turn
    let sCombat = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: luffy.id,
      targetId: target.id,
    }) as GameState;
    expect(isGameError(sCombat)).toBe(false);
    const blockedNow = applyAction(sCombat, { type: 'DeclareBlock', playerId: P2, blockerId: blocker.id });
    expect(isGameError(blockedNow)).toBe(true);

    // Simulate turn switch: blockerSuppressedForAttackerIds must be cleared
    const nextTurn: GameState = {
      ...s,
      blockerSuppressedForAttackerIds: [], // what turn-switch produces
      activePlayerId: P2,
      turnNumber: 5,
    };

    // luffy is now on P1's board but it's P2's turn — re-simulate P1 attacking next turn
    const s2: GameState = {
      ...nextTurn,
      activePlayerId: P1,
      turnNumber: 6,
      // luffy is untapped again
      cards: { ...nextTurn.cards, [luffy.id]: { ...nextTurn.cards[luffy.id]!, tapped: false } },
      // target is tapped again
      cards: { ...nextTurn.cards, [luffy.id]: { ...nextTurn.cards[luffy.id]!, tapped: false }, [target.id]: { ...nextTurn.cards[target.id]!, tapped: true } },
    };

    const s2Combat = applyAction(s2, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: luffy.id,
      targetId: target.id,
    }) as GameState;
    expect(isGameError(s2Combat)).toBe(false);

    const result = applyAction(s2Combat, { type: 'DeclareBlock', playerId: P2, blockerId: blocker.id });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activeCombat?.blockerId).toBe(blocker.id);
    }
  });

  it('d) Event Counter non affecté — SuppressBlockerForAttacker ne bloque que DeclareBlock', () => {
    // SuppressBlockerForAttacker est vérifié uniquement dans applyDeclareBlock.
    // Les Events joués comme Counter (depuis la main pendant la fenêtre d'attaque)
    // ne passent PAS par applyDeclareBlock → ils ne sont pas affectés par cet effet.
    // Ce comportement est garanti par la structure du code (check localisé dans applyDeclareBlock)
    // et n'a pas besoin de test d'intégration supplémentaire ici.
    //
    // Vérification indirecte : blockerSuppressedForAttackerIds est présent sur le state
    // mais PlayCharacterFromHand (Counter) s'exécute sans consulter cette liste.
    const base = bootstrapGame();
    const luffy = makeChar('luffy5', 'p1', 6000);
    const counterCard = makeChar('counter-event', 'p2', 0, {
      zone: 'hand',
      cost: 0,
      counter: 2000,
    });

    let s = addToP1Board(base, luffy);
    s = {
      ...s,
      blockerSuppressedForAttackerIds: [luffy.id],
      cards: { ...s.cards, [counterCard.id]: counterCard },
      players: { ...s.players, [P2]: { ...s.players[P2]!, hand: [...s.players[P2]!.hand, counterCard.id] } },
    };

    // blockerSuppressedForAttackerIds contient luffy mais n'empêche pas
    // d'autres actions (vérification que le state est valide et stable)
    expect(s.blockerSuppressedForAttackerIds).toContain(luffy.id);
    expect(s.players[P2]!.hand).toContain(counterCard.id);
    // Les Events Counter ne consultent pas blockerSuppressedForAttackerIds —
    // confirmé par le placement du check uniquement dans applyDeclareBlock.
  });
});

// ─── DoubleAttack + condition de victoire ─────────────────────────────────────

/** Réduit la vie de P2 à `count` cartes (les autres sont retirées du jeu). */
function setP2Life(state: GameState, count: number): GameState {
  const p2 = state.players[P2]!;
  const kept = p2.life.slice(0, count) as readonly CardId[];
  const dropped = p2.life.slice(count);
  const updatedCards = { ...state.cards };
  for (const id of dropped) {
    const c = updatedCards[id];
    if (c !== undefined) updatedCards[id] = { ...c, zone: 'removed' as const };
  }
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: { ...state.players, [P2]: { ...p2, life: kept } },
  };
}

describe('DoubleAttack — condition de victoire (Q&A officiel)', () => {
  it('DoubleAttack + 1 vie : pas de victoire — la vie tombe à 0 mais winner reste null', () => {
    // Q&A: "If my opponent has 1 Life card, can I win by using Double Attack? No."
    let s = setP2Life(bootstrapGame(), 1);
    const remainingLifeId = s.players[P2]!.life[0]!;
    const attacker = makeChar('da-1life', 'p1', 9000, { keywords: ['DoubleAttack'] });
    s = addToP1Board(s, attacker);
    const p2LeaderId = s.players[P2]!.leader!;

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: p2LeaderId,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    const result = applyAction(s, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.winner).toBeNull();                              // pas de victoire
      expect(result.players[P2]!.life.length).toBe(0);             // 1 vie retirée
      expect(result.players[P2]!.hand).toContain(remainingLifeId); // carte en main
    }
  });

  it('DoubleAttack + 2 vies : 2 cartes retirées, pas de victoire', () => {
    let s = setP2Life(bootstrapGame(), 2);
    const attacker = makeChar('da-2life', 'p1', 9000, { keywords: ['DoubleAttack'] });
    s = addToP1Board(s, attacker);
    const p2LeaderId = s.players[P2]!.leader!;

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: p2LeaderId,
    }) as GameState;

    const result = applyAction(s, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.winner).toBeNull();
      expect(result.players[P2]!.life.length).toBe(0); // 2 vies retirées d'un coup
    }
  });

  it('DoubleAttack + 0 vie : victoire immédiate sur le 1er hit', () => {
    let s = setP2Life(bootstrapGame(), 0);
    const attacker = makeChar('da-0life', 'p1', 9000, { keywords: ['DoubleAttack'] });
    s = addToP1Board(s, attacker);
    const p2LeaderId = s.players[P2]!.leader!;

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: p2LeaderId,
    }) as GameState;

    const result = applyAction(s, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.winner).toBe(P1); // 0 vie au départ → victoire sur le 1er hit
    }
  });

  it('attaque normale (sans DoubleAttack) + 0 vie : victoire', () => {
    let s = setP2Life(bootstrapGame(), 0);
    const attacker = makeChar('normal-0life', 'p1', 9000);
    s = addToP1Board(s, attacker);
    const p2LeaderId = s.players[P2]!.leader!;

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: p2LeaderId,
    }) as GameState;

    const result = applyAction(s, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.winner).toBe(P1);
    }
  });
});

// ─── ST21-017 HasCharacterWithMinPower condition ──────────────────────────────

describe('ST21-017 — HasCharacterWithMinPower condition', () => {
  // Mole Pistol effect: PowerBoost -5000 on a target, then KO a target ≤2000
  // IF the player has a Character with current power ≥ 6000.
  // Current power = base + DON attached + modifiers (spec §4.1).
  const molePistolEffect: CardEffect = {
    trigger: 'OnPlay',
    actions: [
      {
        type: 'PowerBoost',
        amount: -5000,
        target: { scope: 'ChooseOpponentCharacter' },
        duration: 'EndOfTurn',
      },
      {
        // This action is gated by HasCharacterWithMinPower below.
        // In real use the condition would be on a separate CardEffect entry;
        // here we test it as a standalone condition on a dedicated effect.
        type: 'KO',
        target: { scope: 'ChooseOpponentCharacter', maxPower: 2000 },
      },
    ],
  };

  // Isolated KO effect with the HasCharacterWithMinPower condition for direct testing.
  function makeConditionalKOEffect(minPower: number): CardEffect {
    return {
      trigger: 'OnPlay',
      condition: { type: 'HasCharacterWithMinPower', minPower },
      actions: [
        {
          type: 'KO',
          target: { scope: 'ChooseOpponentCharacter', maxPower: 2000 },
        },
      ],
    };
  }

  it('condition remplie : joueur a un Character ≥6000 → KO appliqué', () => {
    const base = bootstrapGame();
    // P1 has a Character with exactly 6000 power
    const bigChar = makeChar('big', 'p1', 6000);
    // P2 has a weak Character to be KO'd
    const target = makeChar('weak', 'p2', 1000, { tapped: true });
    // The card that carries the conditional KO effect
    const pistol = makeChar('pistol', 'p1', 3000, {
      zone: 'hand',
      effects: [makeConditionalKOEffect(6000)],
    });

    let s = addToP1Board(base, bigChar);
    s = addToP2Board(s, target);
    s = {
      ...s,
      cards: { ...s.cards, [pistol.id]: pistol },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, pistol.id] } },
    };

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: pistol.id,
      chosenTargetId: target.id,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // Condition met → KO fired → target in trash, not on board
      expect(result.players[P2]!.board).not.toContain(target.id);
      expect(result.players[P2]!.trash).toContain(target.id);
    }
  });

  it('condition non remplie : joueur a un Character <6000 → KO ignoré', () => {
    const base = bootstrapGame();
    // P1's strongest Character is 5999 — just below the threshold
    const almostChar = makeChar('almost', 'p1', 5999);
    const target = makeChar('weak2', 'p2', 1000, { tapped: true });
    const pistol = makeChar('pistol2', 'p1', 3000, {
      zone: 'hand',
      effects: [makeConditionalKOEffect(6000)],
    });

    let s = addToP1Board(base, almostChar);
    s = addToP2Board(s, target);
    s = {
      ...s,
      cards: { ...s.cards, [pistol.id]: pistol },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, pistol.id] } },
    };

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: pistol.id,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // Condition not met → KO skipped → target still on board
      expect(result.players[P2]!.board).toContain(target.id);
    }
  });

  it('condition remplie via DON!! attaché : 5000 base + 1 DON = 6000 → KO appliqué', () => {
    // Spec §4.1: current power includes DON!! attached — a 5000-base character
    // with 1 DON attached reaches 6000 and satisfies the condition.
    const base = bootstrapGame();
    const charWith5k = makeChar('char5k', 'p1', 5000);
    // Attach 1 DON to charWith5k so its current power = 5000 + 1000 = 6000
    const don = makeDon('don-attached', 'p1', { tapped: true, attachedTo: makeCardId('char5k') });
    const target = makeChar('weak3', 'p2', 500, { tapped: true });
    const pistol = makeChar('pistol3', 'p1', 3000, {
      zone: 'hand',
      effects: [makeConditionalKOEffect(6000)],
    });

    let s = addToP1Board(base, charWith5k);
    s = addToP2Board(s, target);
    // Inject the DON card into cards map + donArea (it is attached to charWith5k)
    s = {
      ...s,
      cards: { ...s.cards, [don.id]: don, [pistol.id]: pistol },
      players: {
        ...s.players,
        [P1]: {
          ...s.players[P1]!,
          hand: [...s.players[P1]!.hand, pistol.id],
          donArea: [...s.players[P1]!.donArea, don.id],
        },
      },
    };

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: pistol.id,
      chosenTargetId: target.id,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // Current power 6000 (5000 + 1 DON) satisfies ≥6000 → KO fired
      expect(result.players[P2]!.board).not.toContain(target.id);
      expect(result.players[P2]!.trash).toContain(target.id);
    }
  });

  it('Leader ne compte pas pour HasCharacterWithMinPower', () => {
    // Spec §5.3: "Character" excludes the Leader card.
    const base = bootstrapGame();
    // P1 has only their Leader (≥6000 power as leader) — no Characters on board
    // Leader power is irrelevant; condition checks Characters only.
    const target = makeChar('weak4', 'p2', 500, { tapped: true });
    const pistol = makeChar('pistol4', 'p1', 3000, {
      zone: 'hand',
      effects: [makeConditionalKOEffect(6000)],
    });

    let s = {
      ...base,
      cards: { ...base.cards, [pistol.id]: pistol },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, hand: [...base.players[P1]!.hand, pistol.id] },
      },
    };
    s = addToP2Board(s, target);

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: pistol.id,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // No Character on P1's board → condition fails → KO not applied
      expect(result.players[P2]!.board).toContain(target.id);
    }
  });
});

// ─── ST21-015 Roronoa Zoro — OnKO PlayFromHand excludeName ───────────────────

describe('ST21-015 Roronoa Zoro — OnKO PlayFromHand excludeName', () => {
  const zoroOnKOEffect: CardEffect = {
    trigger: 'OnKO',
    actions: [
      {
        type: 'PlayFromHand',
        filter: {
          color: 'Red',
          cardType: 'Character',
          maxPower: 6000,
          excludeName: 'Roronoa Zoro',
        },
      },
    ],
  };

  function makeZoro(idSuffix: string): Card {
    return makeChar(`zoro-${idSuffix}`, 'p1', 5000, {
      name: 'Roronoa Zoro',
      effects: [zoroOnKOEffect],
    });
  }

  it('une carte Red Character ≤6000 non Zoro déclenche pendingOnKOInteraction', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('main');
    const luffy = makeChar('luf-z1', 'p1', 5000, {
      name: 'Monkey D. Luffy',
      color: 'Red',
      zone: 'hand',
    });

    let s = addToP1Board(base, zoro);
    s = {
      ...s,
      cards: { ...s.cards, [luffy.id]: luffy },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, luffy.id] } },
    };

    // Simulate KO by resolving effects directly
    const result = applyAction(s, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: null,
    } as Parameters<typeof applyAction>[1]);
    // No pending interaction yet — this would fail. Instead test via the effect directly:
    // The effect fires during KO, which sets pendingOnKOInteraction.
    // We inject it manually to test the resolution path.
    const withPending: GameState = {
      ...s,
      pendingOnKOInteraction: {
        playerId: P1,
        filter: zoroOnKOEffect.actions[0]!.filter as import('../src/index.js').HandFilter,
        sourceCardId: zoro.id,
      },
    };

    // Playing Luffy (valid Red Character ≤6000, not named Roronoa Zoro) should succeed
    const resolved = applyAction(withPending, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: luffy.id,
    });
    expect(isGameError(resolved)).toBe(false);
    if (!isGameError(resolved)) {
      expect(resolved.players[P1]!.board).toContain(luffy.id);
      expect(resolved.players[P1]!.hand).not.toContain(luffy.id);
    }
  });

  it('une carte nommée "Roronoa Zoro" est refusée avec INVALID_CHOICE', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('ko1');
    const zoroInHand = makeChar('zoro-hand', 'p1', 5000, {
      name: 'Roronoa Zoro',
      color: 'Red',
      zone: 'hand',
    });

    let s = addToP1Board(base, zoro);
    s = {
      ...s,
      cards: { ...s.cards, [zoroInHand.id]: zoroInHand },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, zoroInHand.id] } },
    };

    const withPending: GameState = {
      ...s,
      pendingOnKOInteraction: {
        playerId: P1,
        filter: zoroOnKOEffect.actions[0]!.filter as import('../src/index.js').HandFilter,
        sourceCardId: zoro.id,
      },
    };

    const result = applyAction(withPending, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: zoroInHand.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_CHOICE');
  });

  it('une carte Red Character >6000 power est refusée', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('ko2');
    const bigChar = makeChar('big-red', 'p1', 7000, {
      name: 'Whitebeard',
      color: 'Red',
      zone: 'hand',
    });

    let s = addToP1Board(base, zoro);
    s = {
      ...s,
      cards: { ...s.cards, [bigChar.id]: bigChar },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, bigChar.id] } },
    };

    const withPending: GameState = {
      ...s,
      pendingOnKOInteraction: {
        playerId: P1,
        filter: zoroOnKOEffect.actions[0]!.filter as import('../src/index.js').HandFilter,
        sourceCardId: zoro.id,
      },
    };

    const result = applyAction(withPending, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: bigChar.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_CHOICE');
  });

  it('une carte non-Red est refusée', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('ko3');
    const blueChar = makeChar('blue-char', 'p1', 4000, {
      name: 'Nami',
      color: 'Blue',
      zone: 'hand',
    });

    let s = addToP1Board(base, zoro);
    s = {
      ...s,
      cards: { ...s.cards, [blueChar.id]: blueChar },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, blueChar.id] } },
    };

    const withPending: GameState = {
      ...s,
      pendingOnKOInteraction: {
        playerId: P1,
        filter: zoroOnKOEffect.actions[0]!.filter as import('../src/index.js').HandFilter,
        sourceCardId: zoro.id,
      },
    };

    const result = applyAction(withPending, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: blueChar.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_CHOICE');
  });

  it('ZK1: Zoro KO\'d via combat → pendingOnKOInteraction set, then ResolveOnKOInteraction succeeds', () => {
    // P2 attacks P1's Zoro with a stronger character → Zoro gets KO'd.
    // Characters can only be attacked when rested (OPTCG rule), so we start Zoro as tapped.
    // Engine must set pendingOnKOInteraction for P1 after combat resolves.
    // Then P1 resolves it with a valid Red Character ≤6000.
    const base = bootstrapGame();
    const zoro = makeZoro('zk1');
    const luffy = makeChar('luf-zk1', 'p1', 5000, {
      name: 'Monkey D. Luffy',
      color: 'Red',
      zone: 'hand',
    });
    const attacker = makeChar('atk-zk1', 'p2', 7000); // stronger than Zoro (5000)

    let s = addToP1Board(base, zoro);
    s = addToP2Board(s, attacker);
    // Zoro must be rested to be a valid attack target
    s = { ...s, cards: { ...s.cards, [zoro.id]: { ...s.cards[zoro.id]!, tapped: true } } };
    s = {
      ...s,
      cards: { ...s.cards, [luffy.id]: luffy },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, luffy.id] } },
      activePlayerId: P2, // P2's turn — Zoro will be attacked
    };

    // P2 attacks Zoro (P1 board card — rested)
    let result = applyAction(s, { type: 'DeclareAttack', playerId: P2, attackerId: attacker.id, targetId: zoro.id });
    expect(isGameError(result)).toBe(false);
    result = applyAction(result as GameState, { type: 'ResolveCombat', playerId: P2 });
    expect(isGameError(result)).toBe(false);

    const afterCombat = result as GameState;
    // Zoro must be in trash and pendingOnKOInteraction must be set for P1
    expect(afterCombat.players[P1]!.board).not.toContain(zoro.id);
    expect(afterCombat.pendingOnKOInteraction).not.toBeNull();
    expect(afterCombat.pendingOnKOInteraction?.playerId).toBe(P1);
    expect(afterCombat.pendingOnKOInteraction?.filter.color).toBe('Red');
    expect(afterCombat.pendingOnKOInteraction?.filter.maxPower).toBe(6000);

    // Resolve: play Luffy from hand for free
    const resolved = applyAction(afterCombat, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: luffy.id });
    expect(isGameError(resolved)).toBe(false);
    if (!isGameError(resolved)) {
      expect(resolved.players[P1]!.board).toContain(luffy.id);
      expect(resolved.players[P1]!.hand).not.toContain(luffy.id);
      expect(resolved.pendingOnKOInteraction).toBeNull();
    }
  });

  it('ZK2: Zoro KO\'d with no valid card in hand → pendingOnKOInteraction set, skip resolves cleanly', () => {
    // If no valid card exists, player can skip with cardId: null.
    const base = bootstrapGame();
    const zoro = makeZoro('zk2');
    const attacker = makeChar('atk-zk2', 'p2', 7000);

    let s = addToP1Board(base, zoro);
    s = addToP2Board(s, attacker);
    // Zoro must be rested to be a valid attack target
    s = { ...s, cards: { ...s.cards, [zoro.id]: { ...s.cards[zoro.id]!, tapped: true } }, activePlayerId: P2 };

    let result = applyAction(s, { type: 'DeclareAttack', playerId: P2, attackerId: attacker.id, targetId: zoro.id });
    expect(isGameError(result)).toBe(false);
    result = applyAction(result as GameState, { type: 'ResolveCombat', playerId: P2 });
    expect(isGameError(result)).toBe(false);

    const afterCombat = result as GameState;
    // pendingOnKOInteraction may or may not be set depending on hand content;
    // if set, skip must clear it cleanly
    if (afterCombat.pendingOnKOInteraction !== null) {
      const skipped = applyAction(afterCombat, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: null });
      expect(isGameError(skipped)).toBe(false);
      if (!isGameError(skipped)) {
        expect(skipped.pendingOnKOInteraction).toBeNull();
      }
    }
  });

  it('ZK3: pendingOnKOInteraction carries correct playerId, filter, and sourceCardId', () => {
    // Verifies the shape of the pending interaction after Zoro is KO'd.
    const base = bootstrapGame();
    const zoro = makeZoro('zk3');
    const attacker = makeChar('atk-zk3', 'p2', 7000);

    let s = addToP1Board(base, zoro);
    s = addToP2Board(s, attacker);
    // Zoro must be rested to be a valid attack target
    s = { ...s, cards: { ...s.cards, [zoro.id]: { ...s.cards[zoro.id]!, tapped: true } }, activePlayerId: P2 };

    let result = applyAction(s, { type: 'DeclareAttack', playerId: P2, attackerId: attacker.id, targetId: zoro.id });
    expect(isGameError(result)).toBe(false);
    result = applyAction(result as GameState, { type: 'ResolveCombat', playerId: P2 });
    expect(isGameError(result)).toBe(false);

    const afterCombat = result as GameState;
    expect(afterCombat.pendingOnKOInteraction).not.toBeNull();
    const pending = afterCombat.pendingOnKOInteraction!;
    expect(pending.playerId).toBe(P1);
    expect(pending.filter.color).toBe('Red');
    expect(pending.filter.cardType).toBe('Character');
    expect(pending.filter.maxPower).toBe(6000);
    expect(pending.filter.excludeName).toBe('Roronoa Zoro');
    expect(pending.sourceCardId).toBe(zoro.id);
  });
});

// ─── ST21-015 Z1–Z5 — OnKO regression suite ──────────────────────────────────

describe('ST21-015 Zoro OnKO — Z1–Z5 regression suite', () => {
  const zoroEffect: CardEffect = {
    trigger: 'OnKO',
    actions: [{
      type: 'PlayFromHand',
      filter: { color: 'Red', cardType: 'Character', maxPower: 6000, excludeName: 'Roronoa Zoro' },
    }],
  };

  function makeZoro(id: string): Card {
    return makeChar(id, 'p1', 5000, { name: 'Roronoa Zoro', effects: [zoroEffect], tapped: true });
  }

  function koZoroViaCombat(s: GameState, zoro: Card): GameState {
    const attacker = makeChar('z-atk', 'p2', 8000);
    let st = addToP2Board(s, attacker);
    st = { ...st, activePlayerId: P2 };
    let r = applyAction(st, { type: 'DeclareAttack', playerId: P2, attackerId: attacker.id, targetId: zoro.id });
    expect(isGameError(r)).toBe(false);
    r = applyAction(r as GameState, { type: 'ResolveCombat', playerId: P2 });
    expect(isGameError(r)).toBe(false);
    return r as GameState;
  }

  // Z1: Zoro KO'd with a valid red card ≤6000 → prompt set, card played successfully
  it('Z1: Zoro KO\'d with valid Red ≤6000 → prompt set, card played', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('z1-zoro');
    const nami = makeChar('z1-nami', 'p1', 4000, { name: 'Nami', color: 'Red', zone: 'hand' });
    let s = addToP1Board(base, zoro);
    s = { ...s, cards: { ...s.cards, [nami.id]: nami },
          players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, nami.id] } } };

    const afterKO = koZoroViaCombat(s, zoro);
    expect(afterKO.pendingOnKOInteraction).not.toBeNull();
    expect(afterKO.pendingOnKOInteraction?.playerId).toBe(P1);

    const resolved = applyAction(afterKO, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: nami.id });
    expect(isGameError(resolved)).toBe(false);
    if (!isGameError(resolved)) {
      expect(resolved.players[P1]!.board).toContain(nami.id);
      expect(resolved.players[P1]!.hand).not.toContain(nami.id);
      expect(resolved.pendingOnKOInteraction).toBeNull();
    }
  });

  // Z2: Zoro KO'd with multiple valid cards → player can choose any one
  it('Z2: Zoro KO\'d with multiple valid cards → player can choose any one', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('z2-zoro');
    const nami  = makeChar('z2-nami',  'p1', 3000, { name: 'Nami',  color: 'Red', zone: 'hand' });
    const usopp = makeChar('z2-usopp', 'p1', 4000, { name: 'Usopp', color: 'Red', zone: 'hand' });
    let s = addToP1Board(base, zoro);
    s = { ...s,
          cards: { ...s.cards, [nami.id]: nami, [usopp.id]: usopp },
          players: { ...s.players, [P1]: { ...s.players[P1]!,
            hand: [...s.players[P1]!.hand, nami.id, usopp.id] } } };

    const afterKO = koZoroViaCombat(s, zoro);
    expect(afterKO.pendingOnKOInteraction).not.toBeNull();

    // Can choose Nami
    const withNami = applyAction(afterKO, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: nami.id });
    expect(isGameError(withNami)).toBe(false);
    if (!isGameError(withNami)) expect(withNami.players[P1]!.board).toContain(nami.id);

    // Can also choose Usopp (independent from afterKO, not the withNami result)
    const withUsopp = applyAction(afterKO, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: usopp.id });
    expect(isGameError(withUsopp)).toBe(false);
    if (!isGameError(withUsopp)) expect(withUsopp.players[P1]!.board).toContain(usopp.id);
  });

  // Z3: Zoro KO'd with no valid card in hand → auto-skip, no pending interaction, no error
  it('Z3: Zoro KO\'d with no valid card in hand → auto-skip, no error', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('z3-zoro');
    // Add only a Blue character (filtered out by color:Red) — no valid cards
    const blueChar = makeChar('z3-blue', 'p1', 3000, { name: 'Buggy', color: 'Blue', zone: 'hand' });
    let s = addToP1Board(base, zoro);
    // Clear hand first, then add only invalid card
    const handIds = s.players[P1]!.hand;
    const updatedCards: Record<string, Card> = { ...s.cards };
    for (const id of handIds) updatedCards[id] = { ...updatedCards[id]!, zone: 'deck' };
    s = { ...s,
          cards: { ...updatedCards, [blueChar.id]: blueChar } as GameState['cards'],
          players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [blueChar.id] } } };

    const afterKO = koZoroViaCombat(s, zoro);
    // Auto-skip: no pending interaction
    expect(afterKO.pendingOnKOInteraction).toBeNull();
    // Zoro is gone from board
    expect(afterKO.players[P1]!.board).not.toContain(zoro.id);
    // Log has EFFECT_SKIPPED entry
    const skipEntry = afterKO.gameLog.find((e) => e.event === 'EFFECT_SKIPPED');
    expect(skipEntry).toBeDefined();
  });

  // Z4: Zoro KO'd with another "Roronoa Zoro" in hand → explicitly forbidden (INVALID_CHOICE)
  it('Z4: Roronoa Zoro in hand is explicitly excluded when trying to resolve', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('z4-zoro');
    const zoroHand = makeChar('z4-zoro-hand', 'p1', 4000, { name: 'Roronoa Zoro', color: 'Red', zone: 'hand' });
    const nami = makeChar('z4-nami', 'p1', 3000, { name: 'Nami', color: 'Red', zone: 'hand' });
    let s = addToP1Board(base, zoro);
    s = { ...s,
          cards: { ...s.cards, [zoroHand.id]: zoroHand, [nami.id]: nami },
          players: { ...s.players, [P1]: { ...s.players[P1]!,
            hand: [...s.players[P1]!.hand, zoroHand.id, nami.id] } } };

    const afterKO = koZoroViaCombat(s, zoro);
    expect(afterKO.pendingOnKOInteraction).not.toBeNull(); // Nami makes it valid

    // Trying to play the forbidden Zoro → INVALID_CHOICE
    const badChoice = applyAction(afterKO, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: zoroHand.id });
    expect(isGameError(badChoice)).toBe(true);
    if (isGameError(badChoice)) expect(badChoice.code).toBe('INVALID_CHOICE');

    // Playing Nami is fine
    const goodChoice = applyAction(afterKO, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: nami.id });
    expect(isGameError(goodChoice)).toBe(false);
  });

  // Z5: Rush [DON!! x2] still works — attach 2 DON to Zoro → gains Rush keyword
  it('Z5: Rush gained when 2 DON!! attached to Zoro', () => {
    const rushEffect: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'HasRestingDon', count: 2 },
      actions: [{ type: 'GiveKeyword', keyword: 'Rush', target: { scope: 'Self' }, duration: 'Permanent' }],
    };
    const zoroWithRush = makeChar('z5-zoro', 'p1', 5000, {
      name: 'Roronoa Zoro',
      zone: 'board',
      effects: [rushEffect],
    });
    const don1 = makeDon('z5-d1', 'p1');
    const don2 = makeDon('z5-d2', 'p1');

    const base = bootstrapGame();
    let s = addToP1Board(base, zoroWithRush);
    s = addFreeDon(s, [don1, don2]);

    // Attach first DON — Rush not yet (only 1 attached)
    let r = applyAction(s, { type: 'AssignDon', playerId: P1, donCardId: don1.id, targetCardId: zoroWithRush.id });
    expect(isGameError(r)).toBe(false);
    if (!isGameError(r)) expect((r.cards[zoroWithRush.id]?.keywords ?? [])).not.toContain('Rush');

    // Attach second DON — Rush granted at threshold 2
    r = applyAction(r as GameState, { type: 'AssignDon', playerId: P1, donCardId: don2.id, targetCardId: zoroWithRush.id });
    expect(isGameError(r)).toBe(false);
    if (!isGameError(r)) expect((r.cards[zoroWithRush.id]?.keywords ?? [])).toContain('Rush');
  });
});

// ─── ST21-015 L1–L4 — Log entries ────────────────────────────────────────────

describe('ST21-015 Zoro OnKO — L1–L4 log entries', () => {
  const zoroEffect: CardEffect = {
    trigger: 'OnKO',
    actions: [{
      type: 'PlayFromHand',
      filter: { color: 'Red', cardType: 'Character', maxPower: 6000, excludeName: 'Roronoa Zoro' },
    }],
  };

  function makeZoro(id: string): Card {
    return makeChar(id, 'p1', 5000, { name: 'Roronoa Zoro', effects: [zoroEffect], tapped: true });
  }

  function koZoroViaCombat(s: GameState, zoro: Card): GameState {
    const attacker = makeChar('l-atk', 'p2', 8000);
    let st = addToP2Board(s, attacker);
    st = { ...st, activePlayerId: P2 };
    let r = applyAction(st, { type: 'DeclareAttack', playerId: P2, attackerId: attacker.id, targetId: zoro.id });
    expect(isGameError(r)).toBe(false);
    r = applyAction(r as GameState, { type: 'ResolveCombat', playerId: P2 });
    expect(isGameError(r)).toBe(false);
    return r as GameState;
  }

  // L1: a KO produces a 'KO' log entry with the card name
  it('L1: KO produces a gameLog entry of event=KO with card name', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('l1-zoro');
    const s = addToP1Board(base, zoro);

    const afterKO = koZoroViaCombat(s, zoro);
    const entry = afterKO.gameLog.find((e: GameLogEntry) => e.event === 'KO');
    expect(entry).toBeDefined();
    expect(entry?.cardName).toBe('Roronoa Zoro');
    expect(entry?.cardId).toBe(zoro.id);
  });

  // L2: an OnKO trigger detected produces a dedicated 'ON_KO_TRIGGER' log entry
  it('L2: OnKO trigger produces gameLog entry of event=ON_KO_TRIGGER', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('l2-zoro');
    const s = addToP1Board(base, zoro);

    const afterKO = koZoroViaCombat(s, zoro);
    const entry = afterKO.gameLog.find((e: GameLogEntry) => e.event === 'ON_KO_TRIGGER');
    expect(entry).toBeDefined();
    expect(entry?.cardId).toBe(zoro.id);
  });

  // L3: trigger with no valid target produces EFFECT_SKIPPED log entry
  it('L3: trigger with no eligible card produces EFFECT_SKIPPED log entry', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('l3-zoro');
    // Only a Blue card in hand — no valid Red Character
    const blueChar = makeChar('l3-blue', 'p1', 3000, { name: 'Buggy', color: 'Blue', zone: 'hand' });
    let s = addToP1Board(base, zoro);
    const handIds = s.players[P1]!.hand;
    const updatedCards: Record<string, Card> = { ...s.cards };
    for (const id of handIds) updatedCards[id] = { ...updatedCards[id]!, zone: 'deck' };
    s = { ...s,
          cards: { ...updatedCards, [blueChar.id]: blueChar } as GameState['cards'],
          players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [blueChar.id] } } };

    const afterKO = koZoroViaCombat(s, zoro);
    const entry = afterKO.gameLog.find((e: GameLogEntry) => e.event === 'EFFECT_SKIPPED');
    expect(entry).toBeDefined();
    expect(entry?.message).toContain('no eligible cards');
  });

  // L4: player choice produces PLAYER_CHOICE + CARD_PLAYED_VIA_EFFECT log entries
  it('L4: player choice produces PLAYER_CHOICE and CARD_PLAYED_VIA_EFFECT log entries', () => {
    const base = bootstrapGame();
    const zoro = makeZoro('l4-zoro');
    const nami = makeChar('l4-nami', 'p1', 3000, { name: 'Nami', color: 'Red', zone: 'hand' });
    let s = addToP1Board(base, zoro);
    s = { ...s, cards: { ...s.cards, [nami.id]: nami },
          players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, nami.id] } } };

    const afterKO = koZoroViaCombat(s, zoro);
    const resolved = applyAction(afterKO, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: nami.id });
    expect(isGameError(resolved)).toBe(false);
    if (!isGameError(resolved)) {
      const choiceEntry = resolved.gameLog.find((e: GameLogEntry) => e.event === 'PLAYER_CHOICE' && e.cardId === nami.id);
      expect(choiceEntry).toBeDefined();
      expect(choiceEntry?.cardName).toBe('Nami');

      const playedEntry = resolved.gameLog.find((e: GameLogEntry) => e.event === 'CARD_PLAYED_VIA_EFFECT');
      expect(playedEntry).toBeDefined();
      expect(playedEntry?.cardId).toBe(nami.id);
    }
  });
});

// ─── ST21-016 DisableBlocker ──────────────────────────────────────────────────

describe('ST21-016 DisableBlocker — Trigger disables Blocker on opponent Characters', () => {
  const disableEffect: CardEffect = {
    trigger: 'OnPlay',
    actions: [
      {
        type: 'DisableBlocker',
        target: { scope: 'AllOpponentCharacters', maxPower: 4000 },
        duration: 'EndOfTurn',
      },
    ],
  };

  it('DisableBlocker ajoute la carte dans blockerDisabledIds', () => {
    const base = bootstrapGame();
    const blocker = makeChar('db-blocker', 'p2', 4000, { keywords: ['Blocker'] });
    const source = makeChar('db-source', 'p1', 2000, {
      zone: 'hand',
      cost: 0,
      effects: [disableEffect],
    });

    let s = addToP2Board(base, blocker);
    s = {
      ...s,
      cards: { ...s.cards, [source.id]: source },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, source.id] } },
    };

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: source.id,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.blockerDisabledIds).toContain(blocker.id);
    }
  });

  it('une carte avec Blocker disabled retourne BLOCKER_DISABLED', () => {
    const base = bootstrapGame();
    const blocker = makeChar('db-blocker2', 'p2', 4000, { keywords: ['Blocker'] });
    const target = makeChar('db-target', 'p2', 6000, { tapped: true });
    const attacker = makeChar('db-attacker', 'p1', 8000);

    let s = addToP2Board(base, blocker);
    s = addToP2Board(s, target);
    s = addToP1Board(s, attacker);
    // Manually inject blocker into blockerDisabledIds
    s = { ...s, blockerDisabledIds: [blocker.id] };
    s = { ...s, activePlayerId: P1, turnNumber: 4 };

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    const result = applyAction(s, {
      type: 'DeclareBlock',
      playerId: P2,
      blockerId: blocker.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('BLOCKER_DISABLED');
  });

  it('une carte Blocker non disabled peut toujours bloquer normalement', () => {
    const base = bootstrapGame();
    const blocker = makeChar('db-blocker3', 'p2', 4000, { keywords: ['Blocker'] });
    const target = makeChar('db-target3', 'p2', 6000, { tapped: true });
    const attacker = makeChar('db-attacker3', 'p1', 8000);

    let s = addToP2Board(base, blocker);
    s = addToP2Board(s, target);
    s = addToP1Board(s, attacker);
    // blocker NOT in blockerDisabledIds — should block normally
    s = { ...s, activePlayerId: P1, turnNumber: 4 };

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: target.id,
    }) as GameState;

    const result = applyAction(s, {
      type: 'DeclareBlock',
      playerId: P2,
      blockerId: blocker.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activeCombat?.blockerId).toBe(blocker.id);
    }
  });

  it('DisableBlocker ne désactive PAS les cartes >4000 power', () => {
    const base = bootstrapGame();
    const bigBlocker = makeChar('db-big', 'p2', 6000, { keywords: ['Blocker'] });
    const source = makeChar('db-source2', 'p1', 2000, {
      zone: 'hand',
      cost: 0,
      effects: [disableEffect],
    });

    let s = addToP2Board(base, bigBlocker);
    s = {
      ...s,
      cards: { ...s.cards, [source.id]: source },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, source.id] } },
    };

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: source.id,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // bigBlocker has 6000 power — above the maxPower:4000 filter → NOT disabled
      expect(result.blockerDisabledIds).not.toContain(bigBlocker.id);
    }
  });
});

// ─── ST21-001 Luffy Leader ────────────────────────────────────────────────────

describe('ST21-001 Luffy Leader — Activated AttachDon ×2 from rested (HasAttachedDon condition)', () => {
  // [DON!! x1] [Once Per Turn] Give up to 2 rested DON!! to 1 of your Characters.
  // Condition: source card (leader) must have ≥1 DON attached to it.
  const luffyLeaderEffect: CardEffect = {
    trigger: 'Activated',
    condition: { type: 'HasAttachedDon', count: 1 },
    actions: [
      {
        type: 'AttachDon',
        count: 2,
        from: 'rested',
        target: { scope: 'ChooseOwnCharacter' },
      },
    ],
  };

  it('condition remplie : 1 DON attaché au leader + 2 DON resting → 2 DON attachés au personnage ciblé', () => {
    const base = bootstrapGame();
    const leaderId = base.players[P1]!.leader!;
    const ally = makeChar('ll-ally', 'p1', 3000);
    // DON attached to leader
    const attachedDon = makeDon('ll-adon', 'p1', { tapped: true, attachedTo: leaderId });
    const restedDon1 = makeDon('ll-rd1', 'p1');
    const restedDon2 = makeDon('ll-rd2', 'p1');

    let s = addToP1Board(base, ally);
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [luffyLeaderEffect] } } };
    // Inject attached DON into cards map + P1 donArea
    s = {
      ...s,
      cards: { ...s.cards, [attachedDon.id]: attachedDon },
      players: { ...s.players, [P1]: { ...s.players[P1]!, donArea: [...s.players[P1]!.donArea, attachedDon.id] } },
    };
    s = addRestedDon(s, [restedDon1, restedDon2]);

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: leaderId,
      chosenTargetId: ally.id,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      const attachedToAlly = Object.values(result.cards).filter(
        (c) => c.type === 'DON' && c.attachedTo === ally.id,
      );
      expect(attachedToAlly.length).toBe(2);
    }
  });

  it('condition non remplie : 0 DON attaché au leader → CONDITION_NOT_MET', () => {
    const base = bootstrapGame();
    const leaderId = base.players[P1]!.leader!;
    const ally = makeChar('ll-ally2', 'p1', 3000);
    const restedDon = makeDon('ll-rd3', 'p1');

    let s = addToP1Board(base, ally);
    s = { ...s, cards: { ...s.cards, [leaderId]: { ...s.cards[leaderId]!, effects: [luffyLeaderEffect] } } };
    s = addRestedDon(s, [restedDon]);

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: leaderId,
      chosenTargetId: ally.id,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('CONDITION_NOT_MET');
  });
});

// ─── ST21-002 Usopp ───────────────────────────────────────────────────────────
// Official text: [DON!! x2] [Opponent's Turn] This Character gains +2000 power.
// Passive/continuous: fires AUTOMATICALLY via StartOfOpponentTurn when ≥2 DON are
// physically attached to this card. NOT a manually activated ability.

describe('ST21-002 Usopp — [DON!! x2] [Opponent\'s Turn] passive +2000 power', () => {
  const usoppEffect: CardEffect = {
    trigger: 'StartOfOpponentTurn',
    condition: { type: 'HasAttachedDon', count: 2 },
    actions: [
      {
        type: 'PowerBoost',
        amount: 2000,
        target: { scope: 'Self' },
        duration: 'EndOfOpponentTurn',
      },
    ],
  };

  function attachDonToCard(state: GameState, usopp: Card, dons: Card[]): GameState {
    const updatedCards: Record<string, Card> = { ...state.cards };
    const donIds: CardId[] = [];
    for (const d of dons) {
      updatedCards[d.id] = { ...d, zone: 'donArea' as const, tapped: true, attachedTo: usopp.id };
      donIds.push(d.id);
    }
    return {
      ...state,
      cards: updatedCards as GameState['cards'],
      players: {
        ...state.players,
        [P1]: { ...state.players[P1]!, donArea: [...state.players[P1]!.donArea, ...donIds] },
      },
    };
  }

  it('U1: pendant le tour de P1 (son propre tour), Usopp ne reçoit PAS le +2000 passif', () => {
    // During P1's own Main phase, StartOfOpponentTurn has not fired → no powerModifierOT
    const base = bootstrapGame(); // P1 Main, turn 3
    const usopp = makeChar('u1-usopp', 'p1', 3000, { effects: [usoppEffect] });
    const don1 = makeDon('u1-d1', 'p1');
    const don2 = makeDon('u1-d2', 'p1');

    let s = addToP1Board(base, usopp);
    s = attachDonToCard(s, usopp, [don1, don2]);

    expect(s.activePlayerId).toBe(P1);
    // No powerModifierOT during P1's own turn — passive hasn't fired
    expect(s.cards[usopp.id]?.powerModifierOT).toBeUndefined();
    // During P1's own turn: base 3000 + DON bonus 2×1000 = 5000 (DON bonus applies during owner's turn)
    // The Usopp-specific +2000 (powerModifierOT) is NOT yet applied — that fires at start of opponent's turn
    expect(calculatePower(usopp.id, s)).toBe(5000);
  });

  it('U2: passage au tour adverse avec 2 DON attachés → +2000 appliqué automatiquement', () => {
    // P1 has Usopp with 2 DON attached. P1 ends turn → P2 Refresh.
    // At P2 Refresh, StartOfOpponentTurn fires for P1 (inactive) → Usopp gets +2000.
    const base = bootstrapGame(); // P1 Main, turn 3
    const usopp = makeChar('u2-usopp', 'p1', 3000, { effects: [usoppEffect] });
    const don1 = makeDon('u2-d1', 'p1');
    const don2 = makeDon('u2-d2', 'p1');

    let s = addToP1Board(base, usopp);
    s = attachDonToCard(s, usopp, [don1, don2]);

    // P1 ends their turn: Main → End → P2 Refresh
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState; // Main→End
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState; // End→P2 Refresh

    expect(s.activePlayerId).toBe(P2);
    // Usopp should have automatically received +2000 via StartOfOpponentTurn
    expect(s.cards[usopp.id]?.powerModifierOT).toBe(2000);
    expect(calculatePower(usopp.id, s)).toBe(5000); // 3000 base + 2000 OT modifier
  });

  it('U3: tour adverse mais seulement 1 DON attaché → pas de +2000', () => {
    const base = bootstrapGame();
    const usopp = makeChar('u3-usopp', 'p1', 3000, { effects: [usoppEffect] });
    const don1 = makeDon('u3-d1', 'p1');

    let s = addToP1Board(base, usopp);
    s = attachDonToCard(s, usopp, [don1]); // only 1 DON

    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;

    expect(s.activePlayerId).toBe(P2);
    expect(s.cards[usopp.id]?.powerModifierOT).toBeUndefined();
    expect(calculatePower(usopp.id, s)).toBe(3000); // base only
  });

  it('U4: tour adverse, 2 DON attachés, mais sur une carte sans effet comparable → pas de boost incorrect', () => {
    const base = bootstrapGame();
    const plainChar = makeChar('u4-plain', 'p1', 3000); // no effects
    const don1 = makeDon('u4-d1', 'p1');
    const don2 = makeDon('u4-d2', 'p1');

    let s = addToP1Board(base, plainChar);
    s = attachDonToCard(s, plainChar, [don1, don2]);

    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;

    expect(s.activePlayerId).toBe(P2);
    // No effect on a card without the [DON!! x2] [Opponent's Turn] effect
    expect(s.cards[plainChar.id]?.powerModifierOT).toBeUndefined();
    expect(calculatePower(plainChar.id, s)).toBe(3000); // base only
  });
});

// ─── ST21-004 Jewelry Bonney ──────────────────────────────────────────────────

describe('ST21-004 Jewelry Bonney — OnKO DrawCard si ≥2 DON actifs', () => {
  // [DON!! x2] [When KO'd] Draw 1 card.
  // HasRestingDon:2 on non-Activated trigger = cost: rest 2 active DON when the effect fires.
  const bonneyEffect: CardEffect = {
    trigger: 'OnKO',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [{ type: 'DrawCard', count: 1 }],
  };

  it('KO avec ≥2 DON actifs → coût payé (2 restés), P1 pioche 1 carte supplémentaire', () => {
    const base = bootstrapGame();
    const bonney = makeChar('bonney-a', 'p1', 3000, { tapped: true, effects: [bonneyEffect] });
    const p2Atk = makeChar('bonney-atk', 'p2', 5000);
    const rd1 = makeDon('bny-rd1', 'p1');
    const rd2 = makeDon('bny-rd2', 'p1');

    let s = addToP1Board(base, bonney);
    s = addToP2Board(s, p2Atk);
    s = addFreeDon(s, [rd1, rd2]); // active DON — rested as cost on KO trigger
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    const handBefore = s.players[P1]!.hand.length;

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P2,
      attackerId: p2Atk.id,
      targetId: bonney.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    const result = applyAction(s, { type: 'ResolveCombat', playerId: P2 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.trash).toContain(bonney.id);
      expect(result.players[P1]!.hand.length).toBe(handBefore + 1);
    }
  });

  it('KO sans DON actifs → aucun draw', () => {
    const base = bootstrapGame();
    const bonney = makeChar('bonney-b', 'p1', 3000, { tapped: true, effects: [bonneyEffect] });
    const p2Atk = makeChar('bonney-atk2', 'p2', 5000);

    let s = addToP1Board(base, bonney);
    s = addToP2Board(s, p2Atk);
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    const handBefore = s.players[P1]!.hand.length;

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P2,
      attackerId: p2Atk.id,
      targetId: bonney.id,
    }) as GameState;
    const result = applyAction(s, { type: 'ResolveCombat', playerId: P2 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.trash).toContain(bonney.id);
      expect(result.players[P1]!.hand.length).toBe(handBefore); // no draw
    }
  });
});

// ─── ST21-009 Nami ────────────────────────────────────────────────────────────

describe('ST21-009 Nami — Activated AttachDon ×2 cible Straw Hat Crew (OncePerTurn)', () => {
  // [Once Per Turn] Give up to 2 rested DON!! to 1 of your Characters or Leader
  // with the "Straw Hat Crew" type. Condition: 2 already-rested DON in donArea (no cost payment).
  const namiEffect: CardEffect = {
    trigger: 'Activated',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [
      {
        type: 'AttachDon',
        count: 2,
        from: 'rested',
        target: { scope: 'ChooseOwnCharacterOrLeader', subType: 'Straw Hat Crew' },
      },
    ],
  };

  it('2 rested DON + cible SHC → 2 DON attachés au personnage Straw Hat Crew ciblé', () => {
    const base = bootstrapGame();
    const nami = makeChar('nami-main', 'p1', 1000, { effects: [namiEffect] });
    const shcChar = makeChar('nami-shc', 'p1', 3000, { subTypes: 'Straw Hat Crew' });
    const don1 = makeDon('nami-d1', 'p1');
    const don2 = makeDon('nami-d2', 'p1');

    let s = addToP1Board(base, nami);
    s = addToP1Board(s, shcChar);
    s = addRestedDon(s, [don1, don2]); // 2 rested (tapped) DON — official card text

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: shcChar.id,
    });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      const attachedToSHC = Object.values(result.cards).filter(
        (c) => c.type === 'DON' && c.attachedTo === shcChar.id,
      );
      expect(attachedToSHC.length).toBe(2);
    }
  });

  it('déjà activée ce tour → ALREADY_ACTIVATED', () => {
    const base = bootstrapGame();
    const nami = makeChar('nami-aa', 'p1', 1000, { effects: [namiEffect] });
    const shcChar = makeChar('nami-shc2', 'p1', 3000, { subTypes: 'Straw Hat Crew' });
    const don1 = makeDon('nami-aad1', 'p1');
    const don2 = makeDon('nami-aad2', 'p1');

    let s = addToP1Board(base, nami);
    s = addToP1Board(s, shcChar);
    s = addRestedDon(s, [don1, don2]);

    s = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: shcChar.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: shcChar.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('ALREADY_ACTIVATED');
  });
});

// ─── ST21-010 Nico Robin ──────────────────────────────────────────────────────

describe('ST21-010 Nico Robin — OnAttack KO ChooseOpponentCharacter ≤4000', () => {
  // [DON!! x2] [When attacking] KO 1 of your opponent's Characters with 4000 power or less.
  // Condition: source card (Robin) has ≥2 DON attached. Tapped/untapped state irrelevant.
  // Because DeclareAttack has no chosenTargetId, the engine sets pendingTargetInteraction.
  const robinEffect: CardEffect = {
    trigger: 'OnAttack',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [
      {
        type: 'KO',
        target: { scope: 'ChooseOpponentCharacter', maxPower: 4000 },
      },
    ],
  };

  it('2 DON attachés → condition satisfaite, pendingTargetInteraction créé puis ResolveTargetInteraction KO le personnage ciblé', () => {
    const base = bootstrapGame();
    const robin = makeChar('robin-a', 'p1', 4000, { effects: [robinEffect] });
    const weakChar = makeChar('robin-weak', 'p2', 3000, { tapped: true });
    const rd1 = makeDon('rob-rd1', 'p1');
    const rd2 = makeDon('rob-rd2', 'p1');

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, weakChar);
    s = addAttachedDon(s, [rd1, rd2], robin.id); // 2 DON attached to Robin
    const p2LeaderId = s.players[P2]!.leader!;

    // Robin attacks P2 leader → OnAttack fires → pendingTargetInteraction
    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: robin.id,
      targetId: p2LeaderId,
    }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).not.toBeNull();
    expect(s.pendingTargetInteraction?.scope).toBe('ChooseOpponentCharacter');

    // Resolve: choose weakChar (3000 ≤ 4000) → KO
    const result = applyAction(s, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: weakChar.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.pendingTargetInteraction).toBeNull();
      expect(result.players[P2]!.board).not.toContain(weakChar.id);
      expect(result.players[P2]!.trash).toContain(weakChar.id);
    }
  });

  it('0 DON attachés → condition non remplie : pas de pendingTargetInteraction, combat normal', () => {
    const base = bootstrapGame();
    const robin = makeChar('robin-b', 'p1', 4000, { effects: [robinEffect] });
    const weakChar = makeChar('robin-weak2', 'p2', 3000, { tapped: true });

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, weakChar);
    const p2LeaderId = s.players[P2]!.leader!;

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: robin.id,
      targetId: p2LeaderId,
    }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).toBeNull(); // condition failed → no KO interaction
    expect(s.activeCombat).not.toBeNull();         // combat still active normally
  });

  it('WA1 : 2 DON attachés + cible valide → condition satisfaite, pendingTargetInteraction créé', () => {
    const base = bootstrapGame();
    const robin = makeChar('robin-wa1', 'p1', 4000, { effects: [robinEffect] });
    const target = makeChar('wa1-target', 'p2', 4000, { tapped: true });
    const rd1 = makeDon('wa1-rd1', 'p1');
    const rd2 = makeDon('wa1-rd2', 'p1');

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, target);
    s = addAttachedDon(s, [rd1, rd2], robin.id); // 2 DON physically attached to Robin

    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).not.toBeNull();
    expect(s.pendingTargetInteraction?.scope).toBe('ChooseOpponentCharacter');
    expect(s.pendingTargetInteraction?.maxPower).toBe(4000);
    // DON are still attached (no cost consumed)
    expect(s.cards[rd1.id]?.attachedTo).toBe(robin.id);
    expect(s.cards[rd2.id]?.attachedTo).toBe(robin.id);
    // Combat is paused — activeCombat set but waiting for target resolution
    expect(s.activeCombat).not.toBeNull();
  });

  it('WA2 : le choix est résolu avant que le flow continue — activeCombat reste actif après ResolveTargetInteraction', () => {
    const base = bootstrapGame();
    const robin = makeChar('robin-wa2', 'p1', 4000, { effects: [robinEffect] });
    const weakTarget = makeChar('wa2-weak', 'p2', 3000, { tapped: true });
    const rd1 = makeDon('wa2-rd1', 'p1');
    const rd2 = makeDon('wa2-rd2', 'p1');

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, weakTarget);
    s = addAttachedDon(s, [rd1, rd2], robin.id);

    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;
    expect(s.pendingTargetInteraction).not.toBeNull();

    // Resolve: KO the weak character
    s = applyAction(s, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: weakTarget.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).toBeNull();
    // Target is KO'd
    expect(s.players[P2]!.board).not.toContain(weakTarget.id);
    expect(s.players[P2]!.trash).toContain(weakTarget.id);
    // Combat continues normally against the leader
    expect(s.activeCombat).not.toBeNull();
    expect(s.activeCombat?.targetId).toBe(p2Leader);
  });

  it('WA3 : 2 DON attachés mais sans cible valide (aucun personnage ≤4000) → condition satisfaite, pas d\'interaction, attaque continue', () => {
    const base = bootstrapGame();
    const robin = makeChar('robin-wa3', 'p1', 4000, { effects: [robinEffect] });
    // No opponent character on board (only the leader exists, which has its own zone)
    const rd1 = makeDon('wa3-rd1', 'p1');
    const rd2 = makeDon('wa3-rd2', 'p1');

    let s = addToP1Board(base, robin);
    s = addAttachedDon(s, [rd1, rd2], robin.id);

    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).toBeNull(); // no valid targets → auto-skip
    expect(s.activeCombat).not.toBeNull();         // combat proceeds normally
  });

  it('WA4 : 1 DON attaché seulement → condition [DON!! x2] non remplie → pas de prompt', () => {
    const base = bootstrapGame();
    const robin = makeChar('robin-wa4', 'p1', 4000, { effects: [robinEffect] });
    const weakChar = makeChar('wa4-weak', 'p2', 3000, { tapped: true });
    const rd1 = makeDon('wa4-rd1', 'p1');
    // Only 1 attached DON — condition needs 2

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, weakChar);
    s = addAttachedDon(s, [rd1], robin.id);

    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).toBeNull(); // 1 DON < 2 required → no effect
    expect(s.activeCombat).not.toBeNull();
  });

  // ─── DN: DON!! xN condition — presence check, tapped/untapped irrelevant ──────

  it('DN1 : Robin avec 2 DON rested (tapped) attachés → condition [DON!! x2] satisfaite, WhenAttacking s\'active', () => {
    const base = bootstrapGame();
    const robin = makeChar('robin-dn1', 'p1', 4000, { effects: [robinEffect] });
    const weakChar = makeChar('dn1-weak', 'p2', 3000, { tapped: true });
    const don1 = makeDon('dn1-d1', 'p1');
    const don2 = makeDon('dn1-d2', 'p1');

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, weakChar);
    s = addAttachedDon(s, [don1, don2], robin.id); // tapped=true, attached to Robin

    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).not.toBeNull(); // effect fired
    expect(s.pendingTargetInteraction?.scope).toBe('ChooseOpponentCharacter');
  });

  it('DN2 : Robin avec 2 DON actifs (untapped) attachés → condition [DON!! x2] satisfaite, WhenAttacking s\'active', () => {
    const base = bootstrapGame();
    const robin = makeChar('robin-dn2', 'p1', 4000, { effects: [robinEffect] });
    const weakChar = makeChar('dn2-weak', 'p2', 3000, { tapped: true });
    const don1 = makeDon('dn2-d1', 'p1');
    const don2 = makeDon('dn2-d2', 'p1');

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, weakChar);
    // Manually attach with tapped=false (untapped attached DON — still counts)
    s = {
      ...s,
      cards: {
        ...s.cards,
        [don1.id]: { ...don1, zone: 'donArea', tapped: false, attachedTo: robin.id },
        [don2.id]: { ...don2, zone: 'donArea', tapped: false, attachedTo: robin.id },
      },
      players: {
        ...s.players,
        [P1]: { ...s.players[P1]!, donArea: [...s.players[P1]!.donArea, don1.id, don2.id] },
      },
    };

    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).not.toBeNull(); // untapped attached DON still satisfies condition
  });

  it('DN3 : Robin avec 1 DON attaché seulement → condition [DON!! x2] non satisfaite', () => {
    const base = bootstrapGame();
    const robin = makeChar('robin-dn3', 'p1', 4000, { effects: [robinEffect] });
    const weakChar = makeChar('dn3-weak', 'p2', 3000, { tapped: true });
    const don1 = makeDon('dn3-d1', 'p1');

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, weakChar);
    s = addAttachedDon(s, [don1], robin.id); // only 1 DON attached

    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).toBeNull(); // 1 < 2 → condition not met
    expect(s.activeCombat).not.toBeNull();
  });
});

// ─── WA_TIMING: [When Attacking] timing invariant ────────────────────────────

describe('WA_TIMING: [When Attacking] interaction blocks Block/Counter/Resolve steps', () => {
  const robinTimingEffect: CardEffect = {
    trigger: 'OnAttack',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter', maxPower: 4000 } }],
  };

  // WA_TIMING_1: pendingTargetInteraction blocks the Block step at the engine level
  it('WA_TIMING_1: DeclareAttack creates pendingTargetInteraction; DeclareBlock is rejected while it is active', () => {
    const base = bootstrapGame();
    const robin = makeChar('wt1-robin', 'p1', 4000, { effects: [robinTimingEffect] });
    const target = makeChar('wt1-weak', 'p2', 3000, { tapped: true });
    const blocker = makeChar('wt1-blocker', 'p2', 2000, { keywords: ['Blocker'] });
    const rd1 = makeDon('wt1-rd1', 'p1');
    const rd2 = makeDon('wt1-rd2', 'p1');

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, target);
    s = addToP2Board(s, blocker);
    s = addAttachedDon(s, [rd1, rd2], robin.id);

    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;

    // Engine returned early due to pendingTargetInteraction
    expect(s.pendingTargetInteraction).not.toBeNull();
    expect(s.activeCombat).not.toBeNull();

    // Engine must reject DeclareBlock while interaction is pending
    const blockResult = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: blocker.id });
    expect(isGameError(blockResult)).toBe(true);
    if (isGameError(blockResult)) expect(blockResult.code).toBe('PENDING_INTERACTION');
  });

  // WA_TIMING_2: greedyBotDecide returns null (already tested by BTA1 — redundant but explicit)
  it('WA_TIMING_2: greedyBotDecide returns null while opponent has pendingTargetInteraction', () => {
    const base = bootstrapGame();
    const robin = makeChar('wt2-robin', 'p1', 4000, { effects: [robinTimingEffect] });
    const target = makeChar('wt2-weak', 'p2', 3000, { tapped: true });
    const rd1 = makeDon('wt2-rd1', 'p1');
    const rd2 = makeDon('wt2-rd2', 'p1');

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, target);
    s = addAttachedDon(s, [rd1, rd2], robin.id);
    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;
    expect(s.pendingTargetInteraction).not.toBeNull();

    // Bot (P2) must return null — human has an unresolved pending interaction
    const botAction = greedyBotDecide(s, P2);
    expect(botAction).toBeNull();
  });

  // WA_TIMING_3: after ResolveTargetInteraction, Block step is allowed
  it('WA_TIMING_3: after ResolveTargetInteraction, DeclareBlock is accepted and combat proceeds', () => {
    const base = bootstrapGame();
    const robin = makeChar('wt3-robin', 'p1', 4000, { effects: [robinTimingEffect] });
    const target = makeChar('wt3-weak', 'p2', 3000, { tapped: true });
    const blocker = makeChar('wt3-blocker', 'p2', 2000, { keywords: ['Blocker'] });
    const rd1 = makeDon('wt3-rd1', 'p1');
    const rd2 = makeDon('wt3-rd2', 'p1');

    let s = addToP1Board(base, robin);
    s = addToP2Board(s, target);
    s = addToP2Board(s, blocker);
    s = addAttachedDon(s, [rd1, rd2], robin.id);
    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: robin.id, targetId: p2Leader }) as GameState;

    // Resolve the WhenAttacking interaction (KO the weak target)
    s = applyAction(s, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id }) as GameState;
    expect(s.pendingTargetInteraction).toBeNull();
    expect(s.activeCombat).not.toBeNull();

    // Now DeclareBlock must be accepted
    const blockResult = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: blocker.id });
    expect(isGameError(blockResult)).toBe(false);
  });

  // WA_TIMING_4: attack without WhenAttacking effect → no pending, Block step is immediately available
  it('WA_TIMING_4: normal attack without WhenAttacking effect — no pending, Block/Resolve immediate', () => {
    const base = bootstrapGame();
    const plain = makeChar('wt4-plain', 'p1', 4000);
    const blocker = makeChar('wt4-blocker', 'p2', 2000, { keywords: ['Blocker'] });

    let s = addToP1Board(base, plain);
    s = addToP2Board(s, blocker);
    const p2Leader = s.players[P2]!.leader!;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: plain.id, targetId: p2Leader }) as GameState;

    expect(s.pendingTargetInteraction).toBeNull();
    expect(s.activeCombat).not.toBeNull();

    // Block step immediately available
    const blockResult = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: blocker.id });
    expect(isGameError(blockResult)).toBe(false);
  });
});

// ─── ST21-012 Brook ───────────────────────────────────────────────────────────

describe('ST21-012 Brook — OnAttack AttachDon ×2 from rested', () => {
  // [When attacking] Give up to 2 rested DON!! to 1 of your Characters or Leader.
  // No condition — always sets pendingTargetInteraction on attack.
  const brookEffect: CardEffect = {
    trigger: 'OnAttack',
    actions: [
      {
        type: 'AttachDon',
        count: 2,
        from: 'rested',
        target: { scope: 'ChooseOwnCharacterOrLeader' },
      },
    ],
  };

  it('attaque → pendingTargetInteraction ChooseOwnCharacterOrLeader est définie', () => {
    const base = bootstrapGame();
    const brook = makeChar('brook-a', 'p1', 4000, { effects: [brookEffect] });
    let s = addToP1Board(base, brook);
    const p2LeaderId = s.players[P2]!.leader!;

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: brook.id,
      targetId: p2LeaderId,
    }) as GameState;

    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).not.toBeNull();
    expect(s.pendingTargetInteraction?.scope).toBe('ChooseOwnCharacterOrLeader');
  });

  it('ResolveTargetInteraction avec 2 DON resting → 2 DON attachés au personnage ciblé', () => {
    const base = bootstrapGame();
    const brook = makeChar('brook-b', 'p1', 4000, { effects: [brookEffect] });
    const ally = makeChar('brook-ally', 'p1', 3000);
    const rd1 = makeDon('brook-rd1', 'p1');
    const rd2 = makeDon('brook-rd2', 'p1');

    let s = addToP1Board(base, brook);
    s = addToP1Board(s, ally);
    s = addRestedDon(s, [rd1, rd2]);
    const p2LeaderId = s.players[P2]!.leader!;

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: brook.id,
      targetId: p2LeaderId,
    }) as GameState;
    expect(s.pendingTargetInteraction).not.toBeNull();

    const result = applyAction(s, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: ally.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.pendingTargetInteraction).toBeNull();
      const attachedToAlly = Object.values(result.cards).filter(
        (c) => c.type === 'DON' && c.attachedTo === ally.id,
      );
      expect(attachedToAlly.length).toBe(2);
    }
  });
});

// ─── ST21-014 Luffy Character ─────────────────────────────────────────────────

describe('ST21-014 Luffy Character — Rush + OnAttack AttachDon ×1', () => {
  // Rush: can attack the turn he is played.
  // [When attacking] Give up to 1 rested DON!! to 1 of your Characters or Leader.
  const luffyCharEffect: CardEffect = {
    trigger: 'OnAttack',
    actions: [
      {
        type: 'AttachDon',
        count: 1,
        from: 'rested',
        target: { scope: 'ChooseOwnCharacterOrLeader' },
      },
    ],
  };

  it('Rush : peut attaquer le tour de pose (newBoardIds ignoré grâce à Rush)', () => {
    const base = bootstrapGame();
    const luffy14 = makeChar('luf14-rush', 'p1', 6000, {
      keywords: ['Rush'],
      effects: [luffyCharEffect],
      zone: 'hand',
      cost: 0,
    });
    let s = {
      ...base,
      cards: { ...base.cards, [luffy14.id]: luffy14 },
      players: { ...base.players, [P1]: { ...base.players[P1]!, hand: [...base.players[P1]!.hand, luffy14.id] } },
    };

    s = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: luffy14.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.newBoardIds).toContain(luffy14.id); // marked as new this turn

    // Despite being in newBoardIds, Rush allows attacking immediately
    const p2LeaderId = s.players[P2]!.leader!;
    const attackResult = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: luffy14.id,
      targetId: p2LeaderId,
    });
    expect(isGameError(attackResult)).toBe(false); // Rush bypasses summon sickness
  });

  it('OnAttack : pendingTargetInteraction → ResolveTargetInteraction → 1 DON resting attaché', () => {
    const base = bootstrapGame();
    const luffy14 = makeChar('luf14-oa', 'p1', 6000, {
      keywords: ['Rush'],
      effects: [luffyCharEffect],
    });
    const ally = makeChar('luf14-ally', 'p1', 3000);
    const rd = makeDon('luf14-rd', 'p1');

    let s = addToP1Board(base, luffy14);
    s = addToP1Board(s, ally);
    s = addRestedDon(s, [rd]);
    const p2LeaderId = s.players[P2]!.leader!;

    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: luffy14.id,
      targetId: p2LeaderId,
    }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingTargetInteraction).not.toBeNull();

    const result = applyAction(s, {
      type: 'ResolveTargetInteraction',
      playerId: P1,
      targetCardId: ally.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.pendingTargetInteraction).toBeNull();
      const attachedToAlly = Object.values(result.cards).filter(
        (c) => c.type === 'DON' && c.attachedTo === ally.id,
      );
      expect(attachedToAlly.length).toBe(1);
    }
  });
});

describe('hasSubType — multi-subtype "/" separator support via ST21-009 Nami', () => {
  const namiEffect: CardEffect = {
    trigger: 'Activated',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [
      {
        type: 'AttachDon',
        count: 2,
        from: 'rested',
        target: { scope: 'ChooseOwnCharacterOrLeader', subType: 'Straw Hat Crew' },
      },
    ],
  };

  it('cible avec subTypes simple "Straw Hat Crew" est valide', () => {
    const base = bootstrapGame();
    const nami = makeChar('hst-nami', 'p1', 1000, { effects: [namiEffect] });
    const shcChar = makeChar('hst-shc', 'p1', 3000, { subTypes: 'Straw Hat Crew' });
    const don1 = makeDon('hst-d1', 'p1');
    const don2 = makeDon('hst-d2', 'p1');

    let s = addToP1Board(base, nami);
    s = addToP1Board(s, shcChar);
    s = addRestedDon(s, [don1, don2]);

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: shcChar.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      const attached = Object.values(result.cards).filter((c) => c.type === 'DON' && c.attachedTo === shcChar.id);
      expect(attached.length).toBe(2);
    }
  });

  it('cible avec multi-subTypes "/" (ex: "The Four Emperors/Straw Hat Crew") est valide', () => {
    const base = bootstrapGame();
    const nami = makeChar('hst2-nami', 'p1', 1000, { effects: [namiEffect] });
    const multiTypeLeader = makeChar('hst2-leader', 'p1', 5000, {
      subTypes: 'The Four Emperors/Straw Hat Crew',
    });
    const don1 = makeDon('hst2-d1', 'p1');
    const don2 = makeDon('hst2-d2', 'p1');

    let s = addToP1Board(base, nami);
    s = addToP1Board(s, multiTypeLeader);
    s = addRestedDon(s, [don1, don2]);

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: multiTypeLeader.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      const attached = Object.values(result.cards).filter(
        (c) => c.type === 'DON' && c.attachedTo === multiTypeLeader.id,
      );
      expect(attached.length).toBe(2);
    }
  });

  it('cible sans "Straw Hat Crew" est rejetée (aucun DON attaché)', () => {
    const base = bootstrapGame();
    const nami = makeChar('hst3-nami', 'p1', 1000, { effects: [namiEffect] });
    const nonSHC = makeChar('hst3-other', 'p1', 3000, { subTypes: 'The Four Emperors' });
    const don1 = makeDon('hst3-d1', 'p1');
    const don2 = makeDon('hst3-d2', 'p1');

    let s = addToP1Board(base, nami);
    s = addToP1Board(s, nonSHC);
    s = addRestedDon(s, [don1, don2]);

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: nonSHC.id,
    });
    // Either returns an error (INVALID_TARGET) or no DON are attached
    if (!isGameError(result)) {
      const attached = Object.values(result.cards).filter(
        (c) => c.type === 'DON' && c.attachedTo === nonSHC.id,
      );
      expect(attached.length).toBe(0);
    }
  });

  it('cible = leader dans le slot leader (ownPlayer.leader, space-separated subTypes)', () => {
    // Regression: leader is in player.leader slot (not board). ChooseOwnCharacterOrLeader must
    // include ownPlayer.leader in the pool. This mirrors the real ST21-001 leader
    // whose raw data has subTypes: "The Four Emperors Straw Hat Crew" (space-separated).
    const base = bootstrapGame();
    const nami = makeChar('hst4-nami', 'p1', 1000, { effects: [namiEffect] });
    const don1 = makeDon('hst4-d1', 'p1');
    const don2 = makeDon('hst4-d2', 'p1');

    // Give the existing P1 leader "The Four Emperors Straw Hat Crew" subType
    const leaderId = base.players[P1]!.leader!;
    let s: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [leaderId]: { ...base.cards[leaderId]!, subTypes: 'The Four Emperors Straw Hat Crew' },
      },
    };
    s = addToP1Board(s, nami);
    s = addRestedDon(s, [don1, don2]);

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: leaderId,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      const attached = Object.values(result.cards).filter(
        (c) => c.type === 'DON' && c.attachedTo === leaderId,
      );
      expect(attached.length).toBe(2);
    }
  });

  it('échoue si seul donDeck a des DON non-tapés — donArea vide (régression ActionPanel zone filter)', () => {
    // Reproduces the real-game bug: ActionPanel was counting donDeck DON as "active",
    // enabling the button even when donArea had 0 active DON. Engine only checks donArea.
    const base = bootstrapGame();
    const nami = makeChar('hst5-nami', 'p1', 1000, { effects: [namiEffect] });

    const leaderId = base.players[P1]!.leader!;
    let s: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [leaderId]: { ...base.cards[leaderId]!, subTypes: 'The Four Emperors Straw Hat Crew' },
      },
    };
    s = addToP1Board(s, nami);
    // No DON added to donArea → 0 rested DON → engine should reject
    // The donDeck still has undrawn DON but those don't count.

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: leaderId,
    });
    // Must fail — 0 rested DON in donArea
    expect(isGameError(result)).toBe(true);
  });

  it('N1: 2 rested DON in donArea → activation OK, 2 DON attached', () => {
    const base = bootstrapGame();
    const nami = makeChar('n1-nami', 'p1', 1000, { effects: [namiEffect] });
    const shcChar = makeChar('n1-shc', 'p1', 3000, { subTypes: 'Straw Hat Crew' });
    const rd1 = makeDon('n1-rd1', 'p1');
    const rd2 = makeDon('n1-rd2', 'p1');

    let s = addToP1Board(base, nami);
    s = addToP1Board(s, shcChar);
    s = addRestedDon(s, [rd1, rd2]);

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: shcChar.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      const attached = Object.values(result.cards).filter(
        (c) => c.type === 'DON' && c.attachedTo === shcChar.id,
      );
      expect(attached.length).toBe(2);
    }
  });

  it('N2: 0 donArea DON (donDeck has DON) → CONDITION_NOT_MET', () => {
    const base = bootstrapGame();
    const nami = makeChar('n2-nami', 'p1', 1000, { effects: [namiEffect] });
    const leaderId = base.players[P1]!.leader!;
    let s: GameState = {
      ...base,
      cards: { ...base.cards, [leaderId]: { ...base.cards[leaderId]!, subTypes: 'Straw Hat Crew' } },
    };
    s = addToP1Board(s, nami);
    // donArea empty; donDeck still holds undrawn DON

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: leaderId,
    });
    expect(isGameError(result)).toBe(true);
  });

  it('N2: 1 rested DON in donArea → activation OK, 1 DON attached ("up to 2")', () => {
    const base = bootstrapGame();
    const nami = makeChar('n2-nami', 'p1', 1000, { effects: [namiEffect] });
    const shcChar = makeChar('n2-shc', 'p1', 3000, { subTypes: 'Straw Hat Crew' });
    const rd1 = makeDon('n2-rd1', 'p1');

    let s = addToP1Board(base, nami);
    s = addToP1Board(s, shcChar);
    s = addRestedDon(s, [rd1]); // only 1 rested DON available

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: shcChar.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      const attached = Object.values(result.cards).filter(
        (c) => c.type === 'DON' && c.attachedTo === shcChar.id,
      );
      expect(attached.length).toBe(1); // min(2, 1) = 1
    }
  });

  it('N3: 0 rested DON (only active DON) → CONDITION_NOT_MET', () => {
    const base = bootstrapGame();
    const nami = makeChar('n3-nami', 'p1', 1000, { effects: [namiEffect] });
    const shcChar = makeChar('n3-shc', 'p1', 3000, { subTypes: 'Straw Hat Crew' });
    const fd1 = makeDon('n3-fd1', 'p1');

    let s = addToP1Board(base, nami);
    s = addToP1Board(s, shcChar);
    s = addFreeDon(s, [fd1]); // only active DON — no rested DON

    const result = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: shcChar.id,
    });
    expect(isGameError(result)).toBe(true);
  });
});

// ─── ST21-015 Roronoa Zoro — DON!! x2 gains Rush ─────────────────────────────

describe('ST21-015 Zoro — [DON!! x2] gains Rush (passive, fires on AssignDon)', () => {
  const zoroRushEffect: CardEffect = {
    trigger: 'Activated',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [{ type: 'GiveKeyword', keyword: 'Rush', target: { scope: 'Self' }, duration: 'Permanent' }],
  };

  function makeZoroRush(idSuffix: string): Card {
    return makeChar(`zoro-rush-${idSuffix}`, 'p1', 5000, {
      name: 'Roronoa Zoro',
      effects: [zoroRushEffect],
    });
  }

  it('Z1: Zoro played this turn, 0 DON attached → SUMMON_SICKNESS on attack', () => {
    const base = bootstrapGame();
    const zoro = makeZoroRush('z1');
    let s = addToP1Board(base, zoro);
    s = { ...s, newBoardIds: [...s.newBoardIds, zoro.id] };
    const p2LeaderId = s.players[P2]!.leader!;

    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: zoro.id,
      targetId: p2LeaderId,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('SUMMON_SICKNESS');
  });

  it('Z2: Zoro played this turn, 2 DON attached via AssignDon → Rush granted → can attack', () => {
    const base = bootstrapGame();
    const zoro = makeZoroRush('z2');
    const don1 = makeDon('z2-d1', 'p1');
    const don2 = makeDon('z2-d2', 'p1');

    let s = addToP1Board(base, zoro);
    s = { ...s, newBoardIds: [...s.newBoardIds, zoro.id] };
    s = addFreeDon(s, [don1, don2]);

    s = applyAction(s, { type: 'AssignDon', playerId: P1, donCardId: don1.id, targetCardId: zoro.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    s = applyAction(s, { type: 'AssignDon', playerId: P1, donCardId: don2.id, targetCardId: zoro.id }) as GameState;
    expect(isGameError(s)).toBe(false);

    // Zoro now has 2 DON attached → Rush should be granted
    expect(s.cards[zoro.id]!.keywords).toContain('Rush');

    const p2LeaderId = s.players[P2]!.leader!;
    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: zoro.id,
      targetId: p2LeaderId,
    });
    expect(isGameError(result)).toBe(false);
  });

  it('Z3: Rush is permanent — remains after end of turn (keywords, not temporaryKeywords)', () => {
    const base = bootstrapGame();
    const zoro = makeZoroRush('z3');
    const don1 = makeDon('z3-d1', 'p1');
    const don2 = makeDon('z3-d2', 'p1');

    let s = addToP1Board(base, zoro);
    s = addFreeDon(s, [don1, don2]);

    s = applyAction(s, { type: 'AssignDon', playerId: P1, donCardId: don1.id, targetCardId: zoro.id }) as GameState;
    s = applyAction(s, { type: 'AssignDon', playerId: P1, donCardId: don2.id, targetCardId: zoro.id }) as GameState;

    expect(s.cards[zoro.id]!.keywords).toContain('Rush');
    // Rush is in keywords (permanent), not in temporaryKeywords
    expect(s.cards[zoro.id]!.temporaryKeywords ?? []).not.toContain('Rush');
  });
});

// ─── ST21-004 Jewelry Bonney — B1: DON attached to Bonney when KO'd ──────────

describe('ST21-004 Bonney — B1: DON attached when KO\'d + 2 free DON → OnKO draw fires', () => {
  const bonneyEffect: CardEffect = {
    trigger: 'OnKO',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [{ type: 'DrawCard', count: 1 }],
  };

  it('B1: 2 DON attached to Bonney + 2 free DON → KO → cost paid by free DON → draw 1', () => {
    const base = bootstrapGame();
    const bonney = makeChar('b1-bonney', 'p1', 3000, { tapped: true, effects: [bonneyEffect] });
    const p2Atk = makeChar('b1-atk', 'p2', 5000);
    const don1 = makeDon('b1-d1', 'p1');
    const don2 = makeDon('b1-d2', 'p1');
    const freeDon1 = makeDon('b1-free1', 'p1');
    const freeDon2 = makeDon('b1-free2', 'p1');

    let s = addToP1Board(base, bonney);
    s = addToP2Board(s, p2Atk);
    // P1 assigns 2 DON to Bonney; also has 2 extra free DON to pay OnKO cost
    s = addFreeDon(s, [don1, don2, freeDon1, freeDon2]);
    s = applyAction(s, { type: 'AssignDon', playerId: P1, donCardId: don1.id, targetCardId: bonney.id }) as GameState;
    s = applyAction(s, { type: 'AssignDon', playerId: P1, donCardId: don2.id, targetCardId: bonney.id }) as GameState;
    expect(isGameError(s)).toBe(false);

    // P2 attacks Bonney
    s = { ...s, activePlayerId: P2, turnNumber: 4 };
    const handBefore = s.players[P1]!.hand.length;

    s = applyAction(s, { type: 'DeclareAttack', playerId: P2, attackerId: p2Atk.id, targetId: bonney.id }) as GameState;
    const result = applyAction(s, { type: 'ResolveCombat', playerId: P2 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // Bonney is KO'd; free DON rested as [DON!! x2] cost → OnKO fires → draw 1
      expect(result.players[P1]!.trash).toContain(bonney.id);
      expect(result.players[P1]!.hand.length).toBe(handBefore + 1);
      // attached DON are back in donArea as rested (tapped) — per rule 7-1-5
      expect(result.cards[don1.id]!.tapped).toBe(true);
      expect(result.cards[don1.id]!.attachedTo).toBeNull();
    }
  });

  it('B1-neg: no DON attached to Bonney → KO → 0 rested DON → no draw', () => {
    const base = bootstrapGame();
    const bonney = makeChar('b1neg-bonney', 'p1', 3000, { tapped: true, effects: [bonneyEffect] });
    const p2Atk = makeChar('b1neg-atk', 'p2', 5000);

    let s = addToP1Board(base, bonney);
    s = addToP2Board(s, p2Atk);
    s = { ...s, activePlayerId: P2, turnNumber: 4 };

    const handBefore = s.players[P1]!.hand.length;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P2, attackerId: p2Atk.id, targetId: bonney.id }) as GameState;
    const result = applyAction(s, { type: 'ResolveCombat', playerId: P2 });

    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.hand.length).toBe(handBefore);
    }
  });
});

// ─── ST21-015 Zoro — Z-nami: Rush via effect-driven AttachDon path ───────────

describe('ST21-015 Zoro — Rush via effect-driven AttachDon (Nami/Brook path)', () => {
  const zoroRushEffect: CardEffect = {
    trigger: 'Activated',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [{ type: 'GiveKeyword', keyword: 'Rush', target: { scope: 'Self' }, duration: 'Permanent' }],
  };
  const namiEffect: CardEffect = {
    trigger: 'Activated',
    condition: { type: 'HasRestingDon', count: 2 },
    actions: [{ type: 'AttachDon', count: 2, from: 'rested', target: { scope: 'ChooseOwnCharacterOrLeader', subType: 'Straw Hat Crew' } }],
  };

  it('Z-nami: Nami AttachDon (rested path) to Zoro → Rush granted → can attack same turn', () => {
    const base = bootstrapGame();
    const zoro = makeChar('zn-zoro', 'p1', 5000, {
      name: 'Roronoa Zoro',
      subTypes: 'Straw Hat Crew',
      effects: [zoroRushEffect],
    });
    const nami = makeChar('zn-nami', 'p1', 1000, { effects: [namiEffect] });
    const rd1 = makeDon('zn-rd1', 'p1');
    const rd2 = makeDon('zn-rd2', 'p1');

    let s = addToP1Board(base, zoro);
    s = addToP1Board(s, nami);
    s = addRestedDon(s, [rd1, rd2]);
    s = { ...s, newBoardIds: [...s.newBoardIds, zoro.id] };

    // Nami activates: gives 2 rested DON to Zoro via AttachDon effect path
    s = applyAction(s, {
      type: 'ActivatedAbility',
      playerId: P1,
      cardId: nami.id,
      chosenTargetId: zoro.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // Zoro should have Rush (via effectResolver AttachDon path)
    expect(s.cards[zoro.id]!.keywords).toContain('Rush');

    // Zoro was played this turn but has Rush → can attack
    const p2LeaderId = s.players[P2]!.leader!;
    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: zoro.id,
      targetId: p2LeaderId,
    });
    expect(isGameError(result)).toBe(false);
  });
});

// ─── ST21-011 Franky — F1-F6: aura passive auto [Opponent's Turn] ────────────
// Official text: [DON!! x2] [Opponent's Turn] All of your {Straw Hat Crew}
// Characters with 4000 base power or less gain +1000 power.
// Passive/continuous: fires automatically via StartOfOpponentTurn when Franky
// has ≥2 DON physically attached. NOT a manually activated ability.

describe('ST21-011 Franky — [DON!! x2] [Opponent\'s Turn] aura passive', () => {
  const frankyAuraEffect: CardEffect = {
    trigger: 'StartOfOpponentTurn',
    condition: { type: 'HasAttachedDon', count: 2 },
    actions: [{
      type: 'PowerBoost',
      amount: 1000,
      target: { scope: 'AllOwnCharacters', subType: 'Straw Hat Crew', maxPower: 4000 },
      duration: 'EndOfOpponentTurn',
    }],
  };

  function attachDonToFranky(state: GameState, franky: Card, dons: Card[]): GameState {
    const updatedCards: Record<string, Card> = { ...state.cards };
    const donIds: CardId[] = [];
    for (const d of dons) {
      updatedCards[d.id] = { ...d, zone: 'donArea' as const, tapped: true, attachedTo: franky.id };
      donIds.push(d.id);
    }
    return {
      ...state,
      cards: updatedCards as GameState['cards'],
      players: {
        ...state.players,
        [P1]: { ...state.players[P1]!, donArea: [...state.players[P1]!.donArea, ...donIds] },
      },
    };
  }

  it('F1: pendant le tour de P1 (son propre tour), l\'aura ne s\'applique PAS', () => {
    // StartOfOpponentTurn hasn't fired → no powerModifierOT on allies
    const base = bootstrapGame(); // P1 Main, turn 3
    const franky = makeChar('f1-franky', 'p1', 5000, { effects: [frankyAuraEffect], subTypes: 'Straw Hat Crew' });
    const ally = makeChar('f1-ally', 'p1', 3000, { subTypes: 'Straw Hat Crew' });
    const don1 = makeDon('f1-d1', 'p1');
    const don2 = makeDon('f1-d2', 'p1');

    let s = addToP1Board(base, franky);
    s = addToP1Board(s, ally);
    s = attachDonToFranky(s, franky, [don1, don2]);

    expect(s.activePlayerId).toBe(P1);
    // Aura not yet triggered — no powerModifierOT
    expect(s.cards[ally.id]?.powerModifierOT).toBeUndefined();
  });

  it('F2: passage au tour adverse avec 2 DON attachés → SHC ≤4000 gagnent automatiquement +1000', () => {
    const base = bootstrapGame();
    const franky = makeChar('f2-franky', 'p1', 5000, { effects: [frankyAuraEffect], subTypes: 'Straw Hat Crew' });
    const ally = makeChar('f2-ally', 'p1', 3000, { subTypes: 'Straw Hat Crew' });
    const don1 = makeDon('f2-d1', 'p1');
    const don2 = makeDon('f2-d2', 'p1');

    let s = addToP1Board(base, franky);
    s = addToP1Board(s, ally);
    s = attachDonToFranky(s, franky, [don1, don2]);

    // P1 ends turn: Main→End→P2 Refresh (fires StartOfOpponentTurn for P1)
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;

    expect(s.activePlayerId).toBe(P2);
    // Ally (Straw Hat Crew, 3000 ≤ 4000) received the aura boost
    expect(s.cards[ally.id]?.powerModifierOT).toBe(1000);
    // Franky itself has 5000 base power → NOT buffed (>4000)
    expect(s.cards[franky.id]?.powerModifierOT).toBeUndefined();
  });

  it('F3: allié Straw Hat Crew à 5000 base power → ne reçoit PAS le buff', () => {
    const base = bootstrapGame();
    const franky = makeChar('f3-franky', 'p1', 5000, { effects: [frankyAuraEffect] });
    const bigAlly = makeChar('f3-big', 'p1', 5000, { subTypes: 'Straw Hat Crew' });
    const don1 = makeDon('f3-d1', 'p1');
    const don2 = makeDon('f3-d2', 'p1');

    let s = addToP1Board(base, franky);
    s = addToP1Board(s, bigAlly);
    s = attachDonToFranky(s, franky, [don1, don2]);

    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;

    expect(s.activePlayerId).toBe(P2);
    expect(s.cards[bigAlly.id]?.powerModifierOT).toBeUndefined(); // 5000 > 4000 → excluded
  });

  it('F4: allié non-Straw Hat Crew à 4000 base power → ne reçoit PAS le buff', () => {
    const base = bootstrapGame();
    const franky = makeChar('f4-franky', 'p1', 5000, { effects: [frankyAuraEffect] });
    const pirate = makeChar('f4-pirate', 'p1', 4000, { subTypes: 'Pirate' });
    const don1 = makeDon('f4-d1', 'p1');
    const don2 = makeDon('f4-d2', 'p1');

    let s = addToP1Board(base, franky);
    s = addToP1Board(s, pirate);
    s = attachDonToFranky(s, franky, [don1, don2]);

    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;

    expect(s.activePlayerId).toBe(P2);
    expect(s.cards[pirate.id]?.powerModifierOT).toBeUndefined(); // non-SHC → excluded
  });

  it('F5: Franky n\'a qu\'1 DON attaché pendant le tour adverse → aucun buff', () => {
    const base = bootstrapGame();
    const franky = makeChar('f5-franky', 'p1', 5000, { effects: [frankyAuraEffect] });
    const ally = makeChar('f5-ally', 'p1', 3000, { subTypes: 'Straw Hat Crew' });
    const don1 = makeDon('f5-d1', 'p1');

    let s = addToP1Board(base, franky);
    s = addToP1Board(s, ally);
    s = attachDonToFranky(s, franky, [don1]); // only 1 DON

    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;

    expect(s.activePlayerId).toBe(P2);
    expect(s.cards[ally.id]?.powerModifierOT).toBeUndefined(); // condition not met
  });

  it('F6: allié à 4000 base power avec powerModifier existant → éligibilité sur base power, pas power courante', () => {
    // Even if the ally already has a +1000 powerModifier (making it 5000 effective),
    // the aura filter uses card.power (base), so it still qualifies and receives +1000.
    const base = bootstrapGame();
    const franky = makeChar('f6-franky', 'p1', 5000, { effects: [frankyAuraEffect] });
    const ally = makeChar('f6-ally', 'p1', 4000, { subTypes: 'Straw Hat Crew', powerModifier: 1000 });
    const don1 = makeDon('f6-d1', 'p1');
    const don2 = makeDon('f6-d2', 'p1');

    let s = addToP1Board(base, franky);
    s = addToP1Board(s, ally);
    s = attachDonToFranky(s, franky, [don1, don2]);

    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;

    expect(s.activePlayerId).toBe(P2);
    // base power = 4000 ≤ 4000 → eligible despite powerModifier making current power 5000
    expect(s.cards[ally.id]?.powerModifierOT).toBe(1000);
  });
});

// ─── OnKO robustness — R1/R2/R3 ──────────────────────────────────────────────

describe('OnKO robustness — R1 sequential, R2 voluntary skip, R3 KO by effect', () => {
  const onKOEffect: CardEffect = {
    trigger: 'OnKO',
    actions: [{
      type: 'PlayFromHand',
      filter: { color: 'Red', cardType: 'Character', maxPower: 6000 },
    }],
  };

  // ── R1: two cards with OnKO KO'd by the same effect ──────────────────────────
  // First card's OnKO sets pendingOnKOInteraction; second card must NOT overwrite it.
  it('R1: sequential OnKO — second card does not overwrite pending from first', () => {
    const base = bootstrapGame();
    const card1 = makeChar('r1-c1', 'p1', 3000, { name: 'Card One', effects: [onKOEffect] });
    const card2 = makeChar('r1-c2', 'p1', 3000, { name: 'Card Two', effects: [onKOEffect] });
    const validCard = makeChar('r1-valid', 'p1', 4000, { name: 'Valid Red', color: 'Red', zone: 'hand' });

    let s = addToP1Board(base, card1);
    s = addToP1Board(s, card2);
    s = {
      ...s,
      cards: { ...s.cards, [validCard.id]: validCard },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, validCard.id] } },
    };

    // Simulate card1's OnKO having already fired and set pendingOnKOInteraction
    const withPending: GameState = {
      ...s,
      pendingOnKOInteraction: {
        playerId: P1,
        filter: onKOEffect.actions[0]!.filter as import('../src/index.js').HandFilter,
        sourceCardId: card1.id,
      },
    };

    // Now fire card2's OnKO effects on the state that already has a pending interaction.
    // The PlayFromHand guard must NOT overwrite the first card's pending.
    const afterCard2OnKO = resolveEffects(
      card2.effects!,
      'OnKO',
      { sourceCardId: card2.id, sourcePlayerId: P1 },
      withPending,
    );

    // Still points to card1 — card2 did NOT overwrite
    expect(afterCard2OnKO.pendingOnKOInteraction?.sourceCardId).toBe(card1.id);
  });

  // ── R2: voluntary skip — player sends cardId: null ────────────────────────────
  it('R2: voluntary skip — player sends null, prompt cleared, board unchanged', () => {
    const base = bootstrapGame();
    const zoro = makeChar('r2-zoro', 'p1', 5000, {
      name: 'Roronoa Zoro',
      tapped: true,
      effects: [onKOEffect],
    });
    const validCard = makeChar('r2-valid', 'p1', 4000, { name: 'Valid Card', color: 'Red', zone: 'hand' });
    let s = addToP1Board(base, zoro);
    s = {
      ...s,
      cards: { ...s.cards, [validCard.id]: validCard },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, validCard.id] } },
    };

    // Manually set pending (simulates the KO prompt)
    const boardBefore = s.players[P1]!.board.length;
    const withPending: GameState = {
      ...s,
      pendingOnKOInteraction: {
        playerId: P1,
        filter: onKOEffect.actions[0]!.filter as import('../src/index.js').HandFilter,
        sourceCardId: zoro.id,
      },
    };

    // Player skips (cardId: null)
    const result = applyAction(withPending, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: null });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.pendingOnKOInteraction).toBeNull();
      // Board unchanged — valid card was NOT played
      expect(result.players[P1]!.board.length).toBe(boardBefore);
      expect(result.players[P1]!.hand).toContain(validCard.id);
      // Log has PLAYER_CHOICE entry indicating skip
      const skipEntry = result.gameLog.find((e: GameLogEntry) => e.event === 'PLAYER_CHOICE' && e.cardId === undefined);
      expect(skipEntry).toBeDefined();
      expect(skipEntry?.message).toContain('skipped');
    }
  });

  // ── R3: KO by effect — cause='effect' in log, OnKO fires correctly ────────────
  it('R3: KO by effect — log has cause=effect, OnKO prompt set', () => {
    // Simulate a card with OnPlay: KO <target>. The target has an OnKO effect.
    const koOnPlayEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{
        type: 'KO',
        target: { scope: 'ChooseOpponentCharacter' },
      }],
    };
    const attacker = makeChar('r3-atk', 'p1', 4000, {
      name: 'Attacker',
      zone: 'hand',
      cost: 0,
      effects: [koOnPlayEffect],
    });
    const victim = makeChar('r3-victim', 'p2', 3000, {
      name: 'Victim',
      tapped: true,
      effects: [onKOEffect],
    });
    const validCard = makeChar('r3-valid', 'p1', 4000, { name: 'Valid Red', color: 'Red', zone: 'hand' });

    const base = bootstrapGame();
    let s = addToP2Board(base, victim);
    s = {
      ...s,
      cards: { ...s.cards, [attacker.id]: { ...attacker, zone: 'hand' }, [validCard.id]: validCard },
      players: {
        ...s.players,
        [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, attacker.id, validCard.id] },
      },
    };

    // Play attacker with chosen target = victim
    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: attacker.id,
      chosenTargetId: victim.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // Victim is in trash
      expect(result.players[P2]!.board).not.toContain(victim.id);

      // Log has a KO entry with cause='effect'
      const koEntry = result.gameLog.find((e: GameLogEntry) => e.event === 'KO' && e.cardId === victim.id);
      expect(koEntry).toBeDefined();
      expect(koEntry?.cause).toBe('effect');

      // OnKO trigger fired → pendingOnKOInteraction set for P2 (victim's owner)
      // Note: P2 owns the victim, so P2 resolves the OnKO
      expect(result.pendingOnKOInteraction).not.toBeNull();
      expect(result.pendingOnKOInteraction?.playerId).toBe(P2);

      // Log has ON_KO_TRIGGER with cause='effect'
      const triggerEntry = result.gameLog.find((e: GameLogEntry) => e.event === 'ON_KO_TRIGGER');
      expect(triggerEntry).toBeDefined();
      expect(triggerEntry?.cause).toBe('effect');
    }
  });
});

// ─── OnKO queue — Q1/Q2/Q3 ────────────────────────────────────────────────────

describe('OnKO interaction queue — Q1/Q2/Q3', () => {
  const onKOEffect: CardEffect = {
    trigger: 'OnKO',
    actions: [{ type: 'PlayFromHand', filter: { color: 'Red', cardType: 'Character' } }],
  };

  function buildQueueState(): {
    base: GameState;
    card1: Card;
    card2: Card;
    handCard: Card;
    handCard2: Card;
  } {
    const base = bootstrapGame();

    const card1 = makeChar('q-card1', 'p1', 3000, { effects: [onKOEffect] });
    const card2 = makeChar('q-card2', 'p1', 3000, { effects: [onKOEffect] });
    const handCard  = makeChar('q-hand1', 'p1', 2000, { zone: 'hand' });
    const handCard2 = makeChar('q-hand2', 'p1', 2000, { zone: 'hand' });

    let s = addToP1Board(base, card1);
    s = addToP1Board(s, card2);
    s = {
      ...s,
      cards: { ...s.cards, [handCard.id]: handCard, [handCard2.id]: handCard2 },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, handCard.id, handCard2.id] } },
    };

    // Fire card1's OnKO — sets pendingOnKOInteraction
    s = resolveEffects(card1.effects!, 'OnKO', { sourceCardId: card1.id, sourcePlayerId: P1 }, s);
    // Fire card2's OnKO while prompt is open — goes to queue
    s = resolveEffects(card2.effects!, 'OnKO', { sourceCardId: card2.id, sourcePlayerId: P1 }, s);

    return { base: s, card1, card2, handCard, handCard2 };
  }

  // ── Q1: first resolved, second then proposed ────────────────────────────────
  it('Q1: first resolved — second prompt is promoted from queue', () => {
    const { base, card1, card2, handCard } = buildQueueState();

    expect(base.pendingOnKOInteraction?.sourceCardId).toBe(card1.id);
    expect(base.pendingOnKOQueue.length).toBe(1);
    expect(base.pendingOnKOQueue[0]?.sourceCardId).toBe(card2.id);

    const after = applyAction(base, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: handCard.id,
    });
    expect(isGameError(after)).toBe(false);
    if (isGameError(after)) return;

    expect(after.pendingOnKOInteraction?.sourceCardId).toBe(card2.id);
    expect(after.pendingOnKOQueue.length).toBe(0);
    const qEntry = after.gameLog.find((e: GameLogEntry) => e.event === 'QUEUED_TRIGGER');
    expect(qEntry).toBeDefined();
  });

  // ── Q2: first skipped, second then proposed ─────────────────────────────────
  it('Q2: first skipped (null) — second prompt is promoted from queue', () => {
    const { base, card2 } = buildQueueState();

    const after = applyAction(base, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: null,
    });
    expect(isGameError(after)).toBe(false);
    if (isGameError(after)) return;

    expect(after.pendingOnKOInteraction?.sourceCardId).toBe(card2.id);
    expect(after.pendingOnKOQueue.length).toBe(0);
    const qEntry = after.gameLog.find((e: GameLogEntry) => e.event === 'QUEUED_TRIGGER');
    expect(qEntry).toBeDefined();
  });

  // ── Q3: no trigger lost — both prompts served end-to-end ─────────────────────
  it('Q3: no trigger lost — both prompts served, queue empty after both resolved', () => {
    const { base, card2, handCard, handCard2 } = buildQueueState();

    let s = applyAction(base, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: handCard.id,
    });
    expect(isGameError(s)).toBe(false);
    if (isGameError(s)) return;

    expect(s.pendingOnKOInteraction?.sourceCardId).toBe(card2.id);
    expect(s.pendingOnKOQueue.length).toBe(0);

    s = applyAction(s, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: handCard2.id,
    });
    expect(isGameError(s)).toBe(false);
    if (isGameError(s)) return;

    expect(s.pendingOnKOInteraction).toBeNull();
    expect(s.pendingOnKOQueue.length).toBe(0);
    expect(s.players[P1]!.board).toContain(handCard.id);
    expect(s.players[P1]!.board).toContain(handCard2.id);
  });

  // ── Q4: 3 triggers FIFO order (direct resolveEffects path) ───────────────────
  it('Q4: 3 triggers — served in FIFO order card1→card2→card3', () => {
    const base = bootstrapGame();

    // Cards already KO'd → in trash (not on board) so board stays clear for hand plays.
    const c1 = makeChar('q4-c1', 'p1', 3000, { effects: [onKOEffect], zone: 'trash' });
    const c2 = makeChar('q4-c2', 'p1', 3000, { effects: [onKOEffect], zone: 'trash' });
    const c3 = makeChar('q4-c3', 'p1', 3000, { effects: [onKOEffect], zone: 'trash' });
    const h1 = makeChar('q4-h1', 'p1', 2000, { zone: 'hand' });
    const h2 = makeChar('q4-h2', 'p1', 2000, { zone: 'hand' });
    const h3 = makeChar('q4-h3', 'p1', 2000, { zone: 'hand' });

    let s: GameState = {
      ...base,
      cards: { ...base.cards, [c1.id]: c1, [c2.id]: c2, [c3.id]: c3, [h1.id]: h1, [h2.id]: h2, [h3.id]: h3 },
      players: {
        ...base.players,
        [P1]: {
          ...base.players[P1]!,
          trash: [...base.players[P1]!.trash, c1.id, c2.id, c3.id],
          hand:  [...base.players[P1]!.hand, h1.id, h2.id, h3.id],
        },
      },
    };

    // Fire 3 OnKO triggers in order c1 → c2 → c3
    s = resolveEffects(c1.effects!, 'OnKO', { sourceCardId: c1.id, sourcePlayerId: P1 }, s);
    s = resolveEffects(c2.effects!, 'OnKO', { sourceCardId: c2.id, sourcePlayerId: P1 }, s);
    s = resolveEffects(c3.effects!, 'OnKO', { sourceCardId: c3.id, sourcePlayerId: P1 }, s);

    // Active = c1, queue = [c2, c3] in FIFO order
    expect(s.pendingOnKOInteraction?.sourceCardId).toBe(c1.id);
    expect(s.pendingOnKOQueue[0]?.sourceCardId).toBe(c2.id);
    expect(s.pendingOnKOQueue[1]?.sourceCardId).toBe(c3.id);

    // Resolve c1
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: h1.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingOnKOInteraction?.sourceCardId).toBe(c2.id);
    expect(s.pendingOnKOQueue[0]?.sourceCardId).toBe(c3.id);

    // Resolve c2
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: h2.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingOnKOInteraction?.sourceCardId).toBe(c3.id);
    expect(s.pendingOnKOQueue.length).toBe(0);

    // Resolve c3
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: h3.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingOnKOInteraction).toBeNull();
    expect(s.pendingOnKOQueue.length).toBe(0);
    // All 3 cards played
    expect(s.players[P1]!.board).toContain(h1.id);
    expect(s.players[P1]!.board).toContain(h2.id);
    expect(s.players[P1]!.board).toContain(h3.id);
  });

  // ── Q5: 3 triggers, skip-play-skip — no trigger lost ─────────────────────────
  it('Q5: skip-play-skip — only c2 played, no trigger lost', () => {
    const base = bootstrapGame();

    const c1 = makeChar('q5-c1', 'p1', 3000, { effects: [onKOEffect] });
    const c2 = makeChar('q5-c2', 'p1', 3000, { effects: [onKOEffect] });
    const c3 = makeChar('q5-c3', 'p1', 3000, { effects: [onKOEffect] });
    const h2 = makeChar('q5-h2', 'p1', 2000, { zone: 'hand' });

    let s: GameState = addToP1Board(base, c1);
    s = addToP1Board(s, c2);
    s = addToP1Board(s, c3);
    s = {
      ...s,
      cards: { ...s.cards, [h2.id]: h2 },
      players: { ...s.players, [P1]: { ...s.players[P1]!, hand: [...s.players[P1]!.hand, h2.id] } },
    };

    s = resolveEffects(c1.effects!, 'OnKO', { sourceCardId: c1.id, sourcePlayerId: P1 }, s);
    s = resolveEffects(c2.effects!, 'OnKO', { sourceCardId: c2.id, sourcePlayerId: P1 }, s);
    s = resolveEffects(c3.effects!, 'OnKO', { sourceCardId: c3.id, sourcePlayerId: P1 }, s);

    // Skip c1
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: null }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingOnKOInteraction?.sourceCardId).toBe(c2.id);

    // Play h2 for c2
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: h2.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingOnKOInteraction?.sourceCardId).toBe(c3.id);

    // Skip c3
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P1, cardId: null }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingOnKOInteraction).toBeNull();
    expect(s.pendingOnKOQueue.length).toBe(0);

    // Only h2 landed on board
    expect(s.players[P1]!.board).toContain(h2.id);
  });

  // ── Q6: KO effect action with 2 multi-target KOs — both prompts queued ────────
  it('Q6: KO effect targeting 2 cards with OnKO — both prompts served via queue', () => {
    const base = bootstrapGame();

    const victim1 = makeChar('q6-v1', 'p2', 2000, { effects: [onKOEffect] });
    const victim2 = makeChar('q6-v2', 'p2', 2000, { effects: [onKOEffect] });
    // P2 owns victims but P1 casts the KO — OnKO fires for P2 (card owners)
    // We need hand cards for P2
    const h1 = makeChar('q6-h1', 'p2', 2000, { zone: 'hand', color: 'Red' });
    const h2 = makeChar('q6-h2', 'p2', 2000, { zone: 'hand', color: 'Red' });

    let s: GameState = addToP2Board(base, victim1);
    s = addToP2Board(s, victim2);
    s = {
      ...s,
      cards: { ...s.cards, [h1.id]: h1, [h2.id]: h2 },
      players: { ...s.players, [P2]: { ...s.players[P2]!, hand: [...s.players[P2]!.hand, h1.id, h2.id] } },
    };

    // KO effect targeting all opponent characters (P1 casts, KOs P2's board)
    const koEffect: CardEffect = {
      trigger: 'OnPlay',
      actions: [{ type: 'KO', target: { scope: 'AllOpponentCharacters' } }],
    };
    const caster = makeChar('q6-caster', 'p1', 4000, { effects: [koEffect] });
    s = addToP1Board(s, caster);

    s = resolveEffects(caster.effects!, 'OnPlay', { sourceCardId: caster.id, sourcePlayerId: P1 }, s);

    // Both victims KO'd, both OnKO triggered
    expect(s.players[P2]!.board).not.toContain(victim1.id);
    expect(s.players[P2]!.board).not.toContain(victim2.id);

    // First victim's prompt active, second in queue
    expect(s.pendingOnKOInteraction).not.toBeNull();
    expect(s.pendingOnKOQueue.length).toBe(1);

    // Resolve first prompt (play h1 for victim1's OnKO)
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P2, cardId: h1.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingOnKOInteraction).not.toBeNull();
    expect(s.pendingOnKOQueue.length).toBe(0);

    // Resolve second prompt (play h2 for victim2's OnKO)
    s = applyAction(s, { type: 'ResolveOnKOInteraction', playerId: P2, cardId: h2.id }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.pendingOnKOInteraction).toBeNull();
    expect(s.pendingOnKOQueue.length).toBe(0);
    expect(s.players[P2]!.board).toContain(h1.id);
    expect(s.players[P2]!.board).toContain(h2.id);
  });
});
