# DeepV Code Hooks 用户实践指南

> 本指南为 DeepV Code 用户提供实践操作的完整说明。通过本指南，你将学会如何设置、配置和使用 Hooks 系统来增强安全性、自动化任务和定制行为。

## 🎯 重要：一份配置，两种客户端

**Hooks 在 `packages/core` 实现，所以：**

| 客户端 | 享受 Hooks | 配置文件 | 说明 |
|--------|-----------|--------|------|
| **CLI** | ✅ 是 | `.deepvcode/settings.json` | 命令行自动享受 Hooks 能力 |
| **VS Code UI 插件** | ✅ 是 | `.deepvcode/settings.json` | 插件自动享受 Hooks 能力 |

**这意味着：**
- 🎯 **一份配置** - 配置一次 Hooks，CLI 和 VSCode 都生效
- 🔄 **统一安全策略** - 所有用户无论通过哪个客户端都受同样的安全约束
- 🚀 **零额外工作** - 两个客户端自动继承 core 的 Hooks 能力

---

## 📚 目录

1. [快速开始](#快速开始)
2. [配置文件位置](#配置文件位置)
3. [5分钟快速体验](#5分钟快速体验)
4. [常见场景实践](#常见场景实践)
5. [调试和排查](#调试和排查)
6. [常见问题 FAQ](#常见问题-faq)

---

## 快速开始

### 前置要求

- DeepV Code CLI 已安装
- 项目目录已初始化（或新建）

### 选择你的平台和脚本语言

**🐧 Linux/macOS 用户（推荐 Bash）**：
```bash
# 安装 jq（用于 JSON 处理）
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq
```

**🪟 Windows 用户（选择其中一个）**：

✅ **推荐**：**Python 脚本**（跨平台最简单）
- Python 3.6+ 已安装
- 使用 `json` 模块（内置）
- 完全跨平台兼容

✅ **推荐**：**PowerShell 脚本**（Windows 原生）
- PowerShell 5.0+ 或 PowerShell Core
- 内置 `ConvertFrom-Json` 和 `ConvertTo-Json`
- 无需额外工具

✅ **可选**：**Batch/Cmd 脚本**（传统 Windows）
- 需要 PowerShell 支持 JSON 处理
- 或调用外部工具

✅ **可选**：**WSL（Windows Subsystem for Linux）**
- 安装 WSL
- 按 Linux 方式使用 Bash

### 基本概念

**Hooks** 是在 DeepV Code 的关键事件触发时执行的自定义脚本。每个 Hook：

- 接收 JSON 格式的输入（via stdin）
- 执行业务逻辑
- 输出 JSON 格式的结果（via stdout）
- 可以阻止或修改系统行为

**11 个关键事件：**

| 事件 | 触发时机 | 典型用途 |
|------|---------|--------|
| `BeforeTool` | 工具执行前 | 权限检查 |
| `AfterTool` | 工具执行后 | 审计日志 |
| `BeforeAgent` | 提示发送前 | 提示增强 |
| `BeforeModel` | 调用 LLM 前 | 参数优化 |
| `BeforeToolSelection` | 选择工具前 | 权限隔离 |
| `SessionStart` | 会话开始 | 初始化 |
| `SessionEnd` | 会话结束 | 清理资源 |
| 其他 4 个... | | |

---

## 配置文件位置

### 全局配置（所有项目）

```
~/.deepv/settings.json
```

### 项目级配置（仅当前项目）

```
<项目根目录>/.deepvcode/settings.json
```

**优先级**（高到低）：
1. 项目配置 (`.deepvcode/settings.json`)
2. 全局配置 (`~/.deepv/settings.json`)
3. 扩展配置 (`gemini-extension.json`)

---

## 5分钟快速体验

### 第 1 步：创建 Hooks 目录

```bash
# 在项目根目录执行
mkdir -p .deepvcode/hooks
cd .deepvcode/hooks
```

### 第 2 步：创建第一个 Hook 脚本

创建文件 `security-gate.sh`：

```bash
#!/bin/bash
set -euo pipefail

# 读取标准输入的 JSON
read INPUT

# 解析工具名称
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

# 如果无法解析，允许操作
if [[ -z "$TOOL" ]]; then
  echo '{"decision":"allow"}'
  exit 0
fi

# 黑名单：禁止删除操作
if [[ "$TOOL" == "delete_file" ]]; then
  echo '{"decision":"deny","reason":"Delete operations are blocked"}'
  exit 0
fi

# 允许其他操作
echo '{"decision":"allow"}'
exit 0
```

### 第 3 步：设置脚本权限

```bash
chmod +x .deepvcode/hooks/security-gate.sh
```

### 第 4 步：配置 Settings.json

编辑 `.deepvcode/settings.json`：

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/security-gate.sh",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

### 第 5 步：测试

创建测试输入文件 `test-input.json`：

```json
{
  "session_id": "test",
  "cwd": "/tmp",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "delete_file",
  "tool_input": {"path": "/tmp/test.txt"}
}
```

运行测试：

```bash
cat test-input.json | bash .deepvcode/hooks/security-gate.sh
```

预期输出：
```json
{"decision":"deny","reason":"Delete operations are blocked"}
```

✅ **成功！你已创建了第一个 Hook！**

---

## 常见场景实践

### 场景 1：企业安全控制

**目标**：限制文件操作，防止误删

#### 🐧 Linux/macOS 版本（Bash）

**脚本位置**：`.deepvcode/hooks/security-gate.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // empty')

# 禁止列表
FORBIDDEN_PATTERNS=(
  "/etc/*"
  "/sys/*"
  "*.lock"
  "node_modules/*"
)

# 检查黑名单
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == $pattern ]]; then
    echo "{\"decision\":\"deny\",\"reason\":\"Path matches forbidden pattern: $pattern\"}"
    exit 0
  fi
done

# 检查危险操作
case "$TOOL" in
  "delete_file"|"remove_directory")
    echo "{\"decision\":\"deny\",\"reason\":\"Dangerous operation blocked: $TOOL\"}"
    exit 0
    ;;
esac

echo '{"decision":"allow"}'
exit 0
```

**配置**：
```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/security-gate.sh",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

#### 🪟 Windows 版本（Python）

**脚本位置**：`.deepvcode/hooks/security-gate.py`

```python
#!/usr/bin/env python3
import json
import sys
import re

# 读取输入
input_text = sys.stdin.read()
input_data = json.loads(input_text)

tool_name = input_data.get('tool_name', '')
tool_input = input_data.get('tool_input', {})
file_path = tool_input.get('path', '')

# 禁止列表（正则表达式）
forbidden_patterns = [
    r'^[/\\]etc[/\\]',
    r'^[/\\]sys[/\\]',
    r'\.lock

**目标**：记录所有工具调用

**脚本位置**：`.deepvcode/hooks/audit-logger.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 提取关键信息
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
TIMESTAMP=$(echo "$INPUT" | jq -r '.timestamp')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name')

# 创建日志目录
mkdir -p logs

# 记录到文件（不让失败阻止操作）
LOG_FILE="logs/audit-$(date +%Y%m%d).log"
echo "[$TIMESTAMP] Event=$EVENT Tool=$TOOL Session=$SESSION_ID" >> "$LOG_FILE" 2>/dev/null || true

# 总是允许
echo '{"decision":"allow"}'
exit 0
```

**配置**：
```json
{
  "hooks": {
    "AfterTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/audit-logger.sh"
          }
        ]
      }
    ]
  }
}
```

**查看日志**：
```bash
cat logs/audit-20250115.log
# 输出：
# [2025-01-15T10:00:00Z] Event=AfterTool Tool=read_file Session=abc123
# [2025-01-15T10:01:00Z] Event=AfterTool Tool=write_file Session=abc123
```

---

### 场景 3：基于角色的权限控制

**目标**：根据用户角色限制工具权限

**脚本位置**：`.deepvcode/hooks/rbac.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 从环境变量获取用户角色
USER_ROLE="${USER_ROLE:-viewer}"

case "$USER_ROLE" in
  "admin")
    # 管理员：允许所有操作
    echo '{"decision":"allow"}'
    ;;
  "developer")
    # 开发者：禁止删除
    TOOL=$(echo "$INPUT" | jq -r '.tool_name')
    if [[ "$TOOL" == "delete_file" ]]; then
      echo '{"decision":"deny","reason":"Developers cannot delete files"}'
    else
      echo '{"decision":"allow"}'
    fi
    ;;
  "viewer")
    # 查看者：仅读取
    echo '{
      "hookSpecificOutput": {
        "toolConfig": {
          "mode": "ANY",
          "allowedFunctionNames": ["read_file","list_directory","web_fetch"]
        }
      }
    }'
    ;;
  *)
    echo '{"decision":"deny","reason":"Unknown role"}'
    ;;
esac
exit 0
```

**使用方法**：
```bash
# 管理员模式
USER_ROLE=admin deepv-cli

# 开发者模式
USER_ROLE=developer deepv-cli

# 查看者模式
USER_ROLE=viewer deepv-cli
```

---

### 场景 4：提示安全加固

**目标**：为所有提示添加安全指导

**脚本位置**：`.deepvcode/hooks/enhance-prompt.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

SECURITY_GUIDANCE="[SECURITY GUIDELINES]
- Verify user intent before destructive operations
- Never modify system-critical files or configs
- Always check file permissions before operations
- Log important actions for audit purposes
- Ask for confirmation for potentially dangerous operations
[/SECURITY GUIDELINES]"

echo "{
  \"decision\": \"allow\",
  \"hookSpecificOutput\": {
    \"hookEventName\": \"BeforeAgent\",
    \"additionalContext\": \"$SECURITY_GUIDANCE\"
  }
}"
exit 0
```

**配置**：
```json
{
  "hooks": {
    "BeforeAgent": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/enhance-prompt.sh",
            "timeout": 2000
          }
        ]
      }
    ]
  }
}
```

---

### 场景 5：LLM 参数自适应优化

**目标**：根据提示长度自动调整参数

**脚本位置**：`.deepvcode/hooks/optimize-llm.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 获取提示长度
PROMPT=$(echo "$INPUT" | jq -r '.llm_request.messages[0].content // ""')
PROMPT_LENGTH=${#PROMPT}

# 根据长度调整参数
if [[ $PROMPT_LENGTH -gt 2000 ]]; then
  TEMPERATURE="0.8"
  MAX_TOKENS="4096"
elif [[ $PROMPT_LENGTH -gt 500 ]]; then
  TEMPERATURE="0.7"
  MAX_TOKENS="2048"
else
  TEMPERATURE="0.3"
  MAX_TOKENS="1024"
fi

# 检查是否涉及代码
if echo "$PROMPT" | grep -qiE "(code|function|class|def|import)"; then
  # 代码问题：降低温度提高精度
  TEMPERATURE="0.1"
  MAX_TOKENS="4096"
fi

echo "{
  \"hookSpecificOutput\": {
    \"llm_request\": {
      \"config\": {
        \"temperature\": $TEMPERATURE,
        \"maxOutputTokens\": $MAX_TOKENS
      }
    }
  }
}"
exit 0
```

**配置**：
```json
{
  "hooks": {
    "BeforeModel": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/optimize-llm.sh",
            "timeout": 2000
          }
        ]
      }
    ]
  }
}
```

---

## 调试和排查

### 测试 Hook 脚本

创建测试脚本 `.deepvcode/hooks/test.sh`：

```bash
#!/bin/bash

# 彩色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

test_hook() {
  local hook=$1
  local input=$2
  local expected=$3

  echo "Testing: $hook"
  RESULT=$(echo "$input" | bash "$hook" 2>/dev/null)
  DECISION=$(echo "$RESULT" | jq -r '.decision // "error"')

  if [[ "$DECISION" == "$expected" ]]; then
    echo -e "${GREEN}✓ PASS${NC}"
  else
    echo -e "${RED}✗ FAIL${NC}: expected $expected, got $DECISION"
    echo "  Output: $RESULT"
  fi
  echo ""
}

# 测试安全网关
TEST_DELETE='{
  "session_id": "test",
  "cwd": "/tmp",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "delete_file",
  "tool_input": {"path": "/tmp/test"}
}'

test_hook ".deepvcode/hooks/security-gate.sh" "$TEST_DELETE" "deny"

# 测试允许操作
TEST_READ='{
  "session_id": "test",
  "cwd": "/tmp",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "read_file",
  "tool_input": {"path": "/tmp/test"}
}'

test_hook ".deepvcode/hooks/security-gate.sh" "$TEST_READ" "allow"
```

运行测试：
```bash
bash .deepvcode/hooks/test.sh
```

### 启用调试输出

在 Hook 脚本中添加调试：

```bash
#!/bin/bash
DEBUG=${DEBUG:-0}

read INPUT

if [[ $DEBUG -eq 1 ]]; then
  echo "[DEBUG] Received input: $INPUT" >&2
  echo "[DEBUG] Tool: $(echo "$INPUT" | jq '.tool_name')" >&2
fi

# ... 业务逻辑
```

运行带调试：
```bash
DEBUG=1 cat test-input.json | bash .deepvcode/hooks/security-gate.sh
```

### 常见错误

**错误 1：jq not found**
```bash
# 安装 jq
brew install jq  # macOS
sudo apt-get install jq  # Linux
```

**错误 2：Permission denied**
```bash
# 添加执行权限
chmod +x .deepvcode/hooks/*.sh
```

**错误 3：Invalid JSON output**
```bash
# 验证 JSON 有效性
echo '{"decision":"allow"}' | jq .
```

**错误 4：Hook 超时**
```json
{
  "timeout": 60000  // 增加超时时间（毫秒）
}
```

---

## 常见问题 FAQ

### Q1：Hook 支持哪些语言？

**A**：任何支持 stdin/stdout 的脚本或程序，包括：

**跨平台支持：**
- ✅ Bash/Shell 脚本（`.sh`）
- ✅ Windows Batch 脚本（`.bat` / `.cmd`）
- ✅ Windows PowerShell 脚本（`.ps1`）
- ✅ Python（`.py`）
- ✅ JavaScript/Node.js（`.js`）
- ✅ Ruby
- ✅ Go
- ✅ 任何可执行程序

**为什么？** 底层使用 `shell: true` 执行，所以：
- Linux/Mac 用户可以写 Bash 脚本
- Windows 用户可以写 Batch 或 PowerShell 脚本
- 任何平台都可以写 Python 或其他跨平台语言

**Python 例子**：
```python
#!/usr/bin/env python3
import json
import sys

# 读取输入
input_json = json.loads(sys.stdin.read())
tool_name = input_json.get('tool_name')

# 业务逻辑
if tool_name == 'delete_file':
    output = {'decision': 'deny', 'reason': 'Forbidden'}
else:
    output = {'decision': 'allow'}

# 输出结果
print(json.dumps(output))
```

**Windows Batch 例子**：
```batch
@echo off
REM 读取输入（通过管道）
for /f "delims=" %%A in ('powershell -Command "[Console]::In.ReadToEnd()"') do set INPUT=%%A

REM 使用 PowerShell 处理 JSON
powershell -Command "^
  $input = '!INPUT!' | ConvertFrom-Json; ^
  if ($input.tool_name -eq 'delete_file') { ^
    $output = @{'decision'='deny'; 'reason'='Forbidden'} | ConvertTo-Json; ^
    Write-Output $output; ^
  } else { ^
    $output = @{'decision'='allow'} | ConvertTo-Json; ^
    Write-Output $output; ^
  } ^
"
```

**Windows PowerShell 例子**：
```powershell
#!/usr/bin/env pwsh

# 读取输入
$input_text = [Console]::In.ReadToEnd()
$input_json = $input_text | ConvertFrom-Json

# 业务逻辑
if ($input_json.tool_name -eq 'delete_file') {
    $output = @{
        'decision' = 'deny'
        'reason' = 'Forbidden'
    }
} else {
    $output = @{
        'decision' = 'allow'
    }
}

# 输出结果
$output | ConvertTo-Json | Write-Output
```

### Q2：Hook 输出格式有严格要求吗？

**A**：是的，必须是有效的 JSON。最简输出：
```json
{"decision":"allow"}
```

完整输出：
```json
{
  "decision": "allow",
  "reason": "optional reason",
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "optional message",
  "hookSpecificOutput": {
    "additionalContext": "optional"
  }
}
```

### Q3：Hook 可以阻止所有操作吗？

**A**：可以。使用 exit code 2 或返回 `decision: deny`：
```bash
echo '{"decision":"deny","reason":"Blocked"}'
exit 2
```

### Q4：Hook 失败会导致系统崩溃吗？

**A**：不会。Hook 失败默认允许操作继续，除非显式阻止。这确保了系统的鲁棒性。

### Q5：可以同时运行多个 Hook 吗？

**A**：可以。支持两种模式：

**并行执行**（默认）：
```json
{
  "sequential": false,
  "hooks": [...]
}
```

**顺序执行**（后续 hook 看到前一个的修改）：
```json
{
  "sequential": true,
  "hooks": [...]
}
```

### Q6：Hook 性能如何？

**A**：
- 单个 Hook 默认超时 60 秒
- 并行执行多个 Hook 时，总时间为最慢的那个
- 保持 Hook 轻量级是最佳实践

### Q7：如何调试 Hook 不生效的问题？

**A**：
1. 检查 settings.json 语法
2. 验证脚本路径正确
3. 检查脚本权限（`chmod +x`）
4. 用测试输入验证脚本
5. 查看是否有 JSON 格式错误

### Q8：Hook 可以修改 AI 响应吗？

**A**：可以。使用 `AfterModel` 事件修改 LLM 响应：

```bash
echo '{
  "hookSpecificOutput": {
    "llm_response": {
      "candidates": [{
        "content": {"role": "model", "parts": ["Modified response"]},
        "finishReason": "STOP"
      }]
    }
  }
}'
```

### Q9：项目 Hook 和全局 Hook 如何优先级？

**A**：项目级 > 全局级（项目级配置覆盖全局）

### Q10：是否可以禁用所有 Hook？

**A**：可以。删除或注释掉 settings.json 中的 hooks 配置，或设置一个总是允许的 Hook。

---

## 最佳实践总结

✅ **DO（推荐）**
- ✓ 验证输入 JSON 有效性
- ✓ 使用合理的超时时间
- ✓ 记录重要操作
- ✓ 优雅处理失败
- ✓ 编写测试用例
- ✓ 版本控制 Hook 脚本
- ✓ 保持脚本轻量

❌ **DON'T（避免）**
- ✗ 在 Hook 中执行长时间操作
- ✗ 没有输入验证就使用数据
- ✗ 忽略错误处理
- ✗ Hook 依赖外部服务而无备用
- ✗ 过度复杂的业务逻辑
- ✗ 不记录失败日志

---

## 进阶话题

### 集成外部服务

```bash
#!/bin/bash
read INPUT

# 调用远程 API 进行权限检查
RESPONSE=$(curl -s "https://api.company.com/check" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"tool\":\"write_file\"}")

if echo "$RESPONSE" | jq -e '.allowed' > /dev/null; then
  echo '{"decision":"allow"}'
else
  echo '{"decision":"deny","reason":"'$(echo $RESPONSE | jq -r '.reason')'\"}'
fi
```

### Hook 链式处理

```json
{
  "sequential": true,
  "hooks": [
    {"command": "bash ./step1-validate.sh"},
    {"command": "bash ./step2-enhance.sh"},
    {"command": "bash ./step3-audit.sh"}
  ]
}
```

第 2 个 Hook 可以看到第 1 个的输出修改，第 3 个可以看到前两个的修改。

---

## 获取帮助

- 📖 详细文档：`docs/hooks-implementation.md`
- 📚 完整示例：`docs/hooks-examples.md`
- 🐛 报告问题：GitHub Issues
- 💬 社区讨论：DeepV Code 论坛

---

**版本**：1.0
**最后更新**：2025-01-15
**维护者**：DeepV Code 团队
,
    r'node_modules'
]

# 检查黑名单
for pattern in forbidden_patterns:
    if re.search(pattern, file_path, re.IGNORECASE):
        output = {
            'decision': 'deny',
            'reason': f'Path matches forbidden pattern: {pattern}'
        }
        print(json.dumps(output))
        sys.exit(0)

# 检查危险操作
if tool_name in ['delete_file', 'remove_directory']:
    output = {
        'decision': 'deny',
        'reason': f'Dangerous operation blocked: {tool_name}'
    }
    print(json.dumps(output))
    sys.exit(0)

# 允许其他操作
output = {'decision': 'allow'}
print(json.dumps(output))
sys.exit(0)
```

**配置**（Windows 版本）：
```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "python .deepvcode/hooks/security-gate.py",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

#### 🪟 Windows 版本（PowerShell）

**脚本位置**：`.deepvcode/hooks/security-gate.ps1`

```powershell
#!/usr/bin/env pwsh

# 读取输入
$input_text = [Console]::In.ReadToEnd()
$input_data = $input_text | ConvertFrom-Json

$tool_name = $input_data.tool_name
$tool_input = $input_data.tool_input
$file_path = $tool_input.path

# 禁止列表（正则表达式）
$forbidden_patterns = @(
    '^[/\\]etc[/\\]',
    '^[/\\]sys[/\\]',
    '\.lock

**目标**：记录所有工具调用

**脚本位置**：`.deepvcode/hooks/audit-logger.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 提取关键信息
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
TIMESTAMP=$(echo "$INPUT" | jq -r '.timestamp')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name')

# 创建日志目录
mkdir -p logs

# 记录到文件（不让失败阻止操作）
LOG_FILE="logs/audit-$(date +%Y%m%d).log"
echo "[$TIMESTAMP] Event=$EVENT Tool=$TOOL Session=$SESSION_ID" >> "$LOG_FILE" 2>/dev/null || true

# 总是允许
echo '{"decision":"allow"}'
exit 0
```

**配置**：
```json
{
  "hooks": {
    "AfterTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/audit-logger.sh"
          }
        ]
      }
    ]
  }
}
```

**查看日志**：
```bash
cat logs/audit-20250115.log
# 输出：
# [2025-01-15T10:00:00Z] Event=AfterTool Tool=read_file Session=abc123
# [2025-01-15T10:01:00Z] Event=AfterTool Tool=write_file Session=abc123
```

---

### 场景 3：基于角色的权限控制

**目标**：根据用户角色限制工具权限

**脚本位置**：`.deepvcode/hooks/rbac.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 从环境变量获取用户角色
USER_ROLE="${USER_ROLE:-viewer}"

case "$USER_ROLE" in
  "admin")
    # 管理员：允许所有操作
    echo '{"decision":"allow"}'
    ;;
  "developer")
    # 开发者：禁止删除
    TOOL=$(echo "$INPUT" | jq -r '.tool_name')
    if [[ "$TOOL" == "delete_file" ]]; then
      echo '{"decision":"deny","reason":"Developers cannot delete files"}'
    else
      echo '{"decision":"allow"}'
    fi
    ;;
  "viewer")
    # 查看者：仅读取
    echo '{
      "hookSpecificOutput": {
        "toolConfig": {
          "mode": "ANY",
          "allowedFunctionNames": ["read_file","list_directory","web_fetch"]
        }
      }
    }'
    ;;
  *)
    echo '{"decision":"deny","reason":"Unknown role"}'
    ;;
