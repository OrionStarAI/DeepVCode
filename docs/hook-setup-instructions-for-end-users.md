# DeepV Code Hooks 安装与配置指南（跨平台）

## 创建 hooks 目录

**Windows：**
```cmd
mkdir "%USERPROFILE%\.deepv\hooks"
```

**macOS/Linux：**
```bash
mkdir -p "$HOME/.deepv/hooks"
```

---

## 复制脚本文件

**Windows：**
```cmd
copy "D:\Projects\dvcode\DeepVCode\.deepvcode\hooks\hook-template.bat" "%USERPROFILE%\.deepv\hooks\test-hook-logger.bat"
```

**macOS/Linux：**
```bash
cp "/Users/yourname/Projects/dvcode/DeepVCode/.deepvcode/hooks/hook-template.sh" "$HOME/.deepv/hooks/test-hook-logger.sh"
chmod +x "$HOME/.deepv/hooks/test-hook-logger.sh"
```

---

## 修改 settings.json 配置

**Windows：**
```json
{
  "hooks": {
    "AfterTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cmd /c %USERPROFILE%\\.deepv\\hooks\\test-hook-logger.bat",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

**macOS/Linux：**
```json
{
  "hooks": {
    "AfterTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.deepv/hooks/test-hook-logger.sh",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

---

## 设置权限

**macOS/Linux：**
```bash
chmod +x "$HOME/.deepv/hooks/test-hook-logger.sh"
```

---

## 查看日志

**Windows：**
```cmd
type "%USERPROFILE%\.deepv\hooks\hook_log.txt"
```

**macOS/Linux：**
```bash
cat "$HOME/.deepv/hooks/hook_log.txt"
```

---

## 支持的钩子事件类型

DeepV Code 支持在系统的关键生命周期节点触发钩子。以下是所有支持的事件类型：

### 1. 会话生命周期
- **`SessionStart`**: 会话初始化完成时触发。
- **`SessionEnd`**: 会话结束（用户退出、超时或错误）时触发。
- **`PreCompress`**: 聊天记录压缩前触发（当上下文过长时）。

### 2. Agent 循环
- **`BeforeAgent`**: Agent 主循环开始前触发。**支持阻止执行**。
- **`AfterAgent`**: Agent 主循环结束后触发。可以获取完整的请求和响应数据。

### 3. LLM 交互
- **`BeforeModel`**: 发送请求给 LLM 之前触发。**支持修改请求内容**。
- **`AfterModel`**: 收到 LLM 响应之后触发。**支持修改响应内容**。
- **`BeforeToolSelection`**: LLM 进行工具选择之前触发。

### 4. 工具执行
- **`BeforeTool`**: 工具执行之前触发。
- **`AfterTool`**: 工具执行之后触发。
- **`Notification`**: 工具需要权限确认时触发。

---

## 钩子数据传递与交互

钩子脚本通过 **环境变量** 和 **标准输入 (stdin)** 接收数据。

### 环境变量
所有钩子都会收到以下环境变量：
- `DEEPV_SESSION_ID`: 当前会话 ID
- `DEEPV_HOOK_EVENT`: 触发的事件名称（如 `BeforeModel`）
- `DEEPV_TIMESTAMP`: 触发时间戳

### 输入数据 (JSON)
钩子脚本可以通过读取标准输入 (stdin) 获取详细的上下文数据。数据格式为 JSON。

**示例数据结构：**
```json
{
  "session_id": "session_12345",
  "hook_event_name": "BeforeTool",
  "tool_name": "read_file",
  "tool_input": {
    "path": "/path/to/file.txt"
  },
  "cwd": "/current/working/directory"
}
```

### 不同事件的特有数据

| 事件 | 特有数据字段 | 说明 |
|------|--------------|------|
| `BeforeTool` / `AfterTool` | `tool_name`, `tool_input` | 工具名称和参数 |
| `AfterTool` | `tool_response` | 工具执行结果 |
| `BeforeModel` | `model`, `contents` | 模型名称和请求内容 |
| `AfterModel` | `model`, `response` | 模型名称和响应内容 |
| `BeforeAgent` | `prompt` | 用户的输入提示词 |
| `AfterAgent` | `prompt`, `response` | 用户输入和 AI 响应 |
| `SessionStart` | `source` | 启动来源 (startup, resume) |
| `SessionEnd` | `reason` | 结束原因 (exit, error, timeout) |

---

## 高级用法：修改系统行为

某些钩子允许脚本通过输出特定的 JSON 来修改 DeepV Code 的行为。

### 1. 修改 LLM 请求 (`BeforeModel`)
脚本输出 JSON：
```json
{
  "action": "modify_request",
  "modifications": {
    "contents": [...] // 新的请求内容
  }
}
```

### 2. 阻止 Agent 执行 (`BeforeAgent`)
脚本输出 JSON：
```json
{
  "action": "stop",
  "reason": "安全策略拦截：检测到敏感关键词"
}
```

### 3. 修改 LLM 响应 (`AfterModel`)
脚本输出 JSON：
```json
{
  "action": "modify_response",
  "modifications": {
    "response": {...} // 新的响应对象
  }
}
```

---

## Hook Matcher 配置（精准控制触发工具）

### 什么是 Matcher？

`matcher` 是一个字段，用来**指定钩子仅在特定工具执行后触发**。支持三种匹配方式：

#### 1. 精确工具名匹配
只在执行指定工具时触发：
```json
{
  "hooks": {
    "AfterTool": [
      {
        "matcher": "read_file",
        "hooks": [
          {
            "type": "command",
            "command": "cmd /c %USERPROFILE%\\.deepv\\hooks\\test-hook-logger.bat",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```
**效果**：只在执行 `read_file` 工具后触发钩子

#### 2. 正则表达式匹配
使用正则表达式匹配多个工具：
```json
{
  "matcher": "read_.*",
  "hooks": [...]
}
```
**效果**：匹配所有以 `read_` 开头的工具（`read_file`, `read_many_files`, `read_lints`）

#### 3. 多工具精确匹配
使用正则表达式的选择符：
```json
{
  "matcher": "^(read_file|write_file|replace)$",
  "hooks": [...]
}
```
**效果**：只在执行 `read_file`、`write_file` 或 `replace` 工具后触发

#### 4. 不指定 Matcher（默认）
省略 `matcher` 字段表示匹配所有工具：
```json
{
  "hooks": [...]
}
```
**效果**：任何工具执行后都会触发钩子

### 常见 Matcher 示例

| 场景 | Matcher | 说明 |
|------|---------|------|
| 所有文件操作 | `.*file.*` | 匹配名称包含 "file" 的工具 |
| 所有读取操作 | `read_.*` | 匹配所有 read_ 开头的工具 |
| 所有写入操作 | `^(write_file\|replace)$` | 精确匹配写入工具 |
| Shell 命令 | `run_shell_command` | 仅在执行 shell 时触发 |
| 搜索操作 | `(search_file_content\|google_web_search)` | 匹配搜索工具 |
| Web 操作 | `web_.*` | 匹配所有 web_ 开头的工具 |
| 任何工具 | (省略) | 不写 matcher 字段 |

### 完整工具列表（可用于 Matcher）

**核心内置工具（21 个）：**

#### 文件操作
- `read_file` - 读取文件内容
- `write_file` - 写入文件内容
- `replace` - 替换文件内容（编辑）
- `delete_file` - 删除文件

#### 目录操作
- `list_directory` - 列出目录内容
- `glob` - 按模式查找文件

#### 搜索和查询
- `search_file_content` - 在文件中搜索文本（使用正则表达式）
- `read_lints` - 读取代码检查诊断

#### 代码修复
- `lint_fix` - 自动修复代码检查错误
- `read_many_files` - 一次读取多个文件

#### Shell 命令
- `run_shell_command` - 执行 shell 命令

#### Web 工具
- `web_fetch` - 从 URL 获取内容
- `google_web_search` - Google 网络搜索

#### 文档和 PPT
- `ppt_outline` - 管理 PowerPoint 大纲
- `ppt_generate` - 生成 PowerPoint 演示文稿

#### 记忆和任务
- `save_memory` - 保存信息到长期记忆
- `todo_write` - 管理待办事项
- `task` - 任务/工作流管理（VSCode 插件模式下禁用）

#### 技能系统
- `use_skill` - 激活和加载技能
- `list_available_skills` - 列出可用技能
- `get_skill_details` - 获取技能详细信息

**动态工具：**
- **MCP 服务器工具**：从配置的 MCP 服务器动态发现
  - 格式：`{serverName}__{toolName}`
  - 例如：`context7__search` 来自 Context7 MCP 服务器
- **命令行发现工具**：从 `toolDiscoveryCommand` 配置发现

### 快速参考：按功能分类的 Matcher

```json
{
  "hooks": {
    "AfterTool": [
      {
        "description": "所有文件读取操作",
        "matcher": "^(read_file|read_many_files)$",
        "hooks": [...]
      },
      {
        "description": "所有文件修改操作",
        "matcher": "^(write_file|replace|delete_file)$",
        "hooks": [...]
      },
      {
        "description": "所有搜索操作",
        "matcher": "^(search_file_content|google_web_search)$",
        "hooks": [...]
      },
      {
        "description": "Shell 命令",
        "matcher": "run_shell_command",
        "hooks": [...]
      },
      {
        "description": "所有工具（不指定 matcher）",
        "hooks": [...]
      }
    ]
  }
}
```

---

## 完整配置示例 (settings.json)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{ "type": "command", "command": "echo 'Session Started' >> session.log" }]
      }
    ],
    "BeforeAgent": [
      {
        "hooks": [{ "type": "command", "command": "python check_policy.py" }]
      }
    ],
    "AfterTool": [
      {
        "matcher": "^(write_file|replace)$",
        "hooks": [{ "type": "command", "command": "git add . && git commit -m 'Auto commit'" }]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [{ "type": "command", "command": "echo 'Session Ended' >> session.log" }]
      }
    ]
  }
}
```

---

## 跨平台速查表

| 操作 | Windows | macOS/Linux |
|------|----------|-------------|
| 主目录变量 | `%USERPROFILE%` | `$HOME` |
| 创建目录 | `mkdir "%USERPROFILE%\.deepv\hooks"` | `mkdir -p "$HOME/.deepv/hooks"` |
| 拷贝模板 | `copy src dst` | `cp src dst` |
| 权限设置 | 无需 | `chmod +x` |
| 查看日志 | `type file` | `cat file` |
| 命令写法 | `"cmd /c %USERPROFILE%\\.deepv\\hooks\\script.bat"` | `"$HOME/.deepv/hooks/script.sh"` |