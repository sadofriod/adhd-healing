# ADHD Healing

[English README](./README.md)

这是一个面向单用户、面向本地部署的 Obsidian-First 想法澄清与蒸馏网关。它把散落的闪念收拢成一份可长期保留的本地笔记：先用 DeepSeek 进行结构化澄清，再把结果落进你自己的 Obsidian Vault 容器下的独立报告子目录，而不是把知识托管到云端笔记工具。

内置终端 CLI 与 React 网页工作台共享同一套流式 API，系统已经把会话历史持久化到 SQLite，因此可以暂停、恢复、切换历史会话，而不依赖单次网页交互。Apple Reminders 同步现已改为可选，默认关闭，让首轮体验更聚焦于核心的 Obsidian 归档闭环。

## 20 分钟价值主张

1. 克隆仓库。
2. 配置 `DEEPSEEK_API_KEY` 与 `BRAIN_VAULT_PATH`。
3. 运行 `pnpm run start:cli`，完成一次从想法到归档笔记的完整闭环。

## 功能概述

- 通过 `POST /distill` 接口接收 `{ text, reset, resume, sessionId, attachments }` 格式的文字输入，并以 NDJSON 流返回进度事件和最终结果。
- 通过 Prisma + SQLite 持久化会话历史，并允许客户端基于 `sessionId` 继续或切换会话。
- 使用 DeepSeek `deepseek-chat` 模型，通过 Vercel AI SDK 做结构化决策。
- 当需要最新文档 / 产品动态 / 外部事实或真实页面交互时，可通过 CloakBrowser MCP 调用浏览器自动化工具。
- 澄清收束时自动识别与主报告高度相关的垂直、细分或交叉领域，并行启动可使用浏览器自动化和只读 MCP 工具的独立调研 Agent。
- 会话结束时，通过独立 Obsidian 持久化层写入带 YAML 属性、分类关系和语义化 `[[双链]]` 网络的完整 Markdown，适配 Graph View。
- 默认会使用 Obsidian CLI 作为主写入路径；CLI 缺失时会直接失败并提示安装。
- Obsidian 桌面应用无需常驻；Vault 文件系统可直接被写入。
- 通过 CloakBrowser MCP 提供浏览器自动化能力。
- 通过官方 `@modelcontextprotocol/server-filesystem` 增加只读文件读取 MCP。
- Apple Reminders 仅保存时间戳、行动标题和 Obsidian 双链线索。
- 在 `/` 提供 React 网页工作台，内含对话时间线、执行进度和历史会话面板。
- 支持终端 CLI 模式，并内置会话命令：新会话、继续暂停会话、查看历史会话、切换历史会话。
- 前端界面与服务端 API 错误信息均支持中英文（通过 `x-locale` 或 `accept-language` 识别）。

## 平台边界

- 服务运行端：macOS
- 内置入口：终端 CLI 与浏览器 `http://localhost:5001`
- 外部入口：任何可调用 `/distill` 的 HTTP 自动化客户端
- 提醒同步：通过 AppleScript / `osascript` 写入 Reminders

## 架构

```
[CLI / Web / 自动化客户端] ──(POST /distill)──► [Mac 网关 (Bun)]
       ▲                                                │
       │                                     流式返回进度与结果
       │                                                │
       │                            DeepSeek + 搜索 + 并行调研 Agent
       │                                                │
       └────(复用 sessionId 或 /sessions)── CONTINUE / PAUSED
                     │
                 FINISH → Obsidian 产物包
                   → Apple Reminders
```

## 技术栈

- 运行时：Bun
- 语言：TypeScript
- LLM：DeepSeek API（`deepseek-chat`），通过 Vercel AI SDK（`@ai-sdk/openai`）驱动
- 搜索：浏览器搜索工具（Google / DuckDuckGo / Bing）
- 知识库：Obsidian CLI 或 MCP（SSE）
- 本地文件读取：官方只读 filesystem MCP，使用显式 allowlist
- 数据校验：Zod
- 调试客户端：React 网页

