// seed-local.mjs — Reset and seed the local D1 SQLite from a SQL dump.
//
// wrangler d1 execute --local hangs on large SQL files (miniflare parses
// statements one-by-one over IPC). This script uses node:sqlite with batched
// transactions and WAL pragmas for fast bulk import with progress output.
//
// Usage:
//   LOCAL_DB_PATH=<path/to/db.sqlite> BACKUP_FILE=<dump.sql> node seed-local.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const { LOCAL_DB_PATH, BACKUP_FILE } = process.env;
if (!LOCAL_DB_PATH || !BACKUP_FILE) {
  console.error('Missing required env vars: LOCAL_DB_PATH, BACKUP_FILE');
  process.exit(1);
}

const db = new DatabaseSync(LOCAL_DB_PATH);

// Speed pragmas — safe for local-only use (no durability guarantees needed).
db.exec('PRAGMA journal_mode=WAL;');
db.exec('PRAGMA synchronous=OFF;');
db.exec('PRAGMA cache_size=-65536;'); // 64 MB page cache

// Drop all user tables.
const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  )
  .all();
db.exec('PRAGMA foreign_keys=OFF;');
for (const { name } of tables) db.exec(`DROP TABLE IF EXISTS "${name}";`);

const sql = readFileSync(BACKUP_FILE, 'utf8');
const sizeMB = (Buffer.byteLength(sql, 'utf8') / 1024 / 1024).toFixed(1);

// Split on `;\n` — safe for D1 export format where each statement ends at EOL.
// Strip BEGIN/COMMIT/ROLLBACK/FK pragmas from the dump; we manage them ourselves.
const stmts = sql
  .split(/;\s*\n/)
  .map(s => s.trim())
  .filter(
    s =>
      s.length > 0 &&
      !s.startsWith('--') &&
      !/^(BEGIN|COMMIT|ROLLBACK|PRAGMA foreign_keys)/i.test(s),
  );

const total = stmts.length;
const BATCH = 200; // statements per transaction
const start = Date.now();

console.log(`Importing ${sizeMB} MB (~${total} statements)...`);

let lastPct = -1;
for (let i = 0; i < stmts.length; i += BATCH) {
  db.exec('BEGIN;');
  for (const stmt of stmts.slice(i, i + BATCH)) db.exec(stmt + ';');
  db.exec('COMMIT;');

  const pct = Math.round((Math.min(i + BATCH, total) / total) * 100);
  if (pct !== lastPct && pct % 10 === 0) {
    lastPct = pct;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ${String(pct).padStart(3)}%  (${elapsed}s)`);
  }
}

db.exec('PRAGMA foreign_keys=ON;');
console.log(`Done — ${total} statements in ${((Date.now() - start) / 1000).toFixed(1)}s`);
