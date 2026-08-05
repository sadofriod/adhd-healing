# ADHD Healing

[中文说明](./README.zh-CN.md)

Obsidian-first idea clarification and distillation gateway for a single-user, Mac-hosted workflow. The built-in terminal CLI and React web workspace share the same streaming API, and any HTTP-capable automation client can integrate with that contract. The service uses DeepSeek for structured multi-turn clarification, then persists the complete report into a per-report Obsidian vault subdirectory beneath the configured note container and sends only a concise action reference to Apple Reminders.

The system now supports persistent session history in SQLite, so you can pause, resume, switch sessions, and keep working without relying on a browser-only flow. Apple Reminders sync is now optional and defaults to off so the first-run experience stays focused on the core Obsidian-backed workflow.

## What It Does

- Accepts `POST /distill` with `{ text, reset, resume, sessionId, attachments }` and streams NDJSON progress plus final result events.
- Persists session history in SQLite through Prisma and lets clients resume or switch work by `sessionId`.
- Uses DeepSeek (`deepseek-chat`) via the Vercel AI SDK for structured decision-making.
- Lets the model call browser automation tools through CloakBrowser MCP when fresh public context or live page interaction is needed.
- Automatically identifies highly relevant vertical, niche, or cross-domain topics when clarification completes, then runs independent research agents in parallel with browser automation and read-only MCP tools.
- Writes YAML and semantic wiki-link networks through an Obsidian persistence layer for Graph View.
- Uses Obsidian CLI as the primary write path and fails fast with install guidance if the CLI is missing.
- Keeps Obsidian as the complete knowledge source without requiring the desktop app to stay open.
- Adds CloakBrowser MCP for browser automation and a read-only filesystem MCP for local file access using the official `@modelcontextprotocol/server-filesystem` package.
- Syncs only a timestamped milestone title and Obsidian wiki-link reference to Apple Reminders.
- Serves a React web workspace at `/` with conversation timeline, progress, and session history panels.
- Supports a terminal CLI with built-in session controls: new session, continue paused turn, list history, and switch history session.
- Supports Chinese/English localization in both the web UI and server-generated API error messages (`x-locale` / `accept-language`).

## Platform Scope

This repository is intentionally local-first and macOS-hosted.

- Host: macOS
- Built-in clients: terminal CLI and browser at `http://localhost:5001`
- External clients: any HTTP-capable automation client that can call `/distill`
- Reminders sync: AppleScript / `osascript`

## Architecture

```
[CLI / Web / Automation Client] ──(POST /distill)──► [Mac Gateway (Bun)]
     ▲                                                  │
     │                                       stream progress + result
     │                                                  │
     │                               DeepSeek + search + research agents
     │                                                  │
     └────(reuse sessionId or /sessions)──── CONTINUE / PAUSED
                     │
                 FINISH → Obsidian bundle
                   → Apple Reminders
```

## Stack

- Runtime: Bun
- Language: TypeScript
- LLM: DeepSeek API (`deepseek-chat`) via Vercel AI SDK (`@ai-sdk/openai`)
- Search: browser search tool (Google / DuckDuckGo / Bing)
- Knowledge persistence: Obsidian CLI or MCP over SSE
- Local file reading: official read-only filesystem MCP with explicit allowlist
- Validation: Zod
- Debug client: React web app

## Quick Start

### 1. Requirements

