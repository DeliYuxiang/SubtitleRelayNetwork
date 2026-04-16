import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings } from "../types";
import {
  verifySignedRequest,
  verifyDownloadRequest,
} from "../lib/verify-pubkey";

const events = new OpenAPIHono<{ Bindings: Bindings }>();

const authHeaders = z.object({
  "x-srn-pubkey": z
    .string()
    .optional()
    .describe("Client Ed25519 public key (hex)"),
  "x-srn-nonce": z.string().optional().describe("Proof-of-Work nonce"),
  "x-srn-signature": z.string().optional().describe("Request signature (hex)"),
});

// 1. Search
events.openapi(
  createRoute({
    method: "get",
    path: "/v1/events",
    summary: "Search events",
    request: {
      headers: authHeaders,
      query: z
        .object({
          tmdb: z.string().optional(),
          season: z.string().optional(),
          ep: z.string().optional(),
          language: z.string().optional(),
          kind: z.string().optional(),
          pubkey: z.string().optional(),
          archive_md5: z.string().optional(),
        })
        .refine((q) => !(q.season || q.ep) || !!q.tmdb, {
          message: "tmdb is required when season or ep is specified",
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
      401: { description: "Signature verification failed" },
      403: { description: "PoW verification failed" },
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

    const { success } = await c.env.SEARCH_LIMITER.limit({
      key: c.req.header("CF-Connecting-IP") ?? "unknown",
    });
    if (!success) return c.json({ error: "Too many requests" }, 429);

    const { tmdb, season, ep, language, kind, pubkey, archive_md5 } =
      c.req.valid("query");

    let query = `
      SELECT e.*, m.tmdb_id, m.season_num, m.episode_num, m.language, m.archive_md5,
             s.source_type, s.source_uri
      FROM event_metadata m
      JOIN events e ON e.id = m.event_id
      LEFT JOIN event_sources s ON e.id = s.event_id
      WHERE NOT EXISTS (SELECT 1 FROM event_lifecycle WHERE event_id = m.event_id)
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
      headers: authHeaders,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Subtitle file",
        content: { "application/octet-stream": { schema: z.any() } },
      },
      401: { description: "Auth expired" },
      403: { description: "PoW verification failed" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const authResult = await verifyDownloadRequest(c);
    if (!authResult.ok)
      return c.json(
        { error: authResult.error, challenge: authResult.challenge },
        authResult.status,
      );

    const { success } = await c.env.CONTENT_LIMITER.limit({
      key: c.req.header("CF-Connecting-IP") ?? "unknown",
    });
    if (!success) return c.json({ error: "Too many requests" }, 429);

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
      headers: authHeaders,
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
      400: { description: "Bad Request" },
      401: { description: "Unauthorized" },
      403: { description: "PoW verification failed" },
    },
  }),
  async (c) => {
    const { event: eventJsonStr, file: rawFile } = c.req.valid("form");
    const file = rawFile as File | undefined;

    let eventObj: any;
    try {
      eventObj = JSON.parse(eventJsonStr);
    } catch (e) {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const canonicalTags = ((eventObj.tags as string[][] | undefined) || [])
      .filter((t) => t[0] !== "source_type" && t[0] !== "source_uri")
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const canonicalMsg = JSON.stringify([
      eventObj.pubkey,
      eventObj.kind ?? 1001,
      canonicalTags,
      eventObj.content_md5 ?? "",
    ]);

    const authResult = await verifySignedRequest(c, canonicalMsg);
    if (!authResult.ok)
      return c.json(
        { error: authResult.error, challenge: authResult.challenge },
        authResult.status,
      );

    const { pubKeyHex } = authResult;
    const signatureHex = c.req.header("X-SRN-Signature")!;

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

    if (isNew) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO relay_stats(key, value) VALUES('event_count', 1) " +
            "ON CONFLICT(key) DO UPDATE SET value = relay_stats.value + 1",
        ),
      );
    }

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
