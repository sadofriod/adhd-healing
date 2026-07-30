# Local Environment Setup

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Bun | ≥ 1.0 | Runtime |
| pnpm | ≥ 10 | Package manager |
| Docker | any | For PostgreSQL pgvector container |
| Swift / Xcode Command Line Tools | Installed on macOS | Compiles the local Speech transcription helper |
| LM Studio | ≥ 0.3 | OpenAI-compatible local model gateway |
| Modern browser | Safari / Chrome / Edge | Client entry point for text and audio input |

## 1. Start PostgreSQL + pgvector

```bash
docker run -d \
  --name pgvector \
  -e POSTGRES_USER=adhd \
  -e POSTGRES_PASSWORD=adhd \
  -e POSTGRES_DB=adhd_healing \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

Verify connectivity:

```bash
psql "******localhost:5432/adhd_healing" -c "SELECT version();"
```

## 2. Start LM Studio

1. Open LM Studio and load two models:
   - **Chat model**: `qwen2.5-7b-instruct` (or any instruction-tuned chat model)
   - **Embedding model**: `nomic-ai/nomic-embed-text-v1.5` (768-dimensional output required)
2. Enable the local server (default: `http://localhost:1234/v1`).
3. Confirm the models are listed in `GET http://localhost:1234/v1/models`.

> Audio transcription no longer depends on LM Studio Whisper. The service compiles a small Swift helper and calls macOS Speech for on-device transcription.

## 3. Configure environment

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

```
BRAIN_VAULT_PATH=/absolute/path/to/your/vault
DATABASE_URL=******localhost:5432/adhd_healing
```

Optional variables (shown with defaults):

```
LM_STUDIO_BASE_URL=http://localhost:1234/v1
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
CHAT_MODEL=qwen2.5-7b-instruct
MAX_CLARIFICATION_TURNS=3
PORT=5001
```

## 4. Install dependencies

```bash
pnpm install
```

## 5. Start the service

```bash
pnpm start
```

On first startup, macOS may prompt for Speech Recognition permission when the transcription helper runs its health check. Grant it, or the server will fail fast before opening the HTTP port.

Expected output:

```
[db] Initializing database...
[db] Database initialized.
[server] Listening on port 5001
```

## 6. Open the web client

Open the React client in a browser that can reach your Mac:

1. On the same machine, open `http://localhost:5001/`.
2. On your iPhone, open `http://<mac-ip>:5001/` in Safari while on the same LAN.
3. If you want an app-like launcher on iPhone, use Safari `Share -> Add to Home Screen`.
4. Allow microphone access when Safari asks, or use the file picker fallback for audio uploads.

For a focused walkthrough of the page behavior, see [docs/web-entry.md](./web-entry.md).

Each loop works like this:

1. **Read the current question** shown in the prompt card.
2. **Answer with text** through the textarea, or **answer with audio** by recording or uploading a file.
3. **Let the page keep `session_id`** in memory for follow-up turns.
4. **Continue** when `is_complete` is `false` and a new clarification prompt appears.
5. **Stop** when `is_complete` is `true` and the final Markdown is rendered in the result panel.

### Request contract used by the web client

- Text turns send `application/json` to `POST /distill`.
- Audio turns send `multipart/form-data` to `POST /distill`.
- Both modes include `session_id` after the first turn.

### Response contract

```json
{
  "session_id": "uuid",
  "response_type": "clarify",
  "assistant_message": "你希望最终产出成什么形式？",
  "turn_index": 1,
  "is_complete": false,
  "final_markdown": null,
  "final_title": null,
  "milestone": null
}
```

When `response_type` is `"final"`:

```json
{
  "session_id": "uuid",
  "response_type": "final",
  "assistant_message": "蒸馏完成",
  "turn_index": 3,
  "is_complete": true,
  "final_markdown": "### 🎯 今日灵感内核\n...",
  "final_title": "核心标题",
  "milestone": "20分钟行动项内容"
}
```

## 7. Verify end-to-end

| Check | Command / Action |
| --- | --- |
| Health | `curl -X POST http://localhost:5001/distill -H 'Content-Type: application/json' -d '{"input_mode":"text","text":"我有一个想法"}'` |
| Session persisted | `psql $DATABASE_URL -c "SELECT id, status, turn_count FROM idea_sessions;"` |
| Vault file created | `ls $BRAIN_VAULT_PATH` |
| Final idea in DB | `psql $DATABASE_URL -c "SELECT id, created_at FROM my_ideas;"` |

## 8. Apple Reminders permissions

On first run, macOS may prompt for Automation permission for Reminders. Grant it when asked. If the reminder step fails, the server still returns the full final response — check logs for `[reminders]` lines.

## 9. Error reference

| Error | Likely cause |
| --- | --- |
| `Missing required environment variable: DATABASE_URL` | `.env` not loaded or variable missing |
| `Session not found: <id>` | `session_id` was dropped because the page was refreshed or the session was reset mid-conversation |
| embedding request failed | Embedding model not loaded in LM Studio, or model name does not match current configuration |
| `[reminders] Failed to add reminder` | macOS Automation permission not granted |
| `Speech recognition authorization failed` | Grant macOS Speech Recognition permission to the terminal process or rerun startup |
| `400` from `/distill` | `input_mode`, `text`, or `audio` field missing or wrong |
