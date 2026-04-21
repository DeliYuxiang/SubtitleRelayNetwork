import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, RELAY_VERSION } from "../types";

const ui = new OpenAPIHono<{ Bindings: Bindings }>();

ui.openapi(
  createRoute({
    method: "get",
    path: "/v1/relay",
    summary: "Relay info",
    description: "Returns relay metadata and event count.",
    responses: {
      200: {
        description: "Relay status",
        content: {
          "application/json": {
            schema: z.object({
              name: z.literal("SRN Relay"),
              version: z.string(),
              status: z.literal("online"),
              totalEvents: z.number().int().min(0),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    let total = 0;
    try {
      const statsRes = await c.env.DB.prepare(
        "SELECT value as total FROM relay_stats WHERE key = 'event_count'",
      ).first<{ total: number }>();
      total = statsRes?.total ?? 0;
    } catch {
      // DB not yet initialised (fresh preview deployment)
    }
    return c.json({
      name: "SRN Relay" as const,
      version: RELAY_VERSION,
      status: "online" as const,
      totalEvents: total,
    });
  },
);

ui.get("/v1/health", async (c) => {
  let total = 0;
  try {
    const statsRes = await c.env.DB.prepare(
      "SELECT value as total FROM relay_stats WHERE key = 'event_count'",
    ).first<{ total: number }>();
    total = statsRes?.total ?? 0;
  } catch {
    // DB not yet initialised (fresh preview deployment)
  }
  return c.json({
    schemaVersion: 1,
    label: "SRN Relay",
    message: `Online (${total} events)`,
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
