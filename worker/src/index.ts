import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { Bindings, RELAY_VERSION } from "./types";
import ui from "./routes/ui";
import tmdb from "./routes/tmdb";
import events from "./routes/events";
import { relaySignMiddleware } from "./middleware/relay-sign";

const app = new OpenAPIHono<{ Bindings: Bindings }>();

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
