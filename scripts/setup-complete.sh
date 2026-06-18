#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  UgaJapa Connect — Complete System Setup Script
#  Run this once to configure everything end-to-end
#  Usage: bash scripts/setup-complete.sh
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/ugajapa-translation-app"
APP_ID="f47ac10b-58cc-4372-a567-0e02b2c3d479"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
TEAL='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "${TEAL}[UgaJapa]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
header()  { echo -e "\n${BOLD}${BLUE}══════════════════════════════════════${NC}"; echo -e "${BOLD}${BLUE}  $1${NC}"; echo -e "${BOLD}${BLUE}══════════════════════════════════════${NC}"; }

# Load .env
if [ -f "$ROOT_DIR/.env" ]; then
    source "$ROOT_DIR/.env"
fi

RC_URL="${RC_URL:-http://localhost:3000}"
RC_USERNAME="${RC_USERNAME:-admin}"
RC_PASSWORD="${RC_PASSWORD:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

header "UgaJapa Connect — Complete System Setup"
echo ""
log "Root:    $ROOT_DIR"
log "App:     $APP_DIR"
log "Server:  $RC_URL"
echo ""

# ─── STEP 0: Check Docker is running ──────────────────────────────
header "Step 0 — Verifying Docker & Rocket.Chat"

if ! docker compose -f "$ROOT_DIR/docker-compose.yml" ps | grep -q "running\|Up"; then
    warn "Rocket.Chat not running. Starting..."
    cd "$ROOT_DIR"
    docker compose up -d
    log "Waiting 40 seconds for server to start..."
    sleep 40
fi

# Wait for RC to respond
MAX=30
for i in $(seq 1 $MAX); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$RC_URL/api/v1/info" 2>/dev/null || echo "000")
    if [ "$STATUS" = "200" ]; then
        success "Rocket.Chat is responding at $RC_URL"
        break
    fi
    if [ "$i" = "$MAX" ]; then
        error "Rocket.Chat did not respond after ${MAX} attempts. Check: docker compose logs rocketchat"
    fi
    echo -n "."
    sleep 3
done

# ─── STEP 1: Login ────────────────────────────────────────────────
header "Step 1 — Authenticating"

if [ -z "$RC_PASSWORD" ]; then
    read -s -p "Enter Rocket.Chat admin password for user '$RC_USERNAME': " RC_PASSWORD
    echo ""
fi

LOGIN=$(curl -s -X POST "$RC_URL/api/v1/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$RC_USERNAME\",\"password\":\"$RC_PASSWORD\"}")

LOGIN_STATUS=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','fail'))" 2>/dev/null || echo "fail")

if [ "$LOGIN_STATUS" != "success" ]; then
    error "Login failed. Check RC_USERNAME and RC_PASSWORD in .env file."
fi

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['authToken'])")
USERID=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['userId'])")
USERNAME=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['me']['username'])")

success "Logged in as: $USERNAME (ID: $USERID)"

# ─── STEP 2: Ensure admin role ────────────────────────────────────
header "Step 2 — Verifying Admin Role"

ROLES=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join(d['data']['me'].get('roles',[])))" 2>/dev/null || echo "")

if echo "$ROLES" | grep -q "admin"; then
    success "User has admin role: $ROLES"
else
    warn "User missing admin role. Granting via MongoDB..."
    docker exec -it rockect_chat-mongodb-1 mongo rocketchat --quiet --eval \
        "db.users.updateOne({username:'$RC_USERNAME'},{\$set:{roles:['admin','user']}})" \
        2>/dev/null || warn "Could not update role via MongoDB (may already be admin)"
    warn "Please logout and login again in browser if admin panel is still inaccessible."
fi

# ─── STEP 3: Enable required settings ─────────────────────────────
header "Step 3 — Enabling Required Server Settings"

