import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCardDefinition } from '../parser/effectParser.js';
import { SYSTEM_PROMPT, buildUserMessage } from './prompts.js';
import type { RawCard } from './fetchCards.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR     = join(__dirname, '../../../data/raw');
const EFFECTS_DIR = join(__dirname, '../../../data/effects');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Strip markdown code fences (```json ... ```) if present */
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced !== null) return fenced[1]!.trim();
  return text.trim();
}

interface FailureEntry {
  cardId: string;
  cardName: string;
  errors: readonly { path: string; message: string }[];
  rawResponse: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Resolve set file
  const setArg = process.argv[2];
  let rawPath: string;

  if (setArg !== undefined) {
    rawPath = join(RAW_DIR, `${setArg}.json`);
  } else {
    // Pick first available raw file
    const files = readdirSync(RAW_DIR).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      console.error('No raw card files found in data/raw/. Run pnpm fetch-cards <SET_ID> first.');
      process.exit(1);
    }
    rawPath = join(RAW_DIR, files[0]!);
    console.log(`No set specified — using ${files[0]}`);
  }

  const cards: RawCard[] = JSON.parse(readFileSync(rawPath, 'utf8')) as RawCard[];
  console.log(`Processing ${cards.length} cards...\n`);

  mkdirSync(EFFECTS_DIR, { recursive: true });

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  let successes = 0;
  const failures: FailureEntry[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    process.stdout.write(`[${i + 1}/${cards.length}] ${card.id} ${card.name}... `);

    let rawText = '';
    try {
      const msg = await callWithRetry(client, card);
      rawText = msg;
      const parsed = JSON.parse(extractJSON(rawText)) as unknown;
      const result = parseCardDefinition(parsed);

      if (result.ok) {
        const outPath = join(EFFECTS_DIR, `${card.id}.json`);
        writeFileSync(outPath, JSON.stringify(result.value, null, 2));
        successes++;
        process.stdout.write('✅\n');
      } else {
        failures.push({ cardId: card.id, cardName: card.name, errors: result.errors, rawResponse: rawText });
        process.stdout.write(`❌ (${result.errors[0]?.message ?? 'validation error'})\n`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ cardId: card.id, cardName: card.name, errors: [{ path: 'root', message: msg }], rawResponse: rawText });
      process.stdout.write(`❌ (${msg})\n`);
    }

    // Rate limiting — 500ms between calls
    if (i < cards.length - 1) await sleep(500);
  }

  // Write failures log
  if (failures.length > 0) {
    const failPath = join(EFFECTS_DIR, '_failures.json');
    writeFileSync(failPath, JSON.stringify(failures, null, 2));
    console.log(`\n⚠️  ${failures.length} failure(s) logged to data/effects/_failures.json`);
  }

  const total = cards.length;
  const pct   = Math.round((successes / total) * 100);
  console.log(`\n✅ ${successes}/${total} cards valid (${pct}%)`);

  if (pct < 80) {
    console.log('⚠️  Below 80% target. Review _failures.json for patterns.');
  }
}

async function callWithRetry(client: Anthropic, card: RawCard): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(card) }],
      });
      const block = response.content[0];
      if (block === undefined || block.type !== 'text') {
        throw new Error('Unexpected response format from Claude');
      }
      return block.text;
    } catch (err) {
      if (attempt === 2) throw err;
      console.warn(`  Retry ${attempt} for ${card.id}...`);
      await sleep(1000);
    }
  }
  throw new Error('unreachable');
}

main().catch((err: unknown) => {
  console.error('generateEffects error:', err);
  process.exit(1);
});
