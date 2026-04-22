/** Parsed event object from the client's JSON payload. */
export interface SrnEventInput {
  id: string;
  pubkey: string;
  kind: number;
  content_md5: string;
  tags: string[][];
  sig: string;
  created_at: number;
  tmdb_id?: string | null;
  season_num?: number | null;
  episode_num?: number | null;
  language?: string | null;
  archive_md5?: string | null;
  source_type?: string | null;
  source_uri?: string | null;
}

/** Shared context passed to every kind handler. */
export interface KindHandlerContext {
  db: D1Database;
  eventObj: SrnEventInput;
  pubKeyHex: string;
  now: number;
  /** MD5 of the uploaded file content. Empty string for kinds without a file (1002, 1011). */
  contentMd5: string;
}

/**
 * What a kind handler returns:
 * - `{ validationError }` — input is invalid; caller should return 400
 * - `{ deduplicated: true, existingId }` — identical event already exists; caller should short-circuit
 * - `{ statements }` — D1 prepared statements to batch-execute after the main event INSERT
 */
export type KindHandlerResult =
  | { validationError: string }
  | { deduplicated: true; existingId: string }
  | { deduplicated?: false; statements: D1PreparedStatement[] };
