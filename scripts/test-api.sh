#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
fi

RC_URL="${RC_URL:-http://localhost:3000}"
RC_USERNAME="${RC_USERNAME:-admin}"
RC_PASSWORD="${RC_PASSWORD:-change-me}"

echo "==> Logging in to $RC_URL"
LOGIN=$(curl -s -X POST "$RC_URL/api/v1/login" \
    -H "Content-Type: application/json" \
    -d "{\"user\":\"$RC_USERNAME\",\"password\":\"$RC_PASSWORD\"}")

USER_ID=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('userId',''))")
AUTH_TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('authToken',''))")

if [ -z "$USER_ID" ] || [ -z "$AUTH_TOKEN" ]; then
    echo "Login failed. Update RC_USERNAME/RC_PASSWORD in .env"
    echo "$LOGIN"
    exit 1
fi

echo "==> Server info"
curl -s "$RC_URL/api/v1/info" \
    -H "X-Auth-Token: $AUTH_TOKEN" \
    -H "X-User-Id: $USER_ID" | python3 -m json.tool

echo "==> Current user"
curl -s "$RC_URL/api/v1/me" \
    -H "X-Auth-Token: $AUTH_TOKEN" \
    -H "X-User-Id: $USER_ID" | python3 -m json.tool

echo "API test complete."
