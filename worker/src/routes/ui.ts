import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings, RELAY_VERSION } from "../types";
import { renderLandingPage } from "../ui";

const ui = new OpenAPIHono<{ Bindings: Bindings }>();

ui.get("/", async (c) => {
  const statsRes = await c.env.DB.prepare(
    "SELECT value as total FROM relay_stats WHERE key = 'event_count'",
  ).first<{ total: number }>();
  return c.html(renderLandingPage({ totalEvents: statsRes?.total || 0 }));
});

ui.get("/v1/health", async (c) => {
  const statsRes = await c.env.DB.prepare(
    "SELECT value as total FROM relay_stats WHERE key = 'event_count'",
  ).first<{ total: number }>();
  return c.json({
    schemaVersion: 1,
    label: "SRN Relay",
    message: `Online (${statsRes?.total || 0} events)`,
    color: "success",
  });
});

ui.get("/v1/identity", async (c) => {
  return c.json({
    pubkey: c.env.RELAY_PUBLIC_KEY || "",
    name: "SRN Relay",
    version: RELAY_VERSION,
    commit: c.env.COMMIT_SHA || "unknown",
    description: "SRN Phase 2 Cloud Relay",
  });
});

export default ui;
