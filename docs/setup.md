# Local Environment Setup

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Bun | ≥ 1.0 | Runtime |
| pnpm | ≥ 10 | Package manager |
| Docker | any | For PostgreSQL pgvector container |
| LM Studio | ≥ 0.3 | OpenAI-compatible local model gateway |
| iPhone Shortcuts | iOS 16+ | Client entry point for input |

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

> **Whisper transcription**: If your LM Studio version exposes `POST /v1/audio/transcriptions`, load a Whisper model. Otherwise the service returns an error for audio-mode requests.

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
bun --env-file=.env server.ts
```

Expected output:

```
[db] Initializing database...
[db] Database initialized.
[server] Listening on port 5001
```

## 6. iPhone Shortcut setup

Build a Shortcut that loops until the server returns `response_type = "final"`:

1. **Choose input**: Offer "Voice" or "Text" each turn.
2. **Send to server**: `POST http://<mac-ip>:5001/distill` as `multipart/form-data`:
   - `input_mode` = `"audio"` or `"text"`
   - `text` = text content (text mode only)
   - `audio` = recorded audio file (audio mode only)
   - `session_id` = stored value from previous turn (omit on first turn)
3. **Parse JSON response** and store `session_id`.
4. **Loop check**: if `is_complete` is `false`, show `assistant_message` and repeat.
5. **Done**: if `is_complete` is `true`, display `final_markdown`.

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
| Health | `curl -X POST http://localhost:5001/distill -F input_mode=text -F "text=我有一个想法"` |
| Session persisted | `psql $DATABASE_URL -c "SELECT id, status, turn_count FROM idea_sessions;"` |
| Vault file created | `ls $BRAIN_VAULT_PATH` |
| Final idea in DB | `psql $DATABASE_URL -c "SELECT id, created_at FROM my_ideas;"` |

## 8. Apple Reminders permissions

On first run, macOS may prompt for Automation permission for Reminders. Grant it when asked. If the reminder step fails, the server still returns the full final response — check logs for `[reminders]` lines.

## 9. Error reference

| Error | Likely cause |
| --- | --- |
| `Missing required environment variable: DATABASE_URL` | `.env` not loaded or variable missing |
| `Session not found: <id>` | `session_id` was dropped between Shortcut turns |
| `[embedding] Model unavailable` | Embedding model not loaded in LM Studio — fallback vector used |
| `[reminders] Failed to add reminder` | macOS Automation permission not granted |
| `400` from `/distill` | `input_mode`, `text`, or `audio` field missing or wrong |
