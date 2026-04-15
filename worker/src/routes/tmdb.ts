import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings } from "../types";

const tmdb = new OpenAPIHono<{ Bindings: Bindings }>();

// 4. TMDB Search Proxy
tmdb.openapi(
  createRoute({
    method: "get",
    path: "/v1/tmdb/search",
    summary: "TMDB search proxy with local title cache",
    request: {
      query: z.object({
        q: z.string(),
        fresh: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Search results",
        content: { "application/json": { schema: z.any() } },
      },
    },
  }),
  async (c) => {
    const { q: query, fresh } = c.req.valid("query");
    const keyword = query.trim();

    if (fresh !== "1") {
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
            type: r.type,
            year: r.year,
            poster: r.poster || null,
          })),
          source: "cache",
        });
      }
    }

    const { success } = await c.env.SEARCH_LIMITER.limit({
      key: c.req.header("CF-Connecting-IP") ?? "unknown",
    });
    if (!success) return c.json({ error: "Too many requests" }, 429);

    const token = c.env.TMDB_TOKEN;
    if (!token) return c.json({ error: "TMDB_TOKEN not configured" }, 500);

    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(keyword)}&language=zh-CN&include_adult=false`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          accept: "application/json",
        },
      },
    );

    if (!response.ok)
      return c.json({ error: "TMDB failed" }, response.status as any);

    const data: any = await response.json();
    const filtered = (data.results as any[])
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .map((r) => ({
        id: r.id as number,
        name: (r.name || r.title) as string,
        type: r.media_type as string,
        year: ((r.first_air_date || r.release_date || "") as string).split(
          "-",
        )[0],
        poster: r.poster_path
          ? `https://image.tmdb.org/t/p/w92${r.poster_path}`
          : null,
      }));

    const now = Math.floor(Date.now() / 1000);
    c.executionCtx.waitUntil(
      c.env.DB.batch(
        filtered.map((r) =>
          c.env.DB.prepare(
            "INSERT OR REPLACE INTO tmdb_title_cache (tmdb_id, name, type, year, poster, cached_at) VALUES (?, ?, ?, ?, ?, ?)",
          ).bind(r.id, r.name, r.type, r.year, r.poster ?? "", now),
        ),
      ),
    );

    return c.json({ results: filtered, source: "tmdb" });
  },
);

// 5. TMDB Season Episode Count
tmdb.get("/v1/tmdb/season", async (c) => {
  const tmdbId = c.req.query("tmdb_id");
  const seasonNum = c.req.query("season");
  if (!tmdbId || !seasonNum)
    return c.json({ error: "Missing tmdb_id or season" }, 400);

  const cached = await c.env.DB.prepare(
    "SELECT episode_count FROM tmdb_season_cache WHERE tmdb_id = ? AND season_num = ?",
  )
    .bind(Number(tmdbId), Number(seasonNum))
    .first<{ episode_count: number }>();
  if (cached)
    return c.json({ episode_count: cached.episode_count, source: "cache" });

  const { success } = await c.env.SEARCH_LIMITER.limit({
    key: c.req.header("CF-Connecting-IP") ?? "unknown",
  });
  if (!success) return c.json({ error: "Too many requests" }, 429);

  const token = c.env.TMDB_TOKEN;
  if (!token) return c.json({ error: "TMDB_TOKEN not configured" }, 500);

  const response = await fetch(
    `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}`,
    {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    },
  );
  if (!response.ok) return c.json({ error: "TMDB fetch failed" }, 502);

  const data: any = await response.json();
  const episodeCount: number = (data.episodes ?? []).length;

  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      "INSERT OR REPLACE INTO tmdb_season_cache (tmdb_id, season_num, episode_count, cached_at) VALUES (?, ?, ?, ?)",
    )
      .bind(
        Number(tmdbId),
        Number(seasonNum),
        episodeCount,
        Math.floor(Date.now() / 1000),
      )
      .run(),
  );

  return c.json({ episode_count: episodeCount, source: "tmdb" });
});

export default tmdb;
