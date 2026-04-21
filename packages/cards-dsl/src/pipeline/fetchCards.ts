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

// Raw shape returned by optcgapi.com
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
  const apiCards = await fetchSet(setId);
  const cards: RawCard[] = apiCards.map(mapCard).filter(c => c.id !== '');

  mkdirSync(DATA_DIR, { recursive: true });
  const outPath = join(DATA_DIR, `${setId}.json`);
  writeFileSync(outPath, JSON.stringify(cards, null, 2));
  console.log(`✅ ${cards.length} cards written to data/raw/${setId}.json`);
}

main().catch((err: unknown) => {
  console.error('fetchCards error:', err);
  process.exit(1);
});
