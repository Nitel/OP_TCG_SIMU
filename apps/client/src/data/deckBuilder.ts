import { makeCardId } from 'game-engine';
import type { Card, CardEffect, CardKeyword, PlayerId, PlayerSetup } from 'game-engine';

// ─── AUTO-GENERATED: raw set imports — do not edit manually, run pnpm sync-sets
import op01Raw from '../../../../packages/data/raw/OP-01.json';
import op02Raw from '../../../../packages/data/raw/OP-02.json';
import st15Raw from '../../../../packages/data/raw/ST-15.json';
import st21Raw from '../../../../packages/data/raw/ST-21.json';
import st22Raw from '../../../../packages/data/raw/ST-22.json';
import st27Raw from '../../../../packages/data/raw/ST-27.json';
// ─── END AUTO-GENERATED ───────────────────────────────────────────────────────

// ─── Local types matching raw/effect file shapes ──────────────────────────────

interface RawCard {
  readonly id: string;
  readonly name: string;
  readonly cardType: string;
  readonly cost: number;
  readonly power: number;
  readonly color: string;
  readonly counter: number | null;
}

function normalizeCardType(t: string): 'Leader' | 'Character' | 'Event' | 'Stage' | null {
  switch (t.toLowerCase()) {
    case 'leader':    return 'Leader';
    case 'character': return 'Character';
    case 'event':     return 'Event';
    case 'stage':     return 'Stage';
    default:          return null;
  }
}

interface EffectDef {
  readonly id: string;
  readonly keywords: readonly CardKeyword[];
  readonly effects: readonly CardEffect[];
}

// ─── Load effect files (eager = synchronous at build time) ───────────────────