- Bun 1.0+
- pnpm 10+
- macOS is optional for the core flow; the main CLI path only requires a local Obsidian vault and a DeepSeek API key
- Obsidian desktop app with Command line interface enabled and registered in PATH
- DeepSeek API key ([platform.deepseek.com](https://platform.deepseek.com))
- Optional: Apple Reminders sync can be enabled with `REMINDERS_SYNC_ENABLED=true` when you want a reminder created after each finished session

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
REMINDERS_SYNC_ENABLED=false
MCP_CONFIG_PATH=/absolute/path/to/mcp.json
MCP_FILESYSTEM_ALLOWED_DIRS=["/absolute/path/to/extra/dir"]
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
The same startup path also loads the official filesystem MCP server and exposes only
read-only tools to the model. Read access is limited to an explicit allowlist: the vault
path plus any extra absolute directories configured via `MCP_FILESYSTEM_ALLOWED_DIRS`.
Session history is stored in SQLite. If `DATABASE_URL` is unset, the runtime falls back
to `data/sessions.db` in the repository.

### 4. Verify the endpoint

```bash
# Start a new session and print the NDJSON stream
curl -N -X POST http://localhost:5001/distill \
  -H 'Content-Type: application/json' \
  -d '{"text":"我想做一个用 AI 帮助记忆闪念的工具","reset":true}'

# List persisted sessions
curl http://localhost:5001/sessions

# Continue a specific session
curl -N -X POST http://localhost:5001/distill \
  -H 'Content-Type: application/json' \
  -d '{"text":"核心是语音输入，然后自动结构化存到 Obsidian","sessionId":"<session-id>"}'
```

Each `/distill` response is streamed as newline-delimited JSON. The final line is a
`result` event containing `status`, `sessionId`, and the user-facing text.

### 5. Built-in terminal CLI

```bash
pnpm run start:cli
```

Optional startup flags:

```bash
pnpm run start:cli -- --new
pnpm run start:cli -- --session <session-id>
pnpm run start:cli -- --help
```

Interactive commands inside CLI:

- `/new` start a new session
- `/continue` resume the paused turn in current session
- `/history` list history sessions
- `/switch <id|n>` switch to a history session by id or list index
- `/help` show command help
- `/exit` exit CLI mode

### 6. Web workspace

Open `http://localhost:5001/` in a browser. The web workspace talks to the same
`/distill` and `/sessions` endpoints, shows progress events, and lets you reopen
session history from the UI.

### 7. External clients

Any HTTP-capable automation client can call the same API. The repository no longer
maintains platform-specific client recipes; client integrations should stay thin and
delegate workflow state to the gateway.

### 8. Obsidian archive

Each finished conversation creates a timestamped artifact directory beneath the
configured `BRAIN_VAULT_PATH/OBSIDIAN_NOTE_FOLDER` container. That directory
becomes the actual Obsidian vault root for the report, so `.obsidian` lives
inside the report folder rather than at the container root. The directory
contains the main report and any highly relevant execution-focused research
reports. Parent/child frontmatter and bidirectional wiki-links connect every
report. The main report also retains the raw input and transcript.

Research topics are selected by the clarification agent only when they directly
affect execution. There is no fixed topic limit. All research agents must finish
successfully before any report is written; a research failure aborts the
finalization request.

## MCP

The default [MCP configuration](./mcp.json) keeps both integrations:

- GitHub MCP runs through Docker with read-only `repos`, `issues`, and `pull_requests` tools exposed to the clarification agent.
- CloakBrowser MCP runs through `npx` and exposes browser automation tools to the model.
- Filesystem MCP runs through the official `@modelcontextprotocol/server-filesystem` package and exposes only read-only local file tools.
- Obsidian MCP connects over SSE and is called directly by the final persistence pipeline.

## Deployment Stance

The current runtime target is host-native macOS plus SQLite, not a full Dockerized app
stack. That is intentional: the service depends on local Vault paths, the Obsidian CLI,
and optional Apple Reminders automation, all of which are simpler and more reliable on the host
than inside a container. SQLite is sufficient for the current single-user, local-first
workflow, while Docker remains optional only for the read-only GitHub MCP server defined
in `mcp.json`. Revisit Docker Compose when remote deployment, contributor onboarding
without macOS-specific tooling, or multi-user hosting becomes the dominant need.

## API

### `POST /distill`

Request body (`Content-Type: application/json`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `text` | string | yes | Non-empty user input |
| `reset` | boolean | no | `true` abandons the current active session and starts a fresh one |
| `resume` | boolean | no | Retries a paused turn for the same `sessionId` |
| `sessionId` | string | no | Binds the request to a persisted session |
| `attachments` | array | no | Optional inline file payloads `{ name, content, mimeType?, size }` |

Response: `application/x-ndjson; charset=utf-8`

Each line is a standalone JSON event. During execution the gateway may emit progress and
usage events before the final `result` event.

```json
{ "type": "progress", "phase": "process", "message": "Clarifying scope" }
```

```json
{
  "type": "result",
  "result": {
    "status": "CONTINUE",
    "sessionId": "session-1",
    "text": "核心痛点到底是什么？"
  }
}
```

```json
{
  "type": "result",
  "result": {
    "status": "FINISH",
    "sessionId": "session-1",
    "text": "## 20-minute Milestone\n...",
    "tokenUsage": {
      "inputTokens": 1200,
      "outputTokens": 300,
      "totalTokens": 1500
    }
  }
}
```

Recoverable network failures are returned as a `PAUSED` result so clients can resume the
same turn later with `resume: true`.

### Session history endpoints

- `GET /sessions` returns persisted session summaries.
- `POST /sessions/:id/activate` marks a session active so the CLI or web UI can continue it.

### Error behavior

- `400`: invalid JSON or validation failure before streaming starts
- `500`: request setup failure before streaming starts
- `type: "error"` event: unhandled processing, research, or persistence failure during the stream

## Development

```bash
pnpm run build:web
pnpm test
pnpm lint
pnpm exec tsc --noEmit
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, review expectations, and project conventions. GitHub Actions now runs install, lint, typecheck, test, and web build checks on every push and pull request.

## Repository Layout

```text
.
├── docs/                  Product docs and setup guides
├── prisma/                SQLite schema and migrations
├── public/                HTML shell and built frontend assets
├── scripts/cli.ts         Pure terminal CLI entrypoint
├── src/config/            Environment parsing
├── src/cli/               CLI loop, command parsing, and terminal I/O
├── src/routes/distill/    Request validation, streaming, and orchestration
├── src/routes/sessions.ts Session history and activation endpoints
├── src/services/          LLM client, session, vault, reminders, and MCP
├── src/utils/             Context and markdown helpers
├── src/web/               React workspace client
├── server.ts              Bun HTTP entrypoint
└── README.zh-CN.md        Chinese README
```
