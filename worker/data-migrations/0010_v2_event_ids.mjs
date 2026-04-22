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
// Strategy (local SQLite — no D1 variable or round-trip constraints):
//   PRAGMA foreign_keys=OFF on the single connection, then directly UPDATE events.id.
//   No INSERT+DELETE dance needed. All child tables updated in sub-batches within
//   the same transaction. PRAGMA foreign_keys=ON after the loop.
//
//   Variable budget: SQLite default limit is 999. 3 vars/row × 300 rows = 900 < 999.
//
// Idempotent: only selects WHERE LENGTH(id) = 32 (V1 IDs), so re-running is safe.

import { createHash } from 'node:crypto';
import { d1 } from './lib.mjs';

const BATCH_SIZE = 5000; // rows fetched per SELECT
const SUB_BATCH  = 300;  // rows per CASE UPDATE (3 vars/row × 300 = 900 < SQLite 999-var limit)

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// CASE-based UPDATE for a single column. 3 vars/row (WHEN v1 THEN v2 + WHERE IN v1).
async function caseUpdate(table, col, pairs) {
  if (pairs.length === 0) return;
  const caseWhen = pairs.map(() => 'WHEN ? THEN ?').join(' ');
  const inList = pairs.map(() => '?').join(',');
  await d1(
    `UPDATE ${table} SET ${col} = CASE ${col} ${caseWhen} END WHERE ${col} IN (${inList})`,
    [...pairs.flatMap(([v1, v2]) => [v1, v2]), ...pairs.map(([v1]) => v1)],
  );
}

// ─── Main migration ───────────────────────────────────────────────────────────

export default async function run() {
  await d1('PRAGMA foreign_keys=OFF');

  let totalMigrated = 0;
  let outerIter = 0;

  while (true) {
    const { results } = await d1(
      `SELECT id, pubkey, kind, tags, content_md5 FROM events WHERE LENGTH(id) = 32 LIMIT ?`,
      [BATCH_SIZE],
    );

    if (!results?.length) break;
    outerIter++;

    const pairs = results
      .map(row => [row.id, computeIDV2(row.pubkey, row.kind, row.tags, row.content_md5)])
      .filter(([v1, v2]) => {
        if (v1 === v2) {
          console.warn(`⚠  ID collision skipped: ${v1}`);
          return false;
        }
        return true;
      });

    await d1('BEGIN');

    for (const sub of chunk(pairs, SUB_BATCH)) {
      // Direct primary key update — safe with FK off.
      const caseWhen = sub.map(() => 'WHEN ? THEN ?').join(' ');
      const inList = sub.map(() => '?').join(',');
      await d1(
        `UPDATE events SET id = CASE id ${caseWhen} END WHERE id IN (${inList})`,
        [...sub.flatMap(([v1, v2]) => [v1, v2]), ...sub.map(([v1]) => v1)],
      );

      // Update child tables while both V1 and V2 IDs exist in the same transaction.
      await caseUpdate('event_metadata',  'event_id',       sub);
      await caseUpdate('event_tags',      'event_id',       sub);
      await caseUpdate('event_sources',   'event_id',       sub);
      await caseUpdate('event_lifecycle', 'event_id',       sub);
      await caseUpdate('event_lifecycle', 'deactivated_by', sub);
      await caseUpdate('event_keys',      'event_id',       sub);
    }

    await d1('COMMIT');

    totalMigrated += pairs.length;
    console.log(`  Batch ${outerIter}: migrated ${results.length} events (total: ${totalMigrated})`);
  }

  await d1('PRAGMA foreign_keys=ON');
  console.log(`\nV1→V2 ID migration complete. Total events migrated: ${totalMigrated}`);
}
