# Setup Guide

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Bun | ≥ 1.0 | Runtime |
| pnpm | ≥ 10 | Package manager |
| macOS | — | Required for Reminders sync via `osascript` |
| DeepSeek API Key | — | [platform.deepseek.com](https://platform.deepseek.com) |

## 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
BRAIN_VAULT_PATH=/absolute/path/to/your/vault
DEEPSEEK_API_KEY=sk-...
PORT=5001
```

## 2. Install and start

```bash
pnpm install
pnpm start
```

Expected startup output:

```
[startup] DeepSeek API key configured: sk-abc...
[startup] Brain vault path: /path/to/vault
[startup] Dependencies verified.
[server] 🚀 Gateway listening on http://localhost:5001
```

## 3. Apple Reminders permissions

On first run, macOS may prompt for Automation permission for Reminders. Grant it. If the step fails, the server still returns the full final response — check `[reminders]` log lines.

## 4. Archive behavior

Every completed conversation is archived into [`.local-vault/`](/Users/dushihua/dev/apps/adhd-healing/.local-vault). The model classifies it into a category and subcategory, then the service rebuilds [`.local-vault/index.md`](/Users/dushihua/dev/apps/adhd-healing/.local-vault/index.md) so you can retrieve old conversations quickly.

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
    - **Show Alert**: display `serverReply` (the final Milestone report).
13. **End If**

> The recursive self-call avoids the iOS Shortcuts loop-crash bug and naturally handles multi-turn conversation.  
> If the model needs fresh external context during clarification, the server may call Google / DuckDuckGo / Bing behind the scenes before returning the next question or final answer.

## 6. Verify end-to-end

| Check | How |
|---|---|
| Server running | `curl http://localhost:5001/` |
| Distill works | `curl -X POST http://localhost:5001/distill -H 'Content-Type: application/json' -d '{"text":"测试想法","reset":true}'` |
| Vault file created | `ls $BRAIN_VAULT_PATH` |
| Archive index rebuilt | `ls .local-vault && test -f .local-vault/index.md && echo ok` |
| Reminder added | Open Reminders app on Mac |

## 7. Error reference

| Error | Likely cause |
|---|---|
| `Invalid environment variables` | `.env` missing `DEEPSEEK_API_KEY` or `BRAIN_VAULT_PATH` |
| `400` from `/distill` | `text` field missing or empty |
| `[reminders] Failed to add reminder` | macOS Automation permission not granted |
| DeepSeek API error | Invalid API key or rate limit |
