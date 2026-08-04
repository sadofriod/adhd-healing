# Web 调试界面指南

## 1. 入口

启动服务后，在 Mac 浏览器打开 `http://localhost:5001/`。

该网页是内置的浏览器工作台，与终端 CLI 及其他 HTTP 客户端共享同一套 `/distill` 和 `/sessions` 接口。同一局域网中的其他设备也可以访问 `http://<mac-ip>:5001/`。

## 2. 当前能力

网页提供以下功能：

1. 通过文本输入提交想法或回答追问。
2. 展示完整对话时间线和模型执行进度。
3. 在请求因可恢复网络问题暂停时，提供继续执行入口。
4. 通过“历史会话”面板查看并继续 SQLite 中已持久化的会话。
5. 通过“新会话”操作，让下一次提交携带 `reset: true`。

当前仍不包含浏览器录音、音频转写或多人协作能力。

## 3. 对话流程

1. 输入想法并提交。
2. 服务端以 NDJSON 流返回进度事件，最后输出 `result` 事件。
3. `result.status` 为 `CONTINUE` 时，继续回答返回的单个澄清问题。
4. `result.status` 为 `PAUSED` 时，使用“继续任务”恢复同一轮执行。
5. `result.status` 为 `FINISH` 时，网页展示最终 Markdown 与 token 使用量。
6. 要放弃当前对话并开始新主题，先点击“新会话”，再提交新想法。

浏览器刷新会重置当前页面状态，但不会删除已持久化的会话记录。刷新后如需接续旧会话，可从“历史会话”面板重新激活。服务重启不会删除已经落入 SQLite 的会话历史。

## 4. API 契约

### 请求

`POST /distill`，请求头为 `Content-Type: application/json`：

```json
{
  "text": "我想澄清一个产品想法",
  "reset": true,
  "resume": false,
  "sessionId": "optional-session-id"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `text` | `string` | 必填，去除首尾空白后不能为空 |
| `reset` | `boolean` | 可选，默认为 `false`；为 `true` 时先清空当前服务端会话 |
| `resume` | `boolean` | 可选，默认为 `false`；为 `true` 时重试同一 `sessionId` 的暂停任务 |
| `sessionId` | `string` | 可选，用于绑定到已持久化的会话 |

### 流式响应事件

`/distill` 返回 `application/x-ndjson`。每一行都是一个独立事件。

```json
{ "type": "progress", "phase": "process", "message": "正在收敛问题范围" }
```

### 继续追问结果

```json
{
  "type": "result",
  "result": {
    "status": "CONTINUE",
    "sessionId": "session-1",
    "text": "你希望这个想法最终解决谁的什么问题？"
  }
}
```

### 暂停结果

```json
{
  "type": "result",
  "result": {
    "status": "PAUSED",
    "sessionId": "session-1",
    "text": "fetch failed"
  }
}
```

### 完成结果

```json
{
  "type": "result",
  "result": {
    "status": "FINISH",
    "sessionId": "session-1",
    "text": "## 今日灵感内核\n...",
    "tokenUsage": {
      "inputTokens": 1200,
      "outputTokens": 300,
      "totalTokens": 1500
    }
  }
}
```

`FINISH` 的 `text` 是最终 Markdown。完成链路还会写入主 Vault、`.local-vault` 分类归档，并在存在里程碑时尝试写入 Apple Reminders。

### 会话历史接口

- `GET /sessions`：返回历史会话列表。
- `POST /sessions/:id/activate`：激活指定会话，供网页继续处理。

### 错误响应

```json
{
  "error": "text is required"
}
```

请求校验失败返回 `400`；流启动前的初始化异常返回 `500`；流处理中未捕获异常会以下列事件形式返回：

```json
{ "type": "error", "error": "unexpected failure" }
```

## 5. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 刷新后时间线消失 | 页面状态被重置；从“历史会话”面板重新激活对应会话 |
| 返回 `400` | 请求体不是有效 JSON，或 `text` 缺失/为空 |
| 返回 `500` | 检查服务端日志、DeepSeek API Key、网络和 Vault 写入权限 |
| 出现暂停状态 | 这是可恢复网络错误；使用“继续任务”重试 |
| 最终面板为空 | 当前响应仍是 `CONTINUE`，或请求发生错误 |