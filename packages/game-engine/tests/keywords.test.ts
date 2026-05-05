/**
 * Comprehensive tests for all OPTcg keywords and triggers.
 *
 * Coverage:
 *   Combat keywords  : Rush, Blocker, DoubleAttack, Unblockable, Banish
 *   Timing triggers  : OnPlay, OnAttack, OnKO, OnLeaveField, OnBlock, Trigger (life)
 *   Phase triggers   : StartOfTurn, StartOfOpponentTurn, StartOfMainPhase, EndOfTurn
 *   Conditions       : HasRestingDon, HasAttachedDon, LeaderHasAttachedDon
 *   Restrictions     : Once-per-turn (activatedAbilityIds)
 */
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
  return { ...s, phase: 'Main', turnNumber: 3 };
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

function addToP1Hand(state: GameState, card: Card): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand' } },
    players: { ...state.players, [P1]: { ...state.players[P1]!, hand: [...state.players[P1]!.hand, card.id] } },
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

// ─── 1. COMBAT KEYWORDS ───────────────────────────────────────────────────────

describe('[Rush] — attaque le tour où posée', () => {
  it('carte sans Rush posée ce tour → SUMMON_SICKNESS', () => {
    const base = bootstrapGame();
    const char = makeChar('no-rush', 'p1', 2000, { zone: 'hand', cost: 0 });
    const target = makeChar('target', 'p2', 1000, { zone: 'board' });
    let s = addToP1Hand(base, char);
    s = addToP2Board(s, target);
    const afterPlay = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: char.id });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;
    const result = applyAction(afterPlay, { type: 'DeclareAttack', playerId: P1, attackerId: char.id, targetId: target.id });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('SUMMON_SICKNESS');
  });

  it('carte avec Rush posée ce tour → peut attaquer', () => {
    const base = bootstrapGame();
    const char = makeChar('rush-char', 'p1', 2000, { zone: 'hand', cost: 0, keywords: ['Rush'] });
    const target = makeChar('target', 'p2', 1000, { zone: 'board', tapped: true });
    let s = addToP1Hand(base, char);
    s = addToP2Board(s, target);
    const afterPlay = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: char.id });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;
    const result = applyAction(afterPlay, { type: 'DeclareAttack', playerId: P1, attackerId: char.id, targetId: target.id });
    expect(isGameError(result)).toBe(false);
  });
});

describe('[Blocker] — redirige une attaque', () => {
  it('carte sans Blocker → NO_BLOCKER_KEYWORD', () => {
    const base = bootstrapGame();
    const attacker = makeChar('atk', 'p1', 3000);
    const nonBlocker = makeChar('non-blocker', 'p2', 2000);
    let s = addToP1Board(base, attacker);
    s = addToP2Board(s, nonBlocker);
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    const result = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: nonBlocker.id });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_BLOCKER_KEYWORD');
  });

  it('carte avec Blocker → redirige l\'attaque', () => {
    const base = bootstrapGame();
    const attacker = makeChar('atk', 'p1', 3000);
    const blocker = makeChar('blocker', 'p2', 2000, { keywords: ['Blocker'] });
    let s = addToP1Board(base, attacker);
    s = addToP2Board(s, blocker);
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    const result = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: blocker.id });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) expect(result.activeCombat?.blockerId).toBe(blocker.id);
  });
});

describe('[DoubleAttack] — 2 dommages au leader', () => {
  it('attaque non bloquée avec DoubleAttack → 2 cartes de Vie retirées', () => {
    const base = bootstrapGame();
    const attacker = makeChar('da-char', 'p1', 99000, { keywords: ['DoubleAttack'] });
    let s = addToP1Board(base, attacker);
    const lifeBefore = s.players[P2]!.life.length;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    const result = applyAction(s, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P2]!.life.length).toBe(lifeBefore - 2);
  });
});

