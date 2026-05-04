import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from repo root automatically (dev convenience — no extra dependency)
{
  const envFile = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env');
  if (existsSync(envFile)) {
    readFileSync(envFile, 'utf8').split('\n').forEach((line: string) => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m !== null) process.env[m[1]!] ??= m[2]!.replace(/^['"]|['"]$/g, '');
    });
  }
}
import { parseCardDefinition } from '../parser/effectParser.js';
import { SYSTEM_PROMPT, buildUserMessage } from './prompts.js';
import { ruleParseCard } from './ruleParser.js';
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

// ─── Post-processing ──────────────────────────────────────────────────────────

const COUNT_BASED_ACTIONS = new Set(['TrashCard', 'Draw', 'AddLife', 'RemoveLife', 'TakeLifeToHand', 'AttachDon', 'GiveDon']);

const VALID_KEYWORDS = new Set(['Rush', 'Blocker', 'Banish', 'DoubleAttack', 'Unblockable']);

const VALID_ACTION_TYPES = new Set([
  'Draw', 'KO', 'ReturnToHand', 'PowerBoost', 'TrashCard', 'AddLife', 'GiveDon',
  'TakeLifeToHand', 'AttachDon', 'GainKeyword', 'Rest', 'RemoveLife', 'PlaySelf',
  'SearchDeck', 'PlayFromHand', 'RevealFromHand', 'TrashFromHand',
]);

const VALID_TRASH_FROM = new Set(['OpponentHand', 'OwnHand']);

function sanitizeActions(actions: unknown[]): unknown[] {
  return actions.filter((a) => {
    if (typeof a !== 'object' || a === null) return false;
    const act = a as Record<string, unknown>;
    // Drop actions with unknown/trigger-name types (e.g. LLM emitting "OnAttack" as action type)
    if (!VALID_ACTION_TYPES.has(act['type'] as string)) return false;
    if (COUNT_BASED_ACTIONS.has(act['type'] as string) && typeof act['count'] === 'number' && act['count'] < 1) {
      return false;
    }
    // Fix common scope hallucinations
    const t = act['target'];
    if (typeof t === 'object' && t !== null) {
      const tgt = t as Record<string, unknown>;
      if (tgt['scope'] === 'ChooseOwnLeader') tgt['scope'] = 'OwnLeader';
      if (tgt['scope'] === 'ChooseOpponentLeader') tgt['scope'] = 'OpponentLeader';
    }
    // Fix TrashCard.from: default to OwnHand if missing/invalid
    if (act['type'] === 'TrashCard' && !VALID_TRASH_FROM.has(act['from'] as string)) {
      act['from'] = 'OwnHand';
    }
    // Fix SearchDeck.destination: default to hand if missing/invalid
    if (act['type'] === 'SearchDeck' && !['hand', 'board'].includes(act['destination'] as string)) {
      act['destination'] = 'hand';
    }
    if (Array.isArray(act['thenActions'])) {
      act['thenActions'] = sanitizeActions(act['thenActions'] as unknown[]);
    }
    return true;
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const skipExisting   = process.argv.includes('--skip-existing');
  const retryFailures  = process.argv.includes('--retry-failures');

  // Resolve set file — ignore flags (anything starting with --)
  const setArg = process.argv.slice(2).find((a: string) => a !== '--' && !a.startsWith('--'));
  let rawPath: string;

  if (setArg !== undefined) {
    // Normalise OP02 → OP-02, ST21 → ST-21, etc.
    const normalised = setArg.replace(/^([A-Za-z]+)(\d+)$/, '$1-$2').toUpperCase();
    rawPath = join(RAW_DIR, `${normalised}.json`);
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

  // --retry-failures: only process cards listed in the set's _failures.json
  let retryIds: Set<string> | null = null;
  if (retryFailures) {
    const failPath = join(EFFECTS_DIR, '_failures.json');
    if (!existsSync(failPath)) {
      console.log('No _failures.json found — nothing to retry.');
      process.exit(0);
    }
    const failData = JSON.parse(readFileSync(failPath, 'utf8')) as FailureEntry[];
    retryIds = new Set(failData.map((f) => f.cardId));
    console.log(`Retrying ${retryIds.size} failed card(s)...\n`);
  }

  const cards: RawCard[] = JSON.parse(readFileSync(rawPath, 'utf8')) as RawCard[];
  console.log(`Processing ${cards.length} cards...\n`);

  mkdirSync(EFFECTS_DIR, { recursive: true });

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  let successes = 0;
  const failures: FailureEntry[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const outPath = join(EFFECTS_DIR, `${card.id}.json`);

    // --retry-failures: only process IDs that were in the failures list
    if (retryIds !== null && !retryIds.has(card.id)) {
      successes++;
      continue;
    }

    if (skipExisting && retryIds === null && existsSync(outPath)) {
      console.log(`[${i + 1}/${cards.length}] ${card.id} ${card.name}... SKIP`);
      successes++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${cards.length}] ${card.id} ${card.name}... `);

    // ── Rule-based parser (free, instant) ─────────────────────────────────────
    const ruleResult = ruleParseCard(card);
    if (ruleResult !== null) {
      const validated = parseCardDefinition(ruleResult as unknown);
      if (validated.ok) {
        writeFileSync(outPath, JSON.stringify(validated.value, null, 2));
        successes++;
        process.stdout.write('⚡\n');
        continue;
      }
      // Rule parser produced something invalid — fall through to LLM
    }

    let rawText = '';
    try {
      const msg = await callWithRetry(client, card);
      rawText = msg;
      const parsed = JSON.parse(extractJSON(rawText)) as unknown;

      // Post-process: sanitize and strip invalid/empty effects
      if (typeof parsed === 'object' && parsed !== null) {
        const p = parsed as Record<string, unknown>;
        // Strip unknown keywords (e.g. attribute names like Slash, Strike, Special)
        if (Array.isArray(p['keywords'])) {
          p['keywords'] = (p['keywords'] as unknown[]).filter(
            (k) => typeof k === 'string' && VALID_KEYWORDS.has(k),
          );
        }
        if (Array.isArray(p['effects'])) {
          p['effects'] = (p['effects'] as unknown[])
            .map((e) => {
              if (typeof e !== 'object' || e === null) return e;
              const eff = e as Record<string, unknown>;
              if (Array.isArray(eff['actions'])) {
                eff['actions'] = sanitizeActions(eff['actions'] as unknown[]);
              }
              return eff;
            })
            .filter(
              (e) => typeof e === 'object' && e !== null
                && Array.isArray((e as Record<string, unknown>)['actions'])
                && ((e as Record<string, unknown>)['actions'] as unknown[]).length > 0,
            );
        }
      }

      const result = parseCardDefinition(parsed);

      if (result.ok) {
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
