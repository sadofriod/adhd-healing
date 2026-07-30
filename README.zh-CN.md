# ADHD Healing

[English README](./README.md)

这是一个面向单用户、Mac 本地运行的想法澄清与蒸馏网关。React 网页现在是唯一的交互壳；服务端负责接收文字或语音输入，通过本地 LLM 进行多轮追问，结合 pgvector 检索历史相似想法，并把最终结果写入 PostgreSQL、本地 Markdown Vault 和 Apple Reminders。

## 仓库能力

- 在 `/` 提供一个适合手机与桌面的 React 网页输入页。
- 通过统一的 `POST /distill` 接口接收 `text` 或 `audio` 输入。
- 用 `session_id` 串联多轮澄清，并持久化每轮消息。
- 通过本地 LM Studio 模型完成追问决策与 embedding。
- 通过 PostgreSQL + pgvector 检索历史相似想法，参与当前澄清。
- 将最终 Markdown 写入本地知识库目录。
- 从结果中提取里程碑，并尝试同步到 Apple Reminders。

## 平台边界

这个仓库当前不是通用的跨平台服务，而是明确面向本地工作流：

- 服务运行端：macOS
- 输入端：同一局域网中的手机或桌面浏览器
- 语音转写：启动时编译的 macOS Speech Swift Helper
- 提醒同步：通过 AppleScript / `osascript` 写入 Reminders

如果你的目标是 Linux 服务器或完整 iOS App，这个仓库目前不覆盖。

## 架构概览

```mermaid
flowchart LR
  A[React 网页] --> B[POST /distill]
    B --> C[规范化文本或转写音频]
    C --> D[加载或创建 session]
    D --> E[拼装会话上下文]
    E --> F[pgvector 相似检索]
    F --> G[LM Studio 判断继续追问或直接总结]
    G -->|clarify| H[返回问题和 session_id]
    G -->|final| I[生成最终 Markdown]
    I --> J[写入 PostgreSQL]
    I --> K[写入本地 Vault]
    I --> L[同步 Apple Reminders]
```

## 技术栈

- 运行时：Bun
- 语言：TypeScript
- 数据库：PostgreSQL + pgvector
- 数据访问：Prisma + `pg`
- 校验：Zod
- 模型接入：LM Studio OpenAI 兼容接口
- 客户端壳：React 网页

## 快速开始

### 1. 前置依赖

- Bun 1.0+
- pnpm 10+
- Docker
- Xcode Command Line Tools / Swift 工具链
- LM Studio 0.3+
- 已授权语音识别和提醒能力的 macOS 环境

### 2. 启动 PostgreSQL + pgvector

```bash
docker run -d \
  --name pgvector \
  -e POSTGRES_USER=adhd \
  -e POSTGRES_PASSWORD=adhd \
  -e POSTGRES_DB=adhd_healing \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### 3. 配置 LM Studio

加载下列模型，并开启本地服务 `http://localhost:1234/v1`：

- 对话模型：`qwen2.5-7b-instruct`
- 向量模型：`nomic-ai/nomic-embed-text-v1.5`

服务启动时会校验这两个模型 ID 是否已加载。

### 4. 配置环境变量

```bash
cp .env.example .env
```

必填项：

```env
BRAIN_VAULT_PATH=/absolute/path/to/your/local/vault
DATABASE_URL=postgresql://user:password@localhost:5432/adhd_healing
```

可选默认值：

```env
LM_STUDIO_BASE_URL=http://localhost:1234/v1
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
CHAT_MODEL=qwen2.5-7b-instruct
MAX_CLARIFICATION_TURNS=3
PORT=5001
```

### 5. 安装并运行

```bash
pnpm install
pnpm start
```

启动流程会依次完成：

- 初始化数据库
- 校验 LM Studio 可连通且模型已加载
- 构建并校验 macOS Speech Helper
- 启动默认监听 `5001` 端口的 HTTP 服务

### 6. 验证接口

```bash
curl -X POST http://localhost:5001/distill \
  -H 'Content-Type: application/json' \
  -d '{"input_mode":"text","text":"我有一个需要澄清的想法"}'
```

### 7. 打开网页输入页

在 Mac 上访问 `http://localhost:5001/`，或者在同一局域网的 iPhone 上访问 `http://<mac-ip>:5001/`。

网页中的每一轮逻辑：

1. 阅读当前追问。
2. 使用文字输入框或录音上传区域回答。
3. 页面会自动保存并复用返回的 `session_id`。
4. 如果 `is_complete = false`，继续进入下一轮澄清。
5. 如果 `is_complete = true`，在结果面板里查看最终 Markdown。

使用说明见：[docs/web-entry.md](./docs/web-entry.md)

## API 概览

### 请求

`POST /distill`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `input_mode` | 是 | `text` 或 `audio` |
| `text` | 文字模式必填 | 非空字符串；支持 JSON 或 `multipart/form-data` |
| `audio` | 语音模式必填 | 上传的音频文件；仅支持 `multipart/form-data` |
| `session_id` | 否 | 上一轮返回的 UUID |

### 成功响应

```json
{
  "session_id": "uuid",
  "response_type": "clarify",
  "assistant_message": "你希望这个想法最终产出成什么形式？",
  "turn_index": 1,
  "is_complete": false,
  "final_markdown": null,
  "final_title": null,
  "milestone": null
}
```

当会话结束时，`response_type` 会变成 `final`，并返回 `final_markdown`。

### 错误语义

- `400`：请求字段缺失、格式错误，或 `session_id` 非法
- `409`：引用的会话已经结束，不能继续输入
- `500`：处理链路出现未捕获异常

## 开发命令

```bash
pnpm test
pnpm lint
pnpm exec tsc --noEmit
```

## 仓库结构

```text
.
├── docs/                  产品文档、环境说明、网页输入说明
├── public/                HTML 壳与前端构建产物
├── prisma/                Prisma schema
├── src/config/            环境变量解析
├── src/db/                数据库初始化、表结构、查询
├── src/routes/distill/    请求校验与主编排
├── src/services/          LLM、转写、提醒、Vault、会话服务
├── src/utils/             上下文与 Markdown 处理
├── src/web/               React 页面、Hook、组件与静态资源路由
├── server.ts              Bun HTTP 入口
└── README.md              英文仓库 README
```

## 文档导航

- 环境搭建与运行：[docs/setup.md](./docs/setup.md)
- 网页输入说明：[docs/web-entry.md](./docs/web-entry.md)
- MVP 产品范围：[docs/PRD-MVP.md](./docs/PRD-MVP.md)
- MVP 拆解索引：[docs/mvp-breakdown/README.md](./docs/mvp-breakdown/README.md)

## 当前状态

当前仓库实现的是围绕 `POST /distill` 与 React 网页输入页的本地 MVP，目标是验证单用户工作流，而不是面向云部署、多租户或原生移动端。