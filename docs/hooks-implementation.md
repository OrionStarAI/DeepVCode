# DeepVCode Hooks System Implementation Guide

## Overview

DeepVCode已实现完整的Hooks系统，提供11个事件钩子来拦截和修改系统行为。本文档说明如何在项目中使用和集成hooks机制。

## Architecture

Hooks系统由5个核心组件组成：

```
┌──────────────────────┐
│   HookSystem         │ (Coordinator)
│  (Main Entry Point)  │
└──────────┬───────────┘
           │
    ┌──────┼──────┬──────┬──────┐
    │      │      │      │      │
    ▼      ▼      ▼      ▼      ▼
┌────┐ ┌──────┐ ┌────┐ ┌──────┐ ┌──────────┐
│Reg │ │Plan  │ │Run │ │Aggr  │ │EventBus  │
│Reg │ │ner   │ │ner │ │egator│ │Handler   │
└────┘ └──────┘ └────┘ └──────┘ └──────────┘
```

### Component Details

1. **HookRegistry** - 从配置加载和验证hooks
2. **HookPlanner** - 为事件创建执行计划（匹配、去重）
3. **HookRunner** - 在独立进程中执行hooks
4. **HookAggregator** - 使用事件特定的策略合并结果
5. **HookEventHandler** - 协调事件触发和结果处理

## File Structure

```
packages/core/src/hooks/
├── types.ts                    # 类型定义和hook输出类
├── hookTranslator.ts          # SDK类型和Hook格式之间的转换
├── hookRegistry.ts            # Hook注册表
├── hookPlanner.ts             # Hook执行计划
├── hookRunner.ts              # Hook执行引擎
├── hookAggregator.ts          # 结果聚合
├── hookEventHandler.ts        # 事件处理器
├── hookSystem.ts              # 系统协调器
└── index.ts                   # 导出
```

## Integration Steps

### 1. 在Config中添加Hooks支持

✅ **已完成** - Config类已支持hooks：

```typescript
// ConfigParameters中添加了hooks字段
hooks?: { [K in HookEventName]?: HookDefinition[] };

// Config类中添加了getter方法
getHooks(): { [K in HookEventName]?: HookDefinition[] }
```

### 2. 初始化HookSystem

在应用初始化时创建并初始化HookSystem：

```typescript
import { HookSystem } from '../hooks/index.js';
import type { Config } from '../config/config.js';

// 创建HookSystem
const hookSystem = new HookSystem(config);

// 初始化（加载并验证hooks）
await hookSystem.initialize();

// 获取事件处理器来触发hooks
const eventHandler = hookSystem.getEventHandler();
```

### 3. 在关键点触发Hooks

#### BeforeTool Event

在工具执行前触发权限检查：

```typescript
// 在toolExecutionEngine.ts中

import type { HookEventHandler } from '../hooks/index.js';

async executeToolInternal(
  toolName: string,
  toolInput: Record<string, unknown>,
  hookEventHandler?: HookEventHandler,
) {
  // 触发BeforeTool hook
  if (hookEventHandler) {
    const result = await hookEventHandler.fireBeforeToolEvent(
      toolName,
      toolInput,
    );

    // 检查是否被阻止
    if (result.finalOutput?.isBlockingDecision()) {
      throw new Error(`Tool execution blocked: ${result.finalOutput.getEffectiveReason()}`);
    }
  }

  // 继续执行工具
  // ...
}
```

#### AfterTool Event

在工具执行后处理结果：

```typescript
// 工具执行完成后
if (hookEventHandler) {
  const result = await hookEventHandler.fireAfterToolEvent(
    toolName,
    toolInput,
    toolResponse,
  );

  // 应用额外上下文
  const additionalContext = result.finalOutput?.getAdditionalContext();
  if (additionalContext) {
    // 添加到响应或上下文中
  }
}
```

#### BeforeModel Event

在LLM请求前修改参数：

```typescript
// 在generateContent前

if (hookEventHandler) {
  const result = await hookEventHandler.fireBeforeModelEvent(request);

  // 应用LLM请求修改
  if (result.finalOutput) {
    request = result.finalOutput.applyLLMRequestModifications(request);
  }

  // 检查是否有合成响应
  const syntheticResponse = (result.finalOutput as BeforeModelHookOutput)?.getSyntheticResponse();
  if (syntheticResponse) {
    return syntheticResponse;
  }
}
```

#### BeforeAgent Event

在发送提示给LLM前增强提示：

```typescript
// 在geminiChat.ts中

if (hookEventHandler) {
  const result = await hookEventHandler.fireBeforeAgentEvent(prompt);

  // 获取额外上下文
  const additionalContext = result.finalOutput?.getAdditionalContext();
  if (additionalContext) {
    prompt += '\n\n' + additionalContext;
  }
}
```

#### SessionStart/SessionEnd Events

跟踪会话生命周期：

```typescript
// 会话开始
await hookEventHandler.fireSessionStartEvent(SessionStartSource.Startup);

// 会话结束
await hookEventHandler.fireSessionEndEvent(SessionEndReason.Exit);
```

## Configuration Format

### 基本配置示例

在`.gemini/settings.json`或`gemini-extension.json`中配置hooks：

