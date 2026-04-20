import { z } from "@hono/zod-openapi";

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export const ChallengeSchema = z.object({
  salt: z.string().describe("Hex HMAC salt tied to IP and time window"),
  k: z
    .number()
    .int()
    .min(0)
    .describe("Number of leading zero hex chars required"),
});

export const ErrorSchema = z.object({
  error: z.string(),
  challenge: ChallengeSchema.optional().describe(
    "PoW challenge — present on 401/403 when proof-of-work is required",
  ),
});

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
  /** Comma-separated list of allowed CORS origins (e.g. https://srnfrontend.pages.dev). */
  CORS_ORIGINS?: string;
};

export const RELAY_VERSION = "3.0.0";