## 快速开始

### 1. 环境要求

- Bun 1.0+
- pnpm 10+
- macOS（需授权 Reminders 权限给终端/Bun）
- 已安装 Obsidian 桌面应用，并在设置中启用 Command line interface，且已注册到 PATH
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
MCP_FILESYSTEM_ALLOWED_DIRS=["/额外授权的/本地目录"]
OBSIDIAN_MCP_WRITE_TOOL=obsidian_create-note
OBSIDIAN_NOTE_FOLDER=Brainstorm
OBSIDIAN_WRITE_BACKEND=cli
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
当 `OBSIDIAN_WRITE_BACKEND=auto` 时，服务会直接使用配置的 Obsidian CLI 命令；若该命令不可用，会立即失败并提示安装 Obsidian CLI。若你明确想走 MCP 写入，请将 `OBSIDIAN_WRITE_BACKEND` 设为 `mcp`。停止该命令时，两个进程会一起退出。
同一条启动链路还会加载官方 filesystem MCP，并且只向模型暴露只读文件工具；可读范围由显式 allowlist 限定，默认包含 Vault 路径，也可以通过 `MCP_FILESYSTEM_ALLOWED_DIRS` 追加其它绝对路径。
会话历史保存在 SQLite 中；如果未显式设置 `DATABASE_URL`，运行时会默认使用仓库内的 `data/sessions.db`。

### 4. 验证接口

```bash
# 开始新一轮，并打印 NDJSON 流
curl -N -X POST http://localhost:5001/distill \
  -H 'Content-Type: application/json' \
  -d '{"text":"我想做一个用 AI 帮助记忆闪念的工具","reset":true}'

# 查看已持久化的历史会话
curl http://localhost:5001/sessions

# 基于 sessionId 继续指定会话
curl -N -X POST http://localhost:5001/distill \
  -H 'Content-Type: application/json' \
  -d '{"text":"核心是语音输入，然后自动结构化存到 Obsidian","sessionId":"<session-id>"}'
```

`/distill` 的返回值是按行分隔的 JSON 流。最后一行一定是 `result` 事件，包含 `status`、`sessionId` 和用户可读文本。

### 5. 终端 CLI

```bash
pnpm run start:cli
```

可选启动参数：

```bash
pnpm run start:cli -- --new
pnpm run start:cli -- --session <session-id>
pnpm run start:cli -- --help
```

CLI 内置命令：

- `/new` 开启新会话
- `/continue` 继续当前会话中的暂停任务
- `/history` 查看历史会话
- `/switch <id|n>` 按会话 id 或列表序号切换历史会话
- `/help` 查看命令帮助
- `/exit` 退出 CLI

### 6. 网页工作台

在浏览器中打开 `http://localhost:5001/`，网页工作台会调用同一套 `/distill` 和 `/sessions` 接口，并展示执行进度与历史会话。

### 7. 外部客户端

任何可发送 HTTP 请求的自动化客户端都可以直接调用相同接口。仓库不再维护平台专属的客户端接入脚本说明；客户端应尽量保持薄，只负责采集输入和展示输出，把会话状态交给网关维护。

### 8. Obsidian 归档

每个完成的对话都会先在 `BRAIN_VAULT_PATH/OBSIDIAN_NOTE_FOLDER` 这个产物容器下
创建一个带时间戳的独立报告目录，然后把该目录本身作为实际 Vault 根目录使用，
`.obsidian` 也只会出现在这个报告目录里。目录内包含主报告，以及所有高度相关、
偏执行落地的深度调研报告；主子报告通过 frontmatter 父子关系和双向 `[[双链]]`
关联。原始输入和会话记录只保留在主报告中。

调研主题由主澄清 Agent 自动选择，不设固定数量上限，但只允许直接影响主报告
执行的领域进入产物。所有调研 Agent 必须先全部成功，系统才开始写入任何报告；
任一调研失败都会终止本次归档。

