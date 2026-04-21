#!/usr/bin/env node
// Supprime les _p2.png qui sont identiques (même taille) à leur _p1.png correspondant.
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR  = join(ROOT, 'apps/client/public/card-images');

const files = readdirSync(DIR);
let removed = 0;

for (const f of files) {
  if (!f.endsWith('_p2.png')) continue;
  const p1path = join(DIR, f.replace('_p2.png', '_p1.png'));
  const p2path = join(DIR, f);
  try {
    const s1 = statSync(p1path).size;
    const s2 = statSync(p2path).size;
    if (s1 === s2) {
      unlinkSync(p2path);
      removed++;
    }
  } catch { /* _p1.png absent — on garde le _p2.png */ }
}

console.log(`Supprimés : ${removed} _p2.png doublons (même taille que _p1.png).`);
