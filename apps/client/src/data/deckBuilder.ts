import { makeCardId } from 'game-engine';
import type { Card, CardEffect, CardKeyword, PlayerId, PlayerSetup } from 'game-engine';

import op01Raw from '../../../../packages/data/raw/OP-01.json';

// ─── Local types matching raw/effect file shapes ──────────────────────────────

interface RawCard {
  readonly id: string;
  readonly name: string;
  readonly cardType: 'Leader' | 'Character' | 'Event' | 'Stage';
  readonly cost: number;
  readonly power: number;
  readonly color: string;
  readonly counter: number | null;
}

interface EffectDef {
  readonly id: string;
  readonly keywords: readonly CardKeyword[];
  readonly effects: readonly CardEffect[];
}

// ─── Load effect files (eager = synchronous at build time) ───────────────────

const effectModules = import.meta.glob(
  '../../../../packages/data/effects/OP01-*.json',
  { eager: true },
) as Record<string, { readonly default: EffectDef }>;

const effectMap: Record<string, EffectDef> = Object.fromEntries(
  Object.values(effectModules).map((m) => [m.default.id, m.default]),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function rawToCard(
  raw: RawCard,
  instanceId: string,
  playerId: PlayerId,
  zone: Card['zone'],
): Card {
  const eff = effectMap[raw.id];
  const base: Card = {
    id: makeCardId(instanceId),
    name: raw.name,
    cost: raw.cost,
    power: raw.power,
    color: raw.color as Card['color'],
    type: raw.cardType,
    zone,
    ownerId: playerId,
    tapped: false,
    attachedTo: null,
  };
  return {
    ...base,
    ...(raw.counter !== null ? { counter: raw.counter } : {}),
    ...(eff !== undefined && eff.keywords.length > 0 ? { keywords: eff.keywords } : {}),
    ...(eff !== undefined && eff.effects.length > 0 ? { effects: eff.effects } : {}),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a random 50-card deck from OP01 cards for the given player.
 * - 1 random Leader
 * - 50 deck cards (Characters + Events), max 4 copies of any card
 * - 10 DON!! cards
 */
export function buildRandomDeck(playerId: PlayerId): PlayerSetup {
  const pid = String(playerId);
  const allCards = op01Raw as unknown as RawCard[];

  const leaders = allCards.filter((c) => c.cardType === 'Leader');
  const nonLeaders = allCards.filter((c) => c.cardType !== 'Leader');

  // Random leader
  const leaderRaw = leaders[Math.floor(Math.random() * leaders.length)]!;
  const leaderCard = rawToCard(
    leaderRaw,
    `${pid}-${leaderRaw.id}-leader`,
    playerId,
    'leader',
  );

  // Build deck: expand to 4 copies of each card, shuffle, take 50
  // (pool has exactly 4 of each → slice(0,50) guarantees max-4-copies rule)
  const pool = shuffle(nonLeaders.flatMap((c) => [c, c, c, c]));
  const deckRaw = pool.slice(0, 50);

  // Assign unique instance IDs per template card
  const copyCount: Record<string, number> = {};
  const deckCards: Card[] = deckRaw.map((raw) => {
    const idx = copyCount[raw.id] ?? 0;
    copyCount[raw.id] = idx + 1;
    return rawToCard(raw, `${pid}-${raw.id}-${idx}`, playerId, 'deck');
  });

  // 10 DON!! cards
  const donCards: Card[] = Array.from({ length: 10 }, (_, i): Card => ({
    id: makeCardId(`${pid}-don-${i}`),
    name: 'DON!!',
    cost: 0,
    power: 0,
    color: 'Red',
    type: 'DON',
    zone: 'deck',
    ownerId: playerId,
    tapped: false,
    attachedTo: null,
  }));

  return { id: playerId, leaderCard, deckCards, donCards };
}
