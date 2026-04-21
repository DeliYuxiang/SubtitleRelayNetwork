import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, ErrorSchema } from "../types";
import {
  verifySignedRequest,
  verifyDownloadRequest,
  isVip,
} from "../lib/verify-pubkey";
import { BackupBucket } from "../lib/backup-bucket";

const EventSchema = z
  .object({
    id: z.string(),
    pubkey: z.string(),
    kind: z.number().int(),
    content_md5: z.string(),
    tags: z.string().describe("JSON-encoded tag array"),
    sig: z.string(),
    created_at: z.number().int(),
    tmdb_id: z.string().nullable().optional(),
    season_num: z.number().int().nullable().optional(),
    episode_num: z.number().int().nullable().optional(),
    language: z.string().nullable().optional(),
    archive_md5: z.string().nullable().optional(),
    source_type: z.string().nullable().optional(),
    source_uri: z.string().nullable().optional(),
  })
  .openapi("SRNEvent");

const errorResponses = {
  401: {
    description: "Signature verification failed or auth expired",
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
        .refine((q) => !!q.tmdb && (!q.ep || !!q.season), {
          message:
            "TMDB ID is required, and Season must be provided if Episode is specified (Unified Query Standard)",
        }),
    },
    responses: {
      200: {
        description: "List of events",
        content: {
          "application/json": {
            schema: z.object({ events: z.array(EventSchema) }),
          },
        },
      },
      ...errorResponses,
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

    if (!isVip(authResult.pubKeyHex, c.env.SRN_PUBKEY_WHITELIST ?? "")) {
      const { success } = await c.env.SEARCH_LIMITER.limit({
        key: c.req.header("CF-Connecting-IP") ?? "unknown",
      });
      if (!success) return c.json({ error: "Too many requests" }, 429);
    }

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
    path: "/v1/events/{id}/content",
    summary: "Download subtitle file",
    request: {
      headers: authHeaders,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Subtitle file (plain text, decompressed server-side)",
        content: { "application/octet-stream": { schema: z.any() } },
      },
      404: {
        description: "Event or blob not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const authResult = await verifyDownloadRequest(c);
    if (!authResult.ok)
      return c.json(
        { error: authResult.error, challenge: authResult.challenge },
        authResult.status,
      );

    if (!isVip(authResult.pubKeyHex, c.env.SRN_PUBKEY_WHITELIST ?? "")) {
      const { success } = await c.env.CONTENT_LIMITER.limit({
        key: c.req.header("CF-Connecting-IP") ?? "unknown",
      });
      if (!success) return c.json({ error: "Too many requests" }, 429);
    }

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
    // Decompress server-side: Cloudflare's CDN layer can strip or mangle
    // Content-Encoding: gzip in transit, delivering raw gzip bytes to clients.
    // Explicitly decompress here so clients always receive plain text.
    const isGzipped = headers.get("content-encoding") === "gzip";
    headers.delete("content-encoding");

    // Buffer compressed bytes so we can (a) lazy-sync to B2 and (b) rebuild a
    // fresh stream for decompression — R2 body is single-use. Max 5 MB, acceptable.
    const compressedBytes = await object.arrayBuffer();
    new BackupBucket(c.env, c.executionCtx).checkExistsOrWrite(
      blobInfo.r2_key,
      compressedBytes,
      headers.get("content-type") || "text/plain",
    );

    const bodyStream = new Response(compressedBytes).body!;
    const body = isGzipped
      ? bodyStream.pipeThrough(new DecompressionStream("gzip"))
      : bodyStream;
    return new Response(body, { headers }) as any;
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
        description: "Event published or deduplicated",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              id: z.string(),
              deduplicated: z
                .boolean()
                .optional()
                .describe(
                  "True when an identical event already exists; id refers to the existing event",
                ),
            }),
          },
        },
      },
      400: {
        description: "Bad request (invalid JSON, hash mismatch, missing file)",
        content: { "application/json": { schema: ErrorSchema } },
      },
      413: {
        description: "File too large (max 5 MB)",
        content: { "application/json": { schema: ErrorSchema } },
      },
      ...errorResponses,
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
      new BackupBucket(c.env, c.executionCtx).write(
        r2Key,
        compressedBuffer,
        file.type || "text/plain",
      );
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO blobs (content_md5, r2_key, size, created_at) VALUES (?, ?, ?, ?)",
      )
        .bind(contentMd5, r2Key, file.size, Math.floor(Date.now() / 1000))
        .run();
    }

    const now = Math.floor(Date.now() / 1000);

    // Compute dedup hash for Kind 1001 — reused in the event_metadata INSERT below.
    // Formula must match migration_0009_dedup_hash.yml backfill script exactly:
    //   MD5(pubkey|content_md5|tmdb_id|season_num|episode_num|language|archive_md5)
    let dedupHash: string | null = null;
    if (kind === 1001) {
      const hashBuf = await crypto.subtle.digest(
        "MD5",
        new TextEncoder().encode(
          [
            pubKeyHex,
            contentMd5,
            String(eventObj.tmdb_id ?? ""),
            String(eventObj.season_num || 0),
            String(eventObj.episode_num || 0),
            eventObj.language || "und",
            eventObj.archive_md5 || "",
          ].join("|"),
        ),
      );
      dedupHash = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const existing = await c.env.DB.prepare(
        "SELECT event_id FROM event_metadata WHERE dedup_hash = ?",
      )
        .bind(dedupHash)
        .first<{ event_id: string }>();

      if (existing) {
        return c.json({
          success: true,
          id: existing.event_id,
          deduplicated: true,
        });
      }
    }

    await c.env.DB.prepare(
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

    const statements: D1PreparedStatement[] = [];

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
          "INSERT OR IGNORE INTO event_metadata (event_id, tmdb_id, season_num, episode_num, language, archive_md5, dedup_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          eventObj.id,
          eventObj.tmdb_id,
          eventObj.season_num || 0,
          eventObj.episode_num || 0,
          eventObj.language || "und",
          eventObj.archive_md5 || "",
          dedupHash,
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
