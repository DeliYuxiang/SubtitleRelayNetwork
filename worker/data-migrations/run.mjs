#!/usr/bin/env node
// run.mjs — idempotent data migration runner.
//
// Discovers *.mjs files in this directory (excluding itself), checks which have
// already run by querying _srn_migrations in D1, and executes the rest in
// filename-sorted order. Records each completion in _srn_migrations before
// moving to the next migration.
//
// Required env vars:
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_API_TOKEN
//   SRN_D1_ID

import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;
const DB_ID      = process.env.SRN_D1_ID;

if (!ACCOUNT_ID || !API_TOKEN || !DB_ID) {
  console.error('Missing required env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, SRN_D1_ID');
  process.exit(1);
}

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}`;

async function d1(sql, params = []) {
  const res = await fetch(`${BASE}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`D1 error: ${JSON.stringify(data.errors)}`);
  return data.result[0];
}

async function getCompletedMigrations() {
  try {
    const { results } = await d1('SELECT name FROM _srn_migrations');
    return new Set((results ?? []).map(r => r.name));
  } catch (e) {
    // Table may not exist yet (SQL migration 0010 hasn't been applied).
    if (e.message.includes('no such table')) {
      console.warn('_srn_migrations table not found — run SQL migration 0010_migration_tracking.sql first.');
      process.exit(1);
    }
    throw e;
  }
}

async function markComplete(name) {
  await d1('INSERT OR IGNORE INTO _srn_migrations (name) VALUES (?)', [name]);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = (await readdir(__dirname))
  .filter(f => f.endsWith('.mjs') && f !== 'run.mjs')
  .sort();

if (files.length === 0) {
  console.log('No data migrations found.');
  process.exit(0);
}

const completed = await getCompletedMigrations();
const pending = files.filter(f => !completed.has(f));

if (pending.length === 0) {
  console.log(`All ${files.length} migration(s) already completed — nothing to do.`);
  process.exit(0);
}

console.log(`Found ${pending.length} pending migration(s): ${pending.join(', ')}`);

for (const file of pending) {
  console.log(`\n── Running migration: ${file} ──`);
  const modulePath = pathToFileURL(path.join(__dirname, file)).href;

  // Each migration module must export a default async function (or be a top-level script).
  // If it exports a default function, call it; otherwise the import side-effect runs it.
  const mod = await import(modulePath);
  if (typeof mod.default === 'function') {
    await mod.default();
  }

  await markComplete(file);
  console.log(`✓ ${file} complete`);
}

console.log('\nAll pending migrations complete.');
