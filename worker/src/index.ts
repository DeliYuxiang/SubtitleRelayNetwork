import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { Bindings, RELAY_VERSION } from "./types";
import ui from "./routes/ui";
import tmdb from "./routes/tmdb";
import events from "./routes/events";
import challenge from "./routes/challenge";
import { relaySignMiddleware } from "./middleware/relay-sign";

const app = new OpenAPIHono<{ Bindings: Bindings }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { error: result.error.issues.map((i) => i.message).join("; ") },
        422,
      );
    }
  },
});

// First middleware — CORS (must run before maintenance check for OPTIONS preflight)
app.use(
  "*",
  cors<{ Bindings: Bindings }>({
    origin: (origin, c) => {
      const allowed = (c.env.CORS_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "X-SRN-PubKey",
      "X-SRN-Nonce",
      "X-SRN-Signature",
    ],
    exposeHeaders: [
      "X-SRN-Relay-Sig",
      "X-SRN-Relay-PubKey",
      "X-SRN-Relay-Timestamp",
    ],
    maxAge: 3600,
  }),
);

// Maintenance mode middleware
app.use("*", async (c, next) => {
  if (c.env.MAINTENANCE_MODE === "true") {
    return c.text(
      "System Maintenance in progress. Please try again later.",
      503,
    );
  }
  await next();
});

// Relay signature middleware — signs all responses with the relay's Ed25519 key
app.use("*", relaySignMiddleware);

// Mount routes
app.route("/", ui);
app.route("/", tmdb);
app.route("/", events);
app.route("/", challenge);

// Documentation
app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: RELAY_VERSION,
    title: "SRN Relay API",
  },
});

app.get("/ui", swaggerUI({ url: "/doc" }));

export default app;
