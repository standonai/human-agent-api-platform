#!/usr/bin/env bash
set -euo pipefail

echo "Running production environment preflight..."

errors=()

require_set() {
  local key="$1"
  local value="${!key:-}"
  if [[ -z "${value}" ]]; then
    errors+=("${key} must be set")
  fi
}

reject_contains() {
  local key="$1"
  local needle="$2"
  local value="${!key:-}"
  if [[ -n "${value}" && "${value}" == *"${needle}"* ]]; then
    errors+=("${key} contains placeholder value '${needle}'")
  fi
}

require_set "JWT_SECRET"
require_set "ALLOWED_ORIGINS"
require_set "DATABASE_URL"

reject_contains "JWT_SECRET" "change-me"
reject_contains "JWT_SECRET" "dev-secret"

if [[ "${DATABASE_URL:-}" == "./data/platform.db" ]]; then
  errors+=("DATABASE_URL must not use default ./data/platform.db in production")
fi

if [[ "${ENFORCE_HTTPS:-false}" == "true" && "${TRUST_PROXY:-false}" == "false" ]]; then
  errors+=("TRUST_PROXY must be configured when ENFORCE_HTTPS=true")
fi

if [[ "${APP_PROFILE:-core}" == "full" && "${FULL_PROFILE_STRICT:-false}" == "true" ]]; then
  if [[ "${GATEWAY_PROVIDER:-none}" != "none" && "${GATEWAY_PROVIDER:-none}" != "aws" ]]; then
    require_set "GATEWAY_ADMIN_URL"
  fi
fi

if [[ ${#errors[@]} -gt 0 ]]; then
  echo "❌ Production preflight failed:"
  for err in "${errors[@]}"; do
    echo "   - ${err}"
  done
  exit 1
fi

echo "✅ Production environment preflight passed."
