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

## 5. iPhone Shortcuts Setup（快捷指令配置）

Name the shortcut: `🧠 智能脑暴`

Steps:

1. **Receive input**: Tap ⓘ at the bottom, enable accepting "Shortcut Input".
2. **Text action**: Insert a Text action and select the magic variable "Shortcut Input".
3. **If** — If the Text above has no value:
   - **Set variable** `SiriSays` = `"嗨，你现在有什么想法？"`
   - **Set variable** `isReset` = `true`
4. **Otherwise**:
   - **Set variable** `SiriSays` = Shortcut Input
   - **Set variable** `isReset` = `false`
5. **End If**
6. **Dictate Text**: Set the prompt to variable `SiriSays`. (Siri will speak the question, then open the mic.)
7. **Get Contents of URL**:
   - URL: `http://<your-mac-ip>:5001/distill`
   - Method: POST / Request Body: JSON
   - Key 1: `text` → Dictated Text
   - Key 2: `reset` → variable `isReset`
8. **Get Dictionary from Input** → pass the URL contents.
9. **Get Dictionary Value** → key `status` → store as `currentStatus`.
10. **Get Dictionary Value** → key `text` → store as `serverReply`.
11. **If** `currentStatus` equals `CONTINUE`:
    - **Run Shortcut**: Select `🧠 智能脑暴` (itself!), pass `serverReply` as input.
12. **Otherwise** (FINISH):
    - **Show Alert**: display `serverReply` (a concise Obsidian archive confirmation).
13. **End If**

> The recursive self-call avoids the iOS Shortcuts loop-crash bug and naturally handles multi-turn conversation.  
> If the model needs fresh external context during clarification, the server may call Google / DuckDuckGo / Bing behind the scenes before returning the next question or final answer.

## 6. Verify end-to-end

| Check | How |
|---|---|
| Server running | `curl http://localhost:5001/` |
| MCP server running | `curl http://localhost:3001/health` |
| Distill works | `curl -X POST http://localhost:5001/distill -H 'Content-Type: application/json' -d '{"text":"测试想法","reset":true}'` |
| Vault file created | `ls "$BRAIN_VAULT_PATH/$OBSIDIAN_NOTE_FOLDER"` |
| Reminder added | Open Reminders app on Mac |

## 7. Error reference

| Error | Likely cause |
|---|---|
| `Invalid environment variables` | `.env` missing `DEEPSEEK_API_KEY` or `BRAIN_VAULT_PATH` |
| CLI not found | Obsidian CLI is not installed, not registered in PATH, or Obsidian is not running |
| MCP connection failure on startup | Obsidian MCP Server is not listening on port `3001` |
| `MCP tool is unavailable` | `OBSIDIAN_MCP_WRITE_TOOL` does not match the prefixed MCP tool name |
| `400` from `/distill` | `text` field missing or empty |
| `[reminders] Error syncing reminder` | macOS Automation permission not granted |
| DeepSeek API error | Invalid API key or rate limit |
