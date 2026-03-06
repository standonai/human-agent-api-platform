#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Running startup validation smoke test..."

set +e
OUTPUT="$(
  NODE_ENV=production \
  APP_PROFILE=core \
  STRICT_STARTUP_VALIDATION=true \
  JWT_SECRET= \
  ALLOWED_ORIGINS= \
  node --import tsx src/server.ts 2>&1
)"
EXIT_CODE=$?
set -e

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "Expected startup to fail under invalid strict config, but it succeeded."
  exit 1
fi

if ! grep -q "Startup validation failed. Fix the following environment settings" <<<"$OUTPUT"; then
  echo "Missing startup diagnostics header."
  echo "$OUTPUT"
  exit 1
fi

if ! grep -q "JWT_SECRET" <<<"$OUTPUT"; then
  echo "Missing JWT_SECRET diagnostic."
  echo "$OUTPUT"
  exit 1
fi

if ! grep -q "ALLOWED_ORIGINS" <<<"$OUTPUT"; then
  echo "Missing ALLOWED_ORIGINS diagnostic."
  echo "$OUTPUT"
  exit 1
fi

echo "Startup validation smoke test passed."
