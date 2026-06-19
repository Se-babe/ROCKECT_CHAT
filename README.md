# UgaJapa Connect — Rocket.Chat Full Stack

Full-stack Uganda–Japan collaboration platform: Rocket.Chat (Docker) + MongoDB + Apps Engine plugin for real-time **text and voice** translation between English, Luganda, and Japanese, with cultural intelligence hints and translation evaluation.

Based on [RocketChat_System_Documentation.pdf](./RocketChat_System_Documentation.pdf).

## Architecture

```
Browser / Mobile
       │
       ▼
Rocket.Chat :3000  ←── docker-compose
       │
       ├── MongoDB (replica set rs0)
       │
       └── Apps Engine
              └── ugajapa-translation-app
                     ├── Text:  IPreMessageSentExtend → NVIDIA NIM
                     └── Voice: IPostMessageSent → stt-proxy → speech-stt (Whisper) → NVIDIA NIM

stt-proxy :8090  ──→  speech-stt :8000 (faster-whisper, local STT)
```

**Text flow** — user sends a message → language detected (EN / LG / JA) → target picked (JA by default, or per-channel `/set-language`; JA source routes to EN) → NVIDIA NIM translates → original + translation + evaluation prompt attached.

**Voice/video flow** — user uploads audio/video → `stt-proxy` forwards to `speech-stt` (faster-whisper) → transcript sent to NVIDIA NIM for translation → result posted to the channel. (Text-to-speech reply is stubbed — translated text only, no audio reply yet.)

## Quick start

```bash
# 1. Clone this repo and enter it
cd ROCKECT_CHAT

# 2. Copy env template and fill in your own values (see Security below)
cp .env.example .env
chmod +x scripts/*.sh

# 3. Start the full stack — MongoDB, Rocket.Chat, speech-stt, stt-proxy
docker compose up -d

# 4. Create the admin account at http://localhost:3000 (first visit)

# 5. Deploy the translation plugin
./scripts/deploy-app.sh

# 6. Push your NVIDIA API key + settings
./scripts/configure-app.sh

# 7. Confirm the app is installed and enabled
./scripts/app-status.sh

# 8. Test it
/set-language ja
Hello, how is the project going?
```

> **Note:** `configure-app.sh` and `app-status.sh` default to port 3001 in some versions. Set `RC_URL=http://localhost:3000` in `.env` if your stack runs on 3000.

## Project layout

```
ROCKECT_CHAT/
├── docker-compose.yml         # MongoDB + Rocket.Chat + speech-stt + stt-proxy
├── stt-proxy/                 # FastAPI proxy (audio → Whisper)
├── ugajapa-translation-app/   # Rocket.Chat plugin (TypeScript)
│   ├── handlers/              # Text + voice translation handlers
│   ├── services/              # STT, TTS, NVIDIA NIM, language detection, cultural hints
│   └── commands/               # Slash commands + eval-stats
├── scripts/                   # setup, deploy, configure, status, restart
├── nginx/ugajapa.conf          # Production HTTPS reverse-proxy template
└── RocketChat_System_Documentation.pdf
```

Packaged app: `ugajapa-translation-app/dist/ugajapa-translation_1.0.10.zip`

## Translation app

### Hooks

- **`IPreMessageSentExtend`** — intercepts every text message before save, attaches the original text, translation, and an evaluation prompt.
- **`IPostMessageSent`** — fires after an audio/video message is sent; runs the voice translation pipeline (STT → translate → post result).

### Slash commands

| Command | Description |
|---------|-------------|
| `/set-language ja \| en \| lg` | Set per-channel target language |
| `/translate <text>` | On-demand translation without posting to the channel |
| `/eval-stats` | Show translation quality stats for the current channel |

### Supported languages

- **en** — English
- **lg** — Luganda (lexical-marker detection)
- **ja** — Japanese (Unicode-range detection)

### Cultural intelligence

Combines an LLM-generated hint (when nuance might cause misunderstanding) with a local rule-based layer for known patterns — e.g. English indirect-refusal phrases, Japanese indirect-disagreement markers, and Luganda warmth markers (`webale nyo`). Toggle with the `ugajapa_show_hints` setting.

### Translation evaluation

