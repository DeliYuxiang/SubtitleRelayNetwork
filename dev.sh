#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/worker"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

exec npm run dev:test -- "$@"
