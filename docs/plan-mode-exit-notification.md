# Plan模式退出AI通知机制

## 🐛 问题描述

**发现日期**: 2025-09-30

在Plan模式的实现中发现了一个问题：
- ✅ 当用户执行 `/plan on` 进入Plan模式时，系统会在用户的每条消息前添加提示词，告知AI当前处于Plan模式
- ❌ 当用户执行 `/plan off` 退出Plan模式时，**没有**通知AI模式已经退出
- ⚠️ 这导致AI可能仍然认为处于Plan模式，继续限制工具使用

## 🔍 技术分析

### Plan模式开启机制

在 `useGeminiStream.ts` 中：

```typescript
// Plan模式特殊处理 - 只修改发送给AI的内容，不影响历史记录
let modifiedQuery = query;
if (config.getPlanModeActive() && !options?.isContinuation) {
  const planPrompt = `[PLAN MODE ACTIVE]
The user is currently in Plan mode, focusing on requirements discussion and solution design. Please:
1. You may use analytical tools: read_file, read_many_files, list_directory, grep, glob, web_fetch, task, etc.
2. Do NOT use modification tools: write_file, edit, shell, lint_fix, etc.
3. Focus on understanding requirements, discussing solutions, and designing architecture
4. Provide detailed planning and recommendations, but do not perform modification operations
5. If modification operations are needed, remind the user to first use /plan off to exit Plan mode

User question: ${typeof query === 'string' ? query : JSON.stringify(query)}`;

  modifiedQuery = planPrompt;
}
```

**机制**：在用户输入前添加系统提示词

### Plan模式退出机制（修复前）

在 `planCommand.ts` 中：

```typescript
case 'off':
  // 退出Plan模式
  config.setPlanModeActive(false);
  return {
    type: 'message',
    messageType: 'info',
    content: t('plan.mode.disabled.message')
  };
```

**问题**：只修改了配置状态，向用户显示了退出消息，但**没有通知AI**

## ✅ 解决方案

### 修改后的退出机制

```typescript
case 'off':
  // 退出Plan模式
  config.setPlanModeActive(false);

  // 发送一条消息通知AI退出Plan模式
  return {
    type: 'submit_prompt',
    content: '[PLAN MODE EXITED] The user has exited Plan mode. You can now use all tools including modification tools (write_file, replace, run_shell_command, lint_fix, etc.). Normal operation mode is now active.'
  };
```

**改进**：
- 使用 `submit_prompt` 类型向AI发送一条系统消息
- 明确告知AI Plan模式已退出
- 明确说明现在可以使用所有工具，包括修改类工具

## 🎯 效果对比

### 修复前

```
用户: /plan off
系统: ✅ 已退出Plan模式，现在可以执行所有工具和代码修改
AI: [仍然认为处于Plan模式，继续限制工具使用]
用户: 帮我修改代码
AI: 抱歉，当前处于Plan模式，我不能修改代码...
```

### 修复后

```
用户: /plan off
系统: [向AI发送] [PLAN MODE EXITED] ...
AI: [收到通知，知道已退出Plan模式]
用户: 帮我修改代码
AI: [正常使用write_file、replace等工具修改代码]
```

## 📋 实现细节

### 1. 使用 `submit_prompt` 返回类型

`submit_prompt` 是命令返回类型之一，定义在 `types.ts` 中：

```typescript
export interface SubmitPromptActionReturn {
  type: 'submit_prompt';
  content: string;
}
```

### 2. 退出消息内容

```
[PLAN MODE EXITED] The user has exited Plan mode. You can now use all tools including modification tools (write_file, replace, run_shell_command, lint_fix, etc.). Normal operation mode is now active.
```

**设计考虑**：
- 使用方括号标识这是系统消息
- 明确说明状态变化
- 列举可用的修改类工具
- 简洁明了，不会干扰对话流程

### 3. 对话历史处理

- 退出消息会作为用户消息发送给AI
- AI会收到并理解状态变化
- 不会显示在用户界面的历史记录中（与开启时的提示词处理方式一致）

## 🧪 测试场景

### 场景1: 基本流程

1. `/plan on` → AI收到Plan模式提示
2. 用户提问 → AI使用只读工具
3. `/plan off` → AI收到退出通知
4. 用户请求修改 → AI正常使用修改工具

### 场景2: 多次切换

1. `/plan on` → 进入Plan模式
2. `/plan off` → 退出Plan模式
3. `/plan on` → 再次进入Plan模式
4. `/plan off` → 再次退出Plan模式

每次切换都应该正确通知AI

### 场景3: 对话连续性

退出Plan模式的通知不应该中断对话的连贯性，AI应该能够理解上下文并继续对话

## 🔄 与其他命令的一致性

这个修复使Plan模式与其他状态切换命令保持一致：

| 命令 | 状态变化通知机制 |
|------|----------------|
| `/model` | 切换模型时通过系统机制处理 |
| `/plan on` | 在每条用户消息前添加提示词 |
| `/plan off` | ✅ 发送系统消息通知AI（修复后） |

## 📚 相关文件

- `packages/cli/src/ui/commands/planCommand.ts` - Plan命令实现
- `packages/cli/src/ui/hooks/useGeminiStream.ts` - Plan模式提示词注入
- `packages/cli/src/ui/commands/types.ts` - 命令返回类型定义

## 🚀 后续优化建议

1. **统一通知机制**: 考虑为所有模式切换创建统一的状态通知机制
2. **状态持久化**: 确保Plan模式状态在会话恢复时正确
3. **用户提示**: 在退出时可以向用户显示一条简短的确认消息
4. **测试覆盖**: 添加集成测试验证Plan模式的完整流程

---

**修复日期**: 2025-09-30
**修复人员**: AI Assistant
**相关Issue**: Plan模式退出后AI未感知状态变化
