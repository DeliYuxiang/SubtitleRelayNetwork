-- Add updated_at to relay_stats for TTL-based lazy refresh of computed counters.
-- event_count is maintained incrementally (no TTL); unique_titles and
-- unique_episodes are recomputed at most once per STATS_TTL_SECONDS window.

ALTER TABLE relay_stats ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

-- Seed rows with updated_at = 0 so the first request immediately triggers
-- a full recompute and populates real values.
INSERT OR IGNORE INTO relay_stats(key, value, updated_at) VALUES('unique_titles',   0, 0);
INSERT OR IGNORE INTO relay_stats(key, value, updated_at) VALUES('unique_episodes', 0, 0);
