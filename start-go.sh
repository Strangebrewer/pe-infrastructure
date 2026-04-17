#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MIGRATE=false
for arg in "$@"; do
  case $arg in
    -m|--migrate) MIGRATE=true ;;
  esac
done

docker compose up -d --wait

if [ "$MIGRATE" = true ]; then
  (cd ../backend/go-auth && go run ./cmd/migrate up)
  (cd ../backend/go-job-search && go run ./cmd/migrate up)
  (cd ../backend/go-budget && go run ./cmd/migrate up)
fi

pnpm run serve
