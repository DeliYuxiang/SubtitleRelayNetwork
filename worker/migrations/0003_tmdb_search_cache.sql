-- L2 title knowledge base: individual TMDB titles cached from past searches
CREATE TABLE IF NOT EXISTS tmdb_title_cache (
  tmdb_id   INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  type      TEXT    NOT NULL,
  year      TEXT    NOT NULL DEFAULT '',
  poster    TEXT    NOT NULL DEFAULT '',
  cached_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tmdb_title_name ON tmdb_title_cache(name);
