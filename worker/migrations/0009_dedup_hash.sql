-- Add dedup_hash to event_metadata for semantic deduplication of Kind 1001 events.
-- Formula: MD5(pubkey|content_md5|tmdb_id|season_num|episode_num|language|archive_md5)
-- Backfill for existing rows is handled by data migration 0009_dedup_hash.mjs.

ALTER TABLE event_metadata ADD COLUMN dedup_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_metadata_dedup_hash
  ON event_metadata (dedup_hash)
  WHERE dedup_hash IS NOT NULL;