describe('[Unblockable] — ne peut pas être bloqué', () => {
  it('attaquant Unblockable → DeclareBlock rejeté', () => {
    const base = bootstrapGame();
    const attacker = makeChar('unblock-atk', 'p1', 3000, { keywords: ['Unblockable'] });
    const blocker = makeChar('blocker', 'p2', 5000, { keywords: ['Blocker'] });
    let s = addToP1Board(base, attacker);
    s = addToP2Board(s, blocker);
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    const result = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: blocker.id });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('UNBLOCKABLE');
  });
});

describe('[Banish] — KO envoie la carte dans "removed" et non trash', () => {
  it('attaquant Banish → personnage KO va dans zone removed', () => {
    const base = bootstrapGame();
    const banisher = makeChar('banisher', 'p1', 5000, { keywords: ['Banish'] });
    const victim = makeChar('victim', 'p2', 1000, { tapped: true });
    let s = addToP1Board(base, banisher);
    s = addToP2Board(s, victim);
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: banisher.id, targetId: victim.id }) as GameState;
    const result = applyAction(s, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[victim.id]?.zone).toBe('removed');
    expect(result.players[P2]!.trash).not.toContain(victim.id);
    expect(result.players[P2]!.board).not.toContain(victim.id);
  });

  it('sans Banish → personnage KO va en trash', () => {
    const base = bootstrapGame();
    const attacker = makeChar('normal-atk', 'p1', 5000);
    const victim = makeChar('victim2', 'p2', 1000, { tapped: true });
    let s = addToP1Board(base, attacker);
    s = addToP2Board(s, victim);
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: victim.id }) as GameState;
    const result = applyAction(s, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.cards[victim.id]?.zone).toBe('trash');
    expect(result.players[P2]!.trash).toContain(victim.id);
  });
});

// ─── 2. TIMING TRIGGERS ───────────────────────────────────────────────────────

describe('[On Play] trigger', () => {
  it('OnPlay → effet déclenché à la pose', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'OnPlay', actions: [{ type: 'DrawCard', count: 1 }] };
    const char = makeChar('on-play-char', 'p1', 2000, { zone: 'hand', cost: 0, effects: [eff] });
    const s = addToP1Hand(base, char);
    const deckBefore = s.players[P1]!.deck.length;
    const result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: char.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1);
  });
});

describe('[When Attacking] (OnAttack) trigger', () => {
  it('OnAttack → effet déclenché lors de la déclaration d\'attaque', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'OnAttack', actions: [{ type: 'DrawCard', count: 1 }] };
    const attacker = makeChar('on-atk-char', 'p1', 3000, { effects: [eff] });
    let s = addToP1Board(base, attacker);
    const deckBefore = s.players[P1]!.deck.length;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    expect(s.players[P1]!.deck.length).toBe(deckBefore - 1);
  });
});

describe('[When KO\'d] (OnKO) trigger', () => {
  it('OnKO via combat → effet déclenché', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'OnKO', actions: [{ type: 'DrawCard', count: 1 }] };
    const victim = makeChar('on-ko-victim', 'p2', 1000, { effects: [eff], tapped: true });
    const attacker = makeChar('on-ko-atk', 'p1', 5000);
    let s = addToP1Board(base, attacker);
    s = addToP2Board(s, victim);
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: victim.id }) as GameState;
    const p2DeckBefore = s.players[P2]!.deck.length;
    const result = applyAction(s, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // P2's OnKO effect draws 1 card for P2
    expect(result.players[P2]!.deck.length).toBe(p2DeckBefore - 1);
  });

  it('OnKO via action KO → effet déclenché', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'OnKO', actions: [{ type: 'DrawCard', count: 1 }] };
    const victim = makeChar('ko-action-victim', 'p2', 3000, { effects: [eff] });
    const caster = makeChar('ko-action-caster', 'p1', 2000, {
      effects: [{ trigger: 'OnPlay', actions: [{ type: 'KO', target: { scope: 'AllOpponentCharacters' } }] }],
      zone: 'hand', cost: 0,
    });
    let s = addToP2Board(base, victim);
    s = addToP1Hand(s, caster);
    const p2DeckBefore = s.players[P2]!.deck.length;
    const result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P2]!.deck.length).toBe(p2DeckBefore - 1);
  });
});

