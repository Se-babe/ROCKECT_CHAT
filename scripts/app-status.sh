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
USERID=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('userId',''))")

if [ -z "$TOKEN" ]; then
    echo "Login failed for $RC_USERNAME on $RC_URL"
    exit 1
fi

RESPONSE=$(curl -s "$RC_URL/api/apps/installed" \
    -H "X-Auth-Token: $TOKEN" \
    -H "X-User-Id: $USERID")

echo "$RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
apps = data.get('apps', [])
print(f'Installed via API: {len(apps)} app(s)')
for app in apps:
    print(f\"  - {app.get('name')} v{app.get('version')} [{app.get('status')}] private={app.get('private')}\")
print()
print('If Marketplace UI is empty, the app is still installed. Open these on the SAME port as RC_URL:')
print(f'  Installed info: $RC_URL/admin/marketplace/installed/info/$APP_ID')
print(f'  Settings:       $RC_URL/admin/marketplace/installed/$APP_ID/settings')
print()
print('Do NOT re-upload via Private Apps if CLI deploy already succeeded.')
print('Use ./scripts/deploy-app.sh for updates instead of the UI upload dialog.')
"
