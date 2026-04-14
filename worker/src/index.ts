import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { html } from 'hono/html';
import { renderLandingPage } from './ui';

interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
}

const app = new OpenAPIHono<{ Bindings: Env }>();

// --- UI Portal ---

app.get('/v1/health', async (c) => {
  const statsRes = await c.env.DB.prepare("SELECT count(*) as total FROM events").first<{total: number}>();
  const total = statsRes?.total || 0;
  
  return c.json({
    schemaVersion: 1,
    label: "SRN Relay",
    message: `Online (${total} events)`,
    color: "success"
  });
});

app.get('/', async (c) => {
  const statsRes = await c.env.DB.prepare("SELECT count(*) as total FROM events").first<{total: number}>();
  
  return c.html(renderLandingPage({
    totalEvents: statsRes?.total || 0
  }));
});

// --- Schemas & Routes ---

const EventParamsSchema = z.object({
  id: z.string().openapi({ example: '1234567890abcdef...' }),
});

const QueryParamsSchema = z.object({
  tmdb: z.string().optional().openapi({ example: '100565' }),
  s: z.string().optional().openapi({ example: '1' }),
  e: z.string().optional().openapi({ example: '5' }),
  lang: z.string().optional().openapi({ example: 'zh-CN' }),
});

// --- API Endpoints with OpenAPI Documentation ---

// 1. Query Events
app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/events',
    request: { query: QueryParamsSchema },
    responses: {
      200: {
        description: 'Returns a list of matching subtitle events',
        content: { 'application/json': { schema: z.object({ events: z.array(z.any()) }) } },
      },
    },
    summary: 'Query subtitle metadata',
  }),
  async (c) => {
    const { tmdb, s, e, lang } = c.req.valid('query');

    let query = `
      SELECT e.*, m.tmdb_id, m.season, m.ep, m.language, m.archive_md5
      FROM events e
      JOIN event_metadata m ON e.id = m.event_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (tmdb) { query += " AND m.tmdb_id = ?"; params.push(parseInt(tmdb)); }
    if (s) { query += " AND m.season = ?"; params.push(parseInt(s)); }
    if (e) { query += " AND m.ep = ?"; params.push(parseInt(e)); }
    if (lang) { query += " AND m.language = ?"; params.push(lang); }

    query += " ORDER BY e.created_at DESC LIMIT 50";

    const { results } = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ events: results });
  }
);

// 2. Publish Event
// Note: Zod-OpenAPI doesn't handle multipart as cleanly as JSON, but we define the summary.
app.post('/v1/events', async (c) => {
  const formData = await c.req.formData();
  const eventJson = formData.get('event') as string;
  const file = formData.get('file') as File;

  if (!eventJson) return c.json({ error: "Missing event" }, 400);
  const event = JSON.parse(eventJson);

  // Verification
  const isValid = await verifyEvent(event);
  if (!isValid) return c.json({ error: "Invalid signature or ID" }, 403);

  const contentMd5 = event.content;

  let blob = await c.env.DB.prepare("SELECT * FROM blobs WHERE content_md5 = ?").bind(contentMd5).first();
  
  if (!blob) {
    if (!file) return c.json({ error: "File required for first-time upload" }, 400);
    if (file.size > 5 * 1024 * 1024) return c.json({ error: "File too large (Max 5MB)" }, 413);

    const fileBuffer = await file.arrayBuffer();
    const actualHashBuffer = await crypto.subtle.digest("MD5", fileBuffer);
    const actualMd5 = Array.from(new Uint8Array(actualHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (actualMd5 !== contentMd5) return c.json({ error: "File content mismatch" }, 400);
    
    const r2Key = `subtitles/${contentMd5}`;
    await c.env.BUCKET.put(r2Key, fileBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    });
    await c.env.DB.prepare("INSERT INTO blobs (content_md5, r2_key, size, created_at) VALUES (?, ?, ?, ?)")
      .bind(contentMd5, r2Key, file.size, Math.floor(Date.now() / 1000)).run();
  }

  try {
    await c.env.DB.prepare("INSERT INTO events (id, pubkey, kind, content_md5, tags, sig, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(event.id, event.pubkey, event.kind, contentMd5, JSON.stringify(event.tags), event.sig, event.created_at).run();

    const tags = event.tags as string[][];
    const tmdb = tags.find(t => t[0] === 'tmdb')?.[1];
    const s = tags.find(t => t[0] === 's')?.[1];
    const e = tags.find(t => t[0] === 'e')?.[1];
    const lang = tags.find(t => t[0] === 'language' || t[0] === 'lang')?.[1];
    const archive = tags.find(t => t[0] === 'archive_md5')?.[1];

    if (tmdb) {
        await c.env.DB.prepare("INSERT INTO event_metadata (event_id, tmdb_id, season, ep, language, archive_md5) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(event.id, parseInt(tmdb), s ? parseInt(s) : null, e ? parseInt(e) : null, lang || 'und', archive || null).run();
    }

    for (const tag of tags) {
        if (['tmdb', 's', 'e', 'language', 'lang', 'content_md5', 'archive_md5'].includes(tag[0])) continue;
        await c.env.DB.prepare("INSERT INTO event_tags (event_id, name, value) VALUES (?, ?, ?)")
            .bind(event.id, tag[0], tag[1]).run();
    }
    return c.json({ id: event.id, status: "created" }, 201);
  } catch (err: any) {
    if (err.message?.includes("UNIQUE")) return c.json({ id: event.id, status: "exists" }, 200);
    return c.json({ error: err.message }, 500);
  }
});

// 3. Get Content
app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/events/{id}/content',
    request: { params: EventParamsSchema },
    responses: {
      200: { description: 'The subtitle file binary' },
      404: { description: 'Event or file not found' }
    },
    summary: 'Download subtitle file'
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const event = await c.env.DB.prepare("SELECT content_md5 FROM events WHERE id = ?").bind(id).first<{content_md5: string}>();
    if (!event) return c.text("Event not found", 404);

    const blob = await c.env.DB.prepare("SELECT r2_key FROM blobs WHERE content_md5 = ?").bind(event.content_md5).first<{r2_key: string}>();
    if (!blob) return c.text("Blob not found", 404);

    const object = await c.env.BUCKET.get(blob.r2_key);
    if (!object) return c.text("Object not found in R2", 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(object.body, { headers });
  }
);

// --- OpenAPI Doc & UI ---

app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'SRN Relay API', version: '2.0.0' },
});

app.get('/ui', swaggerUI({ url: '/doc' }));

// --- Verification Helper ---

async function verifyEvent(event: any): Promise<boolean> {
  try {
    const canonical = [event.pubkey, event.created_at, event.kind, event.tags, event.filename, event.content];
    const data = JSON.stringify(canonical);
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
    if (event.id !== hashHex) return false;

    const pubKey = await crypto.subtle.importKey("raw", byteToUint8Array(event.pubkey), { name: "Ed25519", namedCurve: "Ed25519" }, true, ["verify"]);
    return await crypto.subtle.verify("Ed25519", pubKey, byteToUint8Array(event.sig), byteToUint8Array(event.id));
  } catch { return false; }
}

function byteToUint8Array(hex: string) {
  return Uint8Array.from(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
}

export default app;
