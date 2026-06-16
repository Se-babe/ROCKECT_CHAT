#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> UgaJapa Connect — Rocket.Chat full stack setup"

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
fi

echo "==> Starting Rocket.Chat + MongoDB (Docker)"
# Reset failed MongoDB state from a previous unhealthy run
if docker compose ps mongodb 2>/dev/null | grep -Eq 'unhealthy|Exit'; then
    echo "Removing failed MongoDB state and recreating stack..."
    docker compose down -v
fi
docker compose up -d

echo "==> Waiting for Rocket.Chat on http://localhost:3000 ..."
for i in $(seq 1 60); do
    if curl -sf http://localhost:3000/api/info >/dev/null 2>&1; then
        echo "Rocket.Chat is ready."
        break
    fi
    sleep 5
    if [ "$i" -eq 60 ]; then
        echo "Timed out waiting for Rocket.Chat. Check: docker compose logs rocketchat"
        exit 1
    fi
done

echo "==> Installing translation app dependencies"
cd ugajapa-translation-app
npm install --include=dev

echo ""
echo "Setup complete."
echo "  1. Open http://localhost:3000 and create your admin account (first visit only)"
echo "  2. Run: ./scripts/deploy-app.sh"
echo "  3. Admin > Apps > UgaJapa Translation — paste Claude API key"
echo "  4. In any channel: /set-language ja"