SETTINGS=(
    "Apps_Framework_enabled:true"
    "Apps_Framework_Development_Mode:true"
    "Message_AllowCustomFields:true"
    "Message_CustomFields:ugajapa_translation:string"
    "Apps_Logs_Level:2"
)

for setting in "${SETTINGS[@]}"; do
    KEY="${setting%%:*}"
    VAL="${setting#*:}"
    docker exec rockect_chat-mongodb-1 mongo rocketchat --quiet --eval \
        "db.rocketchat_settings.updateOne({_id:'$KEY'},{\$set:{value:true}},{upsert:true})" \
        > /dev/null 2>&1 && log "  Set $KEY = $VAL" || warn "  Could not set $KEY"
done

success "Server settings configured"

# ─── STEP 4: Get API key ──────────────────────────────────────────
header "Step 4 — Configuring AI Translation API Key"

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo ""
    echo -e "${YELLOW}No API key found in .env (ANTHROPIC_API_KEY is empty).${NC}"
    echo ""
    echo "Options:"
    echo "  1) NVIDIA NIM (Free)  — https://build.nvidia.com  — starts with nvapi-"
    echo "  2) Anthropic Claude   — https://console.anthropic.com — starts with sk-ant-"
    echo "  3) Skip (use demo mode — placeholder translations)"
    echo ""
    read -p "Choose [1/2/3]: " API_CHOICE

    case "$API_CHOICE" in
        1|2)
            read -s -p "Paste your API key: " ANTHROPIC_API_KEY
            echo ""
            ;;
        3)
            warn "Skipping API key — demo mode will be used (placeholder translations)"
            ANTHROPIC_API_KEY=""
            ;;
        *)
            warn "Invalid choice — using demo mode"
            ANTHROPIC_API_KEY=""
            ;;
    esac
fi

# Detect API type and update service URL
if [[ "$ANTHROPIC_API_KEY" == nvapi-* ]]; then
    API_TYPE="NVIDIA NIM"
    log "Detected NVIDIA NIM API key"

    # Verify the key works
    log "Testing NVIDIA API key..."
    TEST=$(curl -s https://integrate.api.nvidia.com/v1/chat/completions \
        -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model":"meta/llama-3.3-70b-instruct","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10,"stream":false}' \
        2>/dev/null)
    if echo "$TEST" | grep -q "choices"; then
        success "NVIDIA API key is valid and working"
    else
        warn "NVIDIA API test returned: $(echo "$TEST" | head -c 200)"
        warn "Continuing anyway..."
    fi

elif [[ "$ANTHROPIC_API_KEY" == sk-ant-* ]]; then
    API_TYPE="Anthropic Claude"
    log "Detected Anthropic Claude API key"
else
    API_TYPE="Demo mode"
    warn "No valid API key — using demo mode"
fi

# Save key to .env
if [ -n "$ANTHROPIC_API_KEY" ]; then
    if grep -q "^ANTHROPIC_API_KEY=" "$ROOT_DIR/.env" 2>/dev/null; then
        sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY|" "$ROOT_DIR/.env"
    else
        echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" >> "$ROOT_DIR/.env"
    fi
    success "API key saved to .env"
fi

# ─── STEP 5: Build & deploy plugin ────────────────────────────────
header "Step 5 — Building & Deploying UgaJapa Translation Plugin"

cd "$APP_DIR"
log "Installing plugin dependencies..."
npm install --include=dev --silent 2>/dev/null || npm install --include=dev

log "Packaging plugin..."
if command -v rc-apps &>/dev/null; then
    RC_APPS_CMD="rc-apps"
elif [ -x "$APP_DIR/node_modules/.bin/rc-apps" ]; then
    RC_APPS_CMD="$APP_DIR/node_modules/.bin/rc-apps"
else
    RC_APPS_CMD="npx --yes @rocket.chat/apps-cli"
fi

$RC_APPS_CMD package 2>/dev/null
ZIP="$APP_DIR/dist/ugajapa-translation_1.0.0.zip"

