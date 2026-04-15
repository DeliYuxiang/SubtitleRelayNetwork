-- Fix: add leading-column index for season/episode-only queries
--
-- The existing idx_metadata_lookup is (tmdb_id, season_num, episode_num).
-- Queries that filter by (season_num, episode_num) without specifying tmdb_id
-- cannot use that index (B-tree leading-column rule), causing full table scans
-- and accounting for ~77% of all D1 row reads.
--
-- This index covers both query shapes observed in production:
--   WHERE season_num = ? AND episode_num = ?
--   WHERE season_num = ? AND episode_num = ? AND language = ?

CREATE INDEX IF NOT EXISTS idx_metadata_se_ep
    ON event_metadata (season_num, episode_num);

CREATE INDEX IF NOT EXISTS idx_metadata_se_ep_lang
    ON event_metadata (season_num, episode_num, language);