## MCP

服务启动时会同时加载当前默认的 MCP 集成：

- GitHub MCP 通过 Docker 运行，并向澄清 Agent 暴露只读的 `repos`、`issues`、`pull_requests` 工具。
- CloakBrowser MCP 通过 `npx` 运行，并向模型暴露浏览器自动化工具。
- Filesystem MCP 使用官方 `@modelcontextprotocol/server-filesystem` 包，只暴露本地只读文件工具。
- Obsidian MCP 通过 SSE 连接，最终归档由网关直接调用。

## 部署取舍

当前默认运行形态是宿主 macOS + SQLite，而不是完整 Docker 化应用栈。这是有意为之：服务依赖本地 Vault 路径、Obsidian CLI 以及可选的 Apple Reminders 自动化，这些能力在宿主环境中更直接、更稳定，放进容器反而会增加额外转接成本。对于当前单用户、本地优先的工作流，SQLite 已经足够；Docker 只在 `mcp.json` 里被用作只读 GitHub MCP Server 的可选运行方式。只有当远程部署、非 macOS 贡献者接入，或多用户托管成为主要诉求时，才值得重新评估 Docker Compose。

## API

### `POST /distill`

请求体（`Content-Type: application/json`）：

| 字段 | 类型 | 是否必填 | 说明 |
|---|---|---|---|
| `text` | string | 是 | 非空的用户输入 |
| `reset` | boolean | 否 | `true` 时放弃当前激活会话并开启新会话 |
| `resume` | boolean | 否 | 对同一 `sessionId` 的暂停任务发起重试 |
| `sessionId` | string | 否 | 显式绑定到某个已持久化会话 |
| `attachments` | array | 否 | 可选的内联文件载荷 `{ name, content, mimeType?, size }` |

响应类型：`application/x-ndjson; charset=utf-8`

返回内容按行分隔，每一行都是一个独立 JSON 事件。执行过程中，网关可能先输出进度事件和用量事件，最后输出 `result` 事件。

```json
{ "type": "progress", "phase": "process", "message": "正在收敛问题范围" }
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
    "text": "## 20分钟 Milestone\n...",
    "tokenUsage": {
      "inputTokens": 1200,
      "outputTokens": 300,
      "totalTokens": 1500
    }
  }
}
```

可恢复的网络错误会返回 `PAUSED` 结果，客户端可通过 `resume: true` 继续同一轮任务。

### 会话历史接口

- `GET /sessions`：返回已持久化的会话摘要列表。
- `POST /sessions/:id/activate`：把指定会话标记为当前激活会话，供 CLI 或网页继续处理。

### 错误语义

- `400`：流启动前的 JSON 或参数校验失败
- `500`：流启动前的请求初始化失败
- `type: "error"` 事件：流处理中发生未捕获错误、调研失败或归档写入失败

## 开发

```bash
pnpm run build:web
pnpm test
pnpm lint
pnpm exec tsc --noEmit
```

## 贡献

贡献方式、开发约定和提交流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。仓库现已增加 GitHub Actions CI，会在每次 push 和 pull request 上执行安装、lint、typecheck、测试与前端构建检查。

## 仓库结构

```text
.
├── docs/                  产品文档与配置说明
├── prisma/                SQLite schema 与 migrations
├── public/                HTML 外壳与构建后的前端资源
├── scripts/cli.ts         终端 CLI 入口
├── src/config/            环境变量解析
├── src/cli/               CLI 循环、命令解析与终端 IO
├── src/routes/distill/    请求校验、流式返回与主流程编排
├── src/routes/sessions.ts 会话历史与激活接口
├── src/services/          LLM、会话、Vault、Reminders 与 MCP 集成
├── src/utils/             Markdown 等通用工具
├── src/web/               React 网页工作台
├── server.ts              Bun HTTP 入口
└── README.md              英文说明
```
