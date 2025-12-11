# VSCode-UI-Plugin: 预览模型检测修复实现指南

## 问题陈述

在VSCode-UI-Plugin中，当预览模型（如`gemini-3-pro-preview`）重复调用同一工具时，**循环检测失效**。原因是：

1. ✅ LoopDetectionService在GeminiClient内部正常运作
2. ✅ 预览模型检测正确激活（`/preview/i.test(model)`）
3. ✅ 工具调用检查正常执行（阈值4/5）
4. ✅ LoopDetected事件被产生
5. ❌ **关键缺陷**: AIService.processGeminiStreamEvents()没有处理该事件

结果：事件被**SILENT IGNORE**，流继续运行，循环未被中止。

---

## 修复方案

### 方案1: 最小化修复（推荐）

**文件**: `packages/vscode-ui-plugin/src/services/aiService.ts`

**位置**: 在 `processGeminiStreamEvents()` 方法中的switch语句中添加新case

#### 步骤1: 找到处理位置

搜索 `case GeminiEventType.Finished:` (大约在L1527)

```typescript
// 当前代码（L1491-1530左右）
for await (const event of stream) {
  if (signal.aborted) break;

  switch (event.type) {
    case GeminiEventType.Content:
      // ... 现有处理
      break;

    case GeminiEventType.Reasoning:
      // ... 现有处理
      break;

    case GeminiEventType.ToolCallRequest:
      // ... 现有处理
      break;

    case GeminiEventType.TokenUsage:
      // ... 现有处理
      break;

    case GeminiEventType.Error:
      // ... 现有处理
      break;

    case GeminiEventType.Finished:
      // ... 现有处理
      break;

    // ❌ 在这里之前添加新case
  }
}
```

#### 步骤2: 添加LoopDetected处理

在 `case GeminiEventType.Finished:` 之前插入：

```typescript
case GeminiEventType.LoopDetected:
  this.logger.warn(`🔴 Loop detected in AI response: ${event.value}`);

  // 生成用户友好的消息
  const loopMessage = this.getLoopDetectionMessage(event.value);

  // 通知前端
  if (this.communicationService && this.sessionId) {
    await this.communicationService.sendChatError(
      this.sessionId,
      loopMessage
    );
  }

  // 停止处理
  this.isCurrentlyResponding = false;
  this.setProcessingState(false, null, false);

  // 保存当前会话状态
  await this.saveSessionHistoryIfAvailable();

  // 早期返回，停止处理后续事件
  return;
```

#### 步骤3: 添加辅助方法

在 `processGeminiStreamEvents()` 方法下方添加新的私有方法：

```typescript
/**
 * 根据循环类型生成用户友好的消息
 * @param loopType - 循环类型字符串
 * @returns 用户消息
 */
private getLoopDetectionMessage(loopType: string | undefined): string {
  switch (loopType) {
    case 'consecutive_identical_tool_calls':
      return (
        '🔴 **LOOP DETECTED**: The AI was calling the same tool repeatedly with different arguments, ' +
        'which wastes API quota and context.\n\n' +
        '**Why this happened:**\n' +
        '• The model may be stuck trying the same approach\n' +
        '• Current task direction is not productive\n\n' +
        '**What to do next:**\n' +
        '1. **Clarify the task**: Provide more specific requirements\n' +
        '2. **Try a different approach**: Ask the AI to explore differently\n' +
        '3. **Provide examples**: Show what successful output should look like\n' +
        '4. **Break it down**: Divide the task into smaller, focused steps'
      );

    case 'chanting_identical_sentences':
      return (
        '🔴 **LOOP DETECTED**: The AI was generating the same text repeatedly.\n\n' +
        '**Why this happened:**\n' +
        '• The model may be stuck on a specific pattern\n' +
        '• Unable to progress to the next logical step\n\n' +
        '**What to do next:**\n' +
        '1. **Request clarification**: Ask what\'s unclear about the task\n' +
        '2. **Try different wording**: Rephrase the request\n' +
        '3. **Provide context**: Add more background information\n' +
        '4. **Take a fresh approach**: Start with a different angle'
      );

    case 'llm_detected_loop':
      return (
        '🔴 **LOOP DETECTED**: The AI analysis detected you\'re not making meaningful progress.\n\n' +
        '**Why this happened:**\n' +
        '• The current approach is not advancing toward the goal\n' +
        '• May be exploring unproductive paths\n\n' +
        '**What to do next:**\n' +
        '1. **Restate the goal**: Clarify the core objective\n' +
        '2. **Add constraints**: Specify what must/must not be done\n' +
        '3. **Provide examples**: Show expected input/output\n' +
        '4. **Change direction**: Try a fundamentally different approach'
      );

    default:
      return (
        '🔴 **LOOP DETECTED**: The AI detected a repetitive pattern and stopped to save resources.\n\n' +
        'Please provide more guidance or try a different approach.'
      );
  }
}
```

