// 0009_dedup_hash.mjs — Backfill dedup_hash for existing Kind 1001 events.
//
// Runs after SQL schema migration 0009_dedup_hash.sql has been applied
// (which adds the dedup_hash column + UNIQUE index).
//
// Algorithm:
//   1. Batch-fetch event_metadata rows where dedup_hash IS NULL (Kind 1001 only).
//   2. Compute MD5(pubkey|content_md5|tmdb_id|season_num|episode_num|language|archive_md5).
//   3. UPDATE OR IGNORE — if UNIQUE conflict, the row is a semantic duplicate: DELETE it.
//   4. Repeat until no rows remain.
//
// Formula must match events.ts computeDedupHash() exactly.
import { createHash } from 'node:crypto';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;
const DB_ID      = process.env.SRN_D1_ID;

if (!ACCOUNT_ID || !API_TOKEN || !DB_ID) {
  console.error('Missing required env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, SRN_D1_ID');
  process.exit(1);
}

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}`;
const BATCH_SIZE  = 500; // rows fetched per SELECT
const WRITE_BATCH = 33;  // rows per CASE UPDATE (3 params/row → 99 params, under D1's 100-variable limit)

async function d1(sql, params = []) {
  const res = await fetch(`${BASE}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`D1 error: ${JSON.stringify(data.errors)}`);
  return data.result[0];
}

// D1 REST API has no /batch endpoint — use a CASE expression to update N rows in one call.
// Returns { updated, removed } counts for this sub-batch.
async function processBatch(rows) {
  const inList = rows.map(() => '?').join(',');

  // 1. Bulk UPDATE OR IGNORE via CASE — one round-trip for all rows
  const caseWhen = rows.map(() => 'WHEN ? THEN ?').join(' ');
  await d1(
    `UPDATE OR IGNORE event_metadata SET dedup_hash = CASE event_id ${caseWhen} END WHERE event_id IN (${inList}) AND dedup_hash IS NULL`,
    [...rows.flatMap(r => [r.event_id, r.hash]), ...rows.map(r => r.event_id)],
  );

  // 2. Find rows that are still NULL — OR IGNORE left them untouched because of a UNIQUE conflict
  const { results: stillNull } = await d1(
    `SELECT event_id FROM event_metadata WHERE event_id IN (${inList}) AND dedup_hash IS NULL`,
    rows.map(r => r.event_id),
  );
  const duplicateIds = (stillNull ?? []).map(r => r.event_id);

  // 3. Delete the confirmed duplicates
  if (duplicateIds.length > 0) {
    const delList = duplicateIds.map(() => '?').join(',');
    await d1(`DELETE FROM event_metadata WHERE event_id IN (${delList})`, duplicateIds);
    duplicateIds.forEach(id => console.log(`Discarded duplicate event: ${id}`));
  }

  return { updated: rows.length - duplicateIds.length, removed: duplicateIds.length };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function makeDedupHash(pubkey, contentMd5, tmdbId, seasonNum, episodeNum, language, archiveMd5) {
  const key = [
    pubkey,
    contentMd5,
    String(tmdbId   ?? ''),
    String(seasonNum  ?? 0),
    String(episodeNum ?? 0),
    language   || 'und',
    archiveMd5 || '',
  ].join('|');
  return createHash('md5').update(key).digest('hex');
}

export default async function run() {
  let updated = 0;
  let removed = 0;

  while (true) {
    const { results } = await d1(`
      SELECT m.event_id, e.pubkey, e.content_md5,
             m.tmdb_id, m.season_num, m.episode_num, m.language, m.archive_md5
      FROM event_metadata m
      JOIN events e ON e.id = m.event_id
      WHERE m.dedup_hash IS NULL AND e.kind = 1001
      LIMIT ?
    `, [BATCH_SIZE]);

    if (!results?.length) break;

    // Compute all hashes locally (no I/O)
    const rows = results.map(row => ({
      event_id: row.event_id,
      hash: makeDedupHash(row.pubkey, row.content_md5, row.tmdb_id,
                          row.season_num, row.episode_num, row.language, row.archive_md5),
    }));

    // Process in sub-batches of WRITE_BATCH: each sub-batch = 3 REST API calls
    // (1 CASE UPDATE + 1 SELECT for NULLs + 1 DELETE for duplicates)
    for (const batch of chunk(rows, WRITE_BATCH)) {
      const { updated: u, removed: r } = await processBatch(batch);
      updated += u;
      removed += r;
    }
    console.log(`Progress: updated=${updated}, removed=${removed}`);
  }

  console.log(`Backfill complete. Updated: ${updated}, Duplicates removed: ${removed}`);
}
