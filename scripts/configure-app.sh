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
NVIDIA_API_KEY="${NVIDIA_API_KEY:-${ANTHROPIC_API_KEY:-}}"

LOGIN=$(curl -s -X POST "$RC_URL/api/v1/login" \
    -H "Content-Type: application/json" \
    -d "{\"user\":\"$RC_USERNAME\",\"password\":\"$RC_PASSWORD\"}")

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('authToken',''))")
USERID=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('userId',''))")

if [ -z "$TOKEN" ]; then
    echo "Login failed for $RC_USERNAME on $RC_URL"
    exit 1
fi

if [ -z "$NVIDIA_API_KEY" ]; then
    echo "Paste your NVIDIA NIM API key (nvapi-...):"
    read -r NVIDIA_API_KEY
fi

if [[ ! "$NVIDIA_API_KEY" =~ ^nvapi- ]]; then
    echo "Invalid key format. Get a key from https://build.nvidia.com/settings/api-keys"
    echo "It must start with nvapi-"
    exit 1
fi

if [ "${SKIP_NVIDIA_TEST:-}" != "1" ]; then
    echo "Testing NVIDIA API key..."
    NVIDIA_TEST=$(curl -s -o /tmp/nvidia_test.json -w "%{http_code}" \
        "https://integrate.api.nvidia.com/v1/models" \
        -H "Authorization: Bearer $NVIDIA_API_KEY")

    if [ "$NVIDIA_TEST" != "200" ]; then
        echo "NVIDIA API test failed (HTTP $NVIDIA_TEST)."
        python3 -c "import json; d=json.load(open('/tmp/nvidia_test.json')); print(d)" 2>/dev/null || cat /tmp/nvidia_test.json
        echo ""
        echo "To save without testing: SKIP_NVIDIA_TEST=1 NVIDIA_API_KEY='...' ./scripts/configure-app.sh"
        exit 1
    fi
    echo "NVIDIA API key verified."
fi

export NVIDIA_API_KEY

SETTINGS=$(python3 - <<PY
import json, os
settings = [
    {"id": "ugajapa_claude_api_key", "value": os.environ.get("NVIDIA_API_KEY", "")},
    {"id": "ugajapa_default_target_lang", "value": "ja"},
    {"id": "ugajapa_auto_translate", "value": True},
    {"id": "ugajapa_show_hints", "value": True},
    {"id": "ugajapa_translate_voice", "value": True},
    {"id": "ugajapa_stt_endpoint", "value": ""},
    {"id": "ugajapa_tts_endpoint", "value": ""},
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
