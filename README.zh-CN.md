# ADHD Healing

[English README](./README.md)

这是一个面向单用户、Mac 本地运行的想法澄清与蒸馏网关。iPhone 快捷指令是主要使用入口，React 网页作为调试工具使用。服务端通过 DeepSeek API（Vercel AI SDK）进行多轮结构化追问；当需要最新公开资料时，可调用浏览器搜索工具；会话完成后，结果会同时写入主 Vault、按分类归档到 `.local-vault`，并同步到 Apple Reminders。

## 功能概述

- 通过 `POST /distill` 接口接收 `{ text, reset }` 格式的文字输入，返回 `{ status, text }`。
- 服务端用内存 Session 维持多轮对话（单用户、单 Session）。
- 使用 DeepSeek `deepseek-chat` 模型，通过 Vercel AI SDK 做结构化决策。
- 当需要最新文档 / 产品动态 / 外部事实时，可调用 Google / DuckDuckGo / Bing 浏览器搜索工具。
- 会话结束时，将最终 Markdown 写入本地知识库目录（支持 Obsidian）。
- 每次完成的对话会额外归档到 `.local-vault/<一级分类>/<二级分类>/...`，并自动重建 `.local-vault/index.md` 方便检索。
- 从结果中提取里程碑，通过 `osascript` 同步到 Apple Reminders。
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
       │                                    generateObject → DeepSeek API
       │                                              │
       │                                    ASK_MORE → 追加到 Session
       └────(CONTINUE: 追问内容)──────────────┤
                                             │
                                    COMPLETE → 写 Vault + 归档索引 + Reminders
       └────(FINISH: Markdown 报告)───────────┘
```

## 技术栈

- 运行时：Bun
- 语言：TypeScript
- LLM：DeepSeek API（`deepseek-chat`），通过 Vercel AI SDK（`@ai-sdk/openai`）驱动
- 搜索：浏览器搜索工具（Google / DuckDuckGo / Bing）
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
```

可选：

```env
PORT=5001
```

### 3. 安装依赖并启动

```bash
pnpm install
pnpm start
```

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

### 7. 归档检索

每个完成的对话都会复制到 [`.local-vault/`](/Users/dushihua/dev/apps/adhd-healing/.local-vault) 中，并带有 LLM 生成的一级/二级分类。可直接打开 [`.local-vault/index.md`](/Users/dushihua/dev/apps/adhd-healing/.local-vault/index.md) 按分类检索历史对话。

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