esac
exit 0
```

**使用方法**：
```bash
# 管理员模式
USER_ROLE=admin deepv-cli

# 开发者模式
USER_ROLE=developer deepv-cli

# 查看者模式
USER_ROLE=viewer deepv-cli
```

---

### 场景 4：提示安全加固

**目标**：为所有提示添加安全指导

**脚本位置**：`.deepvcode/hooks/enhance-prompt.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

SECURITY_GUIDANCE="[SECURITY GUIDELINES]
- Verify user intent before destructive operations
- Never modify system-critical files or configs
- Always check file permissions before operations
- Log important actions for audit purposes
- Ask for confirmation for potentially dangerous operations
[/SECURITY GUIDELINES]"

echo "{
  \"decision\": \"allow\",
  \"hookSpecificOutput\": {
    \"hookEventName\": \"BeforeAgent\",
    \"additionalContext\": \"$SECURITY_GUIDANCE\"
  }
}"
exit 0
```

**配置**：
```json
{
  "hooks": {
    "BeforeAgent": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/enhance-prompt.sh",
            "timeout": 2000
          }
        ]
      }
    ]
  }
}
```

---

### 场景 5：LLM 参数自适应优化

**目标**：根据提示长度自动调整参数

**脚本位置**：`.deepvcode/hooks/optimize-llm.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 获取提示长度
PROMPT=$(echo "$INPUT" | jq -r '.llm_request.messages[0].content // ""')
PROMPT_LENGTH=${#PROMPT}

# 根据长度调整参数
if [[ $PROMPT_LENGTH -gt 2000 ]]; then
  TEMPERATURE="0.8"
  MAX_TOKENS="4096"
elif [[ $PROMPT_LENGTH -gt 500 ]]; then
  TEMPERATURE="0.7"
  MAX_TOKENS="2048"
else
  TEMPERATURE="0.3"
  MAX_TOKENS="1024"
fi

# 检查是否涉及代码
if echo "$PROMPT" | grep -qiE "(code|function|class|def|import)"; then
  # 代码问题：降低温度提高精度
  TEMPERATURE="0.1"
  MAX_TOKENS="4096"
fi

echo "{
  \"hookSpecificOutput\": {
    \"llm_request\": {
      \"config\": {
        \"temperature\": $TEMPERATURE,
        \"maxOutputTokens\": $MAX_TOKENS
      }
    }
  }
}"
exit 0
```

**配置**：
```json
{
  "hooks": {
    "BeforeModel": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/optimize-llm.sh",
            "timeout": 2000
          }
        ]
      }
    ]
  }
}
```

---

## 调试和排查

### 测试 Hook 脚本

创建测试脚本 `.deepvcode/hooks/test.sh`：

```bash
#!/bin/bash

