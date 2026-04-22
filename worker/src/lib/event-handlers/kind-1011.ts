import type { KindHandlerContext, KindHandlerResult } from "./types";

/**
 * Kind 1011 — Key Alias / Identity
 *
 * Registers or updates the pubkey's alias in event_keys, then deactivates all
 * previous Kind 1011 events by the same pubkey (only one active alias per key).
 */
export async function handleKind1011(
  ctx: KindHandlerContext,
): Promise<KindHandlerResult> {
  const { db, eventObj, pubKeyHex, now } = ctx;
  const statements: D1PreparedStatement[] = [];

  const alias = (eventObj.tags || []).find((t) => t[0] === "alias")?.[1];
  if (alias) {
    statements.push(
      db
        .prepare(
          "INSERT OR REPLACE INTO event_keys (pubkey, alias, url, about, event_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          pubKeyHex,
          alias,
          (eventObj.tags || []).find((t) => t[0] === "url")?.[1] || "",
          (eventObj.tags || []).find((t) => t[0] === "about")?.[1] || "",
          eventObj.id,
          now,
        ),
    );
    statements.push(
      db
        .prepare(
          "INSERT OR REPLACE INTO event_lifecycle (event_id, deactivated_by, deactivated_at, pubkey) SELECT id, ?, ?, pubkey FROM events WHERE pubkey = ? AND kind = 1011 AND id != ?",
        )
        .bind(eventObj.id, now, pubKeyHex, eventObj.id),
    );
  }

  return { statements };
}