---

### 方案2: 增强修复（可选附加）

如果需要更多功能，可以添加以下增强：

#### 2.1 添加循环事件回调

```typescript
/**
 * 注册循环检测回调
 */
private loopDetectionCallbacks: Set<(loopType: string) => void> = new Set();

registerLoopDetectionCallback(callback: (loopType: string) => void): () => void {
  this.loopDetectionCallbacks.add(callback);
  return () => this.loopDetectionCallbacks.delete(callback);
}

// 在case中调用
case GeminiEventType.LoopDetected:
  // ... 现有代码 ...

  // 触发回调
  if (event.value) {
    for (const callback of this.loopDetectionCallbacks) {
      callback(event.value);
    }
  }
  break;
```

#### 2.2 添加统计跟踪

```typescript
// 在AIService类中添加
private loopDetectionStats = {
  totalLoopsDetected: 0,
  loopsByType: new Map<string, number>(),
  lastLoopTime?: Date,
};

// 在循环检测时更新
case GeminiEventType.LoopDetected:
  this.loopDetectionStats.totalLoopsDetected++;
  if (event.value) {
    const count = this.loopDetectionStats.loopsByType.get(event.value) || 0;
    this.loopDetectionStats.loopsByType.set(event.value, count + 1);
  }
  this.loopDetectionStats.lastLoopTime = new Date();
  // ...其他处理
```

#### 2.3 添加用户通知选项

```typescript
// AIService配置中添加
private loopDetectionConfig = {
  enabled: true,
  showMessage: true,
  stopImmediate: true,  // 是否立即停止
  allowRetry: false,    // 是否允许用户重试
};

// 在循环检测时使用
case GeminiEventType.LoopDetected:
  if (!this.loopDetectionConfig.enabled) {
    break;
  }

  if (this.loopDetectionConfig.showMessage) {
    // 显示消息
  }

  if (this.loopDetectionConfig.stopImmediate) {
    // 立即停止
  }
  break;
```

---

## 集成检查清单

### 代码修改清单

- [ ] **L1527** (大约): 在 `case GeminiEventType.Finished:` 之前添加 `case GeminiEventType.LoopDetected:`
- [ ] **添加事件处理代码**: 包含logger.warn, communicationService.sendChatError, setProcessingState等
- [ ] **添加辅助方法**: `getLoopDetectionMessage()` 方法
- [ ] **测试编译**: `npm run build` 确保TypeScript编译通过
- [ ] **运行现有测试**: `npm run test` 确保未破坏现有功能

### 功能验证清单

在VSCode UI中测试：

- [ ] **使用预览模型**: 在设置中选择 `gemini-3-pro-preview` 或类似
- [ ] **触发循环**: 给AI一个会导致重复工具调用的任务
  ```
  示例: "Read these 5 files: a.ts, b.ts, c.ts, d.ts, e.ts"
  → AI可能会重复调用read_file，阈值=4次时应触发
  ```
- [ ] **验证消息**: 用户应该看到循环检测的错误消息
- [ ] **验证停止**: 流应该立即停止，不再产生新的内容或工具调用
- [ ] **验证日志**: 检查输出日志中是否有 `🔴 Loop detected` 警告

