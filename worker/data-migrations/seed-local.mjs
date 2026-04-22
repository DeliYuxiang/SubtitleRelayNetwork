// seed-local.mjs — Reset and seed the local D1 SQLite from a SQL dump.
//
// wrangler d1 execute --local hangs on large SQL files (miniflare parses
// statements one-by-one). This script uses node:sqlite to exec the dump
// directly, which is orders of magnitude faster.
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
const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  )
  .all();

db.exec('PRAGMA foreign_keys=OFF;');
for (const { name } of tables) db.exec(`DROP TABLE IF EXISTS "${name}";`);
db.exec(readFileSync(BACKUP_FILE, 'utf8'));
db.exec('PRAGMA foreign_keys=ON;');

console.log(`Seeded ${BACKUP_FILE} → ${LOCAL_DB_PATH} (${tables.length} tables replaced)`);
