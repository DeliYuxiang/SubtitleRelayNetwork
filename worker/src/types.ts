export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  TMDB_TOKEN?: string;
  SEARCH_LIMITER: RateLimit;
  DEFAULT_LIMITER: RateLimit;
  RELAY_PUBLIC_KEY?: string;
};

export const RELAY_VERSION = "2.1.0";
