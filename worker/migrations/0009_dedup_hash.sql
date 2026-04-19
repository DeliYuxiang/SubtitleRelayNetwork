-- Add dedup_hash to event_metadata for O(1) ingestion-time deduplication.
-- Replaces the multi-table JOIN SELECT in the Kind 1001 publish path with a
-- single unique-index point-lookup.
--
-- Dedup formula (must match events.ts and migration_0009_dedup_hash.yml):
--   MD5( pubkey | content_md5 | tmdb_id | season_num | episode_num | language | archive_md5 )
--   Fields joined with '|'. Kind 1001 only; Kind 1003 rows remain NULL.
--
-- Historical rows are backfilled by .github/workflows/migrations/migration_0009_dedup_hash.yml
-- which runs automatically during the next maintenance window.

ALTER TABLE event_metadata ADD COLUMN dedup_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_dedup_hash
    ON event_metadata (dedup_hash);
