import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, ErrorSchema } from "../types";
import { verifySignedRequest } from "../lib/verify-pubkey";

const TmdbResultSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  title: z.string(),
  poster_path: z.string().nullable(),
  media_type: z.enum(["movie", "tv"]),
  release_date: z.string(),
  first_air_date: z.string(),
});

const tmdbErrorResponses = {
  401: {
    description: "Signature verification failed",
    content: { "application/json": { schema: ErrorSchema } },
  },
  403: {
    description: "PoW verification failed",
    content: { "application/json": { schema: ErrorSchema } },
  },
  429: {
    description: "Rate limited",
    content: { "application/json": { schema: ErrorSchema } },
  },
} as const;

const tmdb = new OpenAPIHono<{ Bindings: Bindings }>();

const authHeaders = z.object({
  "x-srn-pubkey": z
    .string()
    .optional()
    .describe("Client Ed25519 public key (hex)"),
  "x-srn-nonce": z.string().optional().describe("Proof-of-Work nonce"),
  "x-srn-signature": z.string().optional().describe("Request signature (hex)"),
});

// 1. TMDB Search
tmdb.openapi(
  createRoute({
    method: "get",
    path: "/v1/tmdb/search",
    summary: "Search TMDB",
    request: {
      headers: authHeaders,
      query: z.object({
        q: z.string().min(1).describe("Search query"),
        fresh: z.string().optional().describe("Bypass cache (set to 1)"),
      }),
    },
    responses: {
      200: {
        description: "Search results",
        content: {
          "application/json": {
            schema: z.object({ results: z.array(TmdbResultSchema) }),
          },
        },
      },
      ...tmdbErrorResponses,
    },
  }),
  async (c) => {
    const authResult = await verifySignedRequest(
      c,
      c.req.header("X-SRN-PubKey") ?? "",
    );
    if (!authResult.ok)
      return c.json(
        { error: authResult.error, challenge: authResult.challenge },
        authResult.status,
      );

    const { q: query, fresh } = c.req.valid("query");
    const keyword = query.trim();

    // Cache read: substring match against permanent title knowledge base
    if (!fresh) {
      const { results: rows } = await c.env.DB.prepare(
        "SELECT tmdb_id, name, type, year, poster FROM tmdb_title_cache WHERE name LIKE ? LIMIT 10",
      )
        .bind(`%${keyword}%`)
        .all<{
          tmdb_id: number;
          name: string;
          type: string;
          year: string;
          poster: string;
        }>();

      if (rows.length > 0) {
        return c.json({
          results: rows.map((r) => ({
            id: r.tmdb_id,
            name: r.name,
            title: r.name,
            poster_path: r.poster,
            media_type: r.type,
            release_date: r.year,
            first_air_date: r.year,
          })),
        });
      }
    }

    const { success } = await c.env.SEARCH_LIMITER.limit({
      key: c.req.header("CF-Connecting-IP") ?? "unknown",
    });
    if (!success) return c.json({ error: "Too many requests" }, 429);

    const token = c.env.TMDB_TOKEN;
    if (!token) return c.json({ error: "TMDB token missing" }, 500);

    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(
        keyword,
      )}&include_adult=false&language=zh-CN&page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );

    const data: any = await response.json();
    const results = (data.results || [])
      .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
      .map((r: any) => ({
        id: r.id,
        name: (r.name || r.title) as string,
        title: (r.title || r.name) as string,
        poster_path: r.poster_path ?? null,
        media_type: r.media_type as string,
        release_date: (r.release_date || r.first_air_date || "") as string,
        first_air_date: (r.first_air_date || r.release_date || "") as string,
      }));

    // Cache write: upsert each title into permanent knowledge base
    const now = Math.floor(Date.now() / 1000);
    c.executionCtx.waitUntil(
      c.env.DB.batch(
        results.map((r: any) =>
          c.env.DB.prepare(
            "INSERT OR REPLACE INTO tmdb_title_cache (tmdb_id, name, type, year, poster, cached_at) VALUES (?, ?, ?, ?, ?, ?)",
          ).bind(
            r.id,
            r.name,
            r.media_type,
            r.release_date.split("-")[0],
            r.poster_path ?? "",
            now,
          ),
        ),
      ),
    );

    return c.json({ results });
  },
);

// 2. TMDB Season Info (Legacy endpoint but adding PoW for consistency)
tmdb.openapi(
  createRoute({
    method: "get",
    path: "/v1/tmdb/season",
    summary: "Get TMDB Season Info",
    request: {
      headers: authHeaders,
      query: z.object({
        tmdb_id: z.string(),
        season: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Season info",
        content: {
          "application/json": {
            schema: z.object({
              episode_count: z.number().int().min(0),
            }),
          },
        },
      },
      ...tmdbErrorResponses,
    },
  }),
  async (c) => {
    const authResult = await verifySignedRequest(
      c,
      c.req.header("X-SRN-PubKey") ?? "",
    );
    if (!authResult.ok)
      return c.json(
        { error: authResult.error, challenge: authResult.challenge },
        authResult.status,
      );

    const { tmdb_id: tmdbId, season: seasonNum } = c.req.valid("query");

    const cached = await c.env.DB.prepare(
      "SELECT episode_count FROM tmdb_season_cache WHERE tmdb_id = ? AND season_num = ?",
    )
      .bind(tmdbId, parseInt(seasonNum))
      .first<{ episode_count: number }>();

    if (cached) return c.json({ episode_count: cached.episode_count });

    const token = c.env.TMDB_TOKEN;
    if (!token) return c.json({ error: "TMDB token missing" }, 500);

    const response = await fetch(
      `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?language=zh-CN`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );

    const data: any = await response.json();
    const episodeCount = (data.episodes || []).length;

    if (episodeCount > 0) {
      await c.env.DB.prepare(
        "INSERT OR REPLACE INTO tmdb_season_cache (tmdb_id, season_num, episode_count, created_at) VALUES (?, ?, ?, ?)",
      )
        .bind(
          tmdbId,
          parseInt(seasonNum),
          episodeCount,
          Math.floor(Date.now() / 1000),
        )
        .run();
    }

    return c.json({ episode_count: episodeCount });
  },
);

export default tmdb;