const effectModules = import.meta.glob(
  '../../../../packages/data/effects/*.json',
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
    type: (normalizeCardType(raw.cardType) ?? 'Character') as Card['type'],
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
  const allRaw = op01Raw as unknown as RawCard[];

  const leaders = allRaw.filter((c) => c.cardType.toLowerCase() === 'leader');
  const nonLeaders = allRaw.filter((c) => c.cardType.toLowerCase() !== 'leader');

  // Random leader
  const leaderRaw = leaders[Math.floor(Math.random() * leaders.length)]!;
  const leaderCard = rawToCard(
    leaderRaw,
    `${pid}-${leaderRaw.id}-leader`,
    playerId,
    'leader',
  );

  // Build deck: only cards color-compatible with the leader, max 4 copies, exactly 50
  // Colors can be space-separated ("Blue Purple") or slash-separated ("Blue/Purple")
  const splitColors = (c: string): string[] => c.split(/[\s/]+/).map((x) => x.trim()).filter(Boolean);
  const leaderColors = new Set(splitColors(leaderRaw.color));
  const compatible = nonLeaders.filter((c) =>
    splitColors(c.color).some((x) => leaderColors.has(x))
  );
  const pool = shuffle(compatible.flatMap((c) => [c, c, c, c]));
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

/** All unique OP01 template IDs — used to preload card images at startup. */
export const OP01_TEMPLATE_IDS: string[] = [
  ...new Set((op01Raw as unknown as RawCard[]).map((c) => c.id)),
];

// ─── Deck Builder types & API ─────────────────────────────────────────────────

/** A card template as shown in the deck builder UI (no instance data). */
export interface CardTemplate {
  readonly id: string;
  readonly name: string;
  readonly type: 'Leader' | 'Character' | 'Event';
  readonly cost: number;
  readonly power: number;
  readonly color: string;
  readonly counter: number | null;
  readonly keywords: readonly string[];
  readonly isParallel: boolean;
}

/** A user-saved deck (serialisable to localStorage). */
export interface SavedDeck {
  readonly name: string;
  readonly leaderId: string;
  readonly cards: readonly { readonly id: string; readonly count: number }[];
}

// ─── AUTO-GENERATED: allRaw — do not edit manually, run pnpm sync-sets
const allRaw: RawCard[] = [
  ...(op01Raw as unknown as RawCard[]),
  ...(op02Raw as unknown as RawCard[]),
  ...(st15Raw as unknown as RawCard[]),
  ...(st21Raw as unknown as RawCard[]),
  ...(st22Raw as unknown as RawCard[]),
  ...(st27Raw as unknown as RawCard[]),
];
// ─── END AUTO-GENERATED ───────────────────────────────────────────────────────

// IDs qui apparaissent plus d'une fois → les occurrences suivantes sont des arts alternatifs
const _seenIds = new Set<string>();
const _altArtIds = new Set<string>();
for (const c of allRaw) {
  if (_seenIds.has(c.id)) _altArtIds.add(c.id + '|' + c.name);
  else _seenIds.add(c.id);
}

/** All card templates (Leaders + Characters + Events), for the deck builder grid. */
export const ALL_CARD_TEMPLATES: readonly CardTemplate[] = allRaw
  .map((c) => ({ ...c, normalizedType: normalizeCardType(c.cardType) }))
  .filter((c): c is typeof c & { normalizedType: 'Leader' | 'Character' | 'Event' } =>
    c.normalizedType === 'Leader' || c.normalizedType === 'Character' || c.normalizedType === 'Event',
  )
  .map((c) => {
    const eff = effectMap[c.id];
    return {
      id: c.id,
      name: c.name,
      type: c.normalizedType,
      cost: c.cost,
      power: c.power,
      color: c.color,
      counter: c.counter,
      keywords: eff?.keywords ?? [],
      isParallel: _altArtIds.has(c.id + '|' + c.name),
    };
  });

/**
 * Build a PlayerSetup from a user-selected SavedDeck.
 * Cards not found in the pool are silently skipped.
 * Deck is padded with random cards if fewer than 50 valid cards are provided.
 */
export function buildDeckFromSaved(playerId: PlayerId, deck: SavedDeck): PlayerSetup {
  const pid = String(playerId);
  const byId: Record<string, RawCard> = Object.fromEntries(allRaw.map((c) => [c.id, c]));

  // Leader
  const leaderRaw = byId[deck.leaderId];
  const leaderCard = rawToCard(
    leaderRaw ?? allRaw.find((c) => c.cardType.toLowerCase() === 'leader')!,
    `${pid}-${deck.leaderId}-leader`,
    playerId,
    'leader',
  );

  // Main deck cards
  const deckCards: Card[] = [];
  const copyCount: Record<string, number> = {};
  for (const entry of deck.cards) {
    const raw = byId[entry.id];
    if (raw === undefined) continue;
    const clamped = Math.min(entry.count, 4);
    for (let i = 0; i < clamped && deckCards.length < 50; i++) {
      const idx = copyCount[raw.id] ?? 0;
      copyCount[raw.id] = idx + 1;
      deckCards.push(rawToCard(raw, `${pid}-${raw.id}-${idx}`, playerId, 'deck'));
    }
  }

  // Pad to 50 with random non-leader cards if needed
  if (deckCards.length < 50) {
    const nonLeaders = allRaw.filter((c) => c.cardType.toLowerCase() !== 'leader');
    const padPool = shuffle(nonLeaders.flatMap((c) => [c, c, c, c]));
    for (const raw of padPool) {
      if (deckCards.length >= 50) break;
      const existing = copyCount[raw.id] ?? 0;
      if (existing >= 4) continue;
      copyCount[raw.id] = existing + 1;
      deckCards.push(rawToCard(raw, `${pid}-${raw.id}-${existing}`, playerId, 'deck'));
    }
  }

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

// ─── localStorage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = 'op_tcg_saved_decks';

export function loadDecksFromStorage(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    return JSON.parse(raw) as SavedDeck[];
  } catch {
    return [];
  }
}

export function saveDeckToStorage(deck: SavedDeck): void {
  const decks = loadDecksFromStorage().filter((d) => d.name !== deck.name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...decks, deck]));
}

export function deleteDeckFromStorage(name: string): void {
  const decks = loadDecksFromStorage().filter((d) => d.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
}
