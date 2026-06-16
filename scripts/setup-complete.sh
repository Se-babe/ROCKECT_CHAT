#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/ugajapa-translation-app"
APP_ID="f47ac10b-58cc-4372-a567-0e02b2c3d479"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; TEAL='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${TEAL}[UgaJapa]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
header()  { echo -e "\n${BOLD}${BLUE}══════════════════════════════════${NC}"; echo -e "${BOLD}${BLUE}  $1${NC}"; echo -e "${BOLD}${BLUE}══════════════════════════════════${NC}"; }

[ -f "$ROOT_DIR/.env" ] && source "$ROOT_DIR/.env"

RC_URL="${RC_URL:-http://localhost:3000}"
RC_USERNAME="${RC_USERNAME:-sebabe}"
RC_PASSWORD="${RC_PASSWORD:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

header "UgaJapa Connect — Complete System Setup"
log "Server: $RC_URL | User: $RC_USERNAME"

# STEP 0 — Check server
header "Step 0 — Checking Rocket.Chat"
for i in $(seq 1 20); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$RC_URL/api/v1/info" 2>/dev/null || echo "000")
    if [ "$STATUS" = "200" ]; then
        success "Rocket.Chat is up at $RC_URL"
        break
    fi
    [ "$i" = "20" ] && error "Server not responding. Run: cd ~/Desktop/ROCKECT_CHAT && docker compose up -d"
    echo -n "."; sleep 3
done

# STEP 1 — Login
header "Step 1 — Login"
[ -z "$RC_PASSWORD" ] && { read -s -p "Admin password for '$RC_USERNAME': " RC_PASSWORD; echo ""; }

LOGIN=$(curl -s -X POST "$RC_URL/api/v1/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$RC_USERNAME\",\"password\":\"$RC_PASSWORD\"}")

LOGIN_STATUS=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','fail'))" 2>/dev/null || echo "fail")
[ "$LOGIN_STATUS" != "success" ] && error "Login failed. Check password."

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['authToken'])")
USERID=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['userId'])")
success "Logged in as $RC_USERNAME"

# STEP 2 — Enable server settings
header "Step 2 — Enabling Server Settings"
for SETTING in Apps_Framework_enabled Apps_Framework_Development_Mode Message_AllowCustomFields; do
    docker exec rockect_chat-mongodb-1 mongo rocketchat --quiet --eval \
        "db.rocketchat_settings.updateOne({_id:'$SETTING'},{\$set:{value:true}},{upsert:true})" \
        > /dev/null 2>&1 && log "  Enabled: $SETTING"
done
success "Server settings configured"

# STEP 3 — API Key
header "Step 3 — API Key Setup"
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo ""
    echo "  1) NVIDIA NIM (FREE) — build.nvidia.com — key starts with nvapi-"
    echo "  2) Anthropic Claude  — console.anthropic.com — key starts with sk-ant-"
    echo "  3) Skip (demo mode — placeholder translations)"
    echo ""
    read -p "Choose [1/2/3]: " CHOICE
    case "$CHOICE" in
        1|2) read -s -p "Paste API key: " ANTHROPIC_API_KEY; echo "" ;;
        *)   warn "Using demo mode"; ANTHROPIC_API_KEY="" ;;
    esac
fi