Each translated message includes an evaluation prompt (✅ Good / 👎 Poor / ⚠️ Inaccurate). **Status: the prompt is live, but the reaction handler that writes evaluations to persistence is not yet wired up** — `/eval-stats` currently reports zeros. See [Known limitations](#known-limitations).

### Voice & video translation

Upload or record an audio/video message in any channel. The plugin transcribes it via the local Whisper stack and translates the result the same way as text. Requires the `speech-stt` and `stt-proxy` containers to be running and the Whisper model downloaded (see [Voice/STT setup](#voicestt-setup) below).

### Demo mode

If no NVIDIA API key is configured, the app falls back to a clear "demo mode" placeholder instead of failing silently, so the message flow can still be tested end-to-end.

## Voice/STT setup

The STT stack needs the Whisper model downloaded once before voice translation works:

```bash
# Download the model into the speech-stt container (only exposed inside the Docker network)
docker exec rockect_chat-speech-stt-1 curl -s -X POST \
  "http://localhost:8000/v1/models/Systran/faster-whisper-base"

# Verify it installed
docker exec rockect_chat-speech-stt-1 curl -s http://localhost:8000/v1/models
```

Check both STT services are healthy:

```bash
curl -s http://localhost:8090/health   # stt-proxy
docker compose ps                       # all services
```

`stt-proxy` and `speech-stt` ports are **not published to the host** by default except `stt-proxy:8090` (added so it can be health-checked from outside Docker). Calls between containers use the internal Docker network (`http://speech-stt:8000`).

## Settings (Admin → Apps → UgaJapa Translation)

| Setting | Purpose |
|---|---|
| NVIDIA API key (`nvapi-...`) | Required for real translations (text + voice) |
| Default target language | Japanese, English, or Luganda |
| Auto-translate | Translate all eligible messages automatically |
| Cultural hints | Show/hide the cultural intelligence note |
| Voice translation on/off | Enable/disable the voice pipeline |
| Custom STT/TTS endpoints | Optional override for `stt-proxy` URL |

**Never commit a real API key.** Configure it only via Admin → Apps or `./scripts/configure-app.sh`, which reads from your local `.env`.

## Scripts

| Script | Purpose |
|---|---|
| `setup.sh` | Start the Docker stack + install npm deps |
| `deploy-app.sh` | Package and deploy the plugin (port 3000) |
| `configure-app.sh` | Push the NVIDIA key + settings via API |
| `app-status.sh` | List installed apps + admin URLs |
| `restart-app.sh` | Disable/re-enable the app (refresh permissions) |
| `test-api.sh` | REST login smoke test |

## Development (from source)

To work on Rocket.Chat itself instead of using Docker:

```bash
git clone https://github.com/RocketChat/Rocket.Chat.git
cd Rocket.Chat && yarn && yarn dsv
```

Watch-mode plugin development:

```bash
cd ugajapa-translation-app
npm install
npx @rocket.chat/apps-cli watch --url http://localhost:3000 --username admin --password YOUR_PASS
```

## Production

1. Point `ROOT_URL` in `.env` to your public URL.
2. Use `nginx/ugajapa.conf` as a template for HTTPS + WebSocket proxying.
3. Set the NVIDIA API key only via Admin → Apps — never commit keys.
4. Bring up the full stack including `speech-stt` and `stt-proxy` if voice translation is required in production.

## Test cases

| Test | Input | Expected |
|------|-------|----------|
| EN → JA | `The meeting is confirmed for tomorrow.` | Japanese translation attachment |
| Cultural hint | `That might be a bit difficult...` | Hint about indirect refusal |
| Luganda → JA | `/set-language lg`, then `Webale nyo, oli otya?` | Translation to configured target |
| JA → EN (bidirectional) | A Japanese-language message | Auto-translates to English |
| Voice message | Upload/record an audio clip | Transcription + translation posted to channel |
| Invalid language | `/set-language xyz` | Error message |

## REST API

```bash
./scripts/test-api.sh
```

Key endpoints: `/api/v1/login`, `/api/v1/chat.sendMessage`, `/api/v1/rooms.info`, `/api/apps`, `/api/apps/{id}/settings`.

## Known limitations

- **Text-to-speech** — `TextToSpeechService` returns translated text only; there is no audio reply yet.
- **`/eval-stats` shows zeros** — the evaluation UI prompts users to react, but no handler currently writes reactions to persistence.
- **STT containers are not started by default in lightweight setups** — run `docker compose up -d` (full stack) rather than starting only `mongodb` + `rocketchat` if voice translation is needed.

## Security

⚠️ If `.env.example` or any committed file ever contained a real password or API key:

1. Rotate the NVIDIA key at [build.nvidia.com](https://build.nvidia.com).
2. Change the Rocket.Chat admin password.
3. Keep only placeholders in `.env.example`; real secrets belong in `.env`, which must stay in `.gitignore`.

## License

MIT — Rocket.Chat is MIT; UgaJapa Translation App is MIT.