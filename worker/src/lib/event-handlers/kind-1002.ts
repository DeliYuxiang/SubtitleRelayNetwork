import type { KindHandlerContext, KindHandlerResult } from "./types";

/**
 * Kind 1002 — Retract
 *
 * Deactivates the target event referenced by the "e" tag, provided it belongs
 * to the same pubkey as the retraction event.
 */
export async function handleKind1002(
  ctx: KindHandlerContext,
): Promise<KindHandlerResult> {
  const { db, eventObj, pubKeyHex, now } = ctx;

  const targetId = (eventObj.tags || []).find((t) => t[0] === "e")?.[1];
  if (!targetId) {
    return {
      validationError:
        "Kind 1002 requires an 'e' tag referencing the target event",
    };
  }

  const statements: D1PreparedStatement[] = [];

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

  return { statements };
}
