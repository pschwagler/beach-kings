#!/usr/bin/env bash

set -euo pipefail

origin="${1:?usage: verify-public-web-routes.sh <origin>}"
origin="${origin%/}"

readonly required_paths=(
  "/support"
  "/community-guidelines"
  "/terms-of-service"
  "/privacy-policy"
)

for path in "${required_paths[@]}"; do
  url="${origin}${path}"
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url")"
  if [[ "$status" != "200" ]]; then
    echo "Required public page failed: ${url} returned HTTP ${status}" >&2
    exit 1
  fi
  echo "Verified ${url}"
done
