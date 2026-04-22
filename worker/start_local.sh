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
    # Export remote DB to a temporary SQL file
    npx wrangler d1 export "$DB_NAME" --remote --output=.remote_dump.sql
    
    echo "📤 Importing snapshot into local D1..."
    # Execute the dump against the local instance
    # Note: This will create tables if they don't exist, but might conflict if they do.
    # For a clean sync, one might want to delete .wrangler/state first, but we'll try direct execution.
    npx wrangler d1 execute DB --local --file=.remote_dump.sql -c wrangler.test.jsonc
    
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
LOCAL_DB=$(find .wrangler/state/v3/d1 -name 'db.sqlite' 2>/dev/null | head -1)
if [ -n "$LOCAL_DB" ]; then
    echo "🗃️  Running data migrations against local DB..."
    LOCAL_DB_PATH="$LOCAL_DB" node data-migrations/run.mjs
else
    echo "⚠️  Local D1 SQLite not found — skipping data migrations"
fi

# Start wrangler dev with the test configuration
echo "🚀 Starting worker in local development mode..."
npx wrangler dev -c wrangler.test.jsonc --persist
