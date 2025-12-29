# DeepVCode Hooks Examples

本文档提供实际可用的Hook脚本示例，可直接集成到项目中。

## 示例1：安全网关 (BeforeTool Hook)

**文件：** `hooks/security-gate.sh`

```bash
#!/bin/bash
set -euo pipefail

# 从stdin读取JSON输入
read INPUT

# 提取工具名称
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ -z "$TOOL" ]]; then
  # 如果无法解析，允许操作
  echo '{"decision":"allow","systemMessage":"Warning: Could not parse tool name"}' >&2
  exit 0
fi

# 黑名单：禁止危险操作
case "$TOOL" in
  "delete_file"|"remove_directory"|"shell")
    # 这些操作被禁止
    echo '{
      "decision": "deny",
      "reason": "Tool '"$TOOL"' is blocked by security policy"
    }'
    exit 0
    ;;
esac

# 允许其他操作
echo '{"decision":"allow"}'
exit 0
```

**配置：**

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/security-gate.sh",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

## 示例2：提示增强 (BeforeAgent Hook)

**文件：** `hooks/enhance-prompt.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 添加系统指导
SYSTEM_INSTRUCTION="[SYSTEM GUIDELINES]
- Always verify operations before proceeding
- Never modify system-critical files
- Log all important actions
- Ask for confirmation for dangerous operations
- Provide explanations for all recommendations
[END GUIDELINES]"

echo "{
  \"decision\": \"allow\",
  \"hookSpecificOutput\": {
    \"hookEventName\": \"BeforeAgent\",
    \"additionalContext\": \"$SYSTEM_INSTRUCTION\"
  }
}"
exit 0
```

**配置：**

```json
{
  "hooks": {
    "BeforeAgent": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/enhance-prompt.sh",
            "timeout": 2000
          }
        ]
      }
    ]
  }
}
```

## 示例3：审计日志 (AfterTool Hook)

**文件：** `hooks/audit-log.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TIMESTAMP=$(echo "$INPUT" | jq -r '.timestamp')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')

# 写入审计日志
LOG_FILE="logs/audit-$(date +%Y%m%d).log"
mkdir -p logs

# 记录到文件（不要让失败阻止操作）
echo "[$TIMESTAMP] AUDIT: Tool=$TOOL Session=$SESSION_ID" >> "$LOG_FILE" 2>/dev/null || true

# 总是允许
echo '{"decision":"allow"}'
exit 0
```

**配置：**

```json
{
  "hooks": {
    "AfterTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/audit-log.sh"
          }
        ]
      }
    ]
  }
}
```

## 示例4：权限控制 (BeforeToolSelection Hook)

**文件：** `hooks/role-based-access.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 从环境变量或配置获取用户角色
USER_ROLE="${USER_ROLE:-viewer}"

case "$USER_ROLE" in
  "admin")
    # 管理员：允许所有工具
    echo '{"decision":"allow"}'
    ;;
  "developer")
    # 开发者：禁止删除操作
    echo '{
      "hookSpecificOutput": {
        "toolConfig": {
          "mode": "ANY",
          "allowedFunctionNames": [
            "read_file",
            "list_directory",
            "write_file",
            "edit_file",
            "web_fetch",
            "web_search",
            "shell"
          ]
        }
      }
    }'
    ;;
  "viewer")
    # 查看者：仅读取权限
    echo '{
      "hookSpecificOutput": {
        "toolConfig": {
          "mode": "ANY",
          "allowedFunctionNames": [
            "read_file",
            "list_directory",
            "web_fetch",
            "web_search"
          ]
        }
      }
    }'
    ;;
  *)
    # 未知角色：拒绝所有
    echo '{
      "decision": "deny",
      "reason": "Unknown user role: '$USER_ROLE'"
    }'
    ;;
esac
exit 0
```

**配置：**

```json
{
  "hooks": {
    "BeforeToolSelection": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/role-based-access.sh",
            "timeout": 3000
          }
        ]
      }
    ]
  }
}
```

## 示例5：LLM参数优化 (BeforeModel Hook)

**文件：** `hooks/tune-llm-params.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

# 获取第一条消息内容
FIRST_MESSAGE=$(echo "$INPUT" | jq -r '.llm_request.messages[0].content // ""')
MSG_LENGTH=${#FIRST_MESSAGE}

# 根据内容长度调整温度
if [[ $MSG_LENGTH -gt 1000 ]]; then
  # 长提示：复杂问题，增加创意
  TEMPERATURE="0.8"
  MAX_TOKENS="4096"
elif [[ $MSG_LENGTH -gt 500 ]]; then
  # 中等长度
  TEMPERATURE="0.7"
  MAX_TOKENS="2048"
else
  # 短提示：简单问题，降低创意
  TEMPERATURE="0.3"
  MAX_TOKENS="1024"
fi

# 检查是否涉及代码
if echo "$FIRST_MESSAGE" | grep -qiE "(code|script|function|class|def|import|export)"; then
  # 代码问题：精确性更重要
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

**配置：**

```json
{
  "hooks": {
    "BeforeModel": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/tune-llm-params.sh",
            "timeout": 2000
          }
        ]
      }
    ]
  }
}
```

## 示例6：文件操作白名单 (BeforeTool Hook with Matcher)

**文件：** `hooks/file-whitelist.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