describe('[OnLeaveField] trigger', () => {
  it('OnLeaveField via KO en combat → effet déclenché', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'OnLeaveField', actions: [{ type: 'DrawCard', count: 1 }] };
    const victim = makeChar('leave-ko-victim', 'p2', 1000, { effects: [eff], tapped: true });
    const attacker = makeChar('leave-atk', 'p1', 5000);
    let s = addToP1Board(base, attacker);
    s = addToP2Board(s, victim);
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: victim.id }) as GameState;
    const p2DeckBefore = s.players[P2]!.deck.length;
    const result = applyAction(s, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P2]!.deck.length).toBe(p2DeckBefore - 1);
  });

  it('OnLeaveField via ReturnToHand → effet déclenché', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'OnLeaveField', actions: [{ type: 'DrawCard', count: 1 }] };
    const target = makeChar('leave-rth-target', 'p2', 2000, { effects: [eff] });
    const caster = makeChar('rth-caster', 'p1', 2000, {
      effects: [{ trigger: 'OnPlay', actions: [{ type: 'ReturnToHand', target: { scope: 'AllOpponentCharacters' } }] }],
      zone: 'hand', cost: 0,
    });
    let s = addToP2Board(base, target);
    s = addToP1Hand(s, caster);
    const p2DeckBefore = s.players[P2]!.deck.length;
    const result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: caster.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P2]!.deck.length).toBe(p2DeckBefore - 1);
  });
});

describe('[When Blocking] (OnBlock) trigger', () => {
  it('OnBlock → effet déclenché quand la carte bloque', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'OnBlock', actions: [{ type: 'DrawCard', count: 1 }] };
    const blocker = makeChar('on-block-char', 'p2', 3000, { keywords: ['Blocker'], effects: [eff] });
    const attacker = makeChar('on-block-atk', 'p1', 2000);
    let s = addToP1Board(base, attacker);
    s = addToP2Board(s, blocker);
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    const deckBefore = s.players[P2]!.deck.length;
    const result = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: blocker.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P2]!.deck.length).toBe(deckBefore - 1);
  });
});

describe('[Trigger] — révélée depuis la zone Vie', () => {
  it('Trigger PlaySelf → carte posée sur le board depuis la Vie', () => {
    const base = bootstrapGame();
    const triggerEff: CardEffect = { trigger: 'Trigger', actions: [{ type: 'PlaySelf' }] };
    const triggerCard = makeChar('trigger-card', 'p2', 2000, { zone: 'life', effects: [triggerEff] });
    // Inject the trigger card into P2's life zone
    const s: GameState = {
      ...base,
      cards: { ...base.cards, [triggerCard.id]: triggerCard },
      players: {
        ...base.players,
        [P2]: { ...base.players[P2]!, life: [triggerCard.id, ...base.players[P2]!.life] },
      },
    };
    const attacker = makeChar('trigger-atk', 'p1', 99000);
    const s2 = addToP1Board(s, attacker);
    const s3 = applyAction(s2, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    const result = applyAction(s3, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    // Trigger card should be on P2's board via PlaySelf
    expect(result.players[P2]!.board).toContain(triggerCard.id);
    expect(result.cards[triggerCard.id]?.zone).toBe('board');
  });
});

// ─── 3. PHASE TRIGGERS ────────────────────────────────────────────────────────

describe('[At the Start of Your Turn] (StartOfTurn) trigger', () => {
  it('StartOfTurn → effet déclenché au début du tour du propriétaire', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'StartOfTurn', actions: [{ type: 'DrawCard', count: 1 }] };
    const card = makeChar('sot-card', 'p1', 3000, { effects: [eff] });
    // Start from End phase — transition to next turn will fire StartOfTurn
    let s: GameState = { ...addToP1Board(base, card), phase: 'End' };
    const deckBefore = s.players[P1]!.deck.length;
    // EndPhase from End → P2's Refresh (P1's StartOfOpponentTurn, not StartOfTurn yet)
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    // Now it's P2's turn — advance through P2's turn to get back to P1's StartOfTurn
    s = { ...s, phase: 'End' };
    s = applyAction(s, { type: 'EndPhase', playerId: P2 }) as GameState;
    // Now P1's StartOfTurn should have fired
    expect(s.players[P1]!.deck.length).toBe(deckBefore - 1);
  });
});

