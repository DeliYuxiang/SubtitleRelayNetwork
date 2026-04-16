export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  TMDB_TOKEN?: string;
  SEARCH_LIMITER: RateLimit;
  DEFAULT_LIMITER: RateLimit;
  CONTENT_LIMITER: RateLimit;
  RELAY_PUBLIC_KEY?: string;
  RELAY_PRIVATE_KEY?: string;
  COMMIT_SHA?: string;
  /** Comma-separated hex Ed25519 pubkeys for VIP identity (bypasses PoW). */
  SRN_PUBKEY_WHITELIST?: string;
  /** Base difficulty: number of leading zero bits or hex chars. Default 0. */
  SRN_POW_DIFFICULTY?: string;
  /** Secret used to generate PoW salts. */
  SRN_POW_SECRET?: string;
};

export const RELAY_VERSION = "3.0.0";
