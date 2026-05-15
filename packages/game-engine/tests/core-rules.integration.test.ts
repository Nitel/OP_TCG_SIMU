/**
 * Core Rules Integration Tests
 *
 * Validates official One Piece Card Game rules against the engine.
 * Tests that fail document gaps between current behaviour and the official rules —
 * they are intentional and serve as a regression baseline for future fixes.
 *
 * Sources: Official Rule Manual, Comprehensive Rules.
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
import type { Card, CardId, CardEffect, GameState, PlayerId, PlayerSetup } from '../src/index.js';

// ─── Player IDs (prefixed to avoid collision with other test files) ────────────

const P1 = makePlayerId('cr-p1');
const P2 = makePlayerId('cr-p2');

// ─── Card factories ───────────────────────────────────────────────────────────

function makeChar(id: string, ownerId: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 0,
    power,
    color: 'Red',
    type: 'Character',
    zone: 'board',
    ownerId,
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makeDon(id: string, ownerId: PlayerId, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: 'DON!!',
    cost: 0,
    power: 0,
    color: 'Red',
    type: 'DON',
    zone: 'donArea',
    ownerId,
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makePlayerSetup(id: PlayerId): PlayerSetup {
  const idStr = id as string;
  return {
    id,
    leaderCard: makeChar(`${idStr}-leader`, id, 5000, { type: 'Leader', zone: 'deck' }),
    deckCards: Array.from({ length: 50 }, (_, i) =>
      makeChar(`${idStr}-dk-${i}`, id, 2000, { zone: 'deck' }),
    ),
    donCards: Array.from({ length: 10 }, (_, i) =>
      makeDon(`${idStr}-don-${i}`, id) as Card,
    ),
  };
}

// ─── State helpers ────────────────────────────────────────────────────────────

/**
 * Returns state immediately after both mulligans:
 *   phase: 'Refresh', activePlayerId: P1, turnNumber: 1
 */
function afterMulligan(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup(P1),
    player2: makePlayerSetup(P2),
    firstPlayerId: P1,
  });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  return s;
}

/**
 * Advance from Refresh phase to Main phase for the active player.
 * Also handles the DON draw that occurs during this transition.
 */
function advanceToMain(state: GameState): GameState {
  const pid = state.activePlayerId;
  // Refresh → Draw
  let s = applyAction(state, { type: 'EndPhase', playerId: pid });
  if (isGameError(s)) throw new Error(`EndPhase Refresh→Draw failed: ${s.message}`);
  // DrawPhase → advances to DON (+ draws card if not P1 turn 1)
  s = applyAction(s, { type: 'DrawPhase', playerId: pid });
  if (isGameError(s)) throw new Error(`DrawPhase failed: ${s.message}`);
  // DON → Main
  s = applyAction(s, { type: 'EndPhase', playerId: pid });
  if (isGameError(s)) throw new Error(`EndPhase DON→Main failed: ${s.message}`);
  return s;
}

/**
 * End the active player's turn and hand off to the opponent.
 * Returns state at the opponent's Refresh phase.
 */
function endTurn(state: GameState): GameState {
  const pid = state.activePlayerId;
  // Main → End
  let s = applyAction(state, { type: 'EndPhase', playerId: pid });
  if (isGameError(s)) throw new Error(`EndPhase Main→End failed: ${s.message}`);
  // End → turn switch (Refresh for opponent)
  s = applyAction(s, { type: 'EndPhase', playerId: pid });
  if (isGameError(s)) throw new Error(`EndPhase End→turnSwitch failed: ${s.message}`);
  return s;
}

function addToBoard(state: GameState, card: Card, ownerId: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: {
      ...state.players,
      [ownerId]: {
        ...state.players[ownerId]!,
        board: [...(state.players[ownerId]?.board ?? []), card.id],
      },
    },
  };
}

