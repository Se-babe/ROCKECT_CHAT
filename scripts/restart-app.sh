#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="f47ac10b-58cc-4372-a567-0e02b2c3d479"

if [ -f "$ROOT_DIR/.env" ]; then
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
fi

RC_URL="${RC_URL:-http://localhost:3001}"
RC_USERNAME="${RC_USERNAME:-admin}"
RC_PASSWORD="${RC_PASSWORD:-change-me}"

LOGIN=$(curl -s -X POST "$RC_URL/api/v1/login" \
    -H "Content-Type: application/json" \
    -d "{\"user\":\"$RC_USERNAME\",\"password\":\"$RC_PASSWORD\"}")

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('authToken',''))")
USERID=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('userId',''))")

if [ -z "$TOKEN" ]; then
    echo "Login failed for $RC_USERNAME on $RC_URL"
    exit 1
fi

set_status() {
    curl -s -X POST "$RC_URL/api/apps/$APP_ID/status" \
        -H "X-Auth-Token: $TOKEN" \
        -H "X-User-Id: $USERID" \
        -H "Content-Type: application/json" \
        -d "{\"status\":\"$1\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('status ->', d.get('status') or d.get('error'))"
}

echo "Disabling app to refresh runtime permissions..."
set_status manually_disabled
sleep 2
echo "Re-enabling app..."
set_status manually_enabled
echo "Done. Try a voice/video message again."
