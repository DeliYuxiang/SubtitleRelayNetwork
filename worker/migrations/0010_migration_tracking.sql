-- Migration tracking table for data migrations (worker/data-migrations/*.mjs).
-- Records which data migrations have been executed so the runner is idempotent.
CREATE TABLE IF NOT EXISTS _srn_migrations (
  name        TEXT NOT NULL PRIMARY KEY,
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
