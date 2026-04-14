import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { renderLandingPage } from "./ui";

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  TMDB_TOKEN?: string;
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

// 1. Search (Normalized & Optimized)
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
    const { tmdb, season, ep, language, archive_md5 } = c.req.valid("query");

    let query = `
      SELECT e.*, m.tmdb_id, m.season_num, m.episode_num, m.language, m.archive_md5
      FROM events e 
      JOIN event_metadata m ON e.id = m.event_id 
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

// 2. Download (Schema-Aware)
app.get("/v1/events/:id/content", async (c) => {
  const eventId = c.req.param("id");

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
    return c.json({ error: "Event not found or associated blob missing" }, 404);

  const object = await c.env.BUCKET.get(blobInfo.r2_key);
  if (!object) return c.json({ error: "R2 object missing" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);

  return new Response(object.body, { headers });
});

// 3. Publish (Authenticated & Validated)
app.post("/v1/events", async (c) => {
  const pubKeyHex = c.req.header("X-SRN-PubKey");
  const signatureHex = c.req.header("X-SRN-Signature");
  if (!pubKeyHex || !signatureHex)
    return c.json({ error: "Missing auth headers" }, 401);

  const formData = await c.req.parseBody();
  const eventJsonStr = formData.event as string;
  const file = formData.file as File;

  if (!eventJsonStr || !file) return c.json({ error: "Missing payload" }, 400);
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
  await c.env.BUCKET.put(r2Key, compressionStream, {
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
        INSERT INTO events (id, pubkey, kind, content_md5, tags, sig, created_at)
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
        INSERT INTO event_metadata (event_id, tmdb_id, season_num, episode_num, language, archive_md5)
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
          INSERT INTO event_sources (event_id, source_type, source_uri)
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
});

// 4. TMDB Search Proxy
app.get("/v1/tmdb/search", async (c) => {
  const query = c.req.query("q");
  if (!query) return c.json({ error: "Query required" }, 400);

  const token = c.env.TMDB_TOKEN;
  if (!token) return c.json({ error: "TMDB_TOKEN not configured" }, 500);

  const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&language=zh-CN&include_adult=false`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    return c.json({ error: "Failed to fetch from TMDB" }, response.status);
  }

  const data: any = await response.json();
  const filtered = data.results
    .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
    .map((r: any) => ({
      id: r.id,
      name: r.name || r.title,
      type: r.media_type,
      year: (r.first_air_date || r.release_date || "").split("-")[0],
      poster: r.poster_path
        ? `https://image.tmdb.org/t/p/w92${r.poster_path}`
        : null,
    }));

  return c.json({ results: filtered });
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