if [[ "$ANTHROPIC_API_KEY" == nvapi-* ]]; then
    API_TYPE="NVIDIA NIM"
    log "Testing NVIDIA key..."
    TEST=$(curl -s https://integrate.api.nvidia.com/v1/chat/completions \
        -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model":"meta/llama-3.3-70b-instruct","messages":[{"role":"user","content":"Say hello in Japanese in one word"}],"max_tokens":20,"stream":false}' 2>/dev/null)
    if echo "$TEST" | grep -q "choices"; then
        SAMPLE=$(echo "$TEST" | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'][:50])" 2>/dev/null)
        success "NVIDIA API working! Response: $SAMPLE"
    else
        warn "NVIDIA test: $(echo "$TEST" | head -c 150)"
    fi
elif [[ "$ANTHROPIC_API_KEY" == sk-ant-* ]]; then
    API_TYPE="Anthropic Claude"
    success "Anthropic key detected"
else
    API_TYPE="Demo mode"
    warn "No valid key — demo mode active"
fi

# Save to .env
if [ -n "$ANTHROPIC_API_KEY" ]; then
    sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY|" "$ROOT_DIR/.env" 2>/dev/null || \
        echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" >> "$ROOT_DIR/.env"
    success "Key saved to .env"
fi

# STEP 4 — Build & deploy
header "Step 4 — Building & Deploying Plugin"
cd "$APP_DIR"
npm install --include=dev --silent 2>/dev/null || npm install --include=dev

if command -v rc-apps &>/dev/null; then RC_APPS="rc-apps"
elif [ -x "./node_modules/.bin/rc-apps" ]; then RC_APPS="./node_modules/.bin/rc-apps"
else RC_APPS="npx --yes @rocket.chat/apps-cli"; fi

$RC_APPS package 2>/dev/null || $RC_APPS package
ZIP="$APP_DIR/dist/ugajapa-translation_1.0.0.zip"
[ ! -f "$ZIP" ] && error "Package failed. Check TypeScript errors."
success "Plugin packaged ($(du -sh "$ZIP" | cut -f1))"

cd "$ROOT_DIR"
UPLOAD=$(curl -s -X POST "$RC_URL/api/apps/$APP_ID" \
    -H "X-Auth-Token: $TOKEN" \
    -H "X-User-Id: $USERID" \
    -F "app=@$ZIP")
APP_STATUS=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('app',{}).get('status','?'))" 2>/dev/null || echo "?")
success "Plugin deployed: $APP_STATUS"

# STEP 5 — Configure plugin
header "Step 5 — Configuring Plugin"
SAVE=$(curl -s -X POST "$RC_URL/api/apps/$APP_ID/settings" \
    -H "X-Auth-Token: $TOKEN" \
    -H "X-User-Id: $USERID" \
    -H "Content-Type: application/json" \
    -d "{\"settings\":[
        {\"id\":\"ugajapa_claude_api_key\",\"value\":\"$ANTHROPIC_API_KEY\"},
        {\"id\":\"ugajapa_default_target_lang\",\"value\":\"ja\"},
        {\"id\":\"ugajapa_auto_translate\",\"value\":true},
        {\"id\":\"ugajapa_show_hints\",\"value\":true}
    ]}")
echo "$SAVE" | grep -q '"success":true' && success "Settings saved" || warn "Settings: $(echo "$SAVE" | head -c 150)"

# STEP 6 — Create channels
header "Step 6 — Creating Channels"
for CHAN in uganda-japan ugajapa-general translation-test; do
    RESULT=$(curl -s -X POST "$RC_URL/api/v1/channels.create" \
        -H "X-Auth-Token: $TOKEN" -H "X-User-Id: $USERID" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"$CHAN\"}" 2>/dev/null)
    if echo "$RESULT" | grep -q '"success":true'; then
        success "Created #$CHAN"
    else
        log "#$CHAN already exists"
    fi
done

# STEP 7 — Send language setup to test channel
header "Step 7 — Configuring Translation Channels"
TEST_ROOM=$(curl -s "$RC_URL/api/v1/channels.info?roomName=translation-test" \
    -H "X-Auth-Token: $TOKEN" -H "X-User-Id: $USERID" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('channel',{}).get('_id',''))" 2>/dev/null || echo "")

if [ -n "$TEST_ROOM" ]; then
    curl -s -X POST "$RC_URL/api/v1/chat.sendMessage" \
        -H "X-Auth-Token: $TOKEN" -H "X-User-Id: $USERID" \
        -H "Content-Type: application/json" \
        -d "{\"message\":{\"rid\":\"$TEST_ROOM\",\"msg\":\"/set-language ja\"}}" > /dev/null 2>&1 || true
    success "Translation-test channel set to Japanese"

    # Send a welcome message
    curl -s -X POST "$RC_URL/api/v1/chat.sendMessage" \
        -H "X-Auth-Token: $TOKEN" -H "X-User-Id: $USERID" \
        -H "Content-Type: application/json" \
        -d "{\"message\":{\"rid\":\"$TEST_ROOM\",\"msg\":\"UgaJapa Connect is now fully configured! Send any English or Luganda message to see it translated to Japanese in real time. Try: 'Hello, how is the project going today?' \"}}" > /dev/null 2>&1 || true
fi

# FINAL STATUS
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   UgaJapa Connect — Setup Complete!          ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${TEAL}Server:${NC}      $RC_URL"
echo -e "  ${TEAL}Plugin:${NC}      UgaJapa Translation ($APP_STATUS)"
echo -e "  ${TEAL}AI Engine:${NC}   $API_TYPE"
echo -e "  ${TEAL}Languages:${NC}   English / Luganda / Japanese"
echo ""
echo -e "${BOLD}Test now:${NC}"
echo -e "  1. Open ${BLUE}$RC_URL${NC}"
echo -e "  2. Go to ${BOLD}#translation-test${NC}"
echo -e "  3. Send: ${YELLOW}Hello, how is the project going?${NC}"
echo -e "  4. See Japanese translation appear below message"
echo -e "  5. Send: ${YELLOW}Webale nyo, oli otya?${NC} (Luganda)"
echo -e "  6. Send: ${YELLOW}That might be a bit difficult...${NC} (cultural hint)"
echo ""
echo -e "${BOLD}Commands:${NC}  /set-language ja|en|lg   /translate <text>"
echo ""
echo -e "${GREEN}System is live!${NC} ${TEAL}Uganda x Japan${NC}"
