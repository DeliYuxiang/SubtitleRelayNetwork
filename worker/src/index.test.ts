import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "./index";

describe("SRN Worker Integration Tests", () => {
  it("should render the SPA landing page on root", async () => {
    const request = new Request("http://example.com/");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("SRN CLOUDLESS");
    expect(body).toContain("v-scope"); // Check for Petite-Vue markers
  });

  it("should return 404 for non-existent content", async () => {
    const request = new Request(
      "http://example.com/v1/events/nonexistent/content",
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
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