describe('[At the Start of Opponent\'s Turn] (StartOfOpponentTurn) trigger', () => {
  it('StartOfOpponentTurn → effet déclenché au début du tour de l\'adversaire', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'StartOfOpponentTurn', actions: [{ type: 'DrawCard', count: 1 }] };
    const card = makeChar('soot-card', 'p1', 3000, { effects: [eff] });
    // P1 is active in base (turn 3, Main). Move to End phase.
    let s: GameState = { ...addToP1Board(base, card), phase: 'End' };
    const deckBefore = s.players[P1]!.deck.length;
    // EndPhase from End → P2's Refresh. P1's card has StartOfOpponentTurn → fires when P2's turn starts.
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    expect(s.players[P1]!.deck.length).toBe(deckBefore - 1);
  });
});

describe('[At the Start of Main Phase] (StartOfMainPhase) trigger', () => {
  it('StartOfMainPhase → effet déclenché à l\'entrée de la phase Main', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'StartOfMainPhase', actions: [{ type: 'DrawCard', count: 1 }] };
    const card = makeChar('somp-card', 'p1', 3000, { effects: [eff] });
    // Start from DON phase — EndPhase goes DON → Main
    let s: GameState = { ...addToP1Board(base, card), phase: 'DON' };
    const deckBefore = s.players[P1]!.deck.length;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    expect(s.phase).toBe('Main');
    expect(s.players[P1]!.deck.length).toBe(deckBefore - 1);
  });
});

describe('[End of Your Turn] (EndOfTurn) trigger', () => {
  it('EndOfTurn → effet déclenché à l\'entrée de la phase End', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'EndOfTurn', actions: [{ type: 'DrawCard', count: 1 }] };
    const card = makeChar('eot-card', 'p1', 3000, { effects: [eff] });
    // Start from Main phase — EndPhase goes Main → End
    let s: GameState = { ...addToP1Board(base, card), phase: 'Main' };
    const deckBefore = s.players[P1]!.deck.length;
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    expect(s.phase).toBe('End');
    expect(s.players[P1]!.deck.length).toBe(deckBefore - 1);
  });
});

// ─── 4. CONDITIONS ────────────────────────────────────────────────────────────

describe('HasRestingDon condition (passive)', () => {
  it('OnAttack avec HasRestingDon — passe si DON épuisés suffisants', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnAttack',
      condition: { type: 'HasRestingDon', count: 1 },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const attacker = makeChar('hrd-atk', 'p1', 3000, { effects: [eff] });
    const restedDon = makeDon('hrd-don', 'p1', { tapped: true });
    let s = addToP1Board(base, attacker);
    s = addRestedDon(s, [restedDon]);
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    // Effect fires (1 rested DON present)
    const deckBefore = base.players[P1]!.deck.length;
    expect(s.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

  it('OnAttack avec HasRestingDon — ignoré si pas assez de DON épuisés', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnAttack',
      condition: { type: 'HasRestingDon', count: 2 },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const attacker = makeChar('hrd-no-atk', 'p1', 3000, { effects: [eff] });
    const restedDon = makeDon('hrd-don2', 'p1', { tapped: true });
    let s = addToP1Board(base, attacker);
    s = addRestedDon(s, [restedDon]); // only 1, need 2
    const deckBefore = s.players[P1]!.deck.length;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    expect(s.players[P1]!.deck.length).toBe(deckBefore); // no draw
  });
});

describe('HasAttachedDon condition', () => {
  it('effet avec HasAttachedDon — passe si la carte a assez de DON attachés', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnAttack',
      condition: { type: 'HasAttachedDon', count: 2 },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const attacker = makeChar('had-atk', 'p1', 3000, { effects: [eff] });
    const don1 = makeDon('had-don1', 'p1', { tapped: true, attachedTo: makeCardId('had-atk') });
    const don2 = makeDon('had-don2', 'p1', { tapped: true, attachedTo: makeCardId('had-atk') });
    let s = addToP1Board(base, attacker);
    s = {
      ...s,
      cards: { ...s.cards, [don1.id]: don1, [don2.id]: don2 },
      players: { ...s.players, [P1]: { ...s.players[P1]!, donArea: [...s.players[P1]!.donArea, don1.id, don2.id] } },
    };
    const deckBefore = s.players[P1]!.deck.length;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    expect(s.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

  it('effet avec HasAttachedDon — ignoré si pas assez de DON attachés', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'OnAttack',
      condition: { type: 'HasAttachedDon', count: 2 },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const attacker = makeChar('had-no-atk', 'p1', 3000, { effects: [eff] });
    const don1 = makeDon('had-don3', 'p1', { tapped: true, attachedTo: makeCardId('had-no-atk') });
    let s = addToP1Board(base, attacker);
    s = {
      ...s,
      cards: { ...s.cards, [don1.id]: don1 },
      players: { ...s.players, [P1]: { ...s.players[P1]!, donArea: [...s.players[P1]!.donArea, don1.id] } },
    };
    const deckBefore = s.players[P1]!.deck.length;
    s = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: attacker.id, targetId: makeCardId('p2-leader') }) as GameState;
    expect(s.players[P1]!.deck.length).toBe(deckBefore);
  });
});

