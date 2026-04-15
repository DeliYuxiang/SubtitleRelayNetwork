-- Permanent cache: TMDB total episode count per season
CREATE TABLE IF NOT EXISTS tmdb_season_cache (
  tmdb_id       INTEGER NOT NULL,
  season_num    INTEGER NOT NULL,
  episode_count INTEGER NOT NULL,
  cached_at     INTEGER NOT NULL,
  PRIMARY KEY (tmdb_id, season_num)
);
