#!/bin/bash
set -e

# Load environment variables from .env if it exists
if [ -f .env ]; then
  echo "📂 Loading environment variables from .env"
  # This pattern avoids exporting comments and empty lines
  export $(grep -v '^#' .env | xargs)
fi

DB_NAME=${SRN_D1_NAME:-"srn-d1-name-placeholder"}

# Function to pull remote snapshot
pull_remote_db() {
    echo "📥 Exporting remote D1 database ($DB_NAME)..."
    npx wrangler d1 export "$DB_NAME" --remote --output=.remote_dump.sql

    # wrangler d1 execute --local hangs on large SQL files; bootstrap the DB path
    # with migrations apply, then seed via node:sqlite directly.
    echo "🛠️  Initializing local D1..."
    npx wrangler d1 migrations apply DB --local -c wrangler.test.jsonc

    LOCAL_DB_SEED=$(find .wrangler/state/v3/d1 -type f -name '*.sqlite' ! -name 'metadata.sqlite' 2>/dev/null | head -1)
    if [ -z "$LOCAL_DB_SEED" ]; then
        echo "⚠️  Local D1 SQLite not found after migrations apply" >&2
        rm .remote_dump.sql
        return 1
    fi

    echo "📤 Importing snapshot into local D1..."
    LOCAL_DB_PATH="$LOCAL_DB_SEED" BACKUP_FILE=.remote_dump.sql node data-migrations/seed-local.mjs

    echo "🛠️  Applying new SQL migrations on top of snapshot..."
    npx wrangler d1 migrations apply DB --local -c wrangler.test.jsonc

    echo "✅ Sync complete. Cleaning up..."
    rm .remote_dump.sql
}

# Determine if we should pull
PULL_CONFIRMED="n"
if [[ "$1" == "--pull" ]]; then
    PULL_CONFIRMED="y"
else
    # Prompt user for snapshot
    read -p "❓ Would you like to pull a fresh snapshot from remote D1? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        PULL_CONFIRMED="y"
    fi
fi

if [[ "$PULL_CONFIRMED" == "y" ]]; then
    pull_remote_db
else
    # Ensure migrations are applied to local D1 (normal flow)
    echo "🛠️  Applying D1 migrations to local database..."
    npx wrangler d1 migrations apply DB --local -c wrangler.test.jsonc
fi

# Run data migrations against the local SQLite (idempotent — skips already-run migrations).
# When pulling from remote the _srn_migrations table comes with the dump, so this is a no-op.
LOCAL_DB=$(find .wrangler/state/v3/d1 -type f -name '*.sqlite' ! -name 'metadata.sqlite' 2>/dev/null | head -1)
if [ -n "$LOCAL_DB" ]; then
    echo "🗃️  Running data migrations against local DB..."
    LOCAL_DB_PATH="$LOCAL_DB" node data-migrations/run.mjs
else
    echo "⚠️  Local D1 SQLite not found — skipping data migrations"
fi

# Start wrangler dev with the test configuration
echo "🚀 Starting worker in local development mode..."
npx wrangler dev -c wrangler.test.jsonc --persist
