-- SRN Cloudless Normalized Schema (Cloudflare D1)
-- Initial Version (commit 666dbd6)

-- 1. 物理文件表
CREATE TABLE IF NOT EXISTS blobs (
    content_md5  TEXT PRIMARY KEY,
    r2_key       TEXT NOT NULL,
    size         INTEGER NOT NULL,
    created_at   INTEGER NOT NULL
);

-- 2. 协议事件表
CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    pubkey       TEXT NOT NULL,
    kind         INTEGER NOT NULL,
    content_md5  TEXT NOT NULL,
    tags         TEXT NOT NULL, -- JSON backup
    sig          TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    FOREIGN KEY(content_md5) REFERENCES blobs(content_md5)
);

-- 3. 核心索引表
CREATE TABLE IF NOT EXISTS event_metadata (
    event_id     TEXT PRIMARY KEY,
    tmdb_id      INTEGER NOT NULL,
    season       INTEGER,
    ep           INTEGER,
    language     TEXT NOT NULL,
    archive_md5  TEXT,
    FOREIGN KEY(event_id) REFERENCES events(id)
);

-- 4. 扩展标签表
CREATE TABLE IF NOT EXISTS event_tags (
    event_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    value       TEXT NOT NULL,
    FOREIGN KEY(event_id) REFERENCES events(id)
);

-- 5. 溯源表
CREATE TABLE IF NOT EXISTS event_sources (
    event_id    TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_uri  TEXT NOT NULL,
    FOREIGN KEY(event_id) REFERENCES events(id)
);

-- 索引预设
CREATE INDEX IF NOT EXISTS idx_metadata_lookup ON event_metadata(tmdb_id, season, ep);
CREATE INDEX IF NOT EXISTS idx_tags_lookup ON event_tags(name, value);
CREATE INDEX IF NOT EXISTS idx_blobs_created ON blobs(created_at);
