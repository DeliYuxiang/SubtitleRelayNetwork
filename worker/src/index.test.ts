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
});
