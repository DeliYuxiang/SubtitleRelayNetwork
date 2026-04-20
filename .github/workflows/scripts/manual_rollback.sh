#!/usr/bin/env bash
# manual_rollback.sh — restore D1 from a backup and redeploy previous worker code.
#
# Usage:
#   ./manual_rollback.sh [backup-filename.sql]
#   ./manual_rollback.sh            # uses latest backup
#
# Required env vars (copy from .env or set inline):
#   CLOUDFLARE_ACCOUNT_ID
#   CLOUDFLARE_API_TOKEN
#   SRN_D1_NAME
#   SRN_D1_ID
#   SRN_R2_NAME
#   SRN_BACKUP_R2_NAME
#   RELAY_PUBLIC_KEY
#
# Must be run from the repo root.

set -euo pipefail

# ── Load env from worker/.env ─────────────────────────────────────────────────
ENV_FILE="$(git rev-parse --show-toplevel)/worker/.env"
if [ -f "$ENV_FILE" ]; then
  echo "→ Loading env from $ENV_FILE"
  set -a
  # shellcheck source=../../../worker/.env
  source "$ENV_FILE"
  set +a
else
  echo "WARNING: $ENV_FILE not found — falling back to shell environment" >&2
fi

# ── Validate env ──────────────────────────────────────────────────────────────
for var in CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN SRN_D1_NAME SRN_D1_ID SRN_R2_NAME SRN_BACKUP_R2_NAME RELAY_PUBLIC_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set (add it to worker/.env)" >&2
    exit 1
  fi
done

# ── Resolve backup file ───────────────────────────────────────────────────────
BACKUP_FILE="${1:-latest}"

if [ "$BACKUP_FILE" = "latest" ]; then
  echo "→ Searching for latest backup in R2..."
  BACKUP_FILE=$(curl -s \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/$SRN_BACKUP_R2_NAME/objects?prefix=backup-" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    | python3 -c "import json,sys; objs=json.load(sys.stdin)['result']['objects']; print(sorted(objs, key=lambda o: o['key'])[-1]['key'])")
  echo "→ Latest backup: $BACKUP_FILE"
fi

COMMIT_SHA=$(echo "$BACKUP_FILE" | grep -oE "[a-f0-9]{7}" | tail -n 1 || true)
echo "→ Target backup : $BACKUP_FILE"
echo "→ Backup commit : ${COMMIT_SHA:-unknown}"

# ── Download backup ───────────────────────────────────────────────────────────
echo ""
echo "── Step 1: Download backup ──────────────────────────────────────────────"
wrangler r2 object get "$SRN_BACKUP_R2_NAME/$BACKUP_FILE" --file /tmp/rollback.sql
echo "Downloaded to /tmp/rollback.sql"

# ── Drop all tables ───────────────────────────────────────────────────────────
echo ""
echo "── Step 2: Reset database ───────────────────────────────────────────────"
QUERY_OUT=$(wrangler d1 execute "$SRN_D1_NAME" --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'" \
  --json 2>&1)

TABLES=$(echo "$QUERY_OUT" | python3 .github/workflows/scripts/parse_table_names.py)

if [ -z "$TABLES" ]; then
  echo "ERROR: Could not enumerate tables from sqlite_master" >&2
  echo "Raw output: $QUERY_OUT" >&2
  exit 1
fi

echo "Tables to drop: $TABLES"
{
  echo "PRAGMA foreign_keys=OFF;"
  for t in $TABLES; do echo "DROP TABLE IF EXISTS \"$t\";"; done
  echo "PRAGMA foreign_keys=ON;"
} > /tmp/reset_db.sql

wrangler d1 execute "$SRN_D1_NAME" --remote --file=/tmp/reset_db.sql --yes

# ── Restore ───────────────────────────────────────────────────────────────────
echo ""
echo "── Step 3: Restore from backup ──────────────────────────────────────────"
wrangler d1 execute "$SRN_D1_NAME" --remote --file=/tmp/rollback.sql --yes
echo "Database restored."

# ── Redeploy worker ───────────────────────────────────────────────────────────
echo ""
echo "── Step 4: Redeploy worker code ─────────────────────────────────────────"
if [ -z "$COMMIT_SHA" ]; then
  echo "WARNING: Could not extract commit SHA from backup filename — skipping code rollback." >&2
  echo "You may need to manually deploy the correct code version."
  exit 0
fi

git checkout "$COMMIT_SHA"
cd worker
npm install --silent

sed -i "s/srn-d1-name-placeholder/$SRN_D1_NAME/g"               wrangler.jsonc
sed -i "s/srn-d1-id-placeholder/$SRN_D1_ID/g"                   wrangler.jsonc
sed -i "s/srn-r2-name-placeholder/$SRN_R2_NAME/g"               wrangler.jsonc
sed -i "s/srn-backup-r2-name-placeholder/$SRN_BACKUP_R2_NAME/g" wrangler.jsonc
sed -i "s/srn-search-limit-placeholder/${SRN_SEARCH_LIMIT:-3}/g"   wrangler.jsonc
sed -i "s/srn-default-limit-placeholder/${SRN_DEFAULT_LIMIT:-999}/g" wrangler.jsonc
sed -i "s/srn-content-limit-placeholder/${SRN_CONTENT_LIMIT:-6}/g"  wrangler.jsonc
sed -i "s|srn-pubkey-whitelist-placeholder|${SRN_PUBKEY_WHITELIST:-}|g" wrangler.jsonc
sed -i "s|srn-pow-difficulty-placeholder|${SRN_POW_DIFFICULTY:-0}|g"   wrangler.jsonc
POW_SECRET=$(openssl rand -hex 16)
sed -i "s|srn-pow-secret-placeholder|$POW_SECRET|g" wrangler.jsonc

npx wrangler deploy \
  --var MAINTENANCE_MODE:false \
  --var COMMIT_SHA:"$COMMIT_SHA" \
  --var RELAY_PUBLIC_KEY:"$RELAY_PUBLIC_KEY"

echo ""
echo "✓ Rollback complete — DB restored from $BACKUP_FILE, worker at $COMMIT_SHA"
