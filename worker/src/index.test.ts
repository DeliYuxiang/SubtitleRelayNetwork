import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import {
  generateKeypair,
  importPrivKey,
  buildAuthHeaders,
  mineNonce,
} from "@srn/client";
import worker from "./index";

describe("SRN Worker Integration Tests", () => {
  beforeAll(async () => {
    // Create all tables required by the routes under test.
    // One exec() per statement — D1 test env processes them individually.
    const ddl = [
      "CREATE TABLE IF NOT EXISTS relay_stats (key TEXT PRIMARY KEY, value INTEGER)",
      "INSERT OR IGNORE INTO relay_stats (key, value) VALUES ('event_count', 0)",
      "INSERT OR IGNORE INTO relay_stats (key, value) VALUES ('unique_titles', 0)",
      "INSERT OR IGNORE INTO relay_stats (key, value) VALUES ('unique_episodes', 0)",
      "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, pubkey TEXT, kind INTEGER, content_md5 TEXT, tags TEXT, sig TEXT, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS event_metadata (event_id TEXT PRIMARY KEY, tmdb_id INTEGER, season_num INTEGER, episode_num INTEGER, language TEXT, archive_md5 TEXT, dedup_hash TEXT)",
      "CREATE TABLE IF NOT EXISTS event_sources (event_id TEXT NOT NULL, source_type TEXT NOT NULL, source_uri TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS event_lifecycle (event_id TEXT PRIMARY KEY, deactivated_by TEXT NOT NULL, deactivated_at INTEGER NOT NULL, pubkey TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS event_tags (event_id TEXT NOT NULL, tag_name TEXT NOT NULL, tag_value TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS event_keys (pubkey TEXT PRIMARY KEY, alias TEXT, url TEXT, about TEXT, event_id TEXT, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS blobs (content_md5 TEXT PRIMARY KEY, r2_key TEXT, size INTEGER, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS challenge_counts (counter_key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, minute INTEGER NOT NULL)",
    ];
    for (const sql of ddl) {
      await env.DB.exec(sql);
    }
  });

  // ── Smoke tests (no auth) ──────────────────────────────────────────────────

  it("should return JSON relay info on /v1/relay", async () => {
    const request = new Request("http://example.com/v1/relay");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const data: any = await response.json();
    expect(data.name).toBe("SRN Relay");
    expect(data.status).toBe("online");
    expect(data).toHaveProperty("version");
    expect(data).toHaveProperty("totalEvents");
  });

  it("should return 401 for unauthenticated content request", async () => {
    const request = new Request(
      "http://example.com/v1/events/nonexistent/content",
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    // Auth is now required; missing headers yield 401 before content lookup
    expect(response.status).toBe(401);
  });

  it("should expose the OpenAPI documentation UI", async () => {
    const request = new Request("http://example.com/ui");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("swagger-ui");
  });

  it("should return 503 during maintenance mode", async () => {
    // Override env for this test
    const maintenanceEnv = { ...env, MAINTENANCE_MODE: "true" };
    const request = new Request("http://example.com/v1/health");
    const ctx = createExecutionContext();

    // @ts-ignore: Testing middleware logic with mocked env
    const response = await worker.fetch(request, maintenanceEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("Maintenance");
  });

  it("should expose identity and version", async () => {
    const request = new Request("http://example.com/v1/identity");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const data: any = await response.json();
    expect(data).toHaveProperty("version");
    expect(data.name).toBe("SRN Relay");
  });

  // ── Authenticated tests (uses @srn/client crypto primitives) ──────────────
  // Test env sets SRN_POW_DIFFICULTY=0 (k=0), so mineNonce returns "0" instantly.

  it("should issue a challenge", async () => {
    const { pubHex } = await generateKeypair();
    const request = new Request("http://example.com/v1/challenge", {
      headers: { "X-SRN-PubKey": pubHex },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const data: any = await response.json();
    expect(data).toHaveProperty("salt");
    expect(data).toHaveProperty("k");
    expect(typeof data.k).toBe("number");
    // Test env sets SRN_POW_DIFFICULTY=0
    expect(data.k).toBe(0);
  });

  it("authenticated GET /v1/events returns 200 (full PoW + Ed25519 flow)", async () => {
    // 1. Generate a fresh Ed25519 keypair via @srn/client
    const { pubHex, privHex } = await generateKeypair();

    // 2. Fetch challenge from the relay
    const challengeReq = new Request("http://example.com/v1/challenge", {
      headers: { "X-SRN-PubKey": pubHex },
    });
    const ctx1 = createExecutionContext();
    const challengeRes = await worker.fetch(challengeReq, env, ctx1);
    await waitOnExecutionContext(ctx1);
    const { salt, k } = (await challengeRes.json()) as {
      salt: string;
      k: number;
    };

    // 3. Mine PoW nonce (trivial: k=0 in test env)
    const nonce = await mineNonce(salt, pubHex, k);

    // 4. Import private key via @srn/client and build auth headers.
    // Standard GET message = pubHex (non-download endpoints).
    const cryptoKey = await importPrivKey(privHex);
    const authHeaders = await buildAuthHeaders(
      pubHex,
      cryptoKey,
      nonce,
      pubHex,
    );

    // 5. Make authenticated request — tmdb param required by the route's query validation
    const searchReq = new Request("http://example.com/v1/events?tmdb=12345", {
      headers: authHeaders,
    });
    const ctx2 = createExecutionContext();
    const searchRes = await worker.fetch(searchReq, env, ctx2);
    await waitOnExecutionContext(ctx2);

    expect(searchRes.status).toBe(200);
    const data: any = await searchRes.json();
    expect(Array.isArray(data.events)).toBe(true);
  });
});