# 彩色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

test_hook() {
  local hook=$1
  local input=$2
  local expected=$3

  echo "Testing: $hook"
  RESULT=$(echo "$input" | bash "$hook" 2>/dev/null)
  DECISION=$(echo "$RESULT" | jq -r '.decision // "error"')

  if [[ "$DECISION" == "$expected" ]]; then
    echo -e "${GREEN}✓ PASS${NC}"
  else
    echo -e "${RED}✗ FAIL${NC}: expected $expected, got $DECISION"
    echo "  Output: $RESULT"
  fi
  echo ""
}

# 测试安全网关
TEST_DELETE='{
  "session_id": "test",
  "cwd": "/tmp",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "delete_file",
  "tool_input": {"path": "/tmp/test"}
}'

test_hook ".deepvcode/hooks/security-gate.sh" "$TEST_DELETE" "deny"

# 测试允许操作
TEST_READ='{
  "session_id": "test",
  "cwd": "/tmp",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "read_file",
  "tool_input": {"path": "/tmp/test"}
}'

test_hook ".deepvcode/hooks/security-gate.sh" "$TEST_READ" "allow"
```

运行测试：
```bash
bash .deepvcode/hooks/test.sh
```

### 启用调试输出

在 Hook 脚本中添加调试：

```bash
#!/bin/bash
DEBUG=${DEBUG:-0}

