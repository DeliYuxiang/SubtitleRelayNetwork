-- Migration: Rename columns and update index in event_metadata
-- From commit 666dbd6 (Initial) to commit ced98f1 (Current)

-- 1. Rename columns
ALTER TABLE event_metadata RENAME COLUMN season TO season_num;
ALTER TABLE event_metadata RENAME COLUMN ep TO episode_num;

-- 2. Update index
-- Indices cannot be renamed directly, so we drop and recreate.
DROP INDEX IF EXISTS idx_metadata_lookup;
CREATE INDEX IF NOT EXISTS idx_metadata_lookup ON event_metadata(tmdb_id, season_num, episode_num);