```json
{
  "tools": {
    "enableHooks": true
  },
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "write_file|delete_file",
        "sequential": false,
        "hooks": [
          {
            "type": "command",
            "command": "bash ./hooks/security-check.sh",
            "timeout": 30000
          }
        ]
      }
    ],
    "BeforeAgent": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "./hooks/enhance-prompt.sh",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

### Matcher规则

- `matcher` - 正则表达式或精确值
- `sequential` - true为顺序执行，false为并行（默认）
- 无matcher或`*` - 匹配所有

## Hook Input/Output Formats

### Hook Input (stdin)

所有hooks收到JSON格式的输入：

```json
{
  "session_id": "abc123",
  "transcript_path": "",
  "cwd": "/current/dir",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "write_file",
  "tool_input": {
    "path": "/tmp/file.txt",
    "content": "..."
  }
}
```

### Hook Output (stdout)

Hook脚本必须返回JSON格式的输出：

```json
{
  "decision": "allow",
  "reason": "optional reason",
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "optional message",
  "hookSpecificOutput": {
    "hookEventName": "BeforeTool",
    "additionalContext": "optional context"
  }
}
```

### Exit Codes

- `0` - 成功，解析stdout
- `1` - 警告，stderr作为systemMessage
- `2` - 阻止，触发deny决策
- 其他 - 失败（不阻止）

## 11个支持的Hook事件

### 工具相关
1. **BeforeTool** - 工具执行前权限检查
2. **AfterTool** - 工具执行后结果处理

### 提示和LLM
3. **BeforeAgent** - 提示工程和增强
4. **AfterAgent** - LLM响应验证
5. **BeforeModel** - LLM请求参数修改
6. **AfterModel** - LLM响应过滤

### 工具选择
7. **BeforeToolSelection** - 限制可用工具

### 会话
8. **SessionStart** - 会话初始化
9. **SessionEnd** - 会话清理

### 其他
10. **PreCompress** - 压缩前准备
11. **Notification** - 权限请求

## 实际场景示例

### 场景1：安全网关（BeforeTool）

```bash
#!/bin/bash
read INPUT

TOOL=$(echo "$INPUT" | jq -r '.tool_name')

# 禁止删除操作
if [[ "$TOOL" == "delete_file" ]]; then
  echo '{"decision":"deny","reason":"Deletion not allowed"}'
  exit 0
fi

echo '{"decision":"allow"}'
```

### 场景2：提示增强（BeforeAgent）

```bash
#!/bin/bash
read INPUT

echo '{
  "decision": "allow",
  "hookSpecificOutput": {
    "hookEventName": "BeforeAgent",
    "additionalContext": "Follow security guidelines: [...]"
  }
}'
```

### 场景3：权限控制（BeforeToolSelection）

```bash
#!/bin/bash
read INPUT

USER_ROLE=${USER_ROLE:-"user"}

case "$USER_ROLE" in
  "admin")
    echo '{"decision":"allow"}'
    ;;
  "viewer")
    echo '{
      "hookSpecificOutput": {
        "toolConfig": {
          "mode": "ANY",
          "allowedFunctionNames": ["read_file","list_directory"]
        }
      }
    }'
    ;;
esac
```

## Best Practices

1. **始终验证输入** - 检查JSON有效性和必需字段
2. **优雅处理错误** - Hook失败不应阻止系统执行
3. **设置合理的超时** - 避免长时间运行的hooks阻塞
4. **使用顺序执行链式逻辑** - 后续hook可见前一个的修改
5. **记录所有操作** - 用于审计和调试
6. **保持hooks轻量** - 复杂逻辑委托给外部服务
7. **测试hooks** - 使用测试输入验证行为

## 调试和监控

### 启用调试日志

```typescript
import { debugLogger } from '../utils/debugLogger.js';

debugLogger.debug('Hook execution started');
```

### 监视Hook执行

```typescript
const hookStatus = hookSystem.getStatus();
console.log(`Total hooks registered: ${hookStatus.totalHooks}`);

const allHooks = hookSystem.getAllHooks();
for (const hook of allHooks) {
  console.log(`Event: ${hook.eventName}, Source: ${hook.source}`);
}
```

### 启用/禁用特定Hook

```typescript
hookSystem.setHookEnabled('./hooks/security-check.sh', false);
```

## 遥测和日志

Hook执行会自动记录遥测数据，包括：
- Hook名称和事件类型
- 执行时间
- 输入输出数据
- 错误信息

## 与Gemini CLI的兼容性

DeepVCode的hooks实现基于Gemini CLI 0.20.2的设计：
- 相同的输入输出格式
- 相同的事件模型
- 相同的配置结构
- 完全兼容的hooks脚本

迁移from Gemini CLI的hooks脚本时无需修改。

## TODO - 集成点

需要在以下文件中添加hook触发器：

- [ ] `packages/core/src/core/toolExecutionEngine.ts` - BeforeTool / AfterTool
- [ ] `packages/core/src/core/geminiChat.ts` - BeforeAgent / AfterAgent / BeforeModel / AfterModel
- [ ] `packages/core/src/core/contentGenerator.ts` - BeforeToolSelection
- [ ] `packages/cli/src/ui/commands/` - SessionStart / SessionEnd
- [ ] CLI初始化文件 - HookSystem初始化

## 更多信息

详见 `gemini-cli-0.20.2/HOOKS_GUIDE.md` 获取完整的Hooks系统文档。
