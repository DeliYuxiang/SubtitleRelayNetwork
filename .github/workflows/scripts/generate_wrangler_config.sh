#!/usr/bin/env bash
# generate_wrangler_config.sh — emit a complete wrangler config for CI use.
#
# Usage:
#   generate_wrangler_config.sh <output_file>           # production config
#   generate_wrangler_config.sh <output_file> --preview # preview config
#
# Production reads:
#   SRN_D1_NAME, SRN_D1_ID, SRN_R2_NAME, SRN_BACKUP_R2_NAME,
#   SRN_PUBKEY_WHITELIST, SRN_POW_DIFFICULTY, SRN_POW_SECRET
#
# Preview reads:
#   SRN_PREVIEW_D1_NAME, SRN_PREVIEW_D1_ID, SRN_PREVIEW_R2_NAME,
#   SRN_PUBKEY_WHITELIST, SRN_POW_DIFFICULTY, SRN_POW_SECRET
#
# Output is never committed to git (add wrangler.production.jsonc and
# wrangler.preview.jsonc to .gitignore).
#
# shellcheck source=/dev/null
set -euo pipefail

OUTPUT="${1:?Usage: generate_wrangler_config.sh <output_file> [--preview]}"
MODE="${2:-}"

if [ "$MODE" = "--preview" ]; then
  D1_NAME="${SRN_PREVIEW_D1_NAME:?SRN_PREVIEW_D1_NAME is required for preview config}"
  D1_ID="${SRN_PREVIEW_D1_ID:?SRN_PREVIEW_D1_ID is required for preview config}"
  R2_NAME="${SRN_PREVIEW_R2_NAME:?SRN_PREVIEW_R2_NAME is required for preview config}"
  BACKUP_R2_NAME="${SRN_PREVIEW_R2_NAME}"  # preview reuses the same bucket for backup
  WORKER_NAME="srn-worker-preview"
  # Preview: all rate limits relaxed; separate namespace_ids isolate counters from prod
  SEARCH_LIMIT=999
  DEFAULT_LIMIT=999
  CONTENT_LIMIT=999
  NS_SEARCH=2001
  NS_DEFAULT=2002
  NS_CONTENT=2003
else
  D1_NAME="${SRN_D1_NAME:?SRN_D1_NAME is required}"
  D1_ID="${SRN_D1_ID:?SRN_D1_ID is required}"
  R2_NAME="${SRN_R2_NAME:?SRN_R2_NAME is required}"
  BACKUP_R2_NAME="${SRN_BACKUP_R2_NAME:?SRN_BACKUP_R2_NAME is required}"
  WORKER_NAME="srn-worker"
  SEARCH_LIMIT=3
  DEFAULT_LIMIT=999
  CONTENT_LIMIT=6
  NS_SEARCH=1001
  NS_DEFAULT=1002
  NS_CONTENT=1003
fi

PUBKEY_WHITELIST="${SRN_PUBKEY_WHITELIST:-}"
POW_DIFFICULTY="${SRN_POW_DIFFICULTY:-0}"
POW_SECRET="${SRN_POW_SECRET:?SRN_POW_SECRET is required}"
CORS_ORIGINS="${CORS_ORIGINS:-}"
FRONTEND_URL="${FRONTEND_URL:-}"

cat > "$OUTPUT" << EOF
{
  "\$schema": "node_modules/wrangler/config-schema.json",
  "name": "${WORKER_NAME}",
  "main": "src/index.ts",
  "compatibility_date": "2024-04-05",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "${D1_NAME}",
      "database_id": "${D1_ID}",
      "migrations_dir": "migrations"
    }
  ],
  "r2_buckets": [
    { "binding": "BUCKET",        "bucket_name": "${R2_NAME}" },
    { "binding": "BACKUP_BUCKET", "bucket_name": "${BACKUP_R2_NAME}" }
  ],
  "observability": { "enabled": true },
  "vars": {
    "SRN_PUBKEY_WHITELIST": "${PUBKEY_WHITELIST}",
    "SRN_POW_DIFFICULTY":   "${POW_DIFFICULTY}",
    "SRN_POW_SECRET":       "${POW_SECRET}",
    "CORS_ORIGINS":         "${CORS_ORIGINS}",
    "FRONTEND_URL":         "${FRONTEND_URL}"
  },
  "unsafe": {
    "bindings": [
      { "name": "SEARCH_LIMITER",  "type": "ratelimit", "namespace_id": "${NS_SEARCH}",  "simple": { "limit": ${SEARCH_LIMIT},  "period": 60 } },
      { "name": "DEFAULT_LIMITER", "type": "ratelimit", "namespace_id": "${NS_DEFAULT}", "simple": { "limit": ${DEFAULT_LIMIT}, "period": 60 } },
      { "name": "CONTENT_LIMITER", "type": "ratelimit", "namespace_id": "${NS_CONTENT}", "simple": { "limit": ${CONTENT_LIMIT}, "period": 60 } }
    ]
  }
}
EOF

echo "Generated ${OUTPUT} (worker: ${WORKER_NAME}, D1: ${D1_NAME})"
