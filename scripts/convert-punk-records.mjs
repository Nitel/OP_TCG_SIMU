#!/usr/bin/env node
/**
 * Convert punk-records card data → packages/data/raw/{SET}.json
 *
 * Usage:
 *   node scripts/convert-punk-records.mjs --dir ./punk-records [--lang english] [--sets ST-22,OP-01]
 *
 * Options:
 *   --dir <path>   Path to a local clone of https://github.com/buhbbl/punk-records (required)
 *   --lang <lang>  Language folder to use (default: english)
 *   --sets <list>  Comma-separated set IDs to convert (default: all)
 *
 * After conversion, runs `node scripts/sync-sets.mjs` to regenerate deckBuilder.ts imports.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'packages/data/raw');

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function argValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const punkDir  = argValue('--dir');
const lang     = argValue('--lang') ?? 'english';
const setsArg  = argValue('--sets');

if (!punkDir) {
  console.error('Error: --dir <path> is required');
  console.error('  Example: node scripts/convert-punk-records.mjs --dir ./punk-records');
  process.exit(1);
}

if (!existsSync(punkDir)) {
  console.error(`Error: directory not found: ${punkDir}`);
  console.error('  Clone punk-records first:');
  console.error('    git clone --depth=1 https://github.com/buhbbl/punk-records.git');
  process.exit(1);
}

// ─── Load packs index ─────────────────────────────────────────────────────────

const packsPath = join(punkDir, lang, 'packs.json');
if (!existsSync(packsPath)) {
  console.error(`Error: packs.json not found at ${packsPath}`);
  process.exit(1);
}

/**
 * packs.json is an object keyed by pack_id:
 * { "569022": { id: "569022", raw_title: "...", title_parts: { label: "ST-22", ... } } }
 * @type {Record<string, { id: string, raw_title: string, title_parts: { label: string|null } }>}
 */
const packsObj = JSON.parse(readFileSync(packsPath, 'utf8'));

// Normalise to array, skip packs with no label (promo/other)
const packs = Object.values(packsObj).filter(p => p.title_parts?.label != null);

// ─── Filter sets to convert ───────────────────────────────────────────────────

const requestedSets = setsArg ? setsArg.split(',').map(s => s.trim()) : null;

const setsToConvert = requestedSets
  ? packs.filter(p => requestedSets.includes(p.title_parts.label))
  : packs;

if (setsToConvert.length === 0) {
  console.error('No matching sets found.');
  process.exit(1);
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

/**
 * Map a punk-records card object to our RawCard format.
 * @param {Record<string, unknown>} card
 * @param {string} packName  e.g. "ST-22"
 */
function mapCard(card, packName) {
  const colors  = Array.isArray(card.colors)     ? card.colors     : [];
  const types   = Array.isArray(card.types)      ? card.types      : [];
  const attrs   = Array.isArray(card.attributes) ? card.attributes : [];

  return {
    id:         String(card.id   ?? ''),
    name:       String(card.name ?? ''),
    set:        packName,
    cardType:   String(card.category ?? 'Character'),
    cost:       Number(card.cost  ?? 0),
    power:      Number(card.power ?? 0),
    color:      colors.join('/') || '',
    counter:    card.counter != null ? Number(card.counter) : null,
    effectText: String(card.effect ?? ''),
    attribute:  attrs[0] != null ? String(attrs[0]) : '',
    ...(types.length > 0    ? { subTypes:    types.join(' ')          } : {}),
    ...(card.trigger        ? { triggerText: String(card.trigger)     } : {}),
    ...(card.img_full_url   ? { imgUrl:      String(card.img_full_url)} : {}),
  };
}

// ─── Convert ──────────────────────────────────────────────────────────────────

mkdirSync(RAW_DIR, { recursive: true });

let ok = 0, failed = 0;

for (const pack of setsToConvert) {
  const packId   = pack.id;
  const packName = pack.title_parts.label;    // e.g. "ST-22"
  const cardsDir = join(punkDir, lang, 'cards', packId);

  if (!existsSync(cardsDir)) {
    console.warn(`SKIP  ${packName}  (no cards directory: ${cardsDir})`);
    continue;
  }

  try {
    const files = readdirSync(cardsDir).filter(f => f.endsWith('.json'));

    if (files.length === 0) {
      console.warn(`SKIP  ${packName}  (0 cards in ${cardsDir})`);
      continue;
    }

    const cards = files
      .map(f => {
        const raw = JSON.parse(readFileSync(join(cardsDir, f), 'utf8'));
        return mapCard(raw, packName);
      })
      .filter(c => c.id !== '')
      // Sort by card ID for stable output
      .sort((a, b) => a.id.localeCompare(b.id));

    const outPath = join(RAW_DIR, `${packName}.json`);
    writeFileSync(outPath, JSON.stringify(cards, null, 2));
    console.log(`OK    ${packName}  (${cards.length} cards)`);
    ok++;
  } catch (err) {
    console.error(`FAIL  ${packName}  ${err.message}`);
    failed++;
  }
}

console.log(`\n── Done ─────────────────────────────────`);
console.log(`OK: ${ok}  FAIL: ${failed}`);

if (ok > 0) {
  console.log('\nRunning sync-sets to update deckBuilder.ts imports...');
  try {
    execSync('node scripts/sync-sets.mjs', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.warn('sync-sets failed — run `pnpm sync-sets` manually');
  }
}