if [ ! -f "$ZIP" ]; then
    error "Plugin package not found at $ZIP. Check TypeScript errors above."
fi

success "Plugin packaged: $ZIP ($(du -sh "$ZIP" | cut -f1))"

cd "$ROOT_DIR"
log "Uploading plugin to Rocket.Chat..."

UPLOAD=$(curl -s -X POST \
    "$RC_URL/api/apps/$APP_ID" \
    -H "X-Auth-Token: $TOKEN" \
    -H "X-User-Id: $USERID" \
    -F "app=@$ZIP")

APP_STATUS=$(echo "$UPLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('app',{}).get('status','unknown'))" 2>/dev/null || echo "unknown")
APP_SUCCESS=$(echo "$UPLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success','false'))" 2>/dev/null || echo "false")

if [ "$APP_STATUS" = "auto_enabled" ] || [ "$APP_STATUS" = "manually_enabled" ]; then
    success "Plugin deployed: status = $APP_STATUS"
else
    warn "Upload returned: $(echo "$UPLOAD" | head -c 300)"
    warn "Attempting to continue..."
fi

# ─── STEP 6: Configure plugin settings ────────────────────────────
header "Step 6 — Configuring Plugin Settings"

SETTINGS_PAYLOAD="{
    \"settings\": [
        {\"id\": \"ugajapa_claude_api_key\",       \"value\": \"$ANTHROPIC_API_KEY\"},
        {\"id\": \"ugajapa_default_target_lang\",   \"value\": \"ja\"},
        {\"id\": \"ugajapa_auto_translate\",         \"value\": true},
        {\"id\": \"ugajapa_show_hints\",             \"value\": true}
    ]
}"

SETTINGS_RESULT=$(curl -s -X POST \
    "$RC_URL/api/apps/$APP_ID/settings" \
    -H "X-Auth-Token: $TOKEN" \
    -H "X-User-Id: $USERID" \
    -H "Content-Type: application/json" \
    -d "$SETTINGS_PAYLOAD")

if echo "$SETTINGS_RESULT" | grep -q '"success":true'; then
    success "Plugin settings saved"
    log "  API key:           $([ -n "$ANTHROPIC_API_KEY" ] && echo "SET ($API_TYPE)" || echo "EMPTY (demo mode)")"
    log "  Default language:  Japanese (ja)"
    log "  Auto-translate:    Enabled"
    log "  Cultural hints:    Enabled"
else
    warn "Settings save returned: $(echo "$SETTINGS_RESULT" | head -c 200)"
fi

# ─── STEP 7: Create test channels ─────────────────────────────────
header "Step 7 — Setting Up Test Channels"

create_channel() {
    local NAME="$1"
    local RESULT
    RESULT=$(curl -s -X POST "$RC_URL/api/v1/channels.create" \
        -H "X-Auth-Token: $TOKEN" \
        -H "X-User-Id: $USERID" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"$NAME\"}" 2>/dev/null)

    if echo "$RESULT" | grep -q '"success":true'; then
        ROOM_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['channel']['_id'])" 2>/dev/null)
        success "Created channel #$NAME (ID: $ROOM_ID)"
        echo "$ROOM_ID"
    else
        # Channel may already exist
        EXISTING=$(curl -s "$RC_URL/api/v1/channels.info?roomName=$NAME" \
            -H "X-Auth-Token: $TOKEN" \
            -H "X-User-Id: $USERID" 2>/dev/null)
        ROOM_ID=$(echo "$EXISTING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('channel',{}).get('_id',''))" 2>/dev/null || echo "")
        if [ -n "$ROOM_ID" ]; then
            log "Channel #$NAME already exists (ID: $ROOM_ID)"
            echo "$ROOM_ID"
        else
            echo ""
        fi
    fi
}

UG_JP_ROOM=$(create_channel "uganda-japan")
GENERAL_ROOM=$(create_channel "ugajapa-general")
TEST_ROOM=$(create_channel "translation-test")

# Set language on channels
for ROOM_ID in $UG_JP_ROOM $GENERAL_ROOM $TEST_ROOM; do
    if [ -n "$ROOM_ID" ]; then
        # Post a /set-language ja message via API as a bot command
        curl -s -X POST "$RC_URL/api/v1/chat.sendMessage" \
            -H "X-Auth-Token: $TOKEN" \
            -H "X-User-Id: $USERID" \
            -H "Content-Type: application/json" \
            -d "{\"message\":{\"rid\":\"$ROOM_ID\",\"msg\":\"/set-language ja\"}}" \
            > /dev/null 2>&1 || true
    fi
done

success "Channels created and configured for Japanese translation"

# ─── STEP 8: Verify everything ────────────────────────────────────
header "Step 8 — Final Verification"

# Check app status
APP_CHECK=$(curl -s "$RC_URL/api/apps" \
    -H "X-Auth-Token: $TOKEN" \
    -H "X-User-Id: $USERID" 2>/dev/null)

APP_INFO=$(echo "$APP_CHECK" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for app in d.get('apps',[]):
    if 'ugajapa' in app.get('nameSlug','').lower() or 'ugajapa' in app.get('name','').lower():
        print(app.get('name','?'), '|', app.get('status','?'), '|', app.get('version','?'))
" 2>/dev/null || echo "Could not verify")

# Check key is saved
KEY_CHECK=$(curl -s "$RC_URL/api/apps/$APP_ID/settings" \
    -H "X-Auth-Token: $TOKEN" \
    -H "X-User-Id: $USERID" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=d.get('settings',{})
key=s.get('ugajapa_claude_api_key',{}).get('value','')
auto=s.get('ugajapa_auto_translate',{}).get('value',False)
hints=s.get('ugajapa_show_hints',{}).get('value',False)
print('key=' + ('SET' if key else 'EMPTY') + ' auto=' + str(auto) + ' hints=' + str(hints))
" 2>/dev/null || echo "check failed")

echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}   UgaJapa Connect — Setup Complete!           ${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${TEAL}Chat Server:${NC}     $RC_URL"
echo -e "  ${TEAL}Plugin Status:${NC}   $APP_INFO"
echo -e "  ${TEAL}Settings:${NC}        $KEY_CHECK"
echo -e "  ${TEAL}AI Engine:${NC}       $API_TYPE"
echo ""
echo -e "${BOLD}Quick Test:${NC}"
echo -e "  1. Open ${BLUE}$RC_URL${NC} in browser"
echo -e "  2. Login as ${BOLD}$RC_USERNAME${NC}"
echo -e "  3. Go to ${BOLD}#translation-test${NC} channel"
echo -e "  4. Type: ${BOLD}Hello, how is the project going today?${NC}"
echo -e "  5. You should see Japanese translation below your message"
echo ""
echo -e "${BOLD}Slash Commands:${NC}"
echo -e "  ${YELLOW}/set-language ja${NC}  — set target to Japanese"
echo -e "  ${YELLOW}/set-language en${NC}  — set target to English"
echo -e "  ${YELLOW}/set-language lg${NC}  — set target to Luganda"
echo -e "  ${YELLOW}/translate <text>${NC} — translate privately"
echo ""
echo -e "${BOLD}Cultural Intelligence:${NC}"
echo -e "  Try sending: ${YELLOW}That might be a bit difficult...${NC}"
echo -e "  You will see a cultural hint about indirect refusals in Japanese"
echo ""
echo -e "${BOLD}Channels Ready:${NC}"
echo -e "  ${TEAL}#uganda-japan${NC}       — Main Uganda-Japan collaboration channel"
echo -e "  ${TEAL}#ugajapa-general${NC}    — General discussion"
echo -e "  ${TEAL}#translation-test${NC}   — Testing translations"
echo ""
echo -e "${GREEN}System fully configured and ready!${NC} ${TEAL}UG x JP${NC}"
echo ""