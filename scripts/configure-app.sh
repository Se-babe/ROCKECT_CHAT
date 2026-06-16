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
GEMINI_API_KEY="${GEMINI_API_KEY:-}"

LOGIN=$(curl -s -X POST "$RC_URL/api/v1/login" \
    -H "Content-Type: application/json" \
    -d "{\"user\":\"$RC_USERNAME\",\"password\":\"$RC_PASSWORD\"}")

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('authToken',''))")
USERID=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('userId',''))")

if [ -z "$TOKEN" ]; then
    echo "Login failed for $RC_USERNAME on $RC_URL"
    exit 1
fi

if [ -z "$GEMINI_API_KEY" ]; then
    echo "Paste your Gemini API key (AIza...) for voice/video translation:"
    read -r GEMINI_API_KEY
fi

SETTINGS=$(python3 - <<PY
import json, os
settings = [
    {"id": "ugajapa_claude_api_key", "value": os.environ.get("ANTHROPIC_API_KEY", "")},
    {"id": "ugajapa_gemini_api_key", "value": os.environ.get("GEMINI_API_KEY", "")},
    {"id": "ugajapa_default_target_lang", "value": "ja"},
    {"id": "ugajapa_auto_translate", "value": True},
    {"id": "ugajapa_show_hints", "value": True},
    {"id": "ugajapa_translate_voice", "value": True},
]
print(json.dumps({"settings": settings}))
PY
)

SAVE=$(curl -s -X POST "$RC_URL/api/apps/$APP_ID/settings" \
    -H "X-Auth-Token: $TOKEN" \
    -H "X-User-Id: $USERID" \
    -H "Content-Type: application/json" \
    -d "$SETTINGS")

echo "$SAVE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Settings saved.' if d.get('success') else d)"
