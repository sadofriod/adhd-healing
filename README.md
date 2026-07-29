# ADHD Healing

[中文说明](./README.zh-CN.md)

Local-first idea clarification and distillation gateway for a single Mac + iPhone workflow. The iPhone Shortcut is the only client shell; this service accepts text or audio, asks follow-up questions through a local LLM, retrieves related historical ideas with pgvector, and persists the final result to PostgreSQL, a local Markdown vault, and Apple Reminders.

## What It Does

- Accepts `text` and `audio` input through a single `POST /distill` endpoint.
- Keeps multi-turn clarification state with `session_id` and persisted session messages.
- Uses local LM Studio models for chat decisions and embeddings.
- Uses PostgreSQL + pgvector to retrieve similar past ideas during clarification.
- Writes finalized Markdown into a local vault directory.
- Extracts milestones and attempts to sync them into Apple Reminders.

## Platform Scope

This repository is intentionally local-first and macOS-hosted.

- Host: macOS
- Client: iPhone Shortcuts on iOS 16+
- Transcription: macOS Speech via a small Swift helper compiled at startup
- Reminders sync: AppleScript / `osascript`

If you want a cross-platform server, this repository is not there yet.

## Architecture

```mermaid
flowchart LR
    A[iPhone Shortcuts] --> B[POST /distill]
    B --> C[Normalize text or transcribe audio]
    C --> D[Load or create session]
    D --> E[Build session context]
    E --> F[pgvector similarity lookup]
    F --> G[LM Studio clarification decision]
    G -->|clarify| H[Return question + session_id]
    G -->|final| I[Generate final markdown]
    I --> J[Write PostgreSQL record]
    I --> K[Write local vault file]
    I --> L[Sync Apple Reminders milestone]
```

## Stack

- Runtime: Bun
- Language: TypeScript
- Database: PostgreSQL + pgvector
- ORM / client: Prisma + `pg`
- Validation: Zod
- Models: LM Studio OpenAI-compatible API
- Client shell: iPhone Shortcuts

## Quick Start

### 1. Requirements

- Bun 1.0+
- pnpm 10+
- Docker
- Xcode Command Line Tools / Swift toolchain
- LM Studio 0.3+
- macOS host with Speech Recognition and Reminders permissions

### 2. Start PostgreSQL + pgvector

```bash
docker run -d \
  --name pgvector \
  -e POSTGRES_USER=adhd \
  -e POSTGRES_PASSWORD=adhd \
  -e POSTGRES_DB=adhd_healing \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### 3. Configure LM Studio

Load these models and enable the local server at `http://localhost:1234/v1`:

- Chat model: `qwen2.5-7b-instruct`
- Embedding model: `nomic-ai/nomic-embed-text-v1.5`

The service validates both model IDs during startup.

### 4. Configure environment

```bash
cp .env.example .env
```

Required:

```env
BRAIN_VAULT_PATH=/absolute/path/to/your/local/vault
DATABASE_URL=postgresql://user:password@localhost:5432/adhd_healing
```

Optional defaults:

```env
LM_STUDIO_BASE_URL=http://localhost:1234/v1
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
CHAT_MODEL=qwen2.5-7b-instruct
MAX_CLARIFICATION_TURNS=3
PORT=5001
```

### 5. Install and run

```bash
pnpm install
pnpm start
```

Expected startup flow:

- Database initialization runs first.
- LM Studio connectivity and loaded models are verified.
- The macOS Speech helper is built and checked.
- The server starts on port `5001` by default.

### 6. Verify the endpoint

```bash
curl -X POST http://localhost:5001/distill \
  -F input_mode=text \
  -F "text=I have an idea I want to clarify"
```

## iPhone Shortcut Flow

The Shortcut should loop until the service returns `response_type = "final"`.

Each turn:

1. Ask the user whether to answer with voice or text.
2. Send a `multipart/form-data` request to `POST /distill`.
3. Store the returned `session_id`.
4. If `is_complete` is `false`, show `assistant_message` and continue.
5. If `is_complete` is `true`, display `final_markdown` and stop.

Detailed action-by-action setup: [docs/iphone-shortcut.md](./docs/iphone-shortcut.md)

## API Overview

### Request

`POST /distill` with `multipart/form-data`

| Field | Required | Notes |
| --- | --- | --- |
| `input_mode` | yes | `text` or `audio` |
| `text` | text mode | Non-empty string |
| `audio` | audio mode | Uploaded audio file |
| `session_id` | no | UUID from a previous turn |

### Success response

```json
{
  "session_id": "uuid",
  "response_type": "clarify",
  "assistant_message": "What outcome do you want from this idea?",
  "turn_index": 1,
  "is_complete": false,
  "final_markdown": null,
  "final_title": null,
  "milestone": null
}
```

When the conversation is complete, `response_type` becomes `final` and `final_markdown` is populated.

### Error behavior

- `400`: invalid payload, missing fields, or invalid `session_id`
- `409`: the referenced session can no longer accept input
- `500`: unhandled processing failure

## Development

```bash
pnpm test
pnpm lint
pnpm exec tsc --noEmit
```

## Repository Layout

```text
.
├── docs/                  Product docs, setup notes, Shortcut guide
├── prisma/                Prisma schema
├── src/config/            Environment parsing
├── src/db/                DB bootstrap, schema, queries
├── src/routes/distill/    Request validation and orchestration
├── src/services/          LLM, transcription, reminders, vault, sessions
├── src/utils/             Context and markdown helpers
├── server.ts              Bun HTTP entrypoint
└── README.zh-CN.md        Chinese repository README
```

## Documentation Map

- Setup and local environment: [docs/setup.md](./docs/setup.md)
- iPhone Shortcut guide: [docs/iphone-shortcut.md](./docs/iphone-shortcut.md)
- MVP product scope: [docs/PRD-MVP.md](./docs/PRD-MVP.md)
- MVP breakdown index: [docs/mvp-breakdown/README.md](./docs/mvp-breakdown/README.md)

## Current Status

This repository implements the MVP service shell around `POST /distill` for a single-user local workflow. It is designed for validation and iteration, not for cloud deployment, multi-user tenancy, or a native iOS app.