#!/usr/bin/env node
/**
 * Configure CORS rules on the R2 bucket so browsers can load card images.
 *
 * Uses the same env variables as upload-to-r2.mjs:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_KEY, R2_BUCKET
 *
 * Usage:
 *   node scripts/set-r2-cors.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Load .env if present
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

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
  console.error('Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_KEY / R2_BUCKET');
  process.exit(1);
}

let S3Client, PutBucketCorsCommand;
try {
  const require = createRequire(import.meta.url);
  ({ S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3'));
} catch {
  console.error('@aws-sdk/client-s3 not found — run: npm install @aws-sdk/client-s3');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

await s3.send(new PutBucketCorsCommand({
  Bucket: BUCKET,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: ['*'],
        AllowedMethods: ['GET', 'HEAD'],
        AllowedHeaders: ['*'],
        MaxAgeSeconds: 86400,
      },
    ],
  },
}));

console.log(`CORS rules set on bucket "${BUCKET}": GET/HEAD allowed from all origins.`);