### 用户体验验证

- [ ] 错误消息清晰易懂
- [ ] 提供了具体的修复建议
- [ ] 用户可以根据建议调整任务
- [ ] 没有令人困惑的残留消息

---

## 代码变更详细说明

### 变更摘要

```diff
# 文件: packages/vscode-ui-plugin/src/services/aiService.ts

  private async processGeminiStreamEvents(
    stream: AsyncIterable<ServerGeminiStreamEvent>,
    originalMessage: ChatMessage,
    context: ContextInfo | undefined,
    signal: AbortSignal,
    responseId: string
  ): Promise<void> {
    const toolCallRequests: ToolCallRequestInfo[] = [];
    this.isCurrentlyResponding = true;

    try {
      for await (const event of stream) {
        if (signal.aborted) break;

        switch (event.type) {
          case GeminiEventType.Content:
            // ... 现有代码
            break;

          case GeminiEventType.Reasoning:
            // ... 现有代码
            break;

          case GeminiEventType.ToolCallRequest:
            // ... 现有代码
            break;

          case GeminiEventType.TokenUsage:
            // ... 现有代码
            break;

          case GeminiEventType.Error:
            // ... 现有代码
            break;

+         case GeminiEventType.LoopDetected:
+           this.logger.warn(`🔴 Loop detected in AI response: ${event.value}`);
+
+           const loopMessage = this.getLoopDetectionMessage(event.value);
+
+           if (this.communicationService && this.sessionId) {
+             await this.communicationService.sendChatError(
+               this.sessionId,
+               loopMessage
+             );
+           }
+
+           this.isCurrentlyResponding = false;
+           this.setProcessingState(false, null, false);
+
+           await this.saveSessionHistoryIfAvailable();
+
+           return;

          case GeminiEventType.Finished:
            // ... 现有代码
            break;
        }
      }

      // ... 其余代码保持不变
    }
  }

+ private getLoopDetectionMessage(loopType: string | undefined): string {
+   // 实现如上所示...
+ }
```

---

## 测试策略

### 单元测试

建议添加测试文件: `packages/vscode-ui-plugin/src/services/__tests__/aiService.test.ts`

```typescript
describe('AIService - LoopDetection', () => {
  let aiService: AIService;
  let mockCommunicationService: any;

  beforeEach(() => {
    // 设置mock
    mockCommunicationService = {
      sendChatError: vi.fn(),
    };
    aiService = new AIService(mockLogger);
    aiService['communicationService'] = mockCommunicationService;
  });

  it('should handle LoopDetected event', async () => {
    const mockStream = async function* () {
      yield {
        type: GeminiEventType.LoopDetected,
        value: 'consecutive_identical_tool_calls',
      };
    };

    // 调用处理方法
    await aiService['processGeminiStreamEvents'](
      mockStream(),
      mockMessage,
      undefined,
      new AbortController().signal,
      'response-123'
    );

    // 验证
    expect(mockCommunicationService.sendChatError).toHaveBeenCalled();
    expect(aiService['isCurrentlyResponding']).toBe(false);
  });

  it('should generate appropriate message for consecutive_identical_tool_calls', () => {
    const message = aiService['getLoopDetectionMessage'](
      'consecutive_identical_tool_calls'
    );
    expect(message).toContain('same tool repeatedly');
  });

  it('should generate appropriate message for chanting_identical_sentences', () => {
    const message = aiService['getLoopDetectionMessage'](
      'chanting_identical_sentences'
    );
    expect(message).toContain('same text repeatedly');
  });

  it('should generate appropriate message for llm_detected_loop', () => {
    const message = aiService['getLoopDetectionMessage'](
      'llm_detected_loop'
    );
    expect(message).toContain('not making meaningful progress');
  });
});
```

### 集成测试

在VSCode中手动测试：

