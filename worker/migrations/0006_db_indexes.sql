-- DB Optimization & Indexes Migration

-- Solve problem 2, 3 (alias revocation + ORDER BY)
CREATE INDEX IF NOT EXISTS idx_events_pubkey_kind ON events(pubkey, kind);
CREATE INDEX IF NOT EXISTS idx_events_created_at  ON events(created_at);

-- Solve problem 4
CREATE INDEX IF NOT EXISTS idx_event_sources_event_id ON event_sources(event_id);

-- Solve problem 1: Introduce counter table to replace COUNT(*)
CREATE TABLE IF NOT EXISTS relay_stats (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
);

-- Initialize counter
INSERT OR IGNORE INTO relay_stats(key, value) 
SELECT 'event_count', COUNT(*) FROM events;
