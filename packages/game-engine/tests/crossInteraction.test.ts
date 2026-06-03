/**
 * crossInteraction.test.ts — Positive + negative tests for cross-card conditions.
 *
 * Each condition type is tested twice:
 *  [POSITIVE] condition met  → effect fires, observable result present
 *  [NEGATIVE] condition unmet → effect skipped, no observable change
 *
 * Conditions covered:
 *  - HasCardOnBoard (EB01-001, ST06-017)
 *  - LeaderHasType  (EB02-003, EB01-034)
 *  - LeaderIsName   (OP03-016)
 *  - OnlyTypeOnBoard (EB03-038 via resolveEffects)
 *  - OpponentLifeCount (HasFewerLifeThanOpponent variant)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  applyAction, isGameError, makeCardId, makePlayerId, makeEmptyState, resolveEffects,
} from '../src/index.js';
import type { Card, CardEffect, CardId, GameState, PlayerId, PlayerSetup } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const EFFECTS_DIR = path.join(__dirname, '../../data/effects');

const P1: PlayerId = makePlayerId('p1');
const P2: PlayerId = makePlayerId('p2');

// ── Minimal card factories ────────────────────────────────────────────────────

function makeChar(id: string, owner: string, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 0, power,
    color: 'Red', type: 'Character', zone: 'board',
    ownerId: makePlayerId(owner), tapped: false, attachedTo: null,
    ...opts,
  };
}

function makeDon(id: string, owner: string, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0,
    color: 'Red', type: 'DON', zone: 'donArea',
    ownerId: makePlayerId(owner), tapped: false, attachedTo: null,
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

// ── State helpers ─────────────────────────────────────────────────────────────

function addToBoard(state: GameState, card: Card, pid: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board', ownerId: pid } },
    players: { ...state.players, [pid]: { ...state.players[pid]!, board: [...state.players[pid]!.board, card.id] } },
  };
}

function addToHand(state: GameState, card: Card, pid: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand', ownerId: pid } },
    players: { ...state.players, [pid]: { ...state.players[pid]!, hand: [...state.players[pid]!.hand, card.id] } },
  };
}

function addDon(state: GameState, dons: Card[], pid: PlayerId): GameState {
  const updated: Record<string, Card> = { ...state.cards };
  for (const d of dons) updated[d.id] = { ...d, zone: 'donArea', ownerId: pid };
  return {
    ...state,
    cards: updated as GameState['cards'],
    players: {
      ...state.players,
      [pid]: { ...state.players[pid]!, donArea: [...state.players[pid]!.donArea, ...dons.map((d) => d.id)] },
    },
  };
}

// ── Base game state ───────────────────────────────────────────────────────────

function getBase(): GameState {
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
  return { ...s as GameState, phase: 'Main', turnNumber: 3 };
}

function logFired(before: GameState, after: GameState, srcId: CardId): boolean {
  return after.gameLog.slice(before.gameLog.length).some(
    (e) => e.event === 'EFFECT_TRIGGERED' && e.cardId === srcId,
  );
}

function loadEffects(fileId: string): CardEffect[] {
  const fp = path.join(EFFECTS_DIR, `${fileId}.json`);
  const def = JSON.parse(fs.readFileSync(fp, 'utf-8')) as { effects?: CardEffect[] };
  return def.effects ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// HasCardOnBoard — EB01-001 (Leader, OnAttack, "Land of Wano" → PowerBoost)
// ─────────────────────────────────────────────────────────────────────────────

describe('HasCardOnBoard "Land of Wano" (EB01-001 OnAttack → PowerBoost +1000 EndOfTurn)', () => {
  const effects = loadEffects('EB01-001');

  it('[POSITIVE] Land of Wano on P1 board → leader gains powerModifier', () => {
    const base = getBase();
    // Use the bootstrap game's actual leader (it lives in players[P1].leader, not on board)
    const srcId  = base.players[P1]!.leader!;
    const wanoId = makeCardId('ci-land-wano') as CardId;
    const p2tId  = makeCardId('ci-p2t-eb01') as CardId;

    const wano = makeChar(String(wanoId), 'p1', 2000, { id: wanoId, name: 'Land of Wano' });
    const p2t  = makeChar(String(p2tId),  'p2', 2000, { id: p2tId,  tapped: true });

    let state = addToBoard(base, wano, P1);
    state     = addToBoard(state, p2t, P2);
    state = { ...state, activeCombat: { attackerId: srcId, targetId: p2tId, blockerId: null, counterAmount: 0 } };

    const ctx   = { sourceCardId: srcId, sourcePlayerId: P1 };
    const after = resolveEffects(effects, 'OnAttack', ctx, state);

    expect(logFired(state, after, srcId)).toBe(true);
    // Leader's EndOfTurn powerModifier must have increased
    const before = state.cards[srcId]?.powerModifier ?? 0;
    const now    = after.cards[srcId]?.powerModifier ?? 0;
    expect(now).toBeGreaterThan(before);
  });

  it('[NEGATIVE] no Land of Wano → PowerBoost does not fire', () => {
    const base = getBase();
    const srcId = base.players[P1]!.leader!;
    const p2tId = makeCardId('ci-p2t-eb01-neg') as CardId;

    const p2t = makeChar(String(p2tId), 'p2', 2000, { id: p2tId, tapped: true });

    let state = addToBoard(base, p2t, P2);
    state = { ...state, activeCombat: { attackerId: srcId, targetId: p2tId, blockerId: null, counterAmount: 0 } };

    const ctx   = { sourceCardId: srcId, sourcePlayerId: P1 };
    const after = resolveEffects(effects, 'OnAttack', ctx, state);

    expect(logFired(state, after, srcId)).toBe(false);
    const before = state.cards[srcId]?.powerModifier ?? 0;
    const now    = after.cards[srcId]?.powerModifier ?? 0;
    expect(now).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HasCardOnBoard "Navy" (ST06-017 Activated → PowerBoost -1000 on opponent)
// ─────────────────────────────────────────────────────────────────────────────

describe('HasCardOnBoard "Navy" (ST06-017 Activated → PowerBoost –1000 on opp character)', () => {
  const effects = loadEffects('ST06-017');

  it('[POSITIVE] Navy card on P1 board → opponent character gets powerModifier –1000', () => {
    const base  = getBase();
    const srcId  = makeCardId('ci-st06-pos') as CardId;
    const navyId = makeCardId('ci-navy') as CardId;
    const p2tId  = makeCardId('ci-p2t-st06') as CardId;

    const src  = makeChar(String(srcId),  'p1', 2000, { id: srcId  });
    const navy = makeChar(String(navyId), 'p1', 1000, { id: navyId, name: 'Navy' });
    const p2t  = makeChar(String(p2tId),  'p2', 3000, { id: p2tId  });

    let state = addToBoard(base, src,  P1);
    state     = addToBoard(state, navy, P1);
    state     = addToBoard(state, p2t,  P2);

    const ctx   = { sourceCardId: srcId, sourcePlayerId: P1 };
    // Activated trigger (no applyAction needed — resolveEffects is sufficient for condition test)
    const after = resolveEffects(effects, 'Activated', ctx, state);

    // If condition fires, the Choose target creates pendingTargetInteraction
    expect(after.pendingTargetInteraction !== null || logFired(state, after, srcId)).toBe(true);
  });

  it('[NEGATIVE] no Navy card → Activated effect skipped', () => {
    const base  = getBase();
    const srcId  = makeCardId('ci-st06-neg') as CardId;
    const p2tId  = makeCardId('ci-p2t-st06-neg') as CardId;

    const src = makeChar(String(srcId), 'p1', 2000, { id: srcId });
    const p2t = makeChar(String(p2tId), 'p2', 3000, { id: p2tId });

    let state = addToBoard(base, src, P1);
    state     = addToBoard(state, p2t, P2);

    const ctx   = { sourceCardId: srcId, sourcePlayerId: P1 };
    const after = resolveEffects(effects, 'Activated', ctx, state);

    // Condition not met → no EFFECT_TRIGGERED, no pending
    expect(logFired(state, after, srcId)).toBe(false);
    expect(after.pendingTargetInteraction).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LeaderHasType "Straw Hat Crew" (EB02-003 OnPlay → AttachDon ChooseTarget)
// ─────────────────────────────────────────────────────────────────────────────

describe('LeaderHasType "Straw Hat Crew" (EB02-003 OnPlay → AttachDon, ChooseOwnCharOrLeader)', () => {
  const eb02Effects = loadEffects('EB02-003');

  it('[POSITIVE] leader has "Straw Hat Crew" subType → pendingTargetInteraction set', () => {
    const base    = getBase();
    const srcId   = makeCardId('ci-eb02-003-pos') as CardId;
    const leaderId = base.players[P1]!.leader!;

    const src = makeChar(String(srcId), 'p1', 4000, {
      id: srcId, zone: 'hand', cost: 0, effects: eb02Effects,
    });

    // Give leader "Straw Hat Crew" subType and add a rested DON for AttachDon
    const restedDon = makeDon('ci-rested-don', 'p1', { tapped: true, attachedTo: null });
    let state = {
      ...base,
      cards: { ...base.cards, [leaderId]: { ...base.cards[leaderId]!, subTypes: 'Straw Hat Crew' } },
    };
    state = addToHand(state, src, P1);
    state = addDon(state, [restedDon as Card], P1);

    const after = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: srcId });
    expect(isGameError(after)).toBe(false);
    if (!isGameError(after)) {
      // AttachDon with ChooseOwnCharacterOrLeader creates pendingTargetInteraction
      expect((after as GameState).pendingTargetInteraction).not.toBeNull();
    }
  });

  it('[NEGATIVE] leader has different subType → no AttachDon effect, no pending', () => {
    const base     = getBase();
    const srcId    = makeCardId('ci-eb02-003-neg') as CardId;
    const leaderId = base.players[P1]!.leader!;

    const src = makeChar(String(srcId), 'p1', 4000, {
      id: srcId, zone: 'hand', cost: 0, effects: eb02Effects,
    });

    let state = {
      ...base,
      cards: { ...base.cards, [leaderId]: { ...base.cards[leaderId]!, subTypes: 'Hearts Pirates' } },
    };
    state = addToHand(state, src, P1);

    const after = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: srcId });
    expect(isGameError(after)).toBe(false);
    if (!isGameError(after)) {
      const gs = after as GameState;
      expect(gs.pendingTargetInteraction).toBeNull();
      // No AttachDon thenActions either
      expect(gs.pendingSearchInteraction).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LeaderIsName "Portgas.D.Ace" (OP03-016 OnPlay → KO+GiveKeyword+PowerBoost)
// ─────────────────────────────────────────────────────────────────────────────

describe('LeaderIsName "Portgas.D.Ace" (OP03-016 OnPlay → KO / GiveKeyword / PowerBoost)', () => {
  const op03Effects = loadEffects('OP03-016');

  it('[POSITIVE] leader includes "Portgas.D.Ace" → KO fires (pendingTargetInteraction set)', () => {
    const base     = getBase();
    const srcId    = makeCardId('ci-op03-016-pos') as CardId;
    const leaderId = base.players[P1]!.leader!;
    const p2tId    = makeCardId('ci-op03-p2tgt') as CardId;

    const src = makeChar(String(srcId), 'p1', 5000, {
      id: srcId, zone: 'hand', cost: 0, effects: op03Effects,
    });
    const p2t = makeChar(String(p2tId), 'p2', 5000, { id: p2tId, tapped: true });

    let state = {
      ...base,
      cards: { ...base.cards, [leaderId]: { ...base.cards[leaderId]!, name: 'Portgas.D.Ace' } },
    };
    state = addToHand(state, src, P1);
    state = addToBoard(state, p2t, P2);

    const after = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: srcId });
    expect(isGameError(after)).toBe(false);
    if (!isGameError(after)) {
      const gs = after as GameState;
      // KO with ChooseOpponentCharacter creates pendingTargetInteraction
      expect(gs.pendingTargetInteraction).not.toBeNull();
      expect(gs.pendingTargetInteraction?.scope).toBe('ChooseOpponentCharacter');
    }
  });

  it('[NEGATIVE] leader is a different name → no KO/GiveKeyword/PowerBoost fire', () => {
    const base     = getBase();
    const srcId    = makeCardId('ci-op03-016-neg') as CardId;
    const leaderId = base.players[P1]!.leader!;

    const src = makeChar(String(srcId), 'p1', 5000, {
      id: srcId, zone: 'hand', cost: 0, effects: op03Effects,
    });

    let state = {
      ...base,
      cards: { ...base.cards, [leaderId]: { ...base.cards[leaderId]!, name: 'Monkey.D.Luffy' } },
    };
    state = addToHand(state, src, P1);

    const before = state;
    const after  = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: srcId });
    expect(isGameError(after)).toBe(false);
    if (!isGameError(after)) {
      const gs = after as GameState;
      // No KO → no pending target
      expect(gs.pendingTargetInteraction).toBeNull();
      // No GiveKeyword on leader
      const leaderBefore = before.cards[leaderId];
      const leaderAfter  = gs.cards[leaderId];
      expect(leaderAfter?.temporaryKeywords ?? []).toEqual(leaderBefore?.temporaryKeywords ?? []);
      // No PowerBoost on leader
      expect(leaderAfter?.powerModifier ?? 0).toBe(leaderBefore?.powerModifier ?? 0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OnlyTypeOnBoard "GERMA" (EB03-038 — And: DonCountVsOpponent ≤ + OnlyTypeOnBoard)
// ─────────────────────────────────────────────────────────────────────────────

describe('OnlyTypeOnBoard "GERMA" (EB03-038 Activated — And condition)', () => {
  const eb03Effects = loadEffects('EB03-038');

  it('[POSITIVE] board has only GERMA chars + P1 DON ≤ P2 DON → RestDon+AddDon fires', () => {
    const base  = getBase();
    const srcId = makeCardId('ci-eb03-038-pos') as CardId;

    const src = makeChar(String(srcId), 'p1', 3000, {
      id: srcId, subTypes: 'GERMA',
    });

    let state = addToBoard(base, src, P1);
    // P1 gets 1 active DON (needed for RestDon action)
    const p1don = makeDon('ci-p1d-germa', 'p1', { tapped: false, attachedTo: null });
    state = addDon(state, [p1don as Card], P1);
    // P2 gets 2 active DON (so P1 DON 1 ≤ P2 DON 2 → DonCountVsOpponent LessOrEqual satisfied)
    const p2dons = [makeDon('ci-p2d0-germa', 'p2'), makeDon('ci-p2d1-germa', 'p2')] as Card[];
    state = addDon(state, p2dons, P2);

    const donBefore = state.players[P1]!.donArea.length;
    const ctx = { sourceCardId: srcId, sourcePlayerId: P1 };
    const after = resolveEffects(eb03Effects, 'Activated', ctx, state);

    // AddDon×2 fires → P1 donArea grows (net +2 minus 1 rested = donArea.length + 1 at minimum)
    expect(logFired(state, after, srcId)).toBe(true);
    expect(after.players[P1]!.donArea.length).toBeGreaterThan(donBefore);
  });

  it('[NEGATIVE] board has a non-GERMA character → OnlyTypeOnBoard fails, effect skipped', () => {
    const base    = getBase();
    const srcId   = makeCardId('ci-eb03-038-neg') as CardId;
    const otherId = makeCardId('ci-non-germa') as CardId;

    const src   = makeChar(String(srcId),   'p1', 3000, { id: srcId,   subTypes: 'GERMA' });
    const other = makeChar(String(otherId), 'p1', 2000, { id: otherId, subTypes: 'Straw Hat Crew' });

    let state = addToBoard(base, src,   P1);
    state     = addToBoard(state, other, P1);
    const p2dons = [makeDon('ci-p2d0-neg', 'p2'), makeDon('ci-p2d1-neg', 'p2')] as Card[];
    state = addDon(state, p2dons, P2);

    const donBefore = state.players[P1]!.donArea.length;
    const ctx  = { sourceCardId: srcId, sourcePlayerId: P1 };
    const after = resolveEffects(eb03Effects, 'Activated', ctx, state);

    expect(logFired(state, after, srcId)).toBe(false);
    expect(after.players[P1]!.donArea.length).toBe(donBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HasFewerLifeThanOpponent — LifeCount condition variant
// Use a card that fires when P1 life < P2 life (real-game: comeback mechanic)
// ─────────────────────────────────────────────────────────────────────────────

describe('HasFewerLifeThanOpponent condition — life-count gate', () => {
  // Build an effect inline for isolation (no dependency on a specific card file)
  const lessLifeEffects: CardEffect[] = [
    {
      trigger: 'OnPlay',
      condition: { type: 'HasFewerLifeThanOpponent' } as never,
      actions: [{ type: 'DrawCard', count: 1 } as never],
    },
  ];

  it('[POSITIVE] P1 has fewer life cards than P2 → DrawCard fires', () => {
    const base  = getBase();
    const srcId = makeCardId('ci-life-pos') as CardId;
    const src   = makeChar(String(srcId), 'p1', 3000, {
      id: srcId, zone: 'hand', cost: 0, effects: lessLifeEffects,
    });

    // Set P1 life = 1, P2 life = 3
    const p1LifeCard = makeChar('ci-p1-life', 'p1', 1000, { zone: 'life' as const });
    const p2LifeCards = [
      makeChar('ci-p2-life0', 'p2', 1000, { zone: 'life' as const }),
      makeChar('ci-p2-life1', 'p2', 1000, { zone: 'life' as const }),
      makeChar('ci-p2-life2', 'p2', 1000, { zone: 'life' as const }),
    ];

    let state: GameState = {
      ...base,
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, life: [p1LifeCard.id as CardId] },
        [P2]: { ...base.players[P2]!, life: p2LifeCards.map((c) => c.id as CardId) },
      },
      cards: {
        ...base.cards,
        [p1LifeCard.id]: p1LifeCard,
        ...Object.fromEntries(p2LifeCards.map((c) => [c.id, c])),
      },
    };
    state = addToHand(state, src, P1);

    const handBefore = state.players[P1]!.hand.length;
    const after = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: srcId });
    expect(isGameError(after)).toBe(false);
    if (!isGameError(after)) {
      const gs = after as GameState;
      // DrawCard(1) → net hand delta = 1 - 1 (card left hand) = 0, but hand ≥ handBefore - 1 + 1
      expect(gs.players[P1]!.hand.length).toBeGreaterThanOrEqual(handBefore - 1 + 1);
    }
  });

  it('[NEGATIVE] P1 has equal or more life than P2 → DrawCard does not fire', () => {
    const base  = getBase();
    const srcId = makeCardId('ci-life-neg') as CardId;
    const src   = makeChar(String(srcId), 'p1', 3000, {
      id: srcId, zone: 'hand', cost: 0, effects: lessLifeEffects,
    });

    // P1 life = 3, P2 life = 1 (P1 ≥ P2 → condition fails)
    const p1LifeCards = [
      makeChar('ci-p1n-life0', 'p1', 1000, { zone: 'life' as const }),
      makeChar('ci-p1n-life1', 'p1', 1000, { zone: 'life' as const }),
      makeChar('ci-p1n-life2', 'p1', 1000, { zone: 'life' as const }),
    ];
    const p2LifeCard = makeChar('ci-p2n-life', 'p2', 1000, { zone: 'life' as const });

    let state: GameState = {
      ...base,
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, life: p1LifeCards.map((c) => c.id as CardId) },
        [P2]: { ...base.players[P2]!, life: [p2LifeCard.id as CardId] },
      },
      cards: {
        ...base.cards,
        ...Object.fromEntries(p1LifeCards.map((c) => [c.id, c])),
        [p2LifeCard.id]: p2LifeCard,
      },
    };
    state = addToHand(state, src, P1);

    const handBefore = state.players[P1]!.hand.length;
    const after = applyAction(state, { type: 'PlayCharacterFromHand', playerId: P1, cardId: srcId });
    expect(isGameError(after)).toBe(false);
    if (!isGameError(after)) {
      const gs = after as GameState;
      // No DrawCard → hand shrinks by 1 (card was played from hand)
      expect(gs.players[P1]!.hand.length).toBe(handBefore - 1);
    }
  });
});
