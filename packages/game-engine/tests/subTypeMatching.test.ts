/**
 * SubType matching tests — verifies hasSubType normalisation and BySubType DSL fixes.
 *
 * Uses SearchDeck WITHOUT lookCount so the engine auto-selects the first matching
 * card and adds it to hand — clean filter-matching verification.
 *
 * SM1 — "Revolutionary Army" matches compound "Dressrosa Revolutionary Army"
 * SM2 — "Revolutionary Army" matches exact "Revolutionary Army"
 * SM3 — "Revolutionary Army" does NOT match "Straw Hat Crew"
 * SM3b — camelCase "RevolutionaryArmy" matches via normalised fallback
 * SM4 — ByName filter matches by card name (Ulti), respects maxCost
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
} from '../src/index.js';
import type { Card, CardEffect, GameState, PlayerId, PlayerSetup } from '../src/index.js';
import { resolveEffects } from '../src/effects/effectResolver.js';

const P1 = makePlayerId('sm-p1');
const P2 = makePlayerId('sm-p2');

function makeChar(id: string, owner: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 3, power, color: 'Red', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}
function makeDon(id: string, owner: PlayerId): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0, color: 'Red', type: 'DON',
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

/** Set up game with target card in P1's deck and a source card on board. */
function setupSearch(deckCard: Card): { state: GameState; sourceId: ReturnType<typeof makeCardId> } {
  const base = bootstrapGame();
  const source = makeChar(`src-${deckCard.id}`, P1, 3000, { zone: 'board' });
  const p1 = base.players[P1]!;
  const s: GameState = {
    ...base,
    cards: { ...base.cards, [deckCard.id]: { ...deckCard, zone: 'deck' }, [source.id]: source },
    players: {
      ...base.players,
      [P1]: { ...p1, deck: [deckCard.id, ...p1.deck], board: [...p1.board, source.id] },
    },
  };
  return { state: s, sourceId: source.id };
}

type FilterArg =
  | string
  | { kind: 'BySubType'; subType: string }
  | { kind: 'ByName'; name: string; maxCost?: number };

/**
 * Run SearchDeck (NO lookCount — auto-picks first match, adds to hand).
 * Returns true if the card ended up in P1's hand (= filter matched).
 */
function filterMatches(filterArg: FilterArg, deckCard: Card): boolean {
  const { state, sourceId } = setupSearch(deckCard);
  const filter: unknown = typeof filterArg === 'string'
    ? { kind: 'BySubType', subType: filterArg }
    : filterArg;

  const effect: CardEffect = {
    trigger: 'OnPlay',
    actions: [{ type: 'SearchDeck', filter, destination: 'hand' } as never],
  };
  const after = resolveEffects([effect], 'OnPlay', { sourceCardId: sourceId, sourcePlayerId: P1 }, state);
  return after.players[P1]!.hand.includes(deckCard.id);
}

// ════════════════════════════════════════════════════════════════════════════════
// Substring matching
// ════════════════════════════════════════════════════════════════════════════════

describe('SubType matching — substring containment', () => {

  it('SM1 — "Revolutionary Army" matches compound subType "Dressrosa Revolutionary Army"', () => {
    const card = makeChar('sm1', P1, 3000, { zone: 'deck', subTypes: 'Dressrosa Revolutionary Army' });
    expect(filterMatches('Revolutionary Army', card)).toBe(true);
  });

  it('SM2 — "Revolutionary Army" matches exact subType "Revolutionary Army"', () => {
    const card = makeChar('sm2', P1, 3000, { zone: 'deck', subTypes: 'Revolutionary Army' });
    expect(filterMatches('Revolutionary Army', card)).toBe(true);
  });

  it('SM3 — "Revolutionary Army" does NOT match subType "Straw Hat Crew"', () => {
    const card = makeChar('sm3', P1, 3000, { zone: 'deck', subTypes: 'Straw Hat Crew' });
    expect(filterMatches('Revolutionary Army', card)).toBe(false);
  });

  it('SM3b — camelCase "RevolutionaryArmy" matches "Dressrosa Revolutionary Army" via normalised fallback', () => {
    const card = makeChar('sm3b', P1, 3000, { zone: 'deck', subTypes: 'Dressrosa Revolutionary Army' });
    expect(filterMatches('RevolutionaryArmy', card)).toBe(true);
  });

  it('SM3c — "Big Mom Pirates" matches exact subType "Big Mom Pirates"', () => {
    const card = makeChar('sm3c', P1, 3000, { zone: 'deck', subTypes: 'Big Mom Pirates' });
    expect(filterMatches('Big Mom Pirates', card)).toBe(true);
  });

  it('SM3d — camelCase "BigMomPirates" matches "Big Mom Pirates" via normalised fallback', () => {
    const card = makeChar('sm3d', P1, 3000, { zone: 'deck', subTypes: 'Big Mom Pirates' });
    expect(filterMatches('BigMomPirates', card)).toBe(true);
  });

  it('SM3e — "Big Mom Pirates" matches compound "The Four Emperors Big Mom Pirates"', () => {
    const card = makeChar('sm3e', P1, 3000, { zone: 'deck', subTypes: 'The Four Emperors Big Mom Pirates' });
    expect(filterMatches('Big Mom Pirates', card)).toBe(true);
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// ByName filter (character name search)
// ════════════════════════════════════════════════════════════════════════════════

describe('SubType matching — ByName filter', () => {

  it('SM4 — ByName "Ulti" maxCost:4 matches card named "Ulti" with cost 4', () => {
    const card = makeChar('sm4', P1, 5000, {
      zone: 'deck', name: 'Ulti', subTypes: 'Animal Kingdom Pirates', cost: 4,
    });
    expect(filterMatches({ kind: 'ByName', name: 'Ulti', maxCost: 4 }, card)).toBe(true);
  });

  it('SM4b — ByName "Ulti" maxCost:4 excludes Ulti with cost 5', () => {
    const card = makeChar('sm4b', P1, 6000, {
      zone: 'deck', name: 'Ulti', subTypes: 'Animal Kingdom Pirates', cost: 5,
    });
    expect(filterMatches({ kind: 'ByName', name: 'Ulti', maxCost: 4 }, card)).toBe(false);
  });

  it('SM4c — ByName "Holly" matches card named "Holly" regardless of subType', () => {
    const card = makeChar('sm4c', P1, 2000, {
      zone: 'deck', name: 'Holly', subTypes: 'Sky Island Vassals', cost: 2,
    });
    expect(filterMatches({ kind: 'ByName', name: 'Holly' }, card)).toBe(true);
  });

  it('SM4d — ByName "Holly" does NOT match card named "Ohm"', () => {
    const card = makeChar('sm4d', P1, 4000, {
      zone: 'deck', name: 'Ohm', subTypes: 'Sky Island Vassals', cost: 4,
    });
    expect(filterMatches({ kind: 'ByName', name: 'Holly' }, card)).toBe(false);
  });

});
