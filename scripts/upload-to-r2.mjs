#!/usr/bin/env node
/**
 * Upload all card images to Cloudflare R2.
 *
 * Prerequisites:
 *   npm install -g @aws-sdk/client-s3   (or add to devDependencies)
 *
 * Required env variables (set in .env at repo root or export in shell):
 *   R2_ACCOUNT_ID      — Cloudflare account ID
 *   R2_ACCESS_KEY_ID   — R2 access key ID
 *   R2_SECRET_KEY      — R2 secret access key
 *   R2_BUCKET          — R2 bucket name (e.g. "optcg-cards")
 *   R2_PUBLIC_URL      — Public bucket URL (e.g. "https://cdn.optcg-simu.com")
 *
 * Usage:
 *   node scripts/upload-to-r2.mjs [--dry-run]
 *
 * After upload, set in apps/client/.env:
 *   VITE_CDN_BASE_URL=https://cdn.optcg-simu.com
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR   = join(ROOT, 'apps/client/public/card-images');
const DRY_RUN      = process.argv.includes('--dry-run');
const SKIP_EXISTING = process.argv.includes('--skip-existing');

// ─── Load env from .env file if present ──────────────────────────────────────
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_KEY;
const BUCKET     = process.env.R2_BUCKET;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
  console.error(`
Missing required environment variables. Set these in .env or export them:
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_KEY
  R2_BUCKET
  R2_PUBLIC_URL  (optional, for reference)
`);
  process.exit(1);
}

// ─── Load @aws-sdk/client-s3 ─────────────────────────────────────────────────
let S3Client, PutObjectCommand, HeadObjectCommand;
try {
  const require = createRequire(import.meta.url);
  ({ S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3'));
} catch {
  console.error(`
@aws-sdk/client-s3 not found. Install it:
  npm install @aws-sdk/client-s3
or add it to the root package.json devDependencies.
`);
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

// ─── MIME type helper ─────────────────────────────────────────────────────────
function mime(filename) {
  const ext = extname(filename).toLowerCase();
  if (ext === '.png')  return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

// ─── Upload ───────────────────────────────────────────────────────────────────
const files = readdirSync(IMG_DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Uploading ${files.length} image(s) to r2://${BUCKET}/card-images/\n`);

let ok = 0, skipped = 0, failed = 0;

for (const filename of files) {
  const key = `card-images/${filename}`;

  if (DRY_RUN) {
    console.log(`WOULD UPLOAD  ${key}`);
    ok++;
    continue;
  }

  try {
    const body = readFileSync(join(IMG_DIR, filename));

    // --skip-existing: check ETag (MD5) against local file before uploading
    if (SKIP_EXISTING) {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        const remoteEtag = (head.ETag ?? '').replace(/"/g, '');
        const localMd5   = createHash('md5').update(body).digest('hex');
        if (remoteEtag === localMd5) {
          console.log(`SKIP ${key}`);
          skipped++;
          continue;
        }
      } catch {
        // Object doesn't exist yet — proceed with upload
      }
    }

    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        body,
      ContentType: mime(filename),
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    console.log(`OK   ${key}`);
    ok++;
  } catch (err) {
    console.error(`FAIL ${key}  →  ${String(err)}`);
    failed++;
  }
}

console.log(`\n── Done ─────────────────────────────────`);
console.log(`OK: ${ok}  FAIL: ${failed}`);

if (!DRY_RUN && ok > 0 && PUBLIC_URL) {
  console.log(`\nImages are live at ${PUBLIC_URL}/card-images/<filename>.png`);
  console.log(`Set in apps/client/.env:\n  VITE_CDN_BASE_URL=${PUBLIC_URL}`);
}
