import type { KindHandlerContext, KindHandlerResult } from "./types";

/**
 * Kind 1001 — Subtitle Upload
 *
 * 1. Computes the semantic dedup hash and short-circuits if an identical event exists.
 * 2. Returns D1 statements to insert event_metadata and (optionally) event_sources.
 */
export async function handleKind1001(
  ctx: KindHandlerContext,
): Promise<KindHandlerResult> {
  const { db, eventObj, pubKeyHex, contentMd5 } = ctx;

  if (
    !eventObj.tmdb_id ||
    eventObj.season_num == null ||
    eventObj.episode_num == null
  ) {
    return {
      validationError:
        "Kind 1001 requires tmdb_id, season_num, and episode_num",
    };
  }

  // Compute dedup hash.
  // Formula must match migration_0009_dedup_hash.yml backfill script exactly:
  //   MD5(pubkey|content_md5|tmdb_id|season_num|episode_num|language|archive_md5)
  const hashBuf = await crypto.subtle.digest(
    "MD5",
    new TextEncoder().encode(
      [
        pubKeyHex,
        contentMd5,
        eventObj.tmdb_id,
        String(eventObj.season_num),
        String(eventObj.episode_num),
        eventObj.language || "und",
        eventObj.archive_md5 || "",
      ].join("|"),
    ),
  );
  const dedupHash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const existing = await db
    .prepare("SELECT event_id FROM event_metadata WHERE dedup_hash = ?")
    .bind(dedupHash)
    .first<{ event_id: string }>();

  if (existing) {
    return { deduplicated: true, existingId: existing.event_id };
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT OR IGNORE INTO event_metadata (event_id, tmdb_id, season_num, episode_num, language, archive_md5, dedup_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        eventObj.id,
        eventObj.tmdb_id,
        eventObj.season_num,
        eventObj.episode_num,
        eventObj.language || "und",
        eventObj.archive_md5 || "",
        dedupHash,
      ),
  ];

  if (eventObj.source_type && eventObj.source_uri) {
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO event_sources (event_id, source_type, source_uri) VALUES (?, ?, ?)",
        )
        .bind(eventObj.id, eventObj.source_type, eventObj.source_uri),
    );
  }

  return { statements };
}