describe('LeaderHasAttachedDon condition (ST21-001 pattern)', () => {
  it('Activated du leader — réussit si leader a ≥1 DON attaché', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'LeaderHasAttachedDon', count: 1 },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const leaderId = base.players[P1]!.leader!;
    // Add the Activated effect to the leader
    const s: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [leaderId]: { ...base.cards[leaderId]!, effects: [eff] },
      },
    };
    const attachedDon = makeDon('lhad-don', 'p1', { tapped: true, attachedTo: leaderId });
    const s2: GameState = {
      ...s,
      cards: { ...s.cards, [attachedDon.id]: attachedDon },
      players: { ...s.players, [P1]: { ...s.players[P1]!, donArea: [...s.players[P1]!.donArea, attachedDon.id] } },
    };
    const deckBefore = s2.players[P1]!.deck.length;
    const result = applyAction(s2, { type: 'ActivatedAbility', playerId: P1, cardId: leaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;
    expect(result.players[P1]!.deck.length).toBe(deckBefore - 1);
  });

  it('Activated du leader — échoue si leader n\'a aucun DON attaché', () => {
    const base = bootstrapGame();
    const eff: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'LeaderHasAttachedDon', count: 1 },
      actions: [{ type: 'DrawCard', count: 1 }],
    };
    const leaderId = base.players[P1]!.leader!;
    const s: GameState = {
      ...base,
      cards: { ...base.cards, [leaderId]: { ...base.cards[leaderId]!, effects: [eff] } },
    };
    const deckBefore = s.players[P1]!.deck.length;
    // No DON attached to leader — should return CONDITION_NOT_MET error
    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: leaderId });
    expect(isGameError(result)).toBe(true);
    if (!isGameError(result)) return;
    expect(result.code).toBe('CONDITION_NOT_MET');
  });
});

// ─── 5. ONCE-PER-TURN RESTRICTION ────────────────────────────────────────────

