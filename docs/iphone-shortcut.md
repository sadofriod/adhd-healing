# iPhone 快捷指令搭建说明

这份说明把仓库里的 `/distill` 接口契约展开成一套可直接在 iPhone `快捷指令` App 里照着搭的流程。

## 1. 目标

快捷指令需要完成这件事：

1. 每一轮先展示服务端当前问题。
2. 让用户选择 `语音回答` 或 `文字回答`。
3. 以 `multipart/form-data` 调用 `POST /distill`。
4. 保存返回的 `session_id`。
5. 如果返回 `response_type = clarify`，继续下一轮。
6. 如果返回 `response_type = final`，展示最终 Markdown 并结束。

## 2. 使用前提

在 iPhone 上搭快捷指令前，先确认：

1. Mac 上的服务已经启动：`bun --env-file=.env server.ts`
2. iPhone 和 Mac 在同一局域网。
3. 你知道 Mac 的局域网 IP，例如 `192.168.31.20`。
4. 下面这个地址可以从 iPhone 访问：`http://<mac-ip>:5001/distill`

建议先在 Mac 上用 `curl` 验证接口可用，再开始搭快捷指令。

## 3. 快捷指令里要用到的变量

建议统一使用下面这些变量名：

| 变量名 | 初始值 | 用途 |
| --- | --- | --- |
| `Base URL` | `http://<mac-ip>:5001/distill` | 服务端地址 |
| `Prompt` | `先把你的想法说出来，或直接输入。` | 当前要展示给用户的问题 |
| `Session ID` | 空值 | 串联多轮澄清 |
| `Server Response` | 无 | 保存接口返回 |
| `Response Dict` | 无 | 保存解析后的 JSON 字典 |
| `Is Complete` | `false` | 判断是否结束 |
| `Assistant Message` | 空值 | 当前追问文案 |
| `Final Markdown` | 空值 | 最终输出 |

## 4. 推荐动作编排

下面按 `快捷指令` 里的动作顺序写。

### 4.1 初始化

1. 添加 `文本` 动作，内容填入：`http://<mac-ip>:5001/distill`
2. 添加 `设定变量`，命名为 `Base URL`
3. 添加 `文本` 动作，内容填入：`先把你的想法说出来，或直接输入。`
4. 添加 `设定变量`，命名为 `Prompt`
5. 添加 `文本` 动作，内容留空
6. 添加 `设定变量`，命名为 `Session ID`
7. 添加 `重复` 动作，次数填 `30`

`30` 只是保险上限，正常会在服务端返回最终结果后提前结束。

### 4.2 每轮开场

在 `重复` 动作内部，先放这两个动作：

1. `显示提醒`
   - 标题：`当前问题`
   - 消息：选择变量 `Prompt`
2. `从菜单中选取`
   - 选项 1：`语音回答`
   - 选项 2：`文字回答`
   - 选项 3：`取消`

### 4.3 `语音回答` 分支

在 `语音回答` 分支里按这个顺序放动作：

1. `录制音频`
2. `获取 URL 内容`
   - URL：变量 `Base URL`
   - 方法：`POST`
   - 请求体：`表单`
   - 表单字段：

| 字段名 | 类型 | 值 |
| --- | --- | --- |
| `input_mode` | 文本 | `audio` |
| `session_id` | 文本 | 变量 `Session ID` |
| `audio` | 文件 | 上一步录制的音频 |

3. `设定变量`，命名为 `Server Response`

说明：

1. 第一轮时 `Session ID` 为空是允许的，服务端会自动创建新会话。
2. 后续轮次同一个变量会带上服务端返回的 UUID。

### 4.4 `文字回答` 分支

在 `文字回答` 分支里按这个顺序放动作：

1. `询问输入`
   - 提示语：变量 `Prompt`
   - 输入类型：`文本`
   - 允许多行：开启
2. `获取 URL 内容`
   - URL：变量 `Base URL`
   - 方法：`POST`
   - 请求体：`表单`
   - 表单字段：

| 字段名 | 类型 | 值 |
| --- | --- | --- |
| `input_mode` | 文本 | `text` |
| `session_id` | 文本 | 变量 `Session ID` |
| `text` | 文本 | 上一步输入的文本 |

