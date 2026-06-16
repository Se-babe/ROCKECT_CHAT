#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/ugajapa-translation-app"

if [ -f "$ROOT_DIR/.env" ]; then
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
fi

RC_URL="${RC_URL:-http://localhost:3000}"
RC_USERNAME="${RC_USERNAME:-admin}"
RC_PASSWORD="${RC_PASSWORD:-change-me}"

cd "$APP_DIR"
npm install --include=dev

if command -v rc-apps >/dev/null 2>&1; then
    RC_APPS=(rc-apps)
elif [ -x "$APP_DIR/node_modules/.bin/rc-apps" ]; then
    RC_APPS=("$APP_DIR/node_modules/.bin/rc-apps")
else
    RC_APPS=(npx --yes @rocket.chat/apps-cli)
fi

echo "==> Packaging UgaJapa Translation App"
"${RC_APPS[@]}" package

echo "==> Deploying to $RC_URL"
"${RC_APPS[@]}" deploy \
    --url "$RC_URL" \
    --username "$RC_USERNAME" \
    --password "$RC_PASSWORD"

echo "Deployed. Enable the app in Admin > Apps if it is not already active."