describe('[Once Per Turn] — restriction activatedAbilityIds', () => {
  it('Activated utilisé une fois → succès', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'Activated', actions: [{ type: 'DrawCard', count: 1 }] };
    const card = makeChar('once-card', 'p1', 3000, { effects: [eff] });
    const s = addToP1Board(base, card);
    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) expect(result.activatedAbilityIds).toContain(card.id);
  });

  it('Activated utilisé deux fois le même tour → ALREADY_ACTIVATED', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'Activated', actions: [{ type: 'DrawCard', count: 1 }] };
    const card = makeChar('once-card2', 'p1', 3000, { effects: [eff] });
    let s = addToP1Board(base, card);
    s = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: card.id }) as GameState;
    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: card.id });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('ALREADY_ACTIVATED');
  });

  it('EndOfOpponentTurn PowerBoost — actif pendant le tour adverse, nettoyé au tour suivant', () => {
    const base = bootstrapGame();
    // Franky-like: Activated [HasRestingDon x2] → PowerBoost +1000 to all chars ≤4000 until end of opponent's turn
    const eff: CardEffect = {
      trigger: 'Activated',
      condition: { type: 'HasRestingDon', count: 2 },
      actions: [{ type: 'PowerBoost', amount: 1000, target: { scope: 'AllOwnCharacters', maxPower: 4000 }, duration: 'EndOfOpponentTurn' }],
    };
    const franky = makeChar('franky', 'p1', 4000, { effects: [eff] });
    const ally = makeChar('ally', 'p1', 3000);
    const bigAlly = makeChar('big-ally', 'p1', 5000); // above maxPower → should NOT get boost
    const restedDon1 = makeDon('eot-don1', 'p1', { tapped: true });
    const restedDon2 = makeDon('eot-don2', 'p1', { tapped: true });
    let s = addToP1Board(base, franky);
    s = addToP1Board(s, ally);
    s = addToP1Board(s, bigAlly);
    s = addFreeDon(s, [restedDon1, restedDon2]); // active DON!! (untapped) — Activated guard requires N active DON!!

    // P1 activates ability during Main Phase
    s = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: franky.id }) as GameState;
    // powerModifierOT applied; powerModifier NOT set
    expect(s.cards[franky.id]?.powerModifierOT).toBe(1000);
    expect(s.cards[ally.id]?.powerModifierOT).toBe(1000);
    expect(s.cards[bigAlly.id]?.powerModifierOT).toBeUndefined(); // >4000 base power → excluded

    // End P1's turn
    s = { ...s, phase: 'End' };
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState; // → P2 Refresh
    // OT modifier must still be present during P2's turn
    expect(s.cards[franky.id]?.powerModifierOT).toBe(1000);
    expect(s.cards[ally.id]?.powerModifierOT).toBe(1000);

    // End P2's turn → P1's Refresh → OT modifier cleared
    s = { ...s, activePlayerId: P2, phase: 'End' };
    s = applyAction(s, { type: 'EndPhase', playerId: P2 }) as GameState;
    expect(s.cards[franky.id]?.powerModifierOT).toBeUndefined();
    expect(s.cards[ally.id]?.powerModifierOT).toBeUndefined();
  });

  it('activatedAbilityIds vidé au changement de tour', () => {
    const base = bootstrapGame();
    const eff: CardEffect = { trigger: 'Activated', actions: [{ type: 'DrawCard', count: 1 }] };
    const card = makeChar('once-card3', 'p1', 3000, { effects: [eff] });
    let s = addToP1Board(base, card);
    // Activate once
    s = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: card.id }) as GameState;
    expect(s.activatedAbilityIds).toContain(card.id);
    // End the turn
    s = { ...s, phase: 'End' };
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState; // End → P2 Refresh
    // Back to P1 turn
    s = { ...s, activePlayerId: P1, phase: 'End' };
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    // activatedAbilityIds cleared
    expect(s.activatedAbilityIds).not.toContain(card.id);
  });
});

// ─── Régression : premier tour et Rush ───────────────────────────────────────

