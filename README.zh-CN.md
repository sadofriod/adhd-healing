# ADHD Healing

[English README](./README.md)

这是一个面向单用户、Mac 本地运行的 Obsidian-First 想法澄清与蒸馏网关。iPhone 快捷指令是主要使用入口，React 网页作为调试工具使用。服务端通过 DeepSeek API（Vercel AI SDK）进行多轮结构化追问；会话完成后，通过 MCP 将完整报告写入 Obsidian，并向 Apple Reminders 下发极简行动标题。

## 功能概述

- 通过 `POST /distill` 接口接收 `{ text, reset }` 格式的文字输入，返回 `{ status, text }`。
- 服务端用内存 Session 维持多轮对话（单用户、单 Session）。
- 使用 DeepSeek `deepseek-chat` 模型，通过 Vercel AI SDK 做结构化决策。
- 当需要最新文档 / 产品动态 / 外部事实时，可调用 Google / DuckDuckGo / Bing 浏览器搜索工具。
- 澄清收束时自动识别与主报告高度相关的垂直、细分或交叉领域，并行启动可使用浏览器搜索和只读 MCP 工具的独立调研 Agent。
- 会话结束时，通过独立 Obsidian 持久化层写入带 YAML 属性、分类关系和语义化 `[[双链]]` 网络的完整 Markdown，适配 Graph View。
- 默认会优先尝试 Obsidian CLI；若 CLI 不可用则回退到现有 MCP 写入链路。
- Obsidian 桌面应用无需常驻；Vault 文件系统可直接被写入。
- Apple Reminders 仅保存时间戳、行动标题和 Obsidian 双链线索。
- 在 `/` 提供调试用 React 网页客户端。

## 平台边界

- 服务运行端：macOS
- 主要输入端：iPhone 快捷指令
- 调试界面：浏览器访问 `http://localhost:5001`
- 提醒同步：通过 AppleScript / `osascript` 写入 Reminders

## 架构

```
[iPhone 快捷指令] ──(POST { text, reset })──► [Mac 网关 (Bun)]
       ▲                                              │
      │                                     generateText → DeepSeek API
       │                                              │
       │                                    ASK_MORE → 追加到 Session
       └────(CONTINUE: 追问内容)──────────────┤
                                             │
                                    COMPLETE → 并行深度调研 Agent
                                             → 关联产物目录 + Reminders
       └────(FINISH: 简短归档确认)────────────┘
```

## 技术栈

- 运行时：Bun
- 语言：TypeScript
- LLM：DeepSeek API（`deepseek-chat`），通过 Vercel AI SDK（`@ai-sdk/openai`）驱动
- 搜索：浏览器搜索工具（Google / DuckDuckGo / Bing）
- 知识库：Obsidian CLI 或 MCP（SSE）
- 数据校验：Zod
- 调试客户端：React 网页

## 快速开始

### 1. 环境要求

- Bun 1.0+
- pnpm 10+
- macOS（需授权 Reminders 权限给终端/Bun）
- DeepSeek API Key（[platform.deepseek.com](https://platform.deepseek.com)）

### 2. 配置环境变量

```bash
cp .env.example .env
```

必填：

```env
BRAIN_VAULT_PATH=/你的/Vault/绝对路径
DEEPSEEK_API_KEY=sk-...
GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
```

可选：

```env
PORT=5001
MCP_CONFIG_PATH=/你的/mcp.json/绝对路径
OBSIDIAN_MCP_WRITE_TOOL=obsidian_create-note
OBSIDIAN_NOTE_FOLDER=Brainstorm
OBSIDIAN_WRITE_BACKEND=auto
OBSIDIAN_CLI_COMMAND=obsidian
OBSIDIAN_CLI_ARGS=["{path}"]
```

### 3. 安装依赖并启动

```bash
pnpm install
pnpm start
```

`pnpm start` 会先启动 Obsidian MCP Server，等待其健康检查通过后再启动网关。
`BRAIN_VAULT_PATH/OBSIDIAN_NOTE_FOLDER` 会被创建并作为报告写入的 Vault 根目录。
当 `OBSIDIAN_WRITE_BACKEND=auto` 时，服务会先尝试配置的 Obsidian CLI 命令；若该命令不可用，则回退到 MCP 写入。停止该命令时，两个进程会一起退出。

### 4. 验证接口

```bash
# 开始新一轮（reset: true）
curl -X POST http://localhost:5001/distill \
  -H 'Content-Type: application/json' \
  -d '{"text":"我想做一个用 AI 帮助记忆闪念的工具","reset":true}'

# 继续追问（reset: false）
curl -X POST http://localhost:5001/distill \
  -H 'Content-Type: application/json' \
  -d '{"text":"核心是语音输入，然后自动结构化存到 Obsidian","reset":false}'
```

### 5. iPhone 快捷指令配置

详见 [docs/setup.md](./docs/setup.md)（递归自调用模式）。

### 6. 调试网页

在浏览器中打开 `http://localhost:5001/`，可直接与 `/distill` 接口交互。

### 7. Obsidian 归档

每个完成的对话都会在以 `BRAIN_VAULT_PATH/OBSIDIAN_NOTE_FOLDER` 为根目录
的 Vault 中创建一个带时间戳的独立产物目录。目录内包含主报告，以及所有
高度相关、偏执行落地的深度调研报告；主子报告通过 frontmatter 父子关系和
双向 `[[双链]]` 关联。原始输入和会话记录只保留在主报告中。

调研主题由主澄清 Agent 自动选择，不设固定数量上限，但只允许直接影响主报告
执行的领域进入产物。所有调研 Agent 必须先全部成功，系统才开始写入任何报告；
任一调研失败都会终止本次归档。

## API

### 请求

`POST /distill` — `Content-Type: application/json`

| 字段 | 类型 | 是否必填 | 说明 |
|---|---|---|---|
| `text` | string | 是 | 非空的用户输入 |
| `reset` | boolean | 否 | `true` 时开启新一轮 Session（默认 `false`） |

### 响应

```json
{ "status": "CONTINUE", "text": "核心痛点到底是什么？" }
```

```json
{ "status": "FINISH", "text": "## 20分钟 Milestone\n..." }
```

## 开发

```bash
pnpm test
pnpm lint
pnpm exec tsc --noEmit
```

## 错误语义

- `400`：请求参数无效
- `500`：澄清、深度调研或归档写入失败

## MCP

服务启动时会同时加载 `mcp.json` 中的 GitHub 与 Obsidian MCP 服务。GitHub MCP 通过 Docker 运行，并向澄清 Agent 暴露只读的 `repos`、`issues`、`pull_requests` 工具；Obsidian MCP 通过 SSE 连接，最终归档由网关直接调用 `obsidian_create-note`。写入失败会终止本次收工流程，避免返回虚假的成功状态。
