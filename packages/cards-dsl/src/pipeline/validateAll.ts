import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCardDefinition } from '../parser/effectParser.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const EFFECTS_DIR = join(__dirname, '../../../data/effects');

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let files: string[];
  try {
    files = readdirSync(EFFECTS_DIR)
      .filter(f => f.endsWith('.json') && f !== '_failures.json');
  } catch {
    console.error('data/effects/ directory not found. Run pnpm generate-effects first.');
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('No effect files found in data/effects/.');
    return;
  }

  const valid: string[]   = [];
  const invalid: { file: string; errors: string[] }[] = [];

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(EFFECTS_DIR, file), 'utf8')) as unknown;
    const result = parseCardDefinition(raw);
    if (result.ok) {
      valid.push(file);
    } else {
      invalid.push({
        file,
        errors: result.errors.map(e => `  ${e.path}: ${e.message}`),
      });
    }
  }

  const total = files.length;
  const pct   = Math.round((valid.length / total) * 100);

  console.log(`\n✅ ${valid.length}/${total} cards valid (${pct}%)`);

  if (invalid.length > 0) {
    console.log(`\n❌ ${invalid.length} cards invalid:\n`);
    for (const entry of invalid) {
      const cardId = entry.file.replace('.json', '');
      console.log(`  ${cardId}`);
      for (const err of entry.errors) {
        console.log(`    ${err}`);
      }
    }
  }

  // Also report failures from _failures.json if present
  try {
    const failPath = join(EFFECTS_DIR, '_failures.json');
    const failures = JSON.parse(readFileSync(failPath, 'utf8')) as { cardId: string; errors: { message: string }[] }[];
    if (failures.length > 0) {
      console.log(`\n⚠️  ${failures.length} generation failure(s) in _failures.json:`);
      for (const f of failures) {
        console.log(`  ${f.cardId}: ${f.errors[0]?.message ?? '?'}`);
      }
    }
  } catch {
    // _failures.json doesn't exist — that's fine
  }

  process.exit(invalid.length > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('validateAll error:', err);
  process.exit(1);
});
