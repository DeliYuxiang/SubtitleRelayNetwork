#!/usr/bin/env bash
# manual_rollback.sh — restore D1 from a backup and redeploy previous worker code.
#
# Usage (from repo root):
#   ./.github/workflows/scripts/manual_rollback.sh [backup-filename.sql]
#   ./.github/workflows/scripts/manual_rollback.sh   # uses latest backup

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WRANGLER="$REPO_ROOT/worker/node_modules/.bin/wrangler"
export WRANGLER_NON_INTERACTIVE=1

# ── Load env from worker/.env ─────────────────────────────────────────────────
ENV_FILE="$REPO_ROOT/worker/.env"
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
"$WRANGLER" r2 object get "$SRN_BACKUP_R2_NAME/$BACKUP_FILE" --file /tmp/rollback.sql --remote
echo "Downloaded to /tmp/rollback.sql"

# ── Drop all tables via D1 HTTP API (avoids wrangler stdin issues) ────────────

# ── Prepare wrangler config (substitute placeholders into a temp copy) ─────────
# Must live inside worker/ so wrangler resolves src/index.ts correctly.
WRANGLER_TMP="$REPO_ROOT/worker/.wrangler_deploy_tmp.jsonc"
trap 'rm -f "$WRANGLER_TMP"' EXIT
POW_SECRET=$(openssl rand -hex 16)
sed \
  -e "s/srn-d1-name-placeholder/$SRN_D1_NAME/g" \
  -e "s/srn-d1-id-placeholder/$SRN_D1_ID/g" \
  -e "s/srn-r2-name-placeholder/$SRN_R2_NAME/g" \
  -e "s/srn-backup-r2-name-placeholder/$SRN_BACKUP_R2_NAME/g" \
  -e "s/srn-search-limit-placeholder/${SRN_SEARCH_LIMIT:-3}/g" \
  -e "s/srn-default-limit-placeholder/${SRN_DEFAULT_LIMIT:-999}/g" \
  -e "s/srn-content-limit-placeholder/${SRN_CONTENT_LIMIT:-6}/g" \
  -e "s|srn-pubkey-whitelist-placeholder|${SRN_PUBKEY_WHITELIST:-}|g" \
  -e "s|srn-pow-difficulty-placeholder|${SRN_POW_DIFFICULTY:-0}|g" \
  -e "s|srn-pow-secret-placeholder|$POW_SECRET|g" \
  "$REPO_ROOT/worker/wrangler.jsonc" > "$WRANGLER_TMP"

echo ""
echo "── Step 2: Reset database ───────────────────────────────────────────────"
D1_API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/$SRN_D1_ID"

QUERY_OUT=$(curl -s "$D1_API/query" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT name FROM sqlite_master WHERE type=\u0027table\u0027 AND name NOT LIKE \u0027sqlite_%\u0027","params":[]}')
echo "sqlite_master response: $QUERY_OUT"

TABLES=$(echo "$QUERY_OUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
rows = data.get('result', [{}])[0].get('results', [])
# Skip Cloudflare-internal tables (e.g. _cf_KV) — REST API cannot drop them
for r in rows:
    if not r['name'].startswith('_cf_'):
        print(r['name'])
")

if [ -z "$TABLES" ]; then
  echo "ERROR: Could not enumerate tables from sqlite_master" >&2
  exit 1
fi
echo "Tables to drop: $TABLES"

# Write DROP statements to a file and execute via wrangler (handles large tables;
# running directly — not in $() — avoids the stdin-hang issue)
{
  echo "PRAGMA foreign_keys=OFF;"
  for t in $TABLES; do echo "DROP TABLE IF EXISTS \"$t\";"; done
  echo "PRAGMA foreign_keys=ON;"
} > /tmp/reset_db.sql
cat /tmp/reset_db.sql
"$WRANGLER" d1 execute "$SRN_D1_NAME" --remote --file=/tmp/reset_db.sql --yes --config "$WRANGLER_TMP"
echo "All tables dropped."

# ── Restore ───────────────────────────────────────────────────────────────────
echo ""
echo "── Step 3: Restore from backup ──────────────────────────────────────────"
cd "$REPO_ROOT/worker"
"$WRANGLER" d1 execute "$SRN_D1_NAME" --remote --file=/tmp/rollback.sql --yes --config "$WRANGLER_TMP"
echo "Database restored."

# ── Redeploy worker ───────────────────────────────────────────────────────────
echo ""
echo "── Step 4: Redeploy worker code ─────────────────────────────────────────"
if [ -z "$COMMIT_SHA" ]; then
  echo "WARNING: Could not extract commit SHA from backup filename — skipping code rollback." >&2
  echo "You may need to manually deploy the correct code version."
  exit 0
fi

git stash push --include-untracked -m "manual-rollback-tmp" 2>/dev/null || true
git checkout "$COMMIT_SHA"
cd "$REPO_ROOT/worker"
npm install --silent

# Regenerate config for the checked-out commit (wrangler.jsonc may differ)
POW_SECRET=$(openssl rand -hex 16)
sed \
  -e "s/srn-d1-name-placeholder/$SRN_D1_NAME/g" \
  -e "s/srn-d1-id-placeholder/$SRN_D1_ID/g" \
  -e "s/srn-r2-name-placeholder/$SRN_R2_NAME/g" \
  -e "s/srn-backup-r2-name-placeholder/$SRN_BACKUP_R2_NAME/g" \
  -e "s/srn-search-limit-placeholder/${SRN_SEARCH_LIMIT:-3}/g" \
  -e "s/srn-default-limit-placeholder/${SRN_DEFAULT_LIMIT:-999}/g" \
  -e "s/srn-content-limit-placeholder/${SRN_CONTENT_LIMIT:-6}/g" \
  -e "s|srn-pubkey-whitelist-placeholder|${SRN_PUBKEY_WHITELIST:-}|g" \
  -e "s|srn-pow-difficulty-placeholder|${SRN_POW_DIFFICULTY:-0}|g" \
  -e "s|srn-pow-secret-placeholder|$POW_SECRET|g" \
  wrangler.jsonc > "$WRANGLER_TMP"

"$WRANGLER" deploy --config "$WRANGLER_TMP" \
  --var MAINTENANCE_MODE:false \
  --var COMMIT_SHA:"$COMMIT_SHA" \
  --var RELAY_PUBLIC_KEY:"$RELAY_PUBLIC_KEY"

echo ""
echo "✓ Rollback complete — DB restored from $BACKUP_FILE, worker at $COMMIT_SHA"
