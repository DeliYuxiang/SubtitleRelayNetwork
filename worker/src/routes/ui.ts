import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, RELAY_VERSION } from "../types";

const ui = new OpenAPIHono<{ Bindings: Bindings }>();

// ── Shared relay info ────────────────────────────────────────────────────────
// Single source of truth for all relay metadata consumed by /v1/relay,
// /v1/identity, and /v1/health.  DB query is performed once per call here.

// Computed stats (uniqueTitles, uniqueEpisodes) are cached in relay_stats and
// refreshed lazily: a full table scan runs only when the cached value is older
// than STATS_TTL_SECONDS.  event_count is maintained incrementally on publish
// and is never subject to TTL.
const STATS_TTL_SECONDS = 5 * 60;

interface RelayInfo {
  name: "SRN Relay";
  version: string;
  status: "online";
  totalEvents: number;
  uniqueTitles: number;
  uniqueEpisodes: number;
  pubkey: string;
  commit: string;
  description: string;
}

async function fetchRelayInfo(env: Bindings): Promise<RelayInfo> {
  let totalEvents = 0;
  let uniqueTitles = 0;
  let uniqueEpisodes = 0;
  try {
    const now = Math.floor(Date.now() / 1000);

    // Single-row reads — all O(1) primary-key lookups.
    const [eventsRow, titlesRow, episodesRow] = await Promise.all([
      env.DB.prepare(
        "SELECT value, updated_at FROM relay_stats WHERE key = 'event_count'",
      ).first<{ value: number; updated_at: number }>(),
      env.DB.prepare(
        "SELECT value, updated_at FROM relay_stats WHERE key = 'unique_titles'",
      ).first<{ value: number; updated_at: number }>(),
      env.DB.prepare(
        "SELECT value, updated_at FROM relay_stats WHERE key = 'unique_episodes'",
      ).first<{ value: number; updated_at: number }>(),
    ]);

    totalEvents = eventsRow?.value ?? 0;
    uniqueTitles = titlesRow?.value ?? 0;
    uniqueEpisodes = episodesRow?.value ?? 0;

    // Recompute stale counters (full scan, runs at most once per TTL window).
    const titlesStale =
      !titlesRow || now - (titlesRow.updated_at ?? 0) > STATS_TTL_SECONDS;
    const episodesStale =
      !episodesRow || now - (episodesRow.updated_at ?? 0) > STATS_TTL_SECONDS;

    if (titlesStale || episodesStale) {
      const [freshTitles, freshEpisodes] = await Promise.all([
        titlesStale
          ? env.DB.prepare(
              `SELECT COUNT(DISTINCT m.tmdb_id) AS count
               FROM event_metadata m
               WHERE NOT EXISTS (
                 SELECT 1 FROM event_lifecycle l WHERE l.event_id = m.event_id
               )`,
            ).first<{ count: number }>()
          : Promise.resolve<{ count: number } | null>(null),
        episodesStale
          ? env.DB.prepare(
              `SELECT COUNT(DISTINCT
                 m.tmdb_id || ':' ||
                 COALESCE(CAST(m.season_num  AS TEXT), '') || ':' ||
                 COALESCE(CAST(m.episode_num AS TEXT), '')) AS count
               FROM event_metadata m
               WHERE NOT EXISTS (
                 SELECT 1 FROM event_lifecycle l WHERE l.event_id = m.event_id
               )`,
            ).first<{ count: number }>()
          : Promise.resolve<{ count: number } | null>(null),
      ]);

      const updates: D1PreparedStatement[] = [];
      const upsert =
        "INSERT INTO relay_stats(key, value, updated_at) VALUES(?, ?, ?)" +
        " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at";

      if (freshTitles !== null) {
        uniqueTitles = freshTitles?.count ?? 0;
        updates.push(
          env.DB.prepare(upsert).bind("unique_titles", uniqueTitles, now),
        );
      }
      if (freshEpisodes !== null) {
        uniqueEpisodes = freshEpisodes?.count ?? 0;
        updates.push(
          env.DB.prepare(upsert).bind("unique_episodes", uniqueEpisodes, now),
        );
      }
      if (updates.length > 0) await env.DB.batch(updates);
    }
  } catch {
    // DB not yet initialised (fresh preview deployment)
  }
  return {
    name: "SRN Relay",
    version: RELAY_VERSION,
    status: "online",
    totalEvents,
    uniqueTitles,
    uniqueEpisodes,
    pubkey: env.RELAY_PUBLIC_KEY || "",
    commit: env.COMMIT_SHA || "unknown",
    description: "SRN Phase 2 Cloud Relay",
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

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
              uniqueTitles: z
                .number()
                .int()
                .min(0)
                .describe("Unique TMDB IDs with active events"),
              uniqueEpisodes: z
                .number()
                .int()
                .min(0)
                .describe("Unique (tmdb_id, season, episode) combinations"),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { name, version, status, totalEvents, uniqueTitles, uniqueEpisodes } =
      await fetchRelayInfo(c.env);
    return c.json({
      name,
      version,
      status,
      totalEvents,
      uniqueTitles,
      uniqueEpisodes,
    });
  },
);

ui.openapi(
  createRoute({
    method: "get",
    path: "/v1/health",
    summary: "Relay health (Shields.io)",
    description: "Shields.io-compatible health badge with live event count.",
    responses: {
      200: {
        description: "Health badge payload",
        content: {
          "application/json": {
            schema: z.object({
              schemaVersion: z.literal(1),
              label: z.string(),
              message: z.string(),
              color: z.string(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { name, totalEvents } = await fetchRelayInfo(c.env);
    return c.json({
      schemaVersion: 1 as const,
      label: name,
      message: `Online (${totalEvents} events)`,
      color: "success",
    });
  },
);

ui.openapi(
  createRoute({
    method: "get",
    path: "/v1/identity",
    summary: "Relay identity",
    description: "Returns the relay's public key and build metadata.",
    responses: {
      200: {
        description: "Relay identity",
        content: {
          "application/json": {
            schema: z.object({
              pubkey: z.string(),
              name: z.literal("SRN Relay"),
              version: z.string(),
              commit: z.string(),
              description: z.string(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { pubkey, name, version, commit, description } = await fetchRelayInfo(
      c.env,
    );
    return c.json({ pubkey, name, version, commit, description });
  },
);

export default ui;