TOOL=$(echo "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""')

# 如果不是文件操作，允许
if [[ ! "$TOOL" =~ ^(read_file|write_file|edit_file|delete_file)$ ]]; then
  echo '{"decision":"allow"}'
  exit 0
fi

# 检查文件路径是否在允许的目录中
ALLOWED_DIRS=(
  "/home/user/projects"
  "/tmp"
  "./src"
  "./docs"
)

ALLOWED=false
for DIR in "${ALLOWED_DIRS[@]}"; do
  if [[ "$FILE_PATH" == "$DIR"* ]]; then
    ALLOWED=true
    break
  fi
done

if [[ "$ALLOWED" == "true" ]]; then
  echo '{"decision":"allow"}'
else
  echo "{
    \"decision\": \"deny\",
    \"reason\": \"File path '$FILE_PATH' is not in allowed directories\"
  }"
fi
exit 0
```

**配置：**

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "read_file|write_file|edit_file|delete_file",
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/file-whitelist.sh",
            "timeout": 3000
          }
        ]
      }
    ]
  }
}
```

## 示例7：会话生命周期跟踪

**文件：** `hooks/session-tracker.sh`

```bash
#!/bin/bash
set -euo pipefail

read INPUT

EVENT=$(echo "$INPUT" | jq -r '.hook_event_name')
SOURCE=$(echo "$INPUT" | jq -r '.source // .reason // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')

LOG_FILE="logs/sessions-$(date +%Y%m%d).log"
mkdir -p logs

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 记录会话事件
echo "[$TIMESTAMP] Event=$EVENT Source=$SOURCE SessionID=$SESSION_ID" >> "$LOG_FILE" 2>/dev/null || true

echo '{"decision":"allow"}'
exit 0
```

**配置：**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/session-tracker.sh"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/session-tracker.sh"
          }
        ]
      }
    ]
  }
}
```

## 配置完整示例

将所有hooks集合到`.gemini/settings.json`：

```json
{
  "tools": {
    "enableHooks": true
  },
  "hooks": {
    "BeforeTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/security-gate.sh",
            "timeout": 5000
          }
        ]
      },
      {
        "matcher": "read_file|write_file|edit_file|delete_file",
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/file-whitelist.sh",
            "timeout": 3000
          }
        ]
      }
    ],
    "AfterTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/audit-log.sh"
          }
        ]
      }
    ],
    "BeforeAgent": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/enhance-prompt.sh",
            "timeout": 2000
          }
        ]
      }
    ],
    "BeforeModel": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/tune-llm-params.sh",
            "timeout": 2000
          }
        ]
      }
    ],
    "BeforeToolSelection": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/role-based-access.sh",
            "timeout": 3000
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/session-tracker.sh"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/session-tracker.sh"
          }
        ]
      }
    ]
  }
}
```

## 测试Hooks

### 创建测试脚本

**文件：** `hooks/test-hooks.sh`

```bash
#!/bin/bash
# 测试hooks是否正确响应

test_hook() {
  local hook_script=$1
  local test_input=$2
  local expected_decision=$3

  echo "Testing $hook_script..."

  RESULT=$(echo "$test_input" | bash "$hook_script" 2>/dev/null)
  DECISION=$(echo "$RESULT" | jq -r '.decision // empty')

  if [[ "$DECISION" == "$expected_decision" ]]; then
    echo "  ✓ PASS"
  else
    echo "  ✗ FAIL: Expected '$expected_decision', got '$DECISION'"
    echo "  Output: $RESULT"
  fi
}

# 测试安全网关
TEST_INPUT='{
  "session_id": "test",
  "cwd": "/tmp",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "delete_file",
  "tool_input": {"path": "/tmp/test"}
}'

test_hook "./hooks/security-gate.sh" "$TEST_INPUT" "deny"

# 测试允许工具
TEST_INPUT='{
  "session_id": "test",
  "cwd": "/tmp",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "read_file",
  "tool_input": {"path": "/tmp/test"}
}'

test_hook "./hooks/security-gate.sh" "$TEST_INPUT" "allow"
```

### 运行测试

```bash
bash hooks/test-hooks.sh
```

## 调试Hooks

### 启用调试模式

在hook脚本中添加DEBUG变量：

```bash
#!/bin/bash
DEBUG=${DEBUG:-0}

read INPUT

if [[ $DEBUG -eq 1 ]]; then
  echo "[DEBUG] Input: $INPUT" >&2
fi

# ... hook逻辑
```

运行：
```bash
DEBUG=1 bash ./hooks/security-gate.sh < test_input.json
```

## 性能考虑

- **序列执行**：使用`sequential: true`时，后续hook看到前一个的修改
- **并行执行**：默认行为，所有hooks并发运行
- **超时**：设置合理的超时避免长期阻塞（默认60秒）
- **轻量化**：保持hooks简洁，复杂逻辑调用外部API

## 最佳实践

1. **验证输入** - 检查JSON有效性
2. **优雅降级** - Hook失败不应阻止系统
3. **记录日志** - 用于审计和调试
4. **版本控制** - Hooks代码应受版本控制
5. **文档** - 记录每个hook的作用
6. **测试** - 创建测试用例
7. **监控** - 跟踪hook执行情况
