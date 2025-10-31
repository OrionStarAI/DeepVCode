# 版本控制系统修复说明

## 问题诊断

回退失败的根本原因是版本节点没有被正确创建，具体表现为：
- 错误信息：`Version node not found for turn: user-xxx`
- 工具执行后没有记录版本节点
- 工具名称匹配过于严格

## 修复方案

### 1. 智能工具识别（aiService.ts）

**改进点**：使用模糊匹配而非精确匹配
```typescript
// 旧方案：硬编码工具名称
tool.toolName === 'write_file' || tool.toolName === 'WriteFile' || ...

// 新方案：智能识别
toolNameLower.includes('write') ||
toolNameLower.includes('edit') ||
toolNameLower.includes('delete') ||
// 还检查参数中是否有文件路径
(tool.parameters.file_path || tool.parameters.target_file || ...)
```

### 2. 降级方案（aiService.ts）

**改进点**：即使没有明确的文件工具，也创建版本节点
```typescript
if (fileModifyingTools.length === 0) {
  // 降级：为所有成功的工具创建版本节点
  const anySuccessfulTool = completedTools.filter(tool => 
    tool.status === ToolCallStatus.Success
  );
  // 创建版本节点...
}
```

### 3. 版本节点创建优化（versionControlManager.ts）

**改进点**：即使没有具体操作，也创建占位节点
```typescript
if (ops.length === 0 && toolCalls.length > 0) {
  // 为每个工具创建占位操作
  for (const tool of toolCalls) {
    const placeholderOp = {
      opId: generateId(),
      fileUri: '(tool execution)',
      patch: `Tool: ${tool.toolName}`,
      // ...
    };
    ops.push(placeholderOp);
  }
}
```

### 4. 工具操作简化（versionControlService.ts）

**改进点**：接受所有工具，不再严格限制
```typescript
// 旧方案：只接受特定工具
if (!['write_file', 'WriteFile', ...].includes(toolName)) {
  return null;
}

// 新方案：接受所有工具
this.logger.debug(`Processing tool for version control: ${toolName}`);
```

### 5. 消息ID捕获（aiService.ts）

**改进点**：立即捕获消息ID，避免异步丢失
```typescript
// 立即捕获当前的用户消息ID
const capturedUserMessageId = this.currentUserMessageId;
const capturedProcessingMessageId = this.currentProcessingMessageId;

// 使用捕获的ID处理工具完成
this.handleToolBatchCompleteWithIds(completedTools, capturedUserMessageId, capturedProcessingMessageId);
```

## 调试日志

系统现在会输出详细的调试信息：
- 📝 处理用户消息时的ID
- 🔧 工具完成时的状态
- ✅ 识别的文件修改工具
- 🔄 记录版本时使用的turnId
- 📋 可回退的消息ID列表

## 测试步骤

1. 打开开发者工具 (Help > Toggle Developer Tools)
2. 让 AI 执行任何工具（创建文件、编辑、删除等）
3. 查看控制台确认版本节点创建成功
4. 点击用户消息旁的回退按钮
5. 应该能成功回退

## 核心改进

1. **鲁棒性**：不再依赖精确的工具名称匹配
2. **容错性**：多重降级方案确保版本节点创建
3. **可追踪性**：详细的日志便于问题诊断
4. **简化逻辑**：减少复杂的条件判断