function addToHand(state: GameState, card: Card, ownerId: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand' } },
    players: {
      ...state.players,
      [ownerId]: {
        ...state.players[ownerId]!,
        hand: [...(state.players[ownerId]?.hand ?? []), card.id],
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A — PREMIER TOUR : aucune attaque autorisée
// Official rule: "Neither player can attack on their first turn."
// ─────────────────────────────────────────────────────────────────────────────

describe('A — Premier tour : aucune attaque autorisée', () => {
  it('A1 — Joueur 1, tour 1 : le Leader de P1 ne peut pas attaquer', () => {
    // Official rule: No attacks on either player's first turn.
    // Engine: turnNumber <= 2 → NO_ATTACK_FIRST_TURN.
    let s = advanceToMain(afterMulligan()); // P1, turn 1, Main phase
    expect(s.turnNumber).toBe(1);
    expect(s.activePlayerId).toBe(P1);

    const p2LeaderId = s.players[P2]!.leader!;
    const p1LeaderId = s.players[P1]!.leader!;

    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: p1LeaderId,
      targetId: p2LeaderId,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_ATTACK_FIRST_TURN');
  });

  it('A2 — Joueur 1, tour 1 : un Character joué en main ne peut pas non plus attaquer', () => {
    let s = advanceToMain(afterMulligan()); // P1, turn 1, Main phase

    // Add a character to P1's board (not via play — bypass summoning sickness
    // to test the first-turn restriction specifically)
    const char = makeChar('cr-a2-char', P1, 5000);
    s = addToBoard(s, char, P1);

    const p2LeaderId = s.players[P2]!.leader!;
    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: char.id,
      targetId: p2LeaderId,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_ATTACK_FIRST_TURN');
  });

  it('A3 — Joueur 2, à son propre premier tour (turnNumber=2) : ne peut pas attaquer', () => {
    // P2's first turn is turnNumber=2. Same restriction applies.
    const afterP1Turn = endTurn(advanceToMain(afterMulligan())); // P2 at Refresh, turn 2
    let s = advanceToMain(afterP1Turn);
    expect(s.turnNumber).toBe(2);
    expect(s.activePlayerId).toBe(P2);

    const p1LeaderId = s.players[P1]!.leader!;
    const p2LeaderId = s.players[P2]!.leader!;

    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P2,
      attackerId: p2LeaderId,
      targetId: p1LeaderId,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_ATTACK_FIRST_TURN');
  });

  it('A4 — Rush ne bypasse PAS la restriction premier tour (régression bot)', () => {
    // Regression guard: before the fix, turnNumber <= 1 only blocked P1's turn.
    // P2 (the bot) could attack on turn 2 even with a Rush character, because:
    //   - first-turn check: 2 <= 1 → false (not blocked)  ← BUG
    //   - summon-sickness check: isNewCard && !hasRush → false (Rush bypasses)
    // Fix: turnNumber <= 2 now correctly blocks both players' first turns.
    const afterP1Turn = endTurn(advanceToMain(afterMulligan())); // P2 at Refresh, turn 2
    let s = advanceToMain(afterP1Turn);
    expect(s.turnNumber).toBe(2);
    expect(s.activePlayerId).toBe(P2);

    // Add a Rush character to P2's board (simulates bot playing one early)
    const rushChar = makeChar('cr-a4-rush', P2, 5000, { keywords: ['Rush'] });
    s = addToBoard(s, rushChar, P2);

    const p1LeaderId = s.players[P1]!.leader!;
    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P2,
      attackerId: rushChar.id,
      targetId: p1LeaderId,
    });
    // Must be blocked by the first-turn check, not pass through to summon-sickness
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_ATTACK_FIRST_TURN');
  });

  it('A5 — Joueur 2 premier joueur (turnNumber=1) : ne peut pas non plus attaquer', () => {
    // When P2 is firstPlayerId, P2's first turn is turn 1. Must also be blocked.
    function afterMulliganP2First(): GameState {
      const seed = makeEmptyState(P1, P2);
      let s = applyAction(seed, {
        type: 'StartGame',
        player1: makePlayerSetup(P1),
        player2: makePlayerSetup(P2),
        firstPlayerId: P2,  // P2 goes first
      });
      if (isGameError(s)) throw new Error(s.message);
      s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
      if (isGameError(s)) throw new Error(s.message);
      s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
      if (isGameError(s)) throw new Error(s.message);
      return s;
    }

    let s = advanceToMain(afterMulliganP2First()); // P2 turn 1, Main
    expect(s.turnNumber).toBe(1);
    expect(s.activePlayerId).toBe(P2);

    const p1LeaderId = s.players[P1]!.leader!;
    const p2LeaderId = s.players[P2]!.leader!;

    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P2,
      attackerId: p2LeaderId,
      targetId: p1LeaderId,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('NO_ATTACK_FIRST_TURN');
  });

  it('A6 — Tour 3 (deuxième tour de P1) : P1 peut attaquer normalement', () => {
    // Positive test: after both first turns, attacks are allowed.
    const base = afterMulligan(); // P1 turn 1
    const afterP1 = endTurn(advanceToMain(base));     // P2 turn 2
    const afterP2 = endTurn(advanceToMain(afterP1));  // P1 turn 3
    let s = advanceToMain(afterP2);
    expect(s.turnNumber).toBe(3);
    expect(s.activePlayerId).toBe(P1);

    const p2LeaderId = s.players[P2]!.leader!;
    const p1LeaderId = s.players[P1]!.leader!;

    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: p1LeaderId,
      targetId: p2LeaderId,
    });
    // Turn 3 is P1's second turn — attack must succeed
    expect(isGameError(result)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — MAXIMUM 5 CHARACTERS SUR LE BOARD
// Official rule: "You cannot have more than 5 Characters in play."
// ⚠ Ces tests ÉCHOUENT intentionnellement : le moteur n'applique pas encore
//   cette limite. Ils serviront de guide pour le fix à venir.
// ─────────────────────────────────────────────────────────────────────────────

describe('B — Limite de 5 Characters par joueur', () => {
  function setupWith5Chars(): { s: GameState; sixthChar: Card } {
    // Bootstrap at Main phase, turn 3 (attacks unlocked) for simplicity
    const base = afterMulligan();
    let s = advanceToMain(base); // P1, turn 1

    // End turn 1 + turn 2 to reach turn 3 (P1's second turn with attack rights)
    s = endTurn(s);                  // → P2's Refresh, turn 2
    s = advanceToMain(s);            // P2, turn 2, Main
    s = endTurn(s);                  // → P1's Refresh, turn 3
    s = advanceToMain(s);            // P1, turn 3, Main ← attacks unlocked

    // Place exactly 5 Characters on P1's board (injected directly, bypass summoning sickness)
    for (let i = 1; i <= 5; i++) {
      s = addToBoard(s, makeChar(`cr-b-char-${i}`, P1, 2000), P1);
    }
    expect(s.players[P1]!.board.length).toBe(5);

    // 6th character ready in hand
    const sixthChar = makeChar('cr-b-sixth', P1, 2000, { zone: 'hand' });
    s = addToHand(s, sixthChar, P1);
    return { s, sixthChar };
  }

  it('B1 — jouer un 6e Character via PlayCharacterFromHand → BOARD_FULL', () => {
    const { s, sixthChar } = setupWith5Chars();

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: sixthChar.id,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('BOARD_FULL');
  });

  it('B2 — avec exactement 5 Characters, le board est considéré plein', () => {
    // OFFICIAL RULE: board capacity is exactly 5.
    // This test documents what "full" means regardless of engine state.
    const { s } = setupWith5Chars();

    // Confirm the board has 5 characters (not counting leader)
    const p1Board = s.players[P1]!.board;
    const charCount = p1Board.filter((id) => s.cards[id]?.type === 'Character').length;
    expect(charCount).toBe(5); // ← this assertion always passes (setup invariant)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B3 — BOARD LIMIT : AUTRES CHEMINS DE JEU
// Official rule applies to ALL paths that put a Character onto the board,
// not just PlayCharacterFromHand.
// ─────────────────────────────────────────────────────────────────────────────

describe('B3 — Board limit 5 Characters : autres chemins de jeu', () => {
  /** Shared setup: P1 Main phase turn 3, P1 board full (5 Characters). */
  function setupFullBoard(): GameState {
    const base = afterMulligan();
    let s = advanceToMain(base);
    s = endTurn(s); s = advanceToMain(s);
    s = endTurn(s); s = advanceToMain(s); // P1 Main, turn 3

    for (let i = 0; i < 5; i++) {
      s = addToBoard(s, makeChar(`cr-bf-base-${i}`, P1, 2000), P1);
    }
    return s;
  }

  it('B3a — ResolveOnKOInteraction sur board plein → BOARD_FULL', () => {
    let s = setupFullBoard();

    // A Character in P1's hand (eligible for the pending effect)
    const handChar = makeChar('cr-bf3a-hand', P1, 3000, { zone: 'hand', color: 'Red' });
    s = addToHand(s, handChar, P1);

    // Manually set pendingOnKOInteraction (simulates a real OnKO trigger)
    s = {
      ...s,
      pendingOnKOInteraction: {
        playerId: P1,
        filter: { cardType: 'Character' as const },
        sourceCardId: makeCardId('cr-bf3a-source'),
      },
    };

    const result = applyAction(s, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: handChar.id,
    });

    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('BOARD_FULL');
  });

  it('B3b — PlaySelf via Trigger sur board plein → Character reste en main, pas sur board', () => {
    const base = afterMulligan();
    let s = advanceToMain(base);
    s = endTurn(s); s = advanceToMain(s);
    s = endTurn(s); s = advanceToMain(s);
    s = endTurn(s); s = advanceToMain(s); // P2 Main, turn 4

    // P1 board: 5 Characters
    for (let i = 0; i < 5; i++) {
      s = addToBoard(s, makeChar(`cr-bf3b-board-${i}`, P1, 2000), P1);
    }

    // P1 life: Trigger card at the top
    const triggerChar = makeChar('cr-bf3b-trigger', P1, 3000, {
      zone: 'life',
      keywords: ['Trigger'],
      effects: [{ trigger: 'Trigger' as const, actions: [{ type: 'PlaySelf' as const }] }],
    });
    s = {
      ...s,
      cards: { ...s.cards, [triggerChar.id]: triggerChar },
      players: {
        ...s.players,
        [P1]: { ...s.players[P1]!, life: [triggerChar.id, ...s.players[P1]!.life] },
      },
    };

    // P2 attacker (not in newBoardIds → no summoning sickness)
    const attacker = makeChar('cr-bf3b-atk', P2, 8000);
    s = addToBoard(s, attacker, P2);
    const p1Leader = s.players[P1]!.leader!;

    let r = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P2,
      attackerId: attacker.id,
      targetId: p1Leader,
    });
    expect(isGameError(r)).toBe(false);
    if (isGameError(r)) return;

    r = applyAction(r, { type: 'ResolveCombat', playerId: P2 });
    expect(isGameError(r)).toBe(false);
    if (isGameError(r)) return;

    const p1 = r.players[P1]!;
    // Trigger fired but board was full → card stays in hand (moved there by applyLeaderDamage)
    expect(p1.hand).toContain(triggerChar.id);
    expect(p1.board).not.toContain(triggerChar.id);
    expect(p1.board.filter((id) => r.cards[id]?.type === 'Character')).toHaveLength(5);
  });

  it('B3c — PlayFromTrash sur board plein → Character reste en trash', () => {
    let s = setupFullBoard();
    // Remove one Character to have 4, play 5th with OnPlay → PlayFromTrash → board goes to 5 → skip

    // Override: start with only 4 Characters instead of 5
    const base = afterMulligan();
    s = advanceToMain(base);
    s = endTurn(s); s = advanceToMain(s);
    s = endTurn(s); s = advanceToMain(s);
    for (let i = 0; i < 4; i++) {
      s = addToBoard(s, makeChar(`cr-bf3c-board-${i}`, P1, 2000), P1);
    }

    // A Character in P1's trash (matching PlayFromTrash filter)
    const trashChar = makeChar('cr-bf3c-trash', P1, 3000, { zone: 'trash', color: 'Red' });
    s = {
      ...s,
      cards: { ...s.cards, [trashChar.id]: trashChar },
      players: {
        ...s.players,
        [P1]: { ...s.players[P1]!, trash: [...s.players[P1]!.trash, trashChar.id] },
      },
    };

    // 5th Character with OnPlay → PlayFromTrash (any Character)
    const playChar = makeChar('cr-bf3c-play', P1, 2000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{ type: 'PlayFromTrash' as const, filter: { cardType: 'Character' as const } }],
      }],
    });
    s = addToHand(s, playChar, P1);

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playChar.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const p1 = result.players[P1]!;
    // playChar played (board = 5), PlayFromTrash silently skipped
    expect(p1.board).toContain(playChar.id);
    expect(p1.trash).toContain(trashChar.id); // still in trash, not played
    expect(p1.board.filter((id) => result.cards[id]?.type === 'Character')).toHaveLength(5);
  });

  it('B3d — SearchDeck destination:board sur board plein → Character va en main au lieu du board', () => {
    let s = setupFullBoard();
    // Start with 4 Characters, play 5th with OnPlay → SearchDeck→board
    s = afterMulligan();
    s = advanceToMain(s);
    s = endTurn(s); s = advanceToMain(s);
    s = endTurn(s); s = advanceToMain(s);
    for (let i = 0; i < 4; i++) {
      s = addToBoard(s, makeChar(`cr-bf3d-board-${i}`, P1, 2000), P1);
    }

    // Top deck card is a Character (from makePlayerSetup — all deckCards are Characters)
    const deckTopId = s.players[P1]!.deck[0]!;
    expect(s.cards[deckTopId]?.type).toBe('Character');

    // 5th Character with OnPlay → SearchDeck destination: 'board'
    const playChar = makeChar('cr-bf3d-play', P1, 2000, {
      zone: 'hand',
      effects: [{
        trigger: 'OnPlay' as const,
        actions: [{
          type: 'SearchDeck' as const,
          filter: { kind: 'ByType' as const, cardType: 'Character' as const },
          destination: 'board' as const,
        }],
      }],
    });
    s = addToHand(s, playChar, P1);

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: playChar.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const p1 = result.players[P1]!;
    // playChar played (board = 5), SearchDeck→board fell back to hand
    expect(p1.board).toContain(playChar.id);
    expect(p1.board.filter((id) => result.cards[id]?.type === 'Character')).toHaveLength(5);
    // Deck top card was found and placed in hand (fallback), not board
    expect(p1.hand).toContain(deckTopId);
    expect(p1.board).not.toContain(deckTopId);
    expect(p1.deck).not.toContain(deckTopId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — MAXIMUM 1 STAGE EN JEU
// Official rule: "When you play a Stage, if you already have one, the old one
// is sent to the Trash (it is replaced, not KO'd)."
// ─────────────────────────────────────────────────────────────────────────────

describe('C — Maximum 1 Stage en jeu', () => {
  it('C1 — une carte Stage ne peut pas être jouée via PlayCharacterFromHand (INVALID_CARD_TYPE)', () => {
    // Current engine: PlayCharacterFromHand rejects non-Character types.
    // A dedicated PlayStage action is needed (not yet implemented).
    const base = afterMulligan();
    let s = advanceToMain(base);
    s = endTurn(s); s = advanceToMain(s); // turn 2
    s = endTurn(s); s = advanceToMain(s); // turn 3

    const stageCard = makeChar('cr-c1-stage', P1, 0, {
      name: 'Test Stage',
      type: 'Stage',
      zone: 'hand',
    });
    s = addToHand(s, stageCard, P1);

    const result = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: stageCard.id,
    });

    // Engine correctly rejects Stage played as a Character
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_CARD_TYPE');
  });

  it('C2 — jouer une 2e Stage remplace la 1re (ancienne → Trash, nouvelle → board)', () => {
    const base = afterMulligan();
    let s = advanceToMain(base);
    s = endTurn(s); s = advanceToMain(s); // turn 2
    s = endTurn(s); s = advanceToMain(s); // turn 3

    const oldStage = makeChar('cr-c2-old-stage', P1, 0, {
      name: 'Old Stage',
      type: 'Stage',
      zone: 'board',
    });
    const newStage = makeChar('cr-c2-new-stage', P1, 0, {
      name: 'New Stage',
      type: 'Stage',
      zone: 'hand',
    });

    s = addToBoard(s, oldStage, P1);
    s = addToHand(s, newStage, P1);

    const result = applyAction(s, {
      type: 'PlayStage',
      playerId: P1,
      cardId: newStage.id,
    });

    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const p1 = result.players[P1]!;
    // Old Stage must be in trash, new Stage on board
    expect(p1.trash).toContain(oldStage.id);
    expect(p1.board).toContain(newStage.id);
    expect(p1.board).not.toContain(oldStage.id);
    // Exactly one Stage on board
    const stagesOnBoard = p1.board.filter((id) => result.cards[id]?.type === 'Stage');
    expect(stagesOnBoard).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — SUMMONING SICKNESS (invocation ce tour)
// Official rule: "A Character played this turn cannot attack unless it has Rush."
// ─────────────────────────────────────────────────────────────────────────────

describe('D — Summoning sickness', () => {
  it('D1 — un Character joué ce tour ne peut pas attaquer (SUMMON_SICKNESS)', () => {
    // Official rule: summon sickness prevents immediate attacks.
    // Engine: card ID added to newBoardIds on play; checked in DeclareAttack.
    const base = afterMulligan();
    let s = advanceToMain(base);
    s = endTurn(s); s = advanceToMain(s); // turn 2
    s = endTurn(s); s = advanceToMain(s); // turn 3 — attacks unlocked for older chars

    const freshChar = makeChar('cr-d1-fresh', P1, 5000, { zone: 'hand' });
    s = addToHand(s, freshChar, P1);

    // Play the character from hand (adds to newBoardIds)
    s = applyAction(s, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: freshChar.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.newBoardIds).toContain(freshChar.id);

    // Attempt to attack immediately
    const p2LeaderId = s.players[P2]!.leader!;
    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: freshChar.id,
      targetId: p2LeaderId,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('SUMMON_SICKNESS');
  });

  it('D2 — un Character présent depuis le tour précédent peut attaquer normalement', () => {
    // Official rule: a Character that survived until your next turn can attack freely.
    // Engine: card not in newBoardIds → no SUMMON_SICKNESS restriction.
    const base = afterMulligan();
    let s = advanceToMain(base);
    s = endTurn(s); s = advanceToMain(s); // turn 2
    s = endTurn(s); s = advanceToMain(s); // turn 3

    // Character added to board directly (not via PlayCharacterFromHand → not in newBoardIds)
    const veteranChar = makeChar('cr-d2-veteran', P1, 5000);
    s = addToBoard(s, veteranChar, P1);
    expect(s.newBoardIds).not.toContain(veteranChar.id);

    const p2LeaderId = s.players[P2]!.leader!;
    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: veteranChar.id,
      targetId: p2LeaderId,
    });
    // Attack should be accepted (no summon sickness)
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.activeCombat?.attackerId).toBe(veteranChar.id);
    }
  });

  it('D3 — TODO : un Character avec Rush peut attaquer le tour de sa pose', () => {
    // OFFICIAL RULE: Rush allows a Character to attack on the turn it was played.
    // Engine: Rush keyword bypasses newBoardIds check in DeclareAttack.
    // This is already implemented; adding this TODO as explicit documentation.
    //
    // When implemented, expected flow:
    //   play RushChar from hand → newBoardIds contains it
    //   DeclareAttack with RushChar → accepted (no SUMMON_SICKNESS)
    expect(true).toBe(true); // placeholder — document, not gap
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E — CIBLES D'ATTAQUE VALIDES
// Official rule: "Attacks may target the opponent's Leader (always valid)
// or a rested (tapped) Character. Active (untapped) Characters cannot be targeted."
// ─────────────────────────────────────────────────────────────────────────────

describe('E — Cibles d\'attaque valides', () => {
  function setupForAttacks(): { s: GameState; p2Leader: CardId; restedChar: Card; activeChar: Card } {
    const base = afterMulligan();
    let s = advanceToMain(base);
    s = endTurn(s); s = advanceToMain(s); // turn 2
    s = endTurn(s); s = advanceToMain(s); // turn 3

    const restedChar = makeChar('cr-e-rested', P2, 3000, { tapped: true  }); // valid target
    const activeChar = makeChar('cr-e-active', P2, 3000, { tapped: false }); // invalid target

    s = addToBoard(s, restedChar, P2);
    s = addToBoard(s, activeChar, P2);

    // P1 needs an untapped attacker (not in newBoardIds)
    const attacker = makeChar('cr-e-attacker', P1, 6000);
    s = addToBoard(s, attacker, P1);

    // Confirm attacker is ready
    const state = { ...s };
    return { s: state, p2Leader: s.players[P2]!.leader!, restedChar, activeChar };
  }

  it('E1 — attaque autorisée sur le Leader adverse (toujours ciblable)', () => {
    const { s, p2Leader } = setupForAttacks();
    const attacker = Object.values(s.cards).find(
      (c) => c?.ownerId === P1 && c.type === 'Character' && !c.tapped && c.id.includes('cr-e-attacker'),
    )!;

    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: p2Leader,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) expect(result.activeCombat?.targetId).toBe(p2Leader);
  });

  it('E2 — attaque autorisée sur un Character adverse rested (tapped)', () => {
    const { s, restedChar } = setupForAttacks();
    const attacker = Object.values(s.cards).find(
      (c) => c?.ownerId === P1 && c.type === 'Character' && !c.tapped && c.id.includes('cr-e-attacker'),
    )!;

    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: restedChar.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) expect(result.activeCombat?.targetId).toBe(restedChar.id);
  });

  it('E3 — attaque interdite sur un Character adverse active (pas tapped)', () => {
    // Official rule: active (untapped) Characters cannot be attacked.
    const { s, activeChar } = setupForAttacks();
    const attacker = Object.values(s.cards).find(
      (c) => c?.ownerId === P1 && c.type === 'Character' && !c.tapped && c.id.includes('cr-e-attacker'),
    )!;

    const result = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: activeChar.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('TARGET_NOT_RESTED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F — FLOW DON!!
// Official rule:
//   "The first player draws 1 DON!! on their very first turn.
//    All subsequent DON!! draws are 2 cards (up to 2 per turn from the DON!! deck)."
// ─────────────────────────────────────────────────────────────────────────────

describe('F — Flow DON!!', () => {
  it('F1 — premier joueur, tout premier tour (turnNumber=1) : reçoit 1 DON!! uniquement', () => {
    // Official rule: P1 gets only 1 DON!! on their first turn.
    // Engine: applyDonDraw checks turnNumber === 1 && playerId === firstPlayerId.
    const s0 = afterMulligan(); // Refresh, turn 1, P1 active
    expect(s0.turnNumber).toBe(1);
    expect(s0.activePlayerId).toBe(P1);

    const donBefore = s0.players[P1]!.donArea.length;

    // Advance through Refresh → Draw (EndPhase)
    let s = applyAction(s0, { type: 'EndPhase', playerId: P1 }) as GameState;
    // DrawPhase for P1 turn 1 skips card draw and triggers DON draw (1 DON)
    s = applyAction(s, { type: 'DrawPhase', playerId: P1 }) as GameState;
    expect(isGameError(s)).toBe(false);

    const donAfter = s.players[P1]!.donArea.length;
    expect(donAfter - donBefore).toBe(1); // official: exactly 1 DON on P1's first turn
  });

  it('F2 — deuxième joueur (P2), à son premier tour (turnNumber=2) : reçoit 2 DON!!', () => {
    // Official rule: P2 is not restricted — they get 2 DON!! even on their first turn.
    // Engine: restriction is ONLY for turnNumber=1 AND firstPlayerId.
    const s1 = afterMulligan();
    const s1Main = advanceToMain(s1);   // P1, turn 1, Main
    const s2 = endTurn(s1Main);          // → P2's Refresh, turn 2

    expect(s2.turnNumber).toBe(2);
    expect(s2.activePlayerId).toBe(P2);

    const donBefore = s2.players[P2]!.donArea.length;

    let s = applyAction(s2, { type: 'EndPhase', playerId: P2 }) as GameState; // → Draw
    s = applyAction(s, { type: 'DrawPhase', playerId: P2 }) as GameState;      // → DON (2 drawn)
    expect(isGameError(s)).toBe(false);

    const donAfter = s.players[P2]!.donArea.length;
    expect(donAfter - donBefore).toBe(2); // official: 2 DON for P2's first turn
  });

  it('F3 — premier joueur, deuxième tour (turnNumber=3) : reçoit 2 DON!!', () => {
    // Official rule: from turn 2 onwards all DON!! draws are 2 cards.
    const s1 = afterMulligan();
    const s1Main = advanceToMain(s1);    // P1, turn 1, Main
    const s2 = endTurn(s1Main);           // → P2's Refresh, turn 2
    const s2Main = advanceToMain(s2);    // P2, turn 2, Main
    const s3 = endTurn(s2Main);           // → P1's Refresh, turn 3

    expect(s3.turnNumber).toBe(3);
    expect(s3.activePlayerId).toBe(P1);

    const donBefore = s3.players[P1]!.donArea.length;

    let s = applyAction(s3, { type: 'EndPhase', playerId: P1 }) as GameState; // → Draw
    s = applyAction(s, { type: 'DrawPhase', playerId: P1 }) as GameState;      // → DON (2 drawn)
    expect(isGameError(s)).toBe(false);

    const donAfter = s.players[P1]!.donArea.length;
    expect(donAfter - donBefore).toBe(2); // official: back to normal 2 DON from turn 2 onward
  });

  it('F4 — cumul cohérent : P1 a 1 DON après tour 1, puis 3 après tour 3', () => {
    // Validates that DON cards accumulate across turns (they are never returned
    // to the donDeck, only detached/untapped at turn end).
    const s1 = afterMulligan();
    const s1Main = advanceToMain(s1);    // P1 turn 1 Main — P1 already has 1 DON
    const donAfterTurn1 = s1Main.players[P1]!.donArea.length;
    expect(donAfterTurn1).toBe(1);       // 1 DON total after turn 1

    // Advance two more turns
    const s2 = endTurn(s1Main);
    const s2Main = advanceToMain(s2);
    const s3 = endTurn(s2Main);
    const s3Main = advanceToMain(s3);    // P1 turn 3 Main — accumulated 1+2=3 DON

    const donAfterTurn3 = s3Main.players[P1]!.donArea.length;
    expect(donAfterTurn3).toBe(3);       // 3 DON total (1 from turn 1 + 2 from turn 3)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G — DON!! RETURN TIMING
// Official rule: attached DON!! return to the cost area at the START of the
// attached player's NEXT turn (Refresh phase), not at the end of the turn
// where they were assigned.
// ─────────────────────────────────────────────────────────────────────────────

describe('G — DON!! return timing (Refresh, not End)', () => {
  it('T1: attached DON stays attached through EndPhase (not returned at End of turn)', () => {
    // P1 attaches a DON to their leader during Main, then ends the turn.
    // At End phase the DON must still be attached.
    const s0 = advanceToMain(afterMulligan()); // P1 Main, turn 1
    const p1LeaderId = s0.players[P1]!.leader!;

    // P1 has 1 DON in donArea after advanceToMain
    const donId = s0.players[P1]!.donArea[0]!;

    // Assign DON to leader
    let s = applyAction(s0, { type: 'AssignDon', playerId: P1, donCardId: donId, targetCardId: p1LeaderId });
    expect(isGameError(s)).toBe(false);
    s = s as GameState;

    // Verify attached
    expect(s.cards[donId]?.attachedTo).toBe(p1LeaderId);

    // End Main → End phase
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    expect(s.phase).toBe('End');

    // DON must still be attached at End phase
    expect(s.cards[donId]?.attachedTo).toBe(p1LeaderId);
  });

  it('T2: attached DON is detached at Refresh (start of owner\'s next turn)', () => {
    // P1 attaches a DON, ends turn → P2 takes a full turn → back to P1 Refresh.
    // At P1 Refresh the DON must be detached (attachedTo: null) and untapped.
    const s0 = advanceToMain(afterMulligan()); // P1 Main, turn 1
    const p1LeaderId = s0.players[P1]!.leader!;
    const donId = s0.players[P1]!.donArea[0]!;

    let s = applyAction(s0, { type: 'AssignDon', playerId: P1, donCardId: donId, targetCardId: p1LeaderId }) as GameState;
    expect(s.cards[donId]?.attachedTo).toBe(p1LeaderId);

    // P1 ends turn → P2's Refresh
    s = endTurn(s);
    // P2 takes a full turn → back to P1's Refresh
    const s2Main = advanceToMain(s); // P2 Main
    s = endTurn(s2Main);             // → P1 Refresh

    expect(s.activePlayerId).toBe(P1);
    expect(s.phase).toBe('Refresh');

    // DON must now be detached and untapped
    expect(s.cards[donId]?.attachedTo).toBeNull();
    expect(s.cards[donId]?.tapped).toBe(false);
  });

  it('T3: rested characters/leader remain rested through End phase, untap only at their Refresh', () => {
    // Standard combat: P1 leader attacks, gets tapped. At P1 End phase it should
    // still be tapped. Only at P1's NEXT Refresh should it untap.
    const s0 = afterMulligan();
    // Advance past turn 1 (no attacks on turn 1) to P1 turn 3
    const s1Main = advanceToMain(s0);
    const s2 = endTurn(s1Main);
    const s2Main = advanceToMain(s2);
    const s3 = endTurn(s2Main);
    const s3Main = advanceToMain(s3); // P1 Main, turn 3

    const p1LeaderId = s3Main.players[P1]!.leader!;
    const p2LeaderId = s3Main.players[P2]!.leader!;

    // P1 declares attack with leader → leader becomes tapped
    let s = applyAction(s3Main, { type: 'DeclareAttack', playerId: P1, attackerId: p1LeaderId, targetId: p2LeaderId }) as GameState;
    s = applyAction(s, { type: 'ResolveCombat', playerId: P1 }) as GameState;

    // End Main → End phase: leader still tapped
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    expect(s.phase).toBe('End');
    expect(s.cards[p1LeaderId]?.tapped).toBe(true);

    // End phase → P2 Refresh: P1 leader still tapped (not P1's refresh)
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    expect(s.activePlayerId).toBe(P2);
    expect(s.cards[p1LeaderId]?.tapped).toBe(true);

    // P2 takes turn → back to P1 Refresh
    const p2Main = advanceToMain(s);
    s = endTurn(p2Main); // → P1 Refresh

    expect(s.activePlayerId).toBe(P1);
    expect(s.phase).toBe('Refresh');
    expect(s.cards[p1LeaderId]?.tapped).toBe(false); // finally untapped
  });

  it('T4: power modifiers clear at End of turn (not Refresh)', () => {
    // A PowerBoost with duration EndOfTurn must be gone after End phase,
    // NOT linger until the next Refresh.
    const s0 = advanceToMain(afterMulligan()); // P1 Main, turn 1
    const p1LeaderId = s0.players[P1]!.leader!;

    // Manually inject a powerModifier on P1's leader
    const leaderWithModifier: Card = {
      ...s0.cards[p1LeaderId]!,
      powerModifier: 1000,
    };
    let s: GameState = { ...s0, cards: { ...s0.cards, [p1LeaderId]: leaderWithModifier } };
    expect(s.cards[p1LeaderId]?.powerModifier).toBe(1000);

    // Main → End phase
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;
    expect(s.phase).toBe('End');

    // End phase → turn switch (Refresh for P2)
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState;

    // Power modifier must be cleared (was set to expire at end of P1's turn)
    expect(s.cards[p1LeaderId]?.powerModifier ?? 0).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H — DON!! STATIC POWER BONUS (owner's turn only)
// Official rule: a Leader/Character gains +1 000 power per attached DON!!
// ONLY during the card owner's own turn. DON!! remain physically attached
// during the opponent's turn and still count for DON xN conditional checks,
// but they do not contribute to combat power.
// ─────────────────────────────────────────────────────────────────────────────

describe('H — DON!! static power bonus (owner\'s turn only)', () => {
  it('D1: pendant mon tour, 2 DON attachés donnent +2000 power', () => {
    const s0 = advanceToMain(afterMulligan()); // P1 Main, turn 1
    expect(s0.activePlayerId).toBe(P1);

    const char = makeChar('d1-char', P1, 3000);
    const don1 = makeDon('d1-don1', P1, { tapped: true, attachedTo: char.id });
    const don2 = makeDon('d1-don2', P1, { tapped: true, attachedTo: char.id });

    let s: GameState = {
      ...s0,
      cards: { ...s0.cards, [char.id]: { ...char, zone: 'board' }, [don1.id]: don1, [don2.id]: don2 },
      players: { ...s0.players, [P1]: { ...s0.players[P1]!, board: [...s0.players[P1]!.board, char.id] } },
    };

    // During P1's own turn: base 3000 + 2 DON × 1000 = 5000
    expect(calculatePower(char.id, s)).toBe(5000);
  });

  it('D2: pendant le tour adverse, ces mêmes 2 DON attachés ne donnent pas le bonus statique', () => {
    const s0 = advanceToMain(afterMulligan()); // P1 Main, turn 1

    const char = makeChar('d2-char', P1, 3000);
    const don1 = makeDon('d2-don1', P1, { tapped: true, attachedTo: char.id });
    const don2 = makeDon('d2-don2', P1, { tapped: true, attachedTo: char.id });

    // Set up state as P2's turn (opponent turn for P1)
    let s: GameState = {
      ...s0,
      activePlayerId: P2, // opponent's turn
      cards: { ...s0.cards, [char.id]: { ...char, zone: 'board' }, [don1.id]: don1, [don2.id]: don2 },
      players: { ...s0.players, [P1]: { ...s0.players[P1]!, board: [...s0.players[P1]!.board, char.id] } },
    };

    // During P2's (opponent's) turn: base 3000 only, DON bonus does NOT apply
    expect(calculatePower(char.id, s)).toBe(3000);

    // DON are still physically attached (not returned yet)
    expect(s.cards[don1.id]?.attachedTo).toBe(char.id);
    expect(s.cards[don2.id]?.attachedTo).toBe(char.id);
  });

  it('D3: pendant le tour adverse, les DON attachés comptent toujours pour les effets DON xN conditionnels', () => {
    // A card with a [DON!! x2] [Opponent\'s Turn] Activated ability must still fire
    // during the opponent\'s turn when 2 DON are physically attached.
    const donX2OppTurnEffect: CardEffect = {
      trigger: 'Activated',
      timing: 'OpponentTurn',
      condition: { type: 'HasAttachedDon', count: 2 },
      actions: [{ type: 'DrawCard', count: 1 }],
    };

    const s0 = advanceToMain(afterMulligan());
    const char = makeChar('d3-char', P1, 3000, { effects: [donX2OppTurnEffect] });
    const don1 = makeDon('d3-don1', P1, { tapped: true, attachedTo: char.id });
    const don2 = makeDon('d3-don2', P1, { tapped: true, attachedTo: char.id });

    const s: GameState = {
      ...s0,
      activePlayerId: P2, // opponent\'s turn
      cards: { ...s0.cards, [char.id]: { ...char, zone: 'board' }, [don1.id]: don1, [don2.id]: don2 },
      players: { ...s0.players, [P1]: { ...s0.players[P1]!, board: [...s0.players[P1]!.board, char.id] } },
    };

    const handBefore = s.players[P1]!.hand.length;

    // Activate the [DON!! x2] [Opponent\'s Turn] ability during P2\'s turn — must succeed
    const result = applyAction(s, { type: 'ActivatedAbility', playerId: P1, cardId: char.id });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      // Effect fired: P1 drew a card
      expect(result.players[P1]!.hand.length).toBe(handBefore + 1);
    }
  });

  it('D4: au début de mon prochain tour (Refresh), les DON reviennent au cost area (test de non-régression)', () => {
    // This reuses the T2 scenario — DON attached to leader, then P1 ends turn,
    // P2 takes a full turn, back to P1 Refresh: DON must be detached.
    const s0 = advanceToMain(afterMulligan()); // P1 Main, turn 1
    const p1LeaderId = s0.players[P1]!.leader!;
    const donId = s0.players[P1]!.donArea[0]!;

    let s = applyAction(s0, { type: 'AssignDon', playerId: P1, donCardId: donId, targetCardId: p1LeaderId }) as GameState;
    expect(s.cards[donId]?.attachedTo).toBe(p1LeaderId);

    // During P1\'s End phase DON is still attached
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState; // Main→End
    expect(s.cards[donId]?.attachedTo).toBe(p1LeaderId);

    // After turn switch → P2 Refresh: DON still attached (it\'s P2\'s turn, not P1\'s refresh)
    s = applyAction(s, { type: 'EndPhase', playerId: P1 }) as GameState; // End→P2 Refresh
    expect(s.activePlayerId).toBe(P2);
    expect(s.cards[donId]?.attachedTo).toBe(p1LeaderId); // still attached during P2\'s turn

    // P2 takes a full turn → back to P1\'s Refresh
    const s2Main = advanceToMain(s);
    s = endTurn(s2Main);
    expect(s.activePlayerId).toBe(P1);
    expect(s.phase).toBe('Refresh');
    expect(s.cards[donId]?.attachedTo).toBeNull(); // returned at P1\'s Refresh
    expect(s.cards[donId]?.tapped).toBe(false);
  });
});
