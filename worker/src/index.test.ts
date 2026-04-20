import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "./index";

describe("SRN Worker Integration Tests", () => {
  beforeAll(async () => {
    // Basic schema initialization for tests
    // We'll execute the initial schema and recent updates
    const migrations = [
      "0001_initial_schema.sql",
      "0002_rename_metadata_columns.sql",
      "0003_tmdb_search_cache.sql",
      "0004_tmdb_season_cache.sql",
      "0005_event_lifecycle.sql",
      "0006_db_indexes.sql",
    ];

    for (const file of migrations) {
      // Note: In cloudflare:test environment, we don't have direct FS access easily,
      // but for these standard worker tests, it's better to ensure the tables exist.
      // Since we can't easily read files from disk inside the worker sandbox without extra setup,
      // we'll use a pragmatic approach: execute the table creation directly if needed,
      // or assume the pool worker setup handles it.
      // Actually, the best way in Vitest Pool Workers is to use the 'migrations' array
      // if supported, but here we will just create the essential tables for smoke tests.
    }

    // Smoke test specific: Ensure relay_stats and events exist to avoid 500s
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS relay_stats (key TEXT PRIMARY KEY, value INTEGER);
      INSERT OR IGNORE INTO relay_stats (key, value) VALUES ('event_count', 0);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, pubkey TEXT, kind INTEGER, content_md5 TEXT, tags TEXT, sig TEXT, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS event_metadata (event_id TEXT PRIMARY KEY, tmdb_id INTEGER, season_num INTEGER, episode_num INTEGER, language TEXT, archive_md5 TEXT);
      CREATE TABLE IF NOT EXISTS blobs (content_md5 TEXT PRIMARY KEY, r2_key TEXT, size INTEGER, created_at INTEGER);
    `);
  });

  it("should return JSON relay info on root", async () => {
    const request = new Request("http://example.com/");
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
});
