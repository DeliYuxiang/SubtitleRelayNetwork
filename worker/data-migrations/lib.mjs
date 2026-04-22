import { DatabaseSync } from 'node:sqlite';

const LOCAL_PATH = process.env.LOCAL_DB_PATH;
if (!LOCAL_PATH) throw new Error('LOCAL_DB_PATH is required — data migrations always run locally against a SQLite snapshot');

const db = new DatabaseSync(LOCAL_PATH);

export function checkpoint() {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
}

export async function d1(sql, params = []) {
  const stmt = db.prepare(sql);
  const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

  if (isSelect) {
    const results = stmt.all(...params);
    return { results, success: true };
  } else {
    const info = stmt.run(...params);
    return {
      success: true,
      meta: { changes: info.changes, last_row_id: info.lastInsertRowid },
      results: [],
    };
  }
}
