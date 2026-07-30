# ADHD Healing

[中文说明](./README.zh-CN.md)

Cloud-first idea clarification and distillation gateway for a single Mac-hosted workflow. An iPhone Shortcut is the primary input interface; a React web client is available as a debug tool. The service accepts text, calls DeepSeek via the Vercel AI SDK for structured multi-turn clarification, and persists the final result to a local Markdown vault and Apple Reminders.

## What It Does

- Accepts `POST /distill` with `{ text, reset }` and returns `{ status: "CONTINUE" | "FINISH", text }`.
- Manages multi-turn conversation state in memory on the server (single-user, single-session).
- Uses DeepSeek (`deepseek-chat`) via Vercel AI SDK `generateObject` for structured decision-making.
- Writes finalized Markdown into a local vault directory (Obsidian-compatible).
- Extracts milestones and syncs them into Apple Reminders via `osascript`.
- Serves a debug React web client at `/`.

## Platform Scope

This repository is intentionally local-first and macOS-hosted.

- Host: macOS
- Primary client: iPhone Shortcuts (see setup guide)
- Debug client: Safari/Chrome web browser at `http://localhost:5001`
- Reminders sync: AppleScript / `osascript`

## Architecture

```
[iPhone Shortcuts] ──(POST { text, reset })──► [Mac Gateway (Bun)]
       ▲                                              │
       │                                    generateObject → DeepSeek API
       │                                              │
       │                                    ASK_MORE → append to session
       └────(CONTINUE: next question)────────┤
                                             │
                                    COMPLETE → write vault + Reminders
       └────(FINISH: markdown report)────────┘
```

## Stack

- Runtime: Bun
- Language: TypeScript
- LLM: DeepSeek API (`deepseek-chat`) via Vercel AI SDK (`@ai-sdk/openai`)
- Validation: Zod
- Debug client: React web app

## Quick Start

### 1. Requirements

- Bun 1.0+
- pnpm 10+
- macOS with Reminders permissions granted to Terminal/Bun
- DeepSeek API key ([platform.deepseek.com](https://platform.deepseek.com))

### 2. Configure environment

```bash
cp .env.example .env
```

Required:

```env
BRAIN_VAULT_PATH=/absolute/path/to/your/local/vault
DEEPSEEK_API_KEY=sk-...
```

Optional:

```env
PORT=5001
```

### 3. Install and run

```bash
pnpm install
pnpm start
```

### 4. Verify the endpoint

```bash
# Start a new session
curl -X POST http://localhost:5001/distill \
  -H 'Content-Type: application/json' \
  -d '{"text":"我想做一个用 AI 帮助记忆闪念的工具","reset":true}'

# Continue the conversation (use text from previous response)
curl -X POST http://localhost:5001/distill \
  -H 'Content-Type: application/json' \
  -d '{"text":"核心是语音输入，然后自动结构化存到 Obsidian","reset":false}'
```

### 5. iPhone Shortcut setup

See [docs/setup.md](./docs/setup.md) for the full iPhone Shortcuts configuration (recursive self-call pattern).

### 6. Debug web client

Open `http://localhost:5001/` in a browser. The web client sends text turns to the same `/distill` endpoint.

## API

### Request

`POST /distill` — `Content-Type: application/json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `text` | string | yes | Non-empty user input |
| `reset` | boolean | no | `true` starts a fresh session (default: `false`) |

### Response

```json
{ "status": "CONTINUE", "text": "核心痛点到底是什么？" }
```

```json
{ "status": "FINISH", "text": "## 20分钟 Milestone\n..." }
```

### Error behavior

- `400`: invalid payload
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
├── docs/                  Product docs and setup guides
├── public/                HTML shell and built frontend assets
├── src/config/            Environment parsing
├── src/routes/distill/    Request validation and orchestration
├── src/services/          LLM client, session, vault, reminders
├── src/utils/             Context and markdown helpers
├── src/web/               React debug client
├── server.ts              Bun HTTP entrypoint
└── README.zh-CN.md        Chinese README
```
