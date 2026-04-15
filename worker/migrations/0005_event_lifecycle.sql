-- SRN Event Lifecycle & Identity Migration

-- 1. Ensure empty blob exists for non-content events
INSERT OR IGNORE INTO blobs (content_md5, r2_key, size, created_at)
VALUES ('', 'internal/empty', 0, 1713139200);

-- 2. Lifecycle Sidecar Table
CREATE TABLE IF NOT EXISTS event_lifecycle (
    event_id        TEXT PRIMARY KEY,
    deactivated_by  TEXT NOT NULL,
    deactivated_at  INTEGER NOT NULL,
    pubkey          TEXT NOT NULL,
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY(deactivated_by) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_pubkey ON event_lifecycle(pubkey);
CREATE INDEX IF NOT EXISTS idx_lifecycle_expiry ON event_lifecycle(deactivated_at);

-- 3. Key Alias Table (Identity)
CREATE TABLE IF NOT EXISTS event_keys (
    pubkey     TEXT PRIMARY KEY,
    alias      TEXT NOT NULL,
    url        TEXT NOT NULL DEFAULT '',
    about      TEXT NOT NULL DEFAULT '',
    event_id   TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
);
