import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings } from "../types";

const events = new OpenAPIHono<{ Bindings: Bindings }>();

// 1. Search
events.openapi(
  createRoute({
    method: "get",
    path: "/v1/events",
    summary: "Search events",
    request: {
      query: z.object({
        tmdb: z.string().optional(),
        season: z.string().optional(),
        ep: z.string().optional(),
        language: z.string().optional(),
        kind: z.string().optional(),
        pubkey: z.string().optional(),
        archive_md5: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "List of events",
        content: {
          "application/json": {
            schema: z.object({ events: z.array(z.any()) }),
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

    const { tmdb, season, ep, language, kind, pubkey, archive_md5 } =
      c.req.valid("query");

    let query = `
      SELECT e.*, m.tmdb_id, m.season_num, m.episode_num, m.language, m.archive_md5,
             s.source_type, s.source_uri
      FROM events e
      LEFT JOIN event_metadata m ON e.id = m.event_id
      LEFT JOIN event_sources s ON e.id = s.event_id
      WHERE NOT EXISTS (SELECT 1 FROM event_lifecycle WHERE event_id = e.id)
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
      if (!language.includes("-")) {
        query += " AND m.language LIKE ?";
        params.push(language + "%");
      } else {
        query += " AND m.language = ?";
        params.push(language);
      }
    }
    if (kind) {
      query += " AND e.kind = ?";
      params.push(parseInt(kind));
    }
    if (pubkey) {
      query += " AND e.pubkey = ?";
      params.push(pubkey);
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
events.openapi(
  createRoute({
    method: "get",
    path: "/v1/events/:id/content",
    summary: "Download subtitle file",
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Subtitle file",
        content: { "application/octet-stream": { schema: z.any() } },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: z.any() } },
      },
    },
  }),
  async (c) => {
    const { id: eventId } = c.req.valid("param");
    const blobInfo = await c.env.DB.prepare(
      "SELECT b.r2_key FROM events e JOIN blobs b ON e.content_md5 = b.content_md5 WHERE e.id = ? AND e.content_md5 != ''",
    )
      .bind(eventId)
      .first<{ r2_key: string }>();

    if (!blobInfo) return c.json({ error: "Event or content not found" }, 404);

    const object = await c.env.BUCKET.get(blobInfo.r2_key);
    if (!object) return c.json({ error: "Blob missing" }, 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    return new Response(object.body, { headers }) as any;
  },
);

// 3. Publish
events.openapi(
  createRoute({
    method: "post",
    path: "/v1/events",
    summary: "Publish event",
    request: {
      headers: z.object({
        "x-srn-pubkey": z.string(),
        "x-srn-signature": z.string(),
      }),
      body: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: z.object({ event: z.string(), file: z.any().optional() }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Success",
        content: {
          "application/json": {
            schema: z.object({ success: z.boolean(), id: z.string() }),
          },
        },
      },
      400: {
        description: "Bad Request",
        content: {
          "application/json": { schema: z.object({ error: z.string() }) },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": { schema: z.object({ error: z.string() }) },
        },
      },
    },
  }),
  async (c) => {
    const pubKeyHex = c.req.header("X-SRN-PubKey");
    const signatureHex = c.req.header("X-SRN-Signature");
    if (!pubKeyHex || !signatureHex)
      return c.json({ error: "Missing auth headers" }, 401);

    const { event: eventJsonStr, file: rawFile } = c.req.valid("form");
    const file = rawFile as File | undefined;

    let eventObj: any;
    try {
      eventObj = JSON.parse(eventJsonStr);
    } catch (e) {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    // Crypto Verify
    try {
      const encoder = new TextEncoder();
      const publicKey = await crypto.subtle.importKey(
        "raw",
        new Uint8Array(pubKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))),
        { name: "NODE-ED25519", namedCurve: "NODE-ED25519" },
        true,
        ["verify"],
      );
      const verified = await crypto.subtle.verify(
        "NODE-ED25519",
        publicKey,
        new Uint8Array(
          signatureHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
        ),
        encoder.encode(eventJsonStr),
      );
      if (!verified) throw new Error("Sig mismatch");
    } catch (e) {
      return c.json({ error: "Verification failed" }, 401);
    }

    const kind = eventObj.kind || 1001;
    const hasContent = kind === 1001 || kind === 1003;
    let contentMd5 = "";

    if (hasContent) {
      if (!file) return c.json({ error: "Missing file" }, 400);
      if (file.size > 5 * 1024 * 1024)
        return c.json({ error: "File too large (max 5MB)" }, 413);

      const contentArrayBuffer = await file.arrayBuffer();
      const contentHashBuffer = await crypto.subtle.digest(
        "MD5",
        contentArrayBuffer,
      );
      contentMd5 = Array.from(new Uint8Array(contentHashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (contentMd5 !== eventObj.content_md5)
        return c.json({ error: "Hash mismatch" }, 400);

      const r2Key = `v1/${contentMd5}.gz`;
      const compressedBuffer = await new Response(
        file.stream().pipeThrough(new CompressionStream("gzip")),
      ).arrayBuffer();
      await c.env.BUCKET.put(r2Key, compressedBuffer, {
        httpMetadata: {
          contentType: file.type || "text/plain",
          contentEncoding: "gzip",
        },
      });
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO blobs (content_md5, r2_key, size, created_at) VALUES (?, ?, ?, ?)",
      )
        .bind(contentMd5, r2Key, file.size, Math.floor(Date.now() / 1000))
        .run();
    }

    const now = Math.floor(Date.now() / 1000);
    const eventRes = await c.env.DB.prepare(
      "INSERT OR IGNORE INTO events (id, pubkey, kind, content_md5, tags, sig, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        eventObj.id,
        pubKeyHex,
        kind,
        contentMd5,
        JSON.stringify(eventObj.tags || []),
        signatureHex,
        now,
      )
      .run();

    const isNew = eventRes.meta.changes > 0;
    const statements: D1PreparedStatement[] = [];

    // Increment counter if new event
    if (isNew) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO relay_stats(key, value) VALUES('event_count', 1) " +
            "ON CONFLICT(key) DO UPDATE SET value = relay_stats.value + 1",
        ),
      );
    }

    // Lifecycle
    if (kind === 1002 || kind === 1003) {
      const targetId = (eventObj.tags || []).find(
        (t: any) => t[0] === "e",
      )?.[1];
      if (targetId) {
        const target = await c.env.DB.prepare(
          "SELECT pubkey FROM events WHERE id = ?",
        )
          .bind(targetId)
          .first<{ pubkey: string }>();
        if (target && target.pubkey === pubKeyHex) {
          statements.push(
            c.env.DB.prepare(
              "INSERT OR REPLACE INTO event_lifecycle (event_id, deactivated_by, deactivated_at, pubkey) VALUES (?, ?, ?, ?)",
            ).bind(targetId, eventObj.id, now, pubKeyHex),
          );
        }
      }
    }

    // Alias
    if (kind === 1011) {
      const alias = (eventObj.tags || []).find(
        (t: any) => t[0] === "alias",
      )?.[1];
      if (alias) {
        statements.push(
          c.env.DB.prepare(
            "INSERT OR REPLACE INTO event_keys (pubkey, alias, url, about, event_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          ).bind(
            pubKeyHex,
            alias,
            (eventObj.tags || []).find((t: any) => t[0] === "url")?.[1] || "",
            (eventObj.tags || []).find((t: any) => t[0] === "about")?.[1] || "",
            eventObj.id,
            now,
          ),
        );
        statements.push(
          c.env.DB.prepare(
            "INSERT OR REPLACE INTO event_lifecycle (event_id, deactivated_by, deactivated_at, pubkey) SELECT id, ?, ?, pubkey FROM events WHERE pubkey = ? AND kind = 1011 AND id != ?",
          ).bind(eventObj.id, now, pubKeyHex, eventObj.id),
        );
      }
    }

    // Metadata & Sources
    if (hasContent) {
      statements.push(
        c.env.DB.prepare(
          "INSERT OR IGNORE INTO event_metadata (event_id, tmdb_id, season_num, episode_num, language, archive_md5) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(
          eventObj.id,
          eventObj.tmdb_id,
          eventObj.season_num || 0,
          eventObj.episode_num || 0,
          eventObj.language || "und",
          eventObj.archive_md5 || "",
        ),
      );

      if (eventObj.source_type && eventObj.source_uri) {
        statements.push(
          c.env.DB.prepare(
            "INSERT OR IGNORE INTO event_sources (event_id, source_type, source_uri) VALUES (?, ?, ?)",
          ).bind(eventObj.id, eventObj.source_type, eventObj.source_uri),
        );
      }
    }

    if (statements.length > 0) {
      await c.env.DB.batch(statements);
    }
    return c.json({ success: true, id: eventObj.id });
  },
);

export default events;
