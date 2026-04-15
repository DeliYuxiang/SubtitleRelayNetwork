import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { renderLandingPage } from "./ui";

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  TMDB_TOKEN?: string;
  SEARCH_LIMITER: RateLimit;
  DEFAULT_LIMITER: RateLimit;
};

const app = new OpenAPIHono<{ Bindings: Bindings }>();

// --- UI & Lifecycle ---

app.get("/", async (c) => {
  const statsRes = await c.env.DB.prepare(
    "SELECT count(*) as total FROM events",
  ).first<{ total: number }>();
  return c.html(renderLandingPage({ totalEvents: statsRes?.total || 0 }));
});

app.get("/v1/health", async (c) => {
  const statsRes = await c.env.DB.prepare(
    "SELECT count(*) as total FROM events",
  ).first<{ total: number }>();
  return c.json({
    schemaVersion: 1,
    label: "SRN Relay",
    message: `Online (${statsRes?.total || 0} events)`,
    color: "success",
  });
});

// --- Core API ---

// 1. Search
app.openapi(
  createRoute({
    method: "get",
    path: "/v1/events",
    summary: "Search events",
    request: {
      query: z.object({
        tmdb: z.string().optional().openapi({ example: "100565" }),
        season: z.string().optional().openapi({ example: "1" }),
        ep: z.string().optional().openapi({ example: "1" }),
        language: z.string().optional().openapi({ example: "zh-CN" }),
        archive_md5: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "List of events",
        content: {
          "application/json": {
            schema: z.object({
              events: z.array(z.any()),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { success } = await c.env.DEFAULT_LIMITER.limit({
      key: c.req.header("CF-Connecting-IP") ?? "unknown",
    });
    if (!success) return c.json({ error: "Too many requests" }, 429);

    const { tmdb, season, ep, language, archive_md5 } = c.req.valid("query");

    let query = `
      SELECT e.*, m.tmdb_id, m.season_num, m.episode_num, m.language, m.archive_md5,
             s.source_type, s.source_uri
      FROM events e
      JOIN event_metadata m ON e.id = m.event_id
      LEFT JOIN event_sources s ON e.id = s.event_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (tmdb) {
      query += " AND m.tmdb_id = ?";
      params.push(tmdb);
    }
    if (season) {
      query += " AND m.season_num = ?";
      params.push(parseInt(season));
    }
    if (ep) {
      query += " AND m.episode_num = ?";
      params.push(parseInt(ep));
    }
    if (language) {
      query += " AND m.language = ?";
      params.push(language);
    }
    if (archive_md5) {
      query += " AND m.archive_md5 = ?";
      params.push(archive_md5);
    }

    query += " ORDER BY e.created_at DESC LIMIT 100";

    const { results } = await c.env.DB.prepare(query)
      .bind(...params)
      .all();
    return c.json({ events: results });
  },
);

// 2. Download
app.openapi(
  createRoute({
    method: "get",
    path: "/v1/events/:id/content",
    summary: "Download subtitle file",
    request: {
      params: z.object({
        id: z.string().openapi({ description: "Event ID (SHA256 hex)" }),
      }),
    },
    responses: {
      200: {
        description: "Subtitle file (gzip-encoded)",
        content: {
          "application/octet-stream": {
            schema: z.any().openapi({ type: "string", format: "binary" }),
          },
        },
      },
      404: {
        description: "Event or blob not found",
        content: {
          "application/json": {
            schema: z.object({ error: z.string() }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { success } = await c.env.DEFAULT_LIMITER.limit({
      key: c.req.header("CF-Connecting-IP") ?? "unknown",
    });
    if (!success) return c.json({ error: "Too many requests" }, 429);

    const { id: eventId } = c.req.valid("param");

    const blobInfo = await c.env.DB.prepare(
      `
      SELECT b.r2_key
      FROM events e
      JOIN blobs b ON e.content_md5 = b.content_md5
      WHERE e.id = ?
    `,
    )
      .bind(eventId)
      .first<{ r2_key: string }>();

    if (!blobInfo)
      return c.json(
        { error: "Event not found or associated blob missing" },
        404,
      );

    const object = await c.env.BUCKET.get(blobInfo.r2_key);
    if (!object) return c.json({ error: "R2 object missing" }, 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);

    return new Response(object.body, { headers }) as any;
  },
);

// 3. Publish
app.openapi(
  createRoute({
    method: "post",
    path: "/v1/events",
    summary: "Publish event",
    request: {
      headers: z.object({
        "x-srn-pubkey": z
          .string()
          .openapi({ description: "Ed25519 public key (hex)" }),
        "x-srn-signature": z
          .string()
          .openapi({ description: "Ed25519 signature over event JSON (hex)" }),
      }),
      body: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: z.object({
              event: z.string().openapi({ description: "Event JSON payload" }),
              file: z.any().openapi({
                type: "string",
                format: "binary",
                description: "Subtitle file (max 5MB)",
              }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Event published successfully",
        content: {
          "application/json": {
            schema: z.object({ success: z.boolean(), id: z.string() }),
          },
        },
      },
      400: {
        description: "Bad request — invalid JSON or content hash mismatch",
        content: {
          "application/json": {
            schema: z.object({ error: z.string() }),
          },
        },
      },
      401: {
        description: "Unauthorized — missing or invalid Ed25519 signature",
        content: {
          "application/json": {
            schema: z.object({ error: z.string() }),
          },
        },
      },
      409: {
        description: "Conflict — duplicate event or database error",
        content: {
          "application/json": {
            schema: z.object({ error: z.string(), details: z.string() }),
          },
        },
      },
      413: {
        description: "Payload too large (max 5MB)",
        content: {
          "application/json": {
            schema: z.object({ error: z.string() }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { success } = await c.env.DEFAULT_LIMITER.limit({
      key: c.req.header("CF-Connecting-IP") ?? "unknown",
    });
    if (!success) return c.json({ error: "Too many requests" }, 429);

    const pubKeyHex = c.req.header("X-SRN-PubKey");
    const signatureHex = c.req.header("X-SRN-Signature");
    if (!pubKeyHex || !signatureHex)
      return c.json({ error: "Missing auth headers" }, 401);

    const { event: eventJsonStr, file: rawFile } = c.req.valid("form");
    const file = rawFile as File;

    if (!eventJsonStr || !file)
      return c.json({ error: "Missing payload" }, 400);
    if (file.size > 5 * 1024 * 1024)
      return c.json({ error: "File too large (max 5MB)" }, 413);

    let eventObj: any;
    try {
      eventObj = JSON.parse(eventJsonStr);
    } catch (e) {
      return c.json({ error: "Invalid event JSON" }, 400);
    }

    // --- CRYPTO VERIFICATION ---
    try {
      const encoder = new TextEncoder();
      const publicKey = await crypto.subtle.importKey(
        "raw",
        new Uint8Array(
          pubKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
        ),
        { name: "NODE-ED25519", namedCurve: "NODE-ED25519" },
        true,
        ["verify"],
      );
      const verified = await crypto.subtle.verify(
        "NODE-ED25519",
        publicKey,
        new Uint8Array(
          signatureHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
        ),
        encoder.encode(eventJsonStr),
      );
      if (!verified) throw new Error("Sig mismatch");
    } catch (err) {
      return c.json({ error: "Signature verification failed" }, 401);
    }

    const contentArrayBuffer = await file.arrayBuffer();
    const contentHashBuffer = await crypto.subtle.digest(
      "MD5",
      contentArrayBuffer,
    );
    const contentMd5 = Array.from(new Uint8Array(contentHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (contentMd5 !== eventObj.content_md5) {
      return c.json({ error: "Content hash mismatch" }, 400);
    }

    // --- STORAGE (Transparent Compression) ---
    const r2Key = `v1/${contentMd5}.gz`;
    const compressionStream = file
      .stream()
      .pipeThrough(new CompressionStream("gzip"));

    const compressedBuffer = await new Response(
      compressionStream,
    ).arrayBuffer();

    await c.env.BUCKET.put(r2Key, compressedBuffer, {
      httpMetadata: {
        contentType: file.type || "text/plain",
        contentEncoding: "gzip",
        contentDisposition: `attachment; filename="${file.name}"`,
      },
    });

    // --- DATABASE (Transactional Flow) ---
    const now = Math.floor(Date.now() / 1000);
    try {
      const statements = [
        c.env.DB.prepare(
          `
          INSERT OR IGNORE INTO blobs (content_md5, r2_key, size, created_at)
          VALUES (?, ?, ?, ?)
        `,
        ).bind(contentMd5, r2Key, file.size, now),

        c.env.DB.prepare(
          `
          INSERT OR IGNORE INTO events (id, pubkey, kind, content_md5, tags, sig, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(
          eventObj.id,
          pubKeyHex,
          eventObj.kind || 1,
          contentMd5,
          JSON.stringify(eventObj.tags || []),
          signatureHex,
          now,
        ),

        c.env.DB.prepare(
          `
          INSERT OR IGNORE INTO event_metadata (event_id, tmdb_id, season_num, episode_num, language, archive_md5)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(
          eventObj.id,
          eventObj.tmdb_id,
          eventObj.season_num || 0,
          eventObj.episode_num || 0,
          eventObj.language || "und",
          eventObj.archive_md5 || "",
        ),
      ];

      if (eventObj.source_type && eventObj.source_uri) {
        statements.push(
          c.env.DB.prepare(
            `
            INSERT OR IGNORE INTO event_sources (event_id, source_type, source_uri)
            VALUES (?, ?, ?)
          `,
          ).bind(eventObj.id, eventObj.source_type, eventObj.source_uri),
        );
      }

      await c.env.DB.batch(statements);
    } catch (dbErr: any) {
      return c.json(
        { error: "Database conflict or storage error", details: dbErr.message },
        409,
      );
    }

    return c.json({ success: true, id: eventObj.id });
  },
);

// 4. TMDB Search Proxy
app.openapi(
  createRoute({
    method: "get",
    path: "/v1/tmdb/search",
    summary: "TMDB search proxy with local title cache",
    request: {
      query: z.object({
        q: z
          .string()
          .openapi({ description: "Search query (title or keywords)" }),
        fresh: z.string().optional().openapi({
          description:
            "Set to '1' to bypass local cache and query TMDB directly",
        }),
      }),
    },
    responses: {
      200: {
        description: "Search results with source indicator",
        content: {
          "application/json": {
            schema: z.object({
              results: z.array(
                z.object({
                  id: z.number(),
                  name: z.string(),
                  type: z.enum(["movie", "tv"]),
                  year: z.string(),
                  poster: z.string().nullable(),
                }),
              ),
              source: z.enum(["cache", "tmdb"]),
            }),
          },
        },
      },
      400: {
        description: "Missing query parameter",
        content: {
          "application/json": { schema: z.object({ error: z.string() }) },
        },
      },
      429: {
        description: "Rate limit exceeded (TMDB path only)",
        content: {
          "application/json": { schema: z.object({ error: z.string() }) },
        },
      },
      500: {
        description: "TMDB token not configured",
        content: {
          "application/json": { schema: z.object({ error: z.string() }) },
        },
      },
    },
  }),
  async (c) => {
    const { q: query, fresh } = c.req.valid("query");
    const keyword = query.trim();

    // Local title cache: substring match (skip when fresh=1)
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
          source: "cache" as const,
        });
      }
    }

    // Cache miss or forced refresh — rate limit before hitting TMDB
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

    if (!response.ok) {
      const errorBody = await response.text();
      return c.json(
        {
          error: "Failed to fetch from TMDB",
          status: response.status,
          details: errorBody,
        },
        response.status as any,
      );
    }

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

    // Upsert each title into knowledge base (fire-and-forget)
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

    return c.json({ results: filtered, source: "tmdb" as const });
  },
);

// 5. TMDB Season Episode Count
app.get("/v1/tmdb/season", async (c) => {
  const tmdbId = c.req.query("tmdb_id");
  const seasonNum = c.req.query("season");
  if (!tmdbId || !seasonNum)
    return c.json({ error: "Missing tmdb_id or season" }, 400);

  // Permanent cache lookup
  const cached = await c.env.DB.prepare(
    "SELECT episode_count FROM tmdb_season_cache WHERE tmdb_id = ? AND season_num = ?",
  )
    .bind(Number(tmdbId), Number(seasonNum))
    .first<{ episode_count: number }>();
  if (cached)
    return c.json({ episode_count: cached.episode_count, source: "cache" });

  // Cache miss — rate limit before hitting TMDB
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

// --- Documentation ---

app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "2.0.0",
    title: "SRN Relay API",
  },
});

app.get("/ui", swaggerUI({ url: "/doc" }));

export default app;
