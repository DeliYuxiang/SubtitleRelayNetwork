import { DatabaseSync } from 'node:sqlite';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;
const DB_ID      = process.env.SRN_D1_ID;
const LOCAL_PATH = process.env.LOCAL_DB_PATH;

let localDb = null;
if (LOCAL_PATH) {
  localDb = new DatabaseSync(LOCAL_PATH);
}

export async function d1(sql, params = []) {
  if (localDb) {
    const stmt = localDb.prepare(sql);
    const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

    if (isSelect) {
      const results = stmt.all(...params);
      return { results, success: true };
    } else {
      const info = stmt.run(...params);
      return {
        success: true,
        meta: { changes: info.changes, last_row_id: info.lastInsertRowid },
        results: []
      };
    }
  }

  // Remote D1 API
  if (!ACCOUNT_ID || !API_TOKEN || !DB_ID) {
    throw new Error('Missing required env vars for remote D1: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, SRN_D1_ID');
  }
  const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}`;
  const res = await fetch(`${BASE}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`D1 error: ${JSON.stringify(data.errors)}\nSQL: ${sql}`);
  return data.result[0];
}
