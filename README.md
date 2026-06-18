# UgaJapa Connect — Rocket.Chat Full Stack

Full-stack deployment for the **UgaJapa Translation App**: Rocket.Chat (Docker) + MongoDB + Apps Engine plugin for EN/Luganda ↔ Japanese translation with cultural intelligence hints.

Based on [RocketChat_System_Documentation.pdf](./RocketChat_System_Documentation.pdf).

## Architecture

```
Browser / Mobile
       │
       ▼
Rocket.Chat (port 3000)  ←── docker-compose
       │
       ├── MongoDB (replica set)
       │
       └── Apps Engine
              └── ugajapa-translation-app
                     ├── IPreMessageSentExtend (auto-translate)
                     ├── /set-language, /translate
                     └── Claude API (or demo mode)
```

## Quick start

```bash
# 1. Clone this repo and enter it
cd ROCKECT_CHAT

# 2. Start Rocket.Chat + MongoDB
cp .env.example .env
chmod +x scripts/*.sh
./scripts/setup.sh

# 3. Create admin account at http://localhost:3000 (first visit)

# 4. Deploy the translation app
#    Edit .env with your admin password first
./scripts/deploy-app.sh

# 5. Configure in Admin > Apps > UgaJapa Translation
#    - Paste Claude API key (optional — demo mode works without it)
#    - Set default target language: Japanese

# 6. Test in any channel
/set-language ja
Hello, how is the project going?
```

## Project layout

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Rocket.Chat + MongoDB stack |
| `ugajapa-translation-app/` | Apps Engine TypeScript plugin |
| `scripts/setup.sh` | One-command infrastructure setup |
| `scripts/deploy-app.sh` | Package and deploy app to Rocket.Chat |
| `scripts/test-api.sh` | REST API smoke test |
| `nginx/ugajapa.conf` | Production HTTPS reverse proxy |

## Translation app

### Hooks

- **`IPreMessageSentExtend`** — intercepts every message before save, adds translation to `customFields.ugajapa_translation` and a visible attachment.

### Slash commands

| Command | Description |
|---------|-------------|
| `/set-language ja \| en \| lg` | Set per-channel target language |
| `/translate <text>` | On-demand translation without sending as chat |

### Supported languages

- **en** — English  
- **lg** — Luganda (heuristic detection)  
- **ja** — Japanese  

### Demo mode

If no Claude API key is configured, the app uses built-in demo translations and local cultural-hint rules so you can test the full flow without external API calls.

## Development (from source)

To hack on Rocket.Chat itself instead of using Docker:

```bash
git clone https://github.com/RocketChat/Rocket.Chat.git
cd Rocket.Chat && yarn && yarn dsv
```

Install Apps CLI locally:

```bash
cd ugajapa-translation-app
npm install
npx @rocket.chat/apps-cli watch --url http://localhost:3000 --username admin --password YOUR_PASS
```

## Production

1. Point `ROOT_URL` in `.env` to your public URL.
2. Use `nginx/ugajapa.conf` as a template for HTTPS + WebSocket proxying.
3. Set Claude API key only via Admin > Apps (PASSWORD setting — never commit keys).

## Test cases (from documentation)

| Test | Input | Expected |
|------|-------|----------|
| EN → JA | `The meeting is confirmed for tomorrow.` | Japanese translation attachment |
| Cultural hint | `That might be a bit difficult...` | Hint about indirect refusal |
| Luganda | `/set-language lg` then Luganda text | Translation to configured target |
| Invalid lang | `/set-language xyz` | Error message |

## REST API

```bash
./scripts/test-api.sh
```

Key endpoints: `/api/v1/login`, `/api/v1/chat.sendMessage`, `/api/v1/rooms.info`.

## License

MIT — Rocket.Chat is MIT; UgaJapa Translation App is MIT.
# TransChecker-plugin