1. **预览模型重复调用测试**
   ```
   给AI提示: "Read these files repeatedly: file1.ts, file2.ts, file3.ts, file4.ts"
   预期: 在4-5次read_file调用后停止并显示循环检测消息
   ```

2. **标准模型测试**（确保不影响非预览模型）
   ```
   给AI提示: 使用gemini-2.0-flash
   预期: 需要10次相同调用才触发（不是4-5次）
   ```

3. **内容重复测试**
   ```
   给AI提示: "Repeat this phrase 30 times: Hello"
   预期: 检测到chanting_identical_sentences循环
   ```

---

## 回归测试

修改后需要验证：

### Core功能
- [ ] 现有消息处理正常
- [ ] 工具调用执行正常
- [ ] Token计数正常
- [ ] 会话保存正常

### 循环检测特定
- [ ] 非预览模型仍使用阈值10（标准）
- [ ] 预览模型使用阈值4/5（严格）
- [ ] 循环消息准确描述问题
- [ ] 流能正确停止

---

## 常见问题与答案

### Q1: 为什么Core包有效而VSCode插件无效？

**A**: Core包在client.ts中正确处理了LoopDetected事件：
```typescript
// L617-626 in client.ts
if (this.loopDetector.addAndCheck(event)) {
  yield { type: GeminiEventType.LoopDetected, ... };
  return turn;  // ✅ 立即返回停止处理
}
```

VSCode插件的processGeminiStreamEvents没有相应处理，事件被忽略。

### Q2: 循环检测的准确性如何？

**A**: 三层检测机制：
1. **标准**: name+args完全相同（hash比较）→ 10次
2. **预览**: name仅（忽略args） → 5次
3. **LLM**: 语义分析（可选） → 高置信度

预览模型额外敏感是因为它们容易陷入参数微调循环。

### Q3: 是否会误判非循环情况？

**A**: 降低误判的方法：
- 工具A（高开销）使用更低的阈值(4)
- 工具B（普通）使用中等阈值(5)
- 常见模式（列表、代码注释等）被filter out
- LLM检查使用0.9置信度阈值

在实践中误判非常罕见。

### Q4: 预览模型和标准模型的选择如何影响？

**A**:
- **预览模型** (gemini-3-pro-preview): 激进检测，容易误触发
- **标准模型** (gemini-2.0-flash): 保守检测，需要更多重复

建议根据任务复杂度选择：
- 复杂任务 → 标准模型（更多试错空间）
- 简单任务 → 预览模型（更快响应）

---

## 部署检查清单

- [ ] 代码审查通过
- [ ] 所有测试通过（npm run test）
- [ ] TypeScript编译无错误（npm run build）
- [ ] Lint检查通过（npm run lint）
- [ ] 功能测试完成
- [ ] 性能测试未见回归
- [ ] 文档更新（如需）
- [ ] 向用户沟通（改进公告）

---

## 相关文件引用

| 文件 | 行号范围 | 内容 |
|------|---------|------|
| aiService.ts | 1469-1530 | processGeminiStreamEvents方法 |
| aiService.ts | L1521 | Error case位置 |
| aiService.ts | L1527 | Finished case位置 |
| types/messages.ts | - | GeminiEventType枚举 |
| core/src/core/client.ts | 606-626 | Core包的正确处理方式 |
| core/src/services/loopDetectionService.ts | 115+ | 完整的检测实现 |

---

## 总结

通过添加对 `GeminiEventType.LoopDetected` 事件的处理，VSCode-UI-Plugin将能够：

1. ✅ 捕获LoopDetectionService产生的循环检测事件
2. ✅ 向用户显示清晰的错误消息
3. ✅ 立即停止AI响应流
4. ✅ 保存会话状态
5. ✅ 提供有针对性的改进建议

这个修复与Core包的实现保持一致，确保CLI和VSCode插件的行为统一。

---

**实现难度**: ⭐ 简单（添加一个switch case和一个辅助方法）
**预期影响**: 🎯 高（解决在VSCode中循环检测失效的问题）
**测试工作量**: ⭐⭐ 中等（需要多个场景的验证）
