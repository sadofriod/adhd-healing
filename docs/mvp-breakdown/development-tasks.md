# MVP 开发任务与实现状态

## 1. 文档目标

本清单将 `docs/PRD-MVP.md` 映射到当前代码。状态以仓库实现为准，不把规划能力标记为已完成。

## 2. 当前任务

| ID | 状态 | 任务 | 实现位置 | 需求映射 | 验收 |
| --- | --- | --- | --- | --- | --- |
| T-001 | 已完成 | Bun 服务与默认端口 | `server.ts` | MVP-FR-001 | `pnpm start` |
| T-002 | 已完成 | 环境变量校验 | `src/config/env.ts` | MVP-FR-002 至 005 | 缺少必填变量时启动失败 |
| T-003 | 已完成 | React 静态资源构建与服务 | `scripts/build-web.ts`, `src/web/static.ts` | MVP-FR-006, 403 | `pnpm run build:web` |
| T-004 | 已完成 | `/distill` JSON 请求校验 | `src/routes/distill/validate.ts` | MVP-FR-101 至 103, 107 | 空文本和非法 JSON 返回 `400` |
| T-005 | 已完成 | 单内存会话与重置 | `src/services/session.ts` | MVP-FR-104, 109 | 连续请求共享上下文，重置后从空会话开始 |
| T-006 | 已完成 | API 响应与错误边界 | `src/routes/distill/index.ts` | MVP-FR-105 至 108 | 响应为 JSON；异常返回 `{ error }` |
| T-007 | 已完成 | DeepSeek 客户端 | `src/services/llm-client.ts` | MVP-FR-201 | 配置有效时可调用 `deepseek-chat` |
| T-008 | 已完成 | 澄清/完成决策 | `src/services/clarification/` | MVP-FR-202, 203 | 决策可解析为 `clarify` 或 `final` |
| T-009 | 已完成 | 浏览器自动化 MCP | `mcp.json`, `src/services/mcp.ts`, `src/services/clarification/` | MVP-FR-204, 205 | 浏览器能力通过 CloakBrowser MCP 暴露并可用于澄清和调研 |
| T-010 | 已完成 | 归档分类 | `src/services/clarification/archive.ts` | MVP-FR-206 | 完成决策包含分类、摘要和标签 |
| T-011 | 已完成 | 主 Vault 写入 | `src/services/vault.ts` | MVP-FR-301 至 303 | 完成后生成 Markdown 文件 |
| T-012 | 已完成 | 分类归档与索引 | `src/services/vault.ts` | MVP-FR-304 至 307 | `.local-vault/index.md` 被重建 |
| T-013 | 已完成 | Apple Reminders 同步降级 | `src/services/reminders.ts`, `src/routes/distill/finalize.ts` | MVP-FR-401, 402 | 权限失败不影响最终响应 |
| T-014 | 已完成 | React 文本调试界面 | `src/web/` | MVP-FR-404, 405 | 可完成追问、重置和最终展示 |
| T-015 | 已完成 | 使用与配置文档 | `README.md`, `README.zh-CN.md`, `docs/setup.md`, `docs/web-entry.md` | 全部 | 新环境可按文档启动 |

## 3. 当前自动化覆盖

| 测试文件 | 覆盖范围 |
| --- | --- |
| `src/services/vault.spec.ts` | 文件名、归档路径、索引等 Vault 行为 |
| `src/services/clarification/agent.spec.ts` | 澄清 Agent 配置 |
| `src/services/clarification/archive-agent.spec.ts` | 归档 Agent 配置 |
| `src/utils/markdown.spec.ts` | Markdown 提取工具 |
| `src/web/static.spec.ts` | 静态资源响应 |

## 4. 待补测试

| ID | 优先级 | 任务 | 验收标准 |
| --- | --- | --- | --- |
| T-101 | 高 | 请求校验单元测试 | 覆盖非法 JSON、空文本和 `reset` 默认值 |
| T-102 | 高 | `/distill` 路由测试 | 覆盖 `400`、`500` 和成功 JSON 响应 |
| T-103 | 高 | 会话状态测试 | 覆盖追加、重置、完成清空和客户端并发限制 |
| T-104 | 高 | 完成链路测试 | Mock 外部服务并验证主 Vault、归档和 Reminders 降级 |
| T-105 | 中 | Web Hook 测试 | 覆盖 `CONTINUE`、`FINISH`、错误态和延迟重置 |
| T-106 | 中 | 浏览器端到端测试 | 覆盖从首轮文本到最终 Markdown 的完整循环 |

## 5. 后续产品任务

这些任务不属于当前 MVP，开始前需要先更新 PRD 和 API 契约：

| ID | 候选能力 | 关键前置决策 |
| --- | --- | --- |
| F-001 | 音频输入与 ASR | 音频协议、模型、隐私和失败降级 |
| F-002 | 持久会话与 `session_id` | 存储方案、并发模型和迁移策略 |
| F-003 | PostgreSQL + pgvector RAG | embedding 模型、数据模型和召回评估 |
| F-004 | 本地模型 | 模型兼容性、资源要求和云端回退 |
| F-005 | 归档搜索界面 | 索引读取方式和写入并发控制 |

## 6. Definition of Done

任务只有在以下条件都满足时才算完成：

1. 行为与 `docs/PRD-MVP.md` 一致。
2. 失败边界明确，不隐藏外部依赖错误。
3. 有自动化测试或可重复的手工验收步骤。
4. `pnpm test`、`pnpm lint`、`pnpm exec tsc --noEmit` 和 `pnpm run build:web` 通过。