3. `设定变量`，命名为 `Server Response`

### 4.5 `取消` 分支

在 `取消` 分支里只放一个动作：

1. `停止此快捷指令`

### 4.6 统一解析响应

`从菜单中选取` 动作结束后，在它的外面继续追加下面这些动作。这样无论是语音还是文字分支，都会走同一套解析逻辑。

1. `从输入中获取字典`
   - 输入：变量 `Server Response`
2. `设定变量`，命名为 `Response Dict`
3. `获取字典值`
   - 字典：变量 `Response Dict`
   - 键：`session_id`
4. `设定变量`，命名为 `Session ID`
5. `获取字典值`
   - 字典：变量 `Response Dict`
   - 键：`assistant_message`
6. `设定变量`，命名为 `Assistant Message`
7. `获取字典值`
   - 字典：变量 `Response Dict`
   - 键：`is_complete`
8. `设定变量`，命名为 `Is Complete`
9. `获取字典值`
   - 字典：变量 `Response Dict`
   - 键：`final_markdown`
10. `设定变量`，命名为 `Final Markdown`
11. `设定变量`
   - 变量名：`Prompt`
   - 值：变量 `Assistant Message`

### 4.7 结束判断

继续在 `重复` 动作内部追加：

1. `如果`
   - 条件：变量 `Is Complete` `是`
2. 在 `如果` 分支里追加：
   - `显示结果`，内容为变量 `Final Markdown`
   - 可选：`拷贝到剪贴板`，内容为变量 `Final Markdown`
   - `停止此快捷指令`
3. `否则`
   - 不放任何动作，让循环自动进入下一轮

## 5. 服务端返回格式

澄清轮示例：

```json
{
  "session_id": "6dc4f04b-5b92-4b44-9f5d-59b7aa4f2df4",
  "response_type": "clarify",
  "assistant_message": "你希望最终产出成什么形式？",
  "turn_index": 1,
  "is_complete": false,
  "final_markdown": null,
  "final_title": null,
  "milestone": null
}
```

结束轮示例：

```json
{
  "session_id": "6dc4f04b-5b92-4b44-9f5d-59b7aa4f2df4",
  "response_type": "final",
  "assistant_message": "蒸馏完成",
  "turn_index": 3,
  "is_complete": true,
  "final_markdown": "### 🎯 今日灵感内核\n...",
  "final_title": "核心标题",
  "milestone": "20分钟行动项内容"
}
```

快捷指令只要依赖这几个键即可：

1. `session_id`
2. `assistant_message`
3. `is_complete`
4. `final_markdown`

## 6. 调试建议

### 6.1 第一次先只做文字模式

先搭一版只有 `文字回答` 的快捷指令，确认以下链路通了再补语音：

1. iPhone 能访问 Mac 的局域网地址。
2. `/distill` 能返回 JSON。
3. `session_id` 能在多轮之间保留下来。

### 6.2 常见错误对应

| 现象 | 可能原因 |
| --- | --- |
| `400 text field is required...` | 文字模式下没有传 `text` |
| `400 audio field is required...` | 语音模式下没有把录音文件绑定到 `audio` 字段 |
| `400 session_id must be a valid UUID` | 快捷指令把损坏的旧会话 ID 传回去了 |
| `409` | 会话状态已经结束，仍然继续追发旧 `session_id` |
| `500` | 本地转写、LM Studio、数据库或 Vault 写入出现异常 |

### 6.3 建议的排错顺序

1. 先在 Mac 本机用 `curl` 调通文字请求。
2. 再在 iPhone 上做文字模式。
3. 最后再接 `录制音频` 分支。

## 7. 最小可用版本

如果你只想最快跑通，可以先只做下面这条最短路径：

1. 初始化 `Base URL`、`Prompt`、`Session ID`
2. 每轮只提供 `文字回答`
3. 发送 `input_mode=text`
4. 保存 `session_id`
5. `is_complete=false` 时继续
6. `is_complete=true` 时展示 `final_markdown`

这条最小链路确认无误后，再把 `语音回答` 分支补进去。