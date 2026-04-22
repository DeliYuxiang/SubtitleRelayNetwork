// 0010_v2_event_ids.mjs — Migrate all event IDs from V1 (32 hex) to V2 (64 hex).
//
// Background:
//   V1 ID = hex(SHA256(canonicalJSON)[:16])  — 32 hex chars  (Go Sign())
//   V2 ID = hex(SHA256(canonicalJSON))        — 64 hex chars  (Go ComputeIDV2(), TS computeID())
//   canonicalJSON = JSON.stringify([pubkey, kind, canonicalTagsFor(tags), content_md5])
//
// Formula must match srnrelay/ts/src/crypto.ts computeID() and Go ComputeIDV2() exactly.
// Specifically: JSON.stringify with NO HTML escaping (matches Go SetEscapeHTML(false)).
//
// Tables updated (all columns that hold an event ID):
//   events.id                        — primary key
//   event_metadata.event_id          — primary key FK
//   event_tags.event_id              — FK
//   event_sources.event_id           — FK
//   event_lifecycle.event_id         — primary key FK
//   event_lifecycle.deactivated_by   — FK (the retract/replace event's own ID)
//   event_keys.event_id              — FK
//
// D1 notes:
//   - No /batch endpoint (returns "Route not found"); each statement is a separate /query call.
//   - PRAGMA foreign_keys = OFF does not persist across /query calls (stateless connections).
//   - D1 enforces FK constraints; direct UPDATE of events.id fails with FK constraint error.
//   - Strategy: INSERT V2 events → UPDATE child tables → DELETE V1 events (avoids FK issues).
//   - 100-variable limit per query; INSERT uses 2 vars/row → 33 rows/sub-batch = 66 vars.
//   - Idempotent: only selects WHERE LENGTH(id) = 32 (V1 IDs), so re-running is safe.

import { createHash } from 'node:crypto';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DB_ID = process.env.SRN_D1_ID;

if (!ACCOUNT_ID || !API_TOKEN || !DB_ID) {
  console.error('Missing required env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, SRN_D1_ID');
  process.exit(1);
}

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}`;
const BATCH_SIZE = 500;  // rows fetched per SELECT
const SUB_BATCH = 33;   // rows per CASE UPDATE (3 vars/row × 33 = 99, under D1's 100-var limit)

async function d1(sql, params = []) {
  const res = await fetch(`${BASE}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`D1 error: ${JSON.stringify(data.errors)}\nSQL: ${sql}`);
  return data.result[0];
}

// ─── Canonical ID computation ────────────────────────────────────────────────
// Must match Go ComputeIDV2() and TS computeID() exactly.

function canonicalTagsFor(tags) {
  return tags
    .filter(t => t.length >= 1 && t[0] !== 'source_type' && t[0] !== 'source_uri')
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function computeIDV2(pubkey, kind, tagsJson, contentMd5) {
  const tags = tagsJson ? JSON.parse(tagsJson) : [];
  // JSON.stringify does not escape HTML chars ('<', '>', '&'), matching Go's SetEscapeHTML(false).
  const canonical = JSON.stringify([pubkey, kind, canonicalTagsFor(tags), contentMd5]);
  return createHash('sha256').update(canonical).digest('hex'); // 64 hex chars
}

// ─── Batch helpers ────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Build a CASE-based UPDATE for `table.col` in one /query call.
// 3 vars/row (WHEN v1 THEN v2 + WHERE IN v1) × 33 rows = 99 vars, under D1's 100-var limit.
async function caseUpdate(table, col, pairs) {
  if (pairs.length === 0) return;
  const caseWhen = pairs.map(() => 'WHEN ? THEN ?').join(' ');
  const inList = pairs.map(() => '?').join(',');
  await d1(
    `UPDATE ${table} SET ${col} = CASE ${col} ${caseWhen} END WHERE ${col} IN (${inList})`,
    [...pairs.flatMap(([v1, v2]) => [v1, v2]), ...pairs.map(([v1]) => v1)],
  );
}

// Process a sub-batch using INSERT + UPDATE child tables + DELETE — three /query calls per table.
//
// D1 enforces FK constraints and has no /batch endpoint, so we cannot disable FK enforcement
// for the duration of the UPDATE. Instead:
//   1. INSERT OR IGNORE new events with V2 IDs (UNION ALL SELECT from V1 rows).
//      Both V1 and V2 now exist in events → child table UPDATEs will satisfy FK.
//   2. UPDATE all child tables to reference V2 IDs.
//   3. DELETE old V1 event rows (child tables no longer reference V1 → FK satisfied).
//
// INSERT uses 2 params/row (v2_id + v1_id); 33 rows × 2 = 66 params, under the 100-var limit.
async function processSubBatch(pairs) {
  // Phase 1: insert V2 events
  const unionParts = pairs.map(() =>
    'SELECT ? AS id, pubkey, kind, content_md5, tags, sig, created_at FROM events WHERE id = ?'
  ).join(' UNION ALL ');
  await d1(
    `INSERT OR IGNORE INTO events (id, pubkey, kind, content_md5, tags, sig, created_at) ${unionParts}`,
    pairs.flatMap(([v1, v2]) => [v2, v1]),
  );

  // Phase 2: update child tables (V2 now in events → FK satisfied)
  await caseUpdate('event_metadata',   'event_id',       pairs);
  await caseUpdate('event_tags',       'event_id',       pairs);
  await caseUpdate('event_sources',    'event_id',       pairs);
  await caseUpdate('event_lifecycle',  'event_id',       pairs);
  await caseUpdate('event_lifecycle',  'deactivated_by', pairs);
  await caseUpdate('event_keys',       'event_id',       pairs);

  // Phase 3: delete old V1 events (no child rows reference V1 anymore → FK satisfied)
  const inList = pairs.map(() => '?').join(',');
  await d1(`DELETE FROM events WHERE id IN (${inList})`, pairs.map(([v1]) => v1));
}

// ─── Main migration ───────────────────────────────────────────────────────────

export default async function run() {
  let totalMigrated = 0;
  let outerIter = 0;

  while (true) {
    // Fetch the next batch of V1 events (LENGTH(id) = 32 detects V1 IDs safely).
    const { results } = await d1(
      `SELECT id, pubkey, kind, tags, content_md5 FROM events WHERE LENGTH(id) = 32 LIMIT ?`,
      [BATCH_SIZE],
    );

    if (!results?.length) break;
    outerIter++;

    // Compute V2 IDs locally — no round-trips needed.
    const pairs = results.map(row => [
      row.id,
      computeIDV2(row.pubkey, row.kind, row.tags, row.content_md5),
    ]);

    // Sanity-check: V1 and V2 must differ (if they happen to collide, skip to avoid data loss).
    const safePairs = pairs.filter(([v1, v2]) => {
      if (v1 === v2) {
        console.warn(`⚠  ID collision skipped: ${v1}`);
        return false;
      }
      return true;
    });

    // Process in sub-batches of SUB_BATCH rows (D1 100-var limit).
    for (const sub of chunk(safePairs, SUB_BATCH)) {
      await processSubBatch(sub);
      totalMigrated += sub.length;
    }

    console.log(`  Batch ${outerIter}: migrated ${results.length} events (total: ${totalMigrated})`);
  }

  console.log(`\nV1→V2 ID migration complete. Total events migrated: ${totalMigrated}`);
}
