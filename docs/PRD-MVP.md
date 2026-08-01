# ADHD Healing MVP PRD

## 1. 文档状态

- 版本：v0.2
- 状态：Implemented baseline
- 事实来源：当前 `master` 分支代码
- 产品形态：Mac 本地运行的单用户想法澄清与蒸馏网关

本文只描述当前代码已经提供并需要继续保持的 MVP 能力。更完整的语音知识库产品方向见 `docs/PRD.md`；历史方案不代表当前接口承诺。

## 2. 一句话定义

用户通过 iPhone 快捷指令或 React 调试网页提交文本，DeepSeek 通过多轮单点追问帮助用户澄清想法；完成后，系统生成 Markdown，写入本地主 Vault 和分类归档，并尝试把里程碑同步到 Apple Reminders。

## 3. 目标与成功标准

### 3.1 产品目标

1. 验证多轮主动澄清是否比一次性摘要更能形成可执行结果。
2. 让 iPhone 快捷指令保持简单，只处理文本输入和 `CONTINUE` / `FINISH` 状态。
3. 把完成的结果沉淀为可被 Obsidian 等工具读取的本地 Markdown。
4. 把结果中的里程碑接入 Apple Reminders，形成行动出口。

### 3.2 成功标准

1. 文本请求可开始或继续一轮对话。
2. 每轮返回一个澄清问题或最终 Markdown。
3. 完成后同时产生主 Vault 文件和 `.local-vault` 分类归档，并重建归档索引。
4. 存在里程碑时尝试创建提醒；提醒失败不影响主响应。
5. React 网页可展示对话时间线和最终结果。

## 4. 当前范围

### 4.1 已实现

| 模块 | 当前能力 |
| --- | --- |
| 输入入口 | iPhone 快捷指令为主要入口；React 网页为文本调试入口 |
| API | `POST /distill` 接收 JSON `{ text, reset }` |
| 会话 | 服务端维护单个进程级内存会话 |
| 模型 | DeepSeek `deepseek-chat`，通过 Vercel AI SDK 调用 |
| 澄清 | LLM 在继续追问与最终输出之间做结构化决策 |
| 外部信息 | LLM 可按需调用 Google、DuckDuckGo 或 Bing 浏览器搜索 |
| 主 Vault | 最终 Markdown、YAML Front Matter 和用户原始输入写入 `BRAIN_VAULT_PATH` |
| 本地归档 | 写入 `.local-vault/<一级分类>/<二级分类>/` 并重建 `index.md` |
| 行动同步 | 通过 `osascript` 写入 Apple Reminders；失败降级为日志 |
| 调试网页 | 文本提交、追问时间线、新会话和最终 Markdown 展示 |

### 4.2 当前不包含

1. 浏览器录音、音频上传和服务端语音转写。
2. PostgreSQL、pgvector、embedding 或跨会话语义检索。
3. `session_id`、并行会话、多人账户或云端会话同步。
4. 原始音频归档、管理后台和知识聚类。
5. 本地 LM Studio 模型。

## 5. 端到端流程

```mermaid
flowchart LR
    A[iPhone 快捷指令或 React 网页] --> B[POST /distill]
    B --> C{reset=true?}
    C -->|是| D[清空内存会话]
    C -->|否| E[沿用当前内存会话]
    D --> F[追加用户文本]
    E --> F
    F --> G[DeepSeek 判断]
    G -->|需要公开资料| H[浏览器搜索]
    H --> G
    G -->|继续澄清| I[返回 CONTINUE 和问题]
    I --> A
    G -->|完成| J[生成 Markdown 与归档分类]
    J --> K[写主 Vault]
    K --> L[写 .local-vault 并重建索引]
    L --> M[尝试写 Apple Reminders]
    M --> N[清空会话并返回 FINISH]
```

## 6. 功能需求

### 6.1 配置与启动

| 编号 | 需求 |
| --- | --- |
| MVP-FR-001 | 服务使用 Bun + TypeScript 运行，默认监听 `5001` |
| MVP-FR-002 | 必须配置非空 `DEEPSEEK_API_KEY` |
| MVP-FR-003 | 必须配置绝对路径 `BRAIN_VAULT_PATH` |
| MVP-FR-004 | `PORT` 可选，必须是合法正整数端口 |
| MVP-FR-005 | 配置不合法时，启动必须失败并输出 Zod 校验信息 |
| MVP-FR-006 | 启动命令必须先构建 React 静态资源，再启动服务 |

