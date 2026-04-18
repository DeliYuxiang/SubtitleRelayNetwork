-- Per-minute challenge request counter for graduated PoW difficulty.
-- Keyed by "ip:minute" or "ip:pubkey:minute"; auto-purged via challenge route.
CREATE TABLE IF NOT EXISTS challenge_counts (
  counter_key TEXT    PRIMARY KEY,
  count       INTEGER NOT NULL DEFAULT 0,
  minute      INTEGER NOT NULL   -- Unix minute timestamp, used for cleanup
);

CREATE INDEX IF NOT EXISTS idx_challenge_counts_minute
  ON challenge_counts (minute);
