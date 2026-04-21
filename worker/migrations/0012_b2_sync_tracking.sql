-- Track which blobs have been confirmed present in the B2 backup bucket.
-- Populated by BackupBucket._put() and _head() (both write and read paths).
-- NULL means not yet synced/confirmed; a timestamp means last confirmed time.
ALTER TABLE blobs ADD COLUMN b2_synced_at INTEGER;

-- Seed relay_stats rows so the first request triggers a full recompute
-- (updated_at = 0 guarantees TTL is immediately stale).
INSERT OR IGNORE INTO relay_stats(key, value, updated_at) VALUES('r2_blob_count', 0, 0);
INSERT OR IGNORE INTO relay_stats(key, value, updated_at) VALUES('b2_blob_count', 0, 0);