### 6.2 API 与会话

| 编号 | 需求 |
| --- | --- |
| MVP-FR-101 | 提供 `POST /distill`，仅接收 JSON 文本请求 |
| MVP-FR-102 | `text` 必须为去除首尾空白后的非空字符串 |
| MVP-FR-103 | `reset` 为可选布尔值，默认 `false` |
| MVP-FR-104 | `reset=true` 时先清空当前会话，再追加本次输入 |
| MVP-FR-105 | 成功响应固定为 `{ status, text }` |
| MVP-FR-106 | `status` 只能为 `CONTINUE` 或 `FINISH` |
| MVP-FR-107 | 请求校验失败返回 `400` 和 `{ error }` |
| MVP-FR-108 | 未处理异常返回 `500` 和 `{ error }` |
| MVP-FR-109 | 最终完成后清空内存会话 |

### 6.3 澄清与搜索

| 编号 | 需求 |
| --- | --- |
| MVP-FR-201 | 使用 DeepSeek `deepseek-chat` 生成澄清决策 |
| MVP-FR-202 | 信息不足时返回一个聚焦问题 |
| MVP-FR-203 | 信息充分时返回最终 Markdown、标题、里程碑和归档分类 |
| MVP-FR-204 | 模型可按需调用浏览器搜索工具获取最新公开信息 |
| MVP-FR-205 | 搜索工具最多执行有限步骤，避免无限工具循环 |
| MVP-FR-206 | 最终归档分类必须包含一级分类、二级分类、摘要和标签 |

### 6.4 文件持久化与归档

| 编号 | 需求 |
| --- | --- |
| MVP-FR-301 | 主 Vault 目录不存在时自动创建 |
| MVP-FR-302 | 主 Vault 文件名由时间戳和安全标题组成 |
| MVP-FR-303 | 主 Vault 文件包含 YAML Front Matter、最终 Markdown 和用户原始输入 |
| MVP-FR-304 | 每个完成会话额外写入仓库根目录 `.local-vault` |
| MVP-FR-305 | 归档路径按模型生成的一级、二级分类组织 |
| MVP-FR-306 | 每次归档后重建 `.local-vault/index.md` |
| MVP-FR-307 | 归档内容保留最终 Markdown、原始输入和完整对话记录 |

### 6.5 Reminders 与网页

| 编号 | 需求 |
| --- | --- |
| MVP-FR-401 | 仅在里程碑非空时尝试同步 Apple Reminders |
| MVP-FR-402 | Reminders 同步失败只记录日志，不使最终请求失败 |
| MVP-FR-403 | `/` 提供构建后的 React 调试网页 |
| MVP-FR-404 | 网页支持文本提交、加载态、错误态、对话时间线和最终结果 |
| MVP-FR-405 | 网页“新会话”使下一次提交携带 `reset=true` |

## 7. API 契约

### 7.1 请求

```json
{
  "text": "我想做一个帮助记录灵感的工具",
  "reset": true
}
```

### 7.2 继续追问

```json
{
  "status": "CONTINUE",
  "text": "你最希望它先解决记录、整理还是执行的问题？"
}
```

### 7.3 完成

```json
{
  "status": "FINISH",
  "text": "## 今日灵感内核\n..."
}
```

## 8. 约束与风险

1. 会话是服务端全局内存状态，多个客户端会共享并可能互相干扰。
2. 服务重启会丢失未完成会话；浏览器刷新不会主动清空服务端会话。
3. 主 Vault 或归档写入失败会使完成请求返回 `500`。
4. DeepSeek 与浏览器搜索依赖网络；搜索站点结构变化可能导致结果质量下降。
5. Reminders 仅支持 macOS，且首次使用需要系统授权。

## 9. 验收

```bash
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm run build:web
```

手工验收还应覆盖：首次请求、连续追问、主动重置、完成后两个 Vault 产物、归档索引和 Reminders 降级行为。

## 10. 后续候选

以下能力需要单独立项，不属于当前 MVP 契约：

1. 音频输入与本地或云端 ASR。
2. 持久会话 ID 与并发隔离。
3. PostgreSQL/pgvector 历史语义检索。
4. 本地模型和离线模式。
5. 归档搜索 UI 与自动主题合并。