read INPUT

if [[ $DEBUG -eq 1 ]]; then
  echo "[DEBUG] Received input: $INPUT" >&2
  echo "[DEBUG] Tool: $(echo "$INPUT" | jq '.tool_name')" >&2
fi

# ... 业务逻辑
```

运行带调试：
```bash
DEBUG=1 cat test-input.json | bash .deepvcode/hooks/security-gate.sh
```

### 常见错误

**错误 1：jq not found**
```bash
# 安装 jq
brew install jq  # macOS
sudo apt-get install jq  # Linux
```

**错误 2：Permission denied**
```bash
# 添加执行权限
chmod +x .deepvcode/hooks/*.sh
```

**错误 3：Invalid JSON output**
```bash
# 验证 JSON 有效性
echo '{"decision":"allow"}' | jq .
```

**错误 4：Hook 超时**
```json
{
  "timeout": 60000  // 增加超时时间（毫秒）
}
```

---

## 常见问题 FAQ

### Q1：Hook 支持哪些语言？

**A**：任何支持 stdin/stdout 的脚本或程序，包括：

**跨平台支持：**
- ✅ Bash/Shell 脚本（`.sh`）
- ✅ Windows Batch 脚本（`.bat` / `.cmd`）
- ✅ Windows PowerShell 脚本（`.ps1`）
- ✅ Python（`.py`）
- ✅ JavaScript/Node.js（`.js`）
- ✅ Ruby
- ✅ Go
- ✅ 任何可执行程序

**为什么？** 底层使用 `shell: true` 执行，所以：
- Linux/Mac 用户可以写 Bash 脚本
- Windows 用户可以写 Batch 或 PowerShell 脚本
- 任何平台都可以写 Python 或其他跨平台语言

**Python 例子**：
```python
#!/usr/bin/env python3
import json
import sys

# 读取输入
input_json = json.loads(sys.stdin.read())
tool_name = input_json.get('tool_name')

# 业务逻辑
if tool_name == 'delete_file':
    output = {'decision': 'deny', 'reason': 'Forbidden'}
else:
    output = {'decision': 'allow'}

# 输出结果
print(json.dumps(output))
```

**Windows Batch 例子**：
```batch
@echo off
REM 读取输入（通过管道）
for /f "delims=" %%A in ('powershell -Command "[Console]::In.ReadToEnd()"') do set INPUT=%%A

REM 使用 PowerShell 处理 JSON
powershell -Command "^
  $input = '!INPUT!' | ConvertFrom-Json; ^
  if ($input.tool_name -eq 'delete_file') { ^
    $output = @{'decision'='deny'; 'reason'='Forbidden'} | ConvertTo-Json; ^
    Write-Output $output; ^
  } else { ^
    $output = @{'decision'='allow'} | ConvertTo-Json; ^
    Write-Output $output; ^
  } ^
"
```

**Windows PowerShell 例子**：
```powershell
#!/usr/bin/env pwsh

# 读取输入
$input_text = [Console]::In.ReadToEnd()
$input_json = $input_text | ConvertFrom-Json

# 业务逻辑
if ($input_json.tool_name -eq 'delete_file') {
    $output = @{
        'decision' = 'deny'
        'reason' = 'Forbidden'
    }
} else {
    $output = @{
        'decision' = 'allow'
    }
}

# 输出结果
$output | ConvertTo-Json | Write-Output
```

### Q2：Hook 输出格式有严格要求吗？

**A**：是的，必须是有效的 JSON。最简输出：
```json
{"decision":"allow"}
```

完整输出：
```json
{
  "decision": "allow",
  "reason": "optional reason",
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "optional message",
  "hookSpecificOutput": {
    "additionalContext": "optional"
  }
}
```

### Q3：Hook 可以阻止所有操作吗？

**A**：可以。使用 exit code 2 或返回 `decision: deny`：
```bash
echo '{"decision":"deny","reason":"Blocked"}'
exit 2
```

### Q4：Hook 失败会导致系统崩溃吗？

**A**：不会。Hook 失败默认允许操作继续，除非显式阻止。这确保了系统的鲁棒性。

### Q5：可以同时运行多个 Hook 吗？

**A**：可以。支持两种模式：

**并行执行**（默认）：
```json
{
  "sequential": false,
  "hooks": [...]
}
```

**顺序执行**（后续 hook 看到前一个的修改）：
```json
{
  "sequential": true,
  "hooks": [...]
}
```

### Q6：Hook 性能如何？

**A**：
- 单个 Hook 默认超时 60 秒
- 并行执行多个 Hook 时，总时间为最慢的那个
- 保持 Hook 轻量级是最佳实践

### Q7：如何调试 Hook 不生效的问题？

**A**：
1. 检查 settings.json 语法
2. 验证脚本路径正确
3. 检查脚本权限（`chmod +x`）
4. 用测试输入验证脚本
5. 查看是否有 JSON 格式错误

### Q8：Hook 可以修改 AI 响应吗？

**A**：可以。使用 `AfterModel` 事件修改 LLM 响应：

```bash
echo '{
  "hookSpecificOutput": {
    "llm_response": {
      "candidates": [{
        "content": {"role": "model", "parts": ["Modified response"]},
        "finishReason": "STOP"
      }]
    }
  }
}'
```

### Q9：项目 Hook 和全局 Hook 如何优先级？

**A**：项目级 > 全局级（项目级配置覆盖全局）

### Q10：是否可以禁用所有 Hook？

**A**：可以。删除或注释掉 settings.json 中的 hooks 配置，或设置一个总是允许的 Hook。

---

## 最佳实践总结

✅ **DO（推荐）**
- ✓ 验证输入 JSON 有效性
- ✓ 使用合理的超时时间
- ✓ 记录重要操作
- ✓ 优雅处理失败
- ✓ 编写测试用例
- ✓ 版本控制 Hook 脚本
- ✓ 保持脚本轻量

❌ **DON'T（避免）**
- ✗ 在 Hook 中执行长时间操作
- ✗ 没有输入验证就使用数据
- ✗ 忽略错误处理
- ✗ Hook 依赖外部服务而无备用
- ✗ 过度复杂的业务逻辑
- ✗ 不记录失败日志

---

## 进阶话题

### 集成外部服务

```bash
#!/bin/bash
read INPUT

# 调用远程 API 进行权限检查
RESPONSE=$(curl -s "https://api.company.com/check" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"tool\":\"write_file\"}")

if echo "$RESPONSE" | jq -e '.allowed' > /dev/null; then
  echo '{"decision":"allow"}'
else
  echo '{"decision":"deny","reason":"'$(echo $RESPONSE | jq -r '.reason')'\"}'
fi
```

### Hook 链式处理

```json
{
  "sequential": true,
  "hooks": [
    {"command": "bash ./step1-validate.sh"},
    {"command": "bash ./step2-enhance.sh"},
    {"command": "bash ./step3-audit.sh"}
  ]
}
```

第 2 个 Hook 可以看到第 1 个的输出修改，第 3 个可以看到前两个的修改。

---

## 获取帮助

- 📖 详细文档：`docs/hooks-implementation.md`
- 📚 完整示例：`docs/hooks-examples.md`
- 🐛 报告问题：GitHub Issues
- 💬 社区讨论：DeepV Code 论坛

---

**版本**：1.0
**最后更新**：2025-01-15
**维护者**：DeepV Code 团队
,
    'node_modules'
)

# 检查黑名单
foreach ($pattern in $forbidden_patterns) {
    if ($file_path -match $pattern) {
        $output = @{
            'decision' = 'deny'
            'reason' = "Path matches forbidden pattern: $pattern"
        }
        $output | ConvertTo-Json | Write-Output
        exit 0
    }
}

# 检查危险操作
if ($tool_name -in @('delete_file', 'remove_directory')) {
    $output = @{
        'decision' = 'deny'
        'reason' = "Dangerous operation blocked: $tool_name"
    }
    $output | ConvertTo-Json | Write-Output
    exit 0
}

# 允许其他操作
$output = @{'decision' = 'allow'}
$output | ConvertTo-Json | Write-Output
exit 0
```

**配置**（PowerShell 版本）：
```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -ExecutionPolicy Bypass .deepvcode/hooks/security-gate.ps1",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

---

### 场景 2：操作审计日志

**目标**：记录所有工具调用

**脚本位置**：`.deepvcode/hooks/audit-logger.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 提取关键信息
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
TIMESTAMP=$(echo "$INPUT" | jq -r '.timestamp')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name')

# 创建日志目录
mkdir -p logs

# 记录到文件（不让失败阻止操作）
LOG_FILE="logs/audit-$(date +%Y%m%d).log"
echo "[$TIMESTAMP] Event=$EVENT Tool=$TOOL Session=$SESSION_ID" >> "$LOG_FILE" 2>/dev/null || true

# 总是允许
echo '{"decision":"allow"}'
exit 0
```

**配置**：
```json
{
  "hooks": {
    "AfterTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/audit-logger.sh"
          }
        ]
      }
    ]
  }
}
```

**查看日志**：
```bash
cat logs/audit-20250115.log
# 输出：
# [2025-01-15T10:00:00Z] Event=AfterTool Tool=read_file Session=abc123
# [2025-01-15T10:01:00Z] Event=AfterTool Tool=write_file Session=abc123
```

---

### 场景 3：基于角色的权限控制

**目标**：根据用户角色限制工具权限

**脚本位置**：`.deepvcode/hooks/rbac.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 从环境变量获取用户角色
USER_ROLE="${USER_ROLE:-viewer}"

case "$USER_ROLE" in
  "admin")
    # 管理员：允许所有操作
    echo '{"decision":"allow"}'
    ;;
  "developer")
    # 开发者：禁止删除
    TOOL=$(echo "$INPUT" | jq -r '.tool_name')
    if [[ "$TOOL" == "delete_file" ]]; then
      echo '{"decision":"deny","reason":"Developers cannot delete files"}'
    else
      echo '{"decision":"allow"}'
    fi
    ;;
  "viewer")
    # 查看者：仅读取
    echo '{
      "hookSpecificOutput": {
        "toolConfig": {
          "mode": "ANY",
          "allowedFunctionNames": ["read_file","list_directory","web_fetch"]
        }
      }
    }'
    ;;
  *)
    echo '{"decision":"deny","reason":"Unknown role"}'
    ;;
esac
exit 0
```

**使用方法**：
```bash
# 管理员模式
USER_ROLE=admin deepv-cli

# 开发者模式
USER_ROLE=developer deepv-cli

# 查看者模式
USER_ROLE=viewer deepv-cli
```

---

### 场景 4：提示安全加固

**目标**：为所有提示添加安全指导

**脚本位置**：`.deepvcode/hooks/enhance-prompt.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

SECURITY_GUIDANCE="[SECURITY GUIDELINES]
- Verify user intent before destructive operations
- Never modify system-critical files or configs
- Always check file permissions before operations
- Log important actions for audit purposes
- Ask for confirmation for potentially dangerous operations
[/SECURITY GUIDELINES]"

echo "{
  \"decision\": \"allow\",
  \"hookSpecificOutput\": {
    \"hookEventName\": \"BeforeAgent\",
    \"additionalContext\": \"$SECURITY_GUIDANCE\"
  }
}"
exit 0
```

**配置**：
```json
{
  "hooks": {
    "BeforeAgent": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/enhance-prompt.sh",
            "timeout": 2000
          }
        ]
      }
    ]
  }
}
```

---

### 场景 5：LLM 参数自适应优化

**目标**：根据提示长度自动调整参数

**脚本位置**：`.deepvcode/hooks/optimize-llm.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 获取提示长度
PROMPT=$(echo "$INPUT" | jq -r '.llm_request.messages[0].content // ""')
PROMPT_LENGTH=${#PROMPT}

# 根据长度调整参数
if [[ $PROMPT_LENGTH -gt 2000 ]]; then
  TEMPERATURE="0.8"
  MAX_TOKENS="4096"
elif [[ $PROMPT_LENGTH -gt 500 ]]; then
  TEMPERATURE="0.7"
  MAX_TOKENS="2048"
else
  TEMPERATURE="0.3"
  MAX_TOKENS="1024"
fi

# 检查是否涉及代码
if echo "$PROMPT" | grep -qiE "(code|function|class|def|import)"; then
  # 代码问题：降低温度提高精度
  TEMPERATURE="0.1"
  MAX_TOKENS="4096"
fi

echo "{
  \"hookSpecificOutput\": {
    \"llm_request\": {
      \"config\": {
        \"temperature\": $TEMPERATURE,
        \"maxOutputTokens\": $MAX_TOKENS
      }
    }
  }
}"
exit 0
```

**配置**：
```json
{
  "hooks": {
    "BeforeModel": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/optimize-llm.sh",
            "timeout": 2000
          }
        ]
      }
    ]
  }
}
```

---

## 调试和排查

### 测试 Hook 脚本

创建测试脚本 `.deepvcode/hooks/test.sh`：

```bash
#!/bin/bash

# 彩色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

test_hook() {
  local hook=$1
  local input=$2
  local expected=$3

  echo "Testing: $hook"
  RESULT=$(echo "$input" | bash "$hook" 2>/dev/null)
  DECISION=$(echo "$RESULT" | jq -r '.decision // "error"')

  if [[ "$DECISION" == "$expected" ]]; then
    echo -e "${GREEN}✓ PASS${NC}"
  else
    echo -e "${RED}✗ FAIL${NC}: expected $expected, got $DECISION"
    echo "  Output: $RESULT"
  fi
  echo ""
}

# 测试安全网关
TEST_DELETE='{
  "session_id": "test",
  "cwd": "/tmp",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "delete_file",
  "tool_input": {"path": "/tmp/test"}
}'

test_hook ".deepvcode/hooks/security-gate.sh" "$TEST_DELETE" "deny"

# 测试允许操作
TEST_READ='{
  "session_id": "test",
  "cwd": "/tmp",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "read_file",
  "tool_input": {"path": "/tmp/test"}
}'

test_hook ".deepvcode/hooks/security-gate.sh" "$TEST_READ" "allow"
```

运行测试：
```bash
bash .deepvcode/hooks/test.sh
```

### 启用调试输出

在 Hook 脚本中添加调试：

```bash
#!/bin/bash
DEBUG=${DEBUG:-0}

read INPUT

if [[ $DEBUG -eq 1 ]]; then
  echo "[DEBUG] Received input: $INPUT" >&2
  echo "[DEBUG] Tool: $(echo "$INPUT" | jq '.tool_name')" >&2
fi

# ... 业务逻辑
```

运行带调试：
```bash
DEBUG=1 cat test-input.json | bash .deepvcode/hooks/security-gate.sh
```

### 常见错误

**错误 1：jq not found**
```bash
# 安装 jq
brew install jq  # macOS
sudo apt-get install jq  # Linux
```

**错误 2：Permission denied**
```bash
# 添加执行权限
chmod +x .deepvcode/hooks/*.sh
```

**错误 3：Invalid JSON output**
```bash
# 验证 JSON 有效性
echo '{"decision":"allow"}' | jq .
```

**错误 4：Hook 超时**
```json
{
  "timeout": 60000  // 增加超时时间（毫秒）
}
```

---

## 常见问题 FAQ

### Q1：Hook 支持哪些语言？

**A**：任何支持 stdin/stdout 的脚本或程序，包括：

**跨平台支持：**
- ✅ Bash/Shell 脚本（`.sh`）
- ✅ Windows Batch 脚本（`.bat` / `.cmd`）
- ✅ Windows PowerShell 脚本（`.ps1`）
- ✅ Python（`.py`）
- ✅ JavaScript/Node.js（`.js`）
- ✅ Ruby
- ✅ Go
- ✅ 任何可执行程序

**为什么？** 底层使用 `shell: true` 执行，所以：
- Linux/Mac 用户可以写 Bash 脚本
- Windows 用户可以写 Batch 或 PowerShell 脚本
- 任何平台都可以写 Python 或其他跨平台语言

**Python 例子**：
```python
#!/usr/bin/env python3
import json
import sys

# 读取输入
input_json = json.loads(sys.stdin.read())
tool_name = input_json.get('tool_name')

# 业务逻辑
if tool_name == 'delete_file':
    output = {'decision': 'deny', 'reason': 'Forbidden'}
else:
    output = {'decision': 'allow'}

# 输出结果
print(json.dumps(output))
```

**Windows Batch 例子**：
```batch
@echo off
REM 读取输入（通过管道）
for /f "delims=" %%A in ('powershell -Command "[Console]::In.ReadToEnd()"') do set INPUT=%%A

REM 使用 PowerShell 处理 JSON
powershell -Command "^
  $input = '!INPUT!' | ConvertFrom-Json; ^
  if ($input.tool_name -eq 'delete_file') { ^
    $output = @{'decision'='deny'; 'reason'='Forbidden'} | ConvertTo-Json; ^
    Write-Output $output; ^
  } else { ^
    $output = @{'decision'='allow'} | ConvertTo-Json; ^
    Write-Output $output; ^
  } ^
"
```

**Windows PowerShell 例子**：
```powershell
#!/usr/bin/env pwsh

# 读取输入
$input_text = [Console]::In.ReadToEnd()
$input_json = $input_text | ConvertFrom-Json

# 业务逻辑
if ($input_json.tool_name -eq 'delete_file') {
    $output = @{
        'decision' = 'deny'
        'reason' = 'Forbidden'
    }
} else {
    $output = @{
        'decision' = 'allow'
    }
}

# 输出结果
$output | ConvertTo-Json | Write-Output
```

### Q2：Hook 输出格式有严格要求吗？

**A**：是的，必须是有效的 JSON。最简输出：
```json
{"decision":"allow"}
```

完整输出：
```json
{
  "decision": "allow",
  "reason": "optional reason",
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "optional message",
  "hookSpecificOutput": {
    "additionalContext": "optional"
  }
}
```

### Q3：Hook 可以阻止所有操作吗？

**A**：可以。使用 exit code 2 或返回 `decision: deny`：
```bash
echo '{"decision":"deny","reason":"Blocked"}'
exit 2
```

### Q4：Hook 失败会导致系统崩溃吗？

**A**：不会。Hook 失败默认允许操作继续，除非显式阻止。这确保了系统的鲁棒性。

### Q5：可以同时运行多个 Hook 吗？

**A**：可以。支持两种模式：

**并行执行**（默认）：
```json
{
  "sequential": false,
  "hooks": [...]
}
```

**顺序执行**（后续 hook 看到前一个的修改）：
```json
{
  "sequential": true,
  "hooks": [...]
}
```

### Q6：Hook 性能如何？

**A**：
- 单个 Hook 默认超时 60 秒
- 并行执行多个 Hook 时，总时间为最慢的那个
- 保持 Hook 轻量级是最佳实践

### Q7：如何调试 Hook 不生效的问题？

**A**：
1. 检查 settings.json 语法
2. 验证脚本路径正确
3. 检查脚本权限（`chmod +x`）
4. 用测试输入验证脚本
5. 查看是否有 JSON 格式错误

### Q8：Hook 可以修改 AI 响应吗？

**A**：可以。使用 `AfterModel` 事件修改 LLM 响应：

```bash
echo '{
  "hookSpecificOutput": {
    "llm_response": {
      "candidates": [{
        "content": {"role": "model", "parts": ["Modified response"]},
        "finishReason": "STOP"
      }]
    }
  }
}'
```

### Q9：项目 Hook 和全局 Hook 如何优先级？

**A**：项目级 > 全局级（项目级配置覆盖全局）

### Q10：是否可以禁用所有 Hook？

**A**：可以。删除或注释掉 settings.json 中的 hooks 配置，或设置一个总是允许的 Hook。

---

## 最佳实践总结

✅ **DO（推荐）**
- ✓ 验证输入 JSON 有效性
- ✓ 使用合理的超时时间
- ✓ 记录重要操作
- ✓ 优雅处理失败
- ✓ 编写测试用例
- ✓ 版本控制 Hook 脚本
- ✓ 保持脚本轻量

❌ **DON'T（避免）**
- ✗ 在 Hook 中执行长时间操作
- ✗ 没有输入验证就使用数据
- ✗ 忽略错误处理
- ✗ Hook 依赖外部服务而无备用
- ✗ 过度复杂的业务逻辑
- ✗ 不记录失败日志

---

## 进阶话题

### 集成外部服务

```bash
#!/bin/bash
read INPUT

# 调用远程 API 进行权限检查
RESPONSE=$(curl -s "https://api.company.com/check" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"tool\":\"write_file\"}")

if echo "$RESPONSE" | jq -e '.allowed' > /dev/null; then
  echo '{"decision":"allow"}'
else
  echo '{"decision":"deny","reason":"'$(echo $RESPONSE | jq -r '.reason')'\"}'
fi
```

### Hook 链式处理

```json
{
  "sequential": true,
  "hooks": [
    {"command": "bash ./step1-validate.sh"},
    {"command": "bash ./step2-enhance.sh"},
    {"command": "bash ./step3-audit.sh"}
  ]
}
```

第 2 个 Hook 可以看到第 1 个的输出修改，第 3 个可以看到前两个的修改。

---

## 获取帮助

- 📖 详细文档：`docs/hooks-implementation.md`
- 📚 完整示例：`docs/hooks-examples.md`
- 🐛 报告问题：GitHub Issues
- 💬 社区讨论：DeepV Code 论坛

---

**版本**：1.0
**最后更新**：2025-01-15
**维护者**：DeepV Code 团队
