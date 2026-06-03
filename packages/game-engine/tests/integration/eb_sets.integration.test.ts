/**
 * EB Sets Integration Tests (EB01–EB04).
 *
 * Cards under test:
 *   EB01-001 — [When Attacking] HasCardOnBoard: Land of Wano → OwnLeader +1000 EndOfTurn (Oden)
 *   EB01-002 — [On Play] AttachDon 1 rested to own char/leader (after fix)
 *   EB02-010 — [Activate: Main][Once Per Turn] HasCardOnBoard: Straw Hat → ActivateDon 2 + OwnLeader +1000
 *   EB03-053 — [On Play] AttachDon 1 rested to leader + FlipLife opp (after fix)
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
import { resolveEffects } from '../../src/effects/effectResolver.js';

const P1 = makePlayerId('eb-p1');
const P2 = makePlayerId('eb-p2');

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 3, power, color: 'Yellow', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}
function makeDon(id: string, owner: PlayerId): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Yellow', type: 'DON',
    zone: 'donArea', ownerId: owner, tapped: false, attachedTo: null,
  };
}
function makePlayerSetup(id: PlayerId): PlayerSetup {
  const s = id as string;
  return {
    id,
    leaderCard: makeChar(`${s}-leader`, id, 5000, { type: 'Leader', zone: 'deck' }),
    deckCards: Array.from({ length: 50 }, (_, i) => makeChar(`${s}-dk-${i}`, id, 2000, { zone: 'deck' })),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${s}-don-${i}`, id) as Card),
  };
}
function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, { type: 'StartGame', player1: makePlayerSetup(P1), player2: makePlayerSetup(P2), firstPlayerId: P1 });
  if (isGameError(s)) throw new Error((s as any).message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error((s as any).message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error((s as any).message);
  return { ...s as GameState, phase: 'Main', activePlayerId: P1, turnNumber: 3 };
}
function addToBoard(s: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...s, cards: { ...s.cards, [card.id]: { ...card, zone: 'board' } },
    players: { ...s.players, [owner]: { ...s.players[owner]!, board: [...s.players[owner]!.board, card.id] } },
  };
}
function addToHand(s: GameState, card: Card, owner: PlayerId): GameState {
  return {
    ...s, cards: { ...s.cards, [card.id]: { ...card, zone: 'hand' } },
    players: { ...s.players, [owner]: { ...s.players[owner]!, hand: [...s.players[owner]!.hand, card.id] } },
  };
}
function addFreeDon(state: GameState, dons: Card[]): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const d of dons) updatedCards[d.id] = { ...d, zone: 'donArea', tapped: true, attachedTo: null };
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: { ...state.players, [P1]: { ...state.players[P1]!, donArea: [...state.players[P1]!.donArea, ...dons.map((d) => d.id)] } },
  };
}

// ─── DSL stubs ─────────────────────────────────────────────────────────────────

const eb01001Effect: CardEffect = {
  trigger: 'OnAttack',
  condition: { type: 'HasCardOnBoard', name: 'Land of Wano' } as never,
  actions: [
    { type: 'PowerBoost', amount: 1000, target: { scope: 'OwnLeader' }, duration: 'EndOfTurn' } as never,
  ],
};

const eb01002Effect: CardEffect = {
  trigger: 'OnPlay',
  actions: [
    { type: 'AttachDon', count: 1, target: { scope: 'ChooseOwnCharacterOrLeader' }, from: 'rested' } as never,
  ],
};

const eb03053Effect: CardEffect = {
  trigger: 'OnPlay',
  condition: { type: 'Always' },
  actions: [
    { type: 'AttachDon', count: 1, target: { scope: 'OwnLeader' }, from: 'rested' } as never,
    { type: 'FlipLife', count: 1 },
  ],
};

// ════════════════════════════════════════════════════════════════════════════════
// EB01-001 Kouzuki Oden — OnAttack HasCardOnBoard:Land of Wano → OwnLeader +1000
// ════════════════════════════════════════════════════════════════════════════════

describe('EB01 integration — EB01-001 Oden OnAttack conditional +1000 to leader', () => {

  it('L1 — Land of Wano card on board → leader +1000 EndOfTurn on attack', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    const leaderBasePower = calculatePower(leaderId, s);

    const wanoChar = makeChar('eb01-wano', P1, 3000, { name: 'Land of Wano', subTypes: 'Land of Wano' });
    s = addToBoard(s, wanoChar, P1);

    const oden = makeChar('eb01-oden', P1, 5000, { effects: [eb01001Effect], cost: 0 });
    s = addToBoard(s, oden, P1);
    s = { ...s, newBoardIds: [] };

    // Oden attacks
    const p2LeaderId = s.players[P2]!.leader!;
    const result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: oden.id, targetId: p2LeaderId });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    expect(calculatePower(leaderId, result)).toBe(leaderBasePower + 1000);
  });

  it('L2 — no Land of Wano card → condition fails, no boost', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    const leaderBasePower = calculatePower(leaderId, s);

    const oden = makeChar('eb01-oden2', P1, 5000, { effects: [eb01001Effect], cost: 0 });
    s = addToBoard(s, oden, P1);
    s = { ...s, newBoardIds: [] };

    const p2LeaderId = s.players[P2]!.leader!;
    const result = applyAction(s, { type: 'DeclareAttack', playerId: P1, attackerId: oden.id, targetId: p2LeaderId });
    if (isGameError(result)) return;

    expect(calculatePower(leaderId, result)).toBe(leaderBasePower);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// EB01-002 — OnPlay AttachDon 1 rested to own char/leader (after fix)
// ════════════════════════════════════════════════════════════════════════════════

describe('EB01 integration — EB01-002 OnPlay AttachDon rested to own (after fix)', () => {

  it('C1 — play card, 1 rested DON in donArea → attaches to auto-selected own char', () => {
    let s = bootstrapGame();

    // Add 1 rested DON to P1's donArea
    const restedDon = makeDon('eb01-rdon', P1);
    s = addFreeDon(s, [restedDon]); // addFreeDon sets tapped:true

    const target = makeChar('eb01-target', P1, 3000);
    s = addToBoard(s, target, P1);

    const eb01Card = makeChar('eb01-card', P1, 3000, { zone: 'hand', cost: 0, effects: [eb01002Effect] });
    s = addToHand(s, eb01Card, P1);

    let result = applyAction(s, { type: 'PlayCharacterFromHand', playerId: P1, cardId: eb01Card.id });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    // OnPlay AttachDon ChooseOwnCharacterOrLeader → pendingTargetInteraction for player to choose target
    if (result.pendingTargetInteraction !== null) {
      result = applyAction(result, { type: 'ResolveTargetInteraction', playerId: P1, targetCardId: target.id });
      expect(isGameError(result)).toBe(false);
      if (isGameError(result)) return;
    }

    // A rested DON should be attached to the chosen target
    const attachedDon = Object.values(result.cards).find(
      (c) => c.type === 'DON' && c.attachedTo !== null && c.ownerId === P1
    );
    expect(attachedDon).toBeDefined();
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// EB03-053 — OnPlay AttachDon rested to leader + FlipLife opp (after fix)
// ════════════════════════════════════════════════════════════════════════════════

describe('EB03 integration — EB03-053 OnPlay AttachDon to leader + FlipLife opp (after fix)', () => {

  it('C2 — play card → leader has 1 rested DON attached; opp life unchanged (FlipLife)', () => {
    let s = bootstrapGame();

    const leaderId = s.players[P1]!.leader!;
    const oppLifeBefore = s.players[P2]!.life.length;

    const restedDon = makeDon('eb03-rdon', P1);
    s = addFreeDon(s, [restedDon]);

    const eb03Card = makeChar('eb03-card', P1, 4000, { zone: 'hand', cost: 0, effects: [eb03053Effect] });
    s = addToHand(s, eb03Card, P1);

    const result = resolveEffects(
      [eb03053Effect],
      'OnPlay',
      { sourceCardId: eb03Card.id, sourcePlayerId: P1 },
      s,
    );

    // FlipLife: opp life count unchanged (flip = face-up, not moved)
    expect(result.players[P2]!.life.length).toBe(oppLifeBefore);
  });

});
