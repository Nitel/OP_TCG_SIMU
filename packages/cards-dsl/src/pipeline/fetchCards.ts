import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../../data/raw');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawCard {
  id: string;
  name: string;
  set: string;
  cardType: string;
  cost: number;
  power: number;
  color: string;
  counter: number | null;
  effectText: string;
  attribute: string;
}

// Raw shape returned by optcgapi.com /api/sets/
interface ApiCard {
  card_set_id?: string;
  card_name?: string;
  set_id?: string;
  card_type?: string;
  card_cost?: string | number;
  card_power?: string | number;
  card_color?: string;
  counter_amount?: string | number | null;
  card_text?: string | null;
  attribute?: string | null;
}

// Raw shape returned by optcgapi.com /api/decks/
interface ApiDeckCard {
  card_id?: string;       // legacy — not present in newer sets
  card_set_id?: string;   // used by newer sets (ST-27+)
  card_name?: string;
  card_type?: string;
  card_cost?: string | number;
  card_power?: string | number;
  card_color?: string;
  counter?: string | number | null;
  card_text?: string | null;
  attribute?: string | null;
  quantity?: number;
}

interface ApiDeck {
  cards?: ApiDeckCard[];
  deck_cards?: ApiDeckCard[];
}

interface ApiSet {
  set_id: string;
  set_name: string;
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function mapCard(raw: ApiCard): RawCard {
  const cost = parseInt(String(raw.card_cost ?? '0'), 10);
  const power = parseInt(String(raw.card_power ?? '0'), 10);
  const counter = raw.counter_amount !== null && raw.counter_amount !== undefined
    ? parseInt(String(raw.counter_amount), 10)
    : null;

  return {
    id:         raw.card_set_id  ?? '',
    name:       raw.card_name    ?? '',
    set:        raw.set_id       ?? '',
    cardType:   raw.card_type    ?? 'Character',
    cost:       isNaN(cost)   ? 0 : cost,
    power:      isNaN(power)  ? 0 : power,
    color:      raw.card_color   ?? '',
    counter:    counter !== null && isNaN(counter) ? null : counter,
    effectText: raw.card_text    ?? '',
    attribute:  raw.attribute    ?? '',
  };
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = 'https://optcgapi.com/api';

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

async function listSets(): Promise<ApiSet[]> {
  return fetchJSON<ApiSet[]>(`${BASE}/allSets/`);
}

async function fetchSet(setId: string): Promise<ApiCard[]> {
  return fetchJSON<ApiCard[]>(`${BASE}/sets/${setId}/`);
}

async function fetchDeck(setId: string): Promise<RawCard[] | null> {
  try {
    const data = await fetchJSON<ApiDeck | ApiDeckCard[]>(`${BASE}/decks/${setId}/`);
    // API may return an array directly or an object with a cards/deck_cards array
    const rawCards: ApiDeckCard[] = Array.isArray(data)
      ? data
      : (data.cards ?? data.deck_cards ?? []);
    if (rawCards.length === 0) return null;
    const seen = new Set<string>();
    const result: RawCard[] = [];
    for (const c of rawCards) {
      const id = c.card_set_id ?? c.card_id ?? '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const cost    = parseInt(String(c.card_cost ?? '0'), 10);
      const power   = parseInt(String(c.card_power ?? '0'), 10);
      const counter = c.counter !== null && c.counter !== undefined
        ? parseInt(String(c.counter), 10) : null;
      result.push({
        id,
        name:       c.card_name   ?? '',
        set:        setId,
        cardType:   c.card_type   ?? 'Character',
        cost:       isNaN(cost)   ? 0 : cost,
        power:      isNaN(power)  ? 0 : power,
        color:      c.card_color  ?? '',
        counter:    counter !== null && isNaN(counter) ? null : counter,
        effectText: c.card_text   ?? '',
        attribute:  c.attribute   ?? '',
      });
    }
    return result.length > 0 ? result : null;
  } catch (err) {
    console.warn(`  ⚠ fetchDeck error: ${err}`);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const setId = process.argv.slice(2).find((a: string) => a !== '--');

  if (setId === undefined) {
    console.log('Usage: pnpm fetch-cards <SET_ID>  (e.g. OP-01)\n');
    console.log('Fetching available sets from OPTCGAPI...\n');
    const sets = await listSets();
    for (const s of sets) {
      console.log(`  ${s.set_id.padEnd(12)} ${s.set_name}`);
    }
    return;
  }

  console.log(`Fetching set ${setId}...`);

  // ST-* and EB-* are starter/extra decks → use /api/decks/ only
  // OP-* and others are booster sets → use /api/sets/ only
  const isStarterDeck = /^(ST|EB)-/i.test(setId);

  let cards: RawCard[];
  if (isStarterDeck) {
    console.log(`  ← /api/decks/${setId}/`);
    const result = await fetchDeck(setId);
    if (result === null) throw new Error(`Deck endpoint vide ou absent pour ${setId}`);
    cards = result;
  } else {
    console.log(`  ← /api/sets/${setId}/`);
    const apiCards = await fetchSet(setId);
    cards = apiCards.map(mapCard).filter(c => c.id !== '');
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const outPath = join(DATA_DIR, `${setId}.json`);
  writeFileSync(outPath, JSON.stringify(cards, null, 2));
  console.log(`✅ ${cards.length} cards written to data/raw/${setId}.json`);
}

main().catch((err: unknown) => {
  console.error('fetchCards error:', err);
  process.exit(1);
});
