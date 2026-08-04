# ADHD Healing

[中文说明](./README.zh-CN.md)

Obsidian-first idea clarification and distillation gateway for a single Mac-hosted workflow. An iPhone Shortcut is the primary input interface; a React web client is available as a debug tool. The service uses DeepSeek for structured multi-turn clarification, then persists the complete report through an Obsidian MCP server and sends only a concise action reference to Apple Reminders.

## What It Does

- Accepts `POST /distill` with `{ text, reset }` and returns `{ status: "CONTINUE" | "FINISH", text }`.
- Manages multi-turn conversation state in memory on the server (single-user, single-session).
- Uses DeepSeek (`deepseek-chat`) via the Vercel AI SDK for structured decision-making.
- Lets the model call a browser search tool backed by Google, DuckDuckGo, and Bing when fresh public context is needed.
- Automatically identifies highly relevant vertical, niche, or cross-domain topics when clarification completes, then runs independent research agents in parallel with browser search and read-only MCP tools.
- Writes YAML and semantic wiki-link networks through an Obsidian persistence layer for Graph View.
- Uses Obsidian CLI as the primary write path and fails fast with install guidance if the CLI is missing.
- Keeps Obsidian as the complete knowledge source without requiring the desktop app to stay open.
- Syncs only a timestamped milestone title and Obsidian wiki-link reference to Apple Reminders.
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
      │                                     generateText → DeepSeek API
       │                                              │
       │                                    ASK_MORE → append to session
       └────(CONTINUE: next question)────────┤
                                             │
                                    COMPLETE → parallel research agents
                                             → artifact bundle + Reminders
       └────(FINISH: concise confirmation)───┘
```

## Stack

- Runtime: Bun
- Language: TypeScript
- LLM: DeepSeek API (`deepseek-chat`) via Vercel AI SDK (`@ai-sdk/openai`)
- Search: browser search tool (Google / DuckDuckGo / Bing)
- Knowledge persistence: Obsidian CLI or MCP over SSE
- Validation: Zod
- Debug client: React web app

## Quick Start

### 1. Requirements

- Bun 1.0+
- pnpm 10+
- macOS with Reminders permissions granted to Terminal/Bun
- Obsidian desktop app with Command line interface enabled and registered in PATH
- DeepSeek API key ([platform.deepseek.com](https://platform.deepseek.com))

### 2. Configure environment

```bash
cp .env.example .env
```

Required:

```env
BRAIN_VAULT_PATH=/absolute/path/to/your/local/vault
DEEPSEEK_API_KEY=sk-...
GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
```

Optional:

```env
PORT=5001
MCP_CONFIG_PATH=/absolute/path/to/mcp.json
OBSIDIAN_MCP_WRITE_TOOL=obsidian_create-note
OBSIDIAN_NOTE_FOLDER=Brainstorm
OBSIDIAN_WRITE_BACKEND=cli
OBSIDIAN_CLI_COMMAND=obsidian
OBSIDIAN_CLI_ARGS=["{path}"]
```

### 3. Install and run

```bash
pnpm install
pnpm start
```

`pnpm start` starts the Obsidian MCP server, waits for its health endpoint, and then
starts the gateway. `BRAIN_VAULT_PATH/OBSIDIAN_NOTE_FOLDER` is created and used as
the Vault root for generated reports. When `OBSIDIAN_WRITE_BACKEND=auto`, the service
uses the configured Obsidian CLI command and now fails fast with install guidance if
that command is unavailable. Set `OBSIDIAN_WRITE_BACKEND=mcp` only if you explicitly
want MCP writes instead of CLI writes. Stopping the command shuts down both processes.

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

### 7. Obsidian archive

Each finished conversation creates a timestamped artifact directory under the
Vault rooted at `BRAIN_VAULT_PATH/OBSIDIAN_NOTE_FOLDER`. The directory contains
the main report and any highly relevant execution-focused research reports.
Parent/child frontmatter and bidirectional wiki-links connect every report. The
main report also retains the raw input and transcript.

Research topics are selected by the clarification agent only when they directly
affect execution. There is no fixed topic limit. All research agents must finish
successfully before any report is written; a research failure aborts the
finalization request.

## MCP

The default [MCP configuration](./mcp.json) keeps both integrations:

- GitHub MCP runs through Docker with read-only `repos`, `issues`, and `pull_requests` tools exposed to the clarification agent.
- Obsidian MCP connects over SSE and is called directly by the final persistence pipeline.

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
- `500`: unhandled processing, research, or persistence failure

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