describe('[Rush] régression — règle du premier tour', () => {
  it('turnNumber 1 (premier tour J1) — aucune attaque même avec Rush', () => {
    // OPTCG : seul le premier joueur ne peut pas attaquer à son tout premier tour.
    const base = bootstrapGame();
    const rushChar = makeChar('rush-t1', 'p1', 5000, { keywords: ['Rush'] });
    const target = makeChar('target', 'p2', 1000, { tapped: true });
    let s = addToP1Board(base, rushChar);
    s = addToP2Board(s, target);
    // Force turnNumber 1 (premier tour de J1)
    s = { ...s, turnNumber: 1 };
    const result = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: rushChar.id, targetId: target.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_ATTACK_FIRST_TURN');
  });

  it('turnNumber 2 (premier tour J2) — peut attaquer avec un personnage déjà en jeu', () => {
    // OPTCG : le second joueur peut attaquer dès son premier tour.
    const base = bootstrapGame();
    const char = makeChar('p2-veteran', 'p2', 3000);
    const target = makeChar('p1-target', 'p1', 1000, { tapped: true });
    let s = addToP2Board(base, char);
    s = addToP1Board(s, target);
    // Force turnNumber 2 (premier tour de J2, phase Main)
    s = { ...s, turnNumber: 2, activePlayerId: P2, phase: 'Main' };
    const result = applyAction(s, {
      type: 'DeclareAttack', playerId: P2, attackerId: char.id, targetId: target.id,
    });
    expect(isGameError(result)).toBe(false);
  });

  it('turnNumber 2 — personnage avec Rush posé ce tour peut attaquer', () => {
    // Rush doit fonctionner dès le premier tour du second joueur.
    const base = bootstrapGame();
    const rushChar = makeChar('rush-p2', 'p2', 3000, { zone: 'hand', cost: 0, keywords: ['Rush'] });
    const target = makeChar('p1-target', 'p1', 1000, { tapped: true });
    let s = addToP1Board(base, target);
    // Add rush char to P2 hand
    s = {
      ...s,
      cards: { ...s.cards, [rushChar.id]: { ...rushChar, zone: 'hand' } },
      players: { ...s.players, [P2]: { ...s.players[P2]!, hand: [...s.players[P2]!.hand, rushChar.id] } },
    };
    s = { ...s, turnNumber: 2, activePlayerId: P2, phase: 'Main' };

    const afterPlay = applyAction(s, {
      type: 'PlayCharacterFromHand', playerId: P2, cardId: rushChar.id,
    });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;

    const result = applyAction(afterPlay, {
      type: 'DeclareAttack', playerId: P2, attackerId: rushChar.id, targetId: target.id,
    });
    expect(isGameError(result)).toBe(false);
  });

  it('turnNumber 2 — personnage sans Rush posé ce tour → SUMMON_SICKNESS', () => {
    const base = bootstrapGame();
    const char = makeChar('no-rush-p2', 'p2', 3000, { zone: 'hand', cost: 0 });
    const target = makeChar('p1-target', 'p1', 1000, { tapped: true });
    let s = addToP1Board(base, target);
    s = {
      ...s,
      cards: { ...s.cards, [char.id]: { ...char, zone: 'hand' } },
      players: { ...s.players, [P2]: { ...s.players[P2]!, hand: [...s.players[P2]!.hand, char.id] } },
    };
    s = { ...s, turnNumber: 2, activePlayerId: P2, phase: 'Main' };

    const afterPlay = applyAction(s, {
      type: 'PlayCharacterFromHand', playerId: P2, cardId: char.id,
    });
    expect(isGameError(afterPlay)).toBe(false);
    if (isGameError(afterPlay)) return;

    const result = applyAction(afterPlay, {
      type: 'DeclareAttack', playerId: P2, attackerId: char.id, targetId: target.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('SUMMON_SICKNESS');
  });

  it('Rush via GiveKeyword (temporaryKeyword) permet d\'attaquer le tour joué', () => {
    // Une carte à laquelle on donne Rush via effet doit pouvoir attaquer immédiatement.
    const base = bootstrapGame();
    const target = makeChar('t', 'p2', 1000, { tapped: true });
    const newChar = makeChar('new-char', 'p1', 3000, { zone: 'hand', cost: 0 });
    let s = addToP2Board(base, target);
    s = addToP1Hand(s, newChar);
    // Play the character (adds to newBoardIds)
    s = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: newChar.id }) as GameState;
    // Manually grant Rush via temporaryKeywords (simulating GiveKeyword effect)
    s = {
      ...s,
      cards: {
        ...s.cards,
        [newChar.id]: { ...s.cards[newChar.id]!, temporaryKeywords: ['Rush'] },
      },
    };
    // Now the character is new AND has Rush → should be able to attack
    const result = applyAction(s, {
      type: 'DeclareAttack', playerId: P1, attackerId: newChar.id, targetId: target.id,
    });
    expect(isGameError(result)).toBe(false);
  });
});
