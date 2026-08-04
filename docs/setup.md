# Setup Guide

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Bun | ≥ 1.0 | Runtime |
| pnpm | ≥ 10 | Package manager |
| macOS | — | Required for Reminders sync via `osascript` |
| Obsidian desktop app + CLI | Latest | Enable Command line interface in Obsidian and register `obsidian` in PATH; the app must be running for CLI calls |
| DeepSeek API Key | — | [platform.deepseek.com](https://platform.deepseek.com) |
| Obsidian MCP Server | `@smith-and-web/obsidian-mcp-server@1.4.0` | Direct filesystem access; Obsidian does not need to stay open |
| Filesystem MCP Server | `@modelcontextprotocol/server-filesystem@2026.7.10` | Read-only local file access through an explicit allowlist |

## 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
BRAIN_VAULT_PATH=/absolute/path/to/your/vault
DEEPSEEK_API_KEY=sk-...
GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
PORT=5001
MCP_FILESYSTEM_ALLOWED_DIRS=["/absolute/path/to/extra/dir"]
OBSIDIAN_MCP_WRITE_TOOL=obsidian_create-note
OBSIDIAN_NOTE_FOLDER=Brainstorm
OBSIDIAN_WRITE_BACKEND=cli
```

## 2. Install and start

```bash
pnpm install
pnpm start
```

The start command creates `BRAIN_VAULT_PATH/OBSIDIAN_NOTE_FOLDER`, uses that artifact
directory as the Obsidian MCP Vault, waits for its health endpoint, and then launches
the gateway. Both processes stop together. If the CLI is not installed or not
registered, startup now fails fast with a link to the official Obsidian CLI setup
page instead of silently falling back to MCP.
The default [MCP configuration](../mcp.json) connects to `http://localhost:3001/sse`
and retains the read-only GitHub MCP server for repository context.
The same startup path also loads the official filesystem MCP package and only
exposes read-only file tools. Access is limited to an allowlist: the vault path plus
any extra absolute directories configured via `MCP_FILESYSTEM_ALLOWED_DIRS`.
Session history is stored in SQLite. If `DATABASE_URL` is unset, the runtime uses
`data/sessions.db` inside the repository.

Expected startup output:

```
[start] Obsidian MCP is healthy at http://localhost:3001/health
[startup] DeepSeek API key configured: sk-abc...
[startup] Obsidian vault path: /path/to/vault/Brainstorm
[mcp] Loaded ... tools from 2 server(s).
[startup] Dependencies verified.
[server] 🚀 Gateway listening on http://localhost:5001
```

## 3. Apple Reminders permissions

On first run, macOS may prompt for Automation permission for Reminders. Grant it.
Reminders receive only a timestamped action title and an Obsidian `[[wiki-link]]`
reference; the full report remains in Obsidian.

## 4. Obsidian archive behavior

Every completed conversation is written through the configured MCP tool directly
into the Vault rooted at `BRAIN_VAULT_PATH/OBSIDIAN_NOTE_FOLDER`. Each note contains
YAML properties, the full report, `[[wiki-links]]`, the original input, and the
conversation transcript.

## 5. Access Modes

Choose the entry point that best fits your workflow:

1. **Terminal CLI**: run `pnpm run start:cli` for a host-native loop with session switching and resume commands.
2. **Web workspace**: open `http://localhost:5001/` for the built-in browser UI with timeline, progress, and history panels.
3. **External automation client**: call `POST /distill` directly from any script, launcher, or automation tool that can send JSON.

The repository no longer maintains platform-specific client scripts. External clients should stay thin and delegate workflow state to the gateway via `sessionId`, `reset`, and `resume`.

## 6. Verify end-to-end

| Check | How |
|---|---|
| Server running | `curl http://localhost:5001/` |
| MCP server running | `curl http://localhost:3001/health` |
| Distill works | `curl -N -X POST http://localhost:5001/distill -H 'Content-Type: application/json' -d '{"text":"测试想法","reset":true}'` |
| Session history works | `curl http://localhost:5001/sessions` |
| Vault file created | `ls "$BRAIN_VAULT_PATH/$OBSIDIAN_NOTE_FOLDER"` |
| Reminder added | Open Reminders app on Mac |

## 7. Error reference

| Error | Likely cause |
|---|---|
| `Invalid environment variables` | `.env` missing `DEEPSEEK_API_KEY` or `BRAIN_VAULT_PATH` |
| CLI not found | Obsidian CLI is not installed, not registered in PATH, or Obsidian is not running |
| MCP connection failure on startup | Obsidian MCP Server is not listening on port `3001` |
| Filesystem MCP not available | `MCP_FILESYSTEM_ALLOWED_DIRS` is empty and you want local file access outside the vault |
| `MCP tool is unavailable` | `OBSIDIAN_MCP_WRITE_TOOL` does not match the prefixed MCP tool name |
| `400` from `/distill` | `text` field missing or empty |
| `[reminders] Error syncing reminder` | macOS Automation permission not granted |
| DeepSeek API error | Invalid API key or rate limit |

## 8. Deployment Stance

For the current local-first workflow, SQLite is enough and a full Dockerized app stack is not the default recommendation. The runtime depends on host-native macOS integrations such as Apple Reminders automation, local Vault paths, and the Obsidian CLI, so Docker would add operational indirection without simplifying the main use case.

Docker remains relevant only for the optional GitHub MCP server defined in [mcp.json](../mcp.json). If the project later needs remote hosting, contributor onboarding without macOS-specific tooling, or multi-user operation, that is the right time to introduce Docker Compose.
