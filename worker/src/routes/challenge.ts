import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, ChallengeSchema } from "../types";
import { getPoWSalt, isVip } from "../lib/verify-pubkey";

const ChallengeResponseSchema = ChallengeSchema.extend({
  vip: z.boolean().describe("Whether the client is a VIP"),
}).openapi("ChallengeResponse");

const challenge = new OpenAPIHono<{ Bindings: Bindings }>();

/**
 * GET /v1/challenge
 *
 * Returns PoW parameters (salt and difficulty k).
 *
 * Difficulty formula:
 *   k = base_k + floor(max(ip_count, pk_count) / 5)
 *   capped at base_k + 4.
 */
challenge.openapi(
  createRoute({
    method: "get",
    path: "/v1/challenge",
    summary: "Get current PoW challenge parameters",
    description: "Returns salt and difficulty k. VIPs get k=0.",
    responses: {
      200: {
        description: "Challenge parameters",
        content: {
          "application/json": {
            schema: ChallengeResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const baseK = parseInt(c.env.SRN_POW_DIFFICULTY ?? "0", 10) || 0;
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const pubKeyHex = c.req.header("X-SRN-PubKey") ?? "anonymous";
    const minute = Math.floor(Date.now() / 60000);

    // 1. VIP Check (Simplified: just whitelist check for now)
    if (isVip(pubKeyHex, c.env.SRN_PUBKEY_WHITELIST ?? "")) {
      const salt = await getPoWSalt(c.env, ip, minute);
      return c.json({ salt, k: 0, vip: true });
    }

    // 2. Dual Counter Logic
    const ipKey = `ip:${ip}`;
    const pkKey = `pk:${pubKeyHex}`;

    // Atomically increment both counters for the current minute
    const statements = [
      c.env.DB.prepare(
        "INSERT INTO challenge_counts (counter_key, count, minute) VALUES (?, 1, ?) " +
          "ON CONFLICT(counter_key) DO UPDATE SET count = count + 1 " +
          "RETURNING count",
      ).bind(ipKey, minute),
      c.env.DB.prepare(
        "INSERT INTO challenge_counts (counter_key, count, minute) VALUES (?, 1, ?) " +
          "ON CONFLICT(counter_key) DO UPDATE SET count = count + 1 " +
          "RETURNING count",
      ).bind(pkKey, minute),
    ];

    const results = await c.env.DB.batch<{ count: number }>(statements);
    const ipCount = results[0]?.results?.[0]?.count ?? 1;
    const pkCount = results[1]?.results?.[0]?.count ?? 1;

    // k increases by 1 for every 5 requests in a minute, capped at +4
    const increment = Math.min(Math.floor(Math.max(ipCount, pkCount) / 5), 4);
    const k = baseK + increment;

    // 3. Generate Salt
    const salt = await getPoWSalt(c.env, ip, minute);

    // Async cleanup: purge records older than 2 minutes
    c.executionCtx.waitUntil(
      c.env.DB.prepare("DELETE FROM challenge_counts WHERE minute < ?")
        .bind(minute - 1)
        .run(),
    );

    return c.json({ salt, k, vip: false });
  },
);

export default challenge;
