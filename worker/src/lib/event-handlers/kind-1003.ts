import type { KindHandlerContext, KindHandlerResult } from "./types";

/**
 * Kind 1003 — Replace
 *
 * 1. Deactivates the predecessor event referenced by the "e" tag (same pubkey check).
 * 2. Inserts event_metadata for the new version (no dedup check; dedup_hash is null).
 * 3. Optionally inserts event_sources.
 */
export async function handleKind1003(
  ctx: KindHandlerContext,
): Promise<KindHandlerResult> {
  const { db, eventObj, pubKeyHex, now } = ctx;

  const targetId = (eventObj.tags || []).find((t) => t[0] === "e")?.[1];
  if (!targetId) {
    return {
      validationError:
        "Kind 1003 requires an 'e' tag referencing the predecessor event",
    };
  }

  if (
    !eventObj.tmdb_id ||
    eventObj.season_num == null ||
    eventObj.episode_num == null
  ) {
    return {
      validationError:
        "Kind 1003 requires tmdb_id, season_num, and episode_num",
    };
  }

  const statements: D1PreparedStatement[] = [];

  // Deactivate predecessor
  const target = await db
    .prepare("SELECT pubkey FROM events WHERE id = ?")
    .bind(targetId)
    .first<{ pubkey: string }>();
  if (target && target.pubkey === pubKeyHex) {
    statements.push(
      db
        .prepare(
          "INSERT OR REPLACE INTO event_lifecycle (event_id, deactivated_by, deactivated_at, pubkey) VALUES (?, ?, ?, ?)",
        )
        .bind(targetId, eventObj.id, now, pubKeyHex),
    );
  }

  // Insert metadata for the replacement event (no dedup for replace events)
  statements.push(
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
        null,
      ),
  );

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
