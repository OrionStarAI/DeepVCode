# 🛠️ Loop Detection Service 修复实现指南

## 问题重述

VSCode 中 Preview 模型的循环检测完全失效，根本原因是：**LoopDetectionService 在每个新的 prompt_id 时被重置，导致工具调用计数无法跨 sendMessageStream 调用累积。**

---

## 📊 解决方案对比

有多种方法修复此问题，每种都有权衡。

### 方案 A: 统一 prompt_id（推荐）
**核心思路**: 对同一个用户消息的所有相关 sendMessageStream 调用使用相同的 prompt_id。

**优点**:
- 最简单，最符合原设计意图
- 不需要修改 LoopDetectionService 核心逻辑
- loop detector 状态在整个交互周期内保持

**缺点**:
- 需要在 VSCode AIService 中追踪和传递 prompt_id
- 修改点相对较多

**修复位置**:
- `packages/vscode-ui-plugin/src/services/aiService.ts`
- `packages/core/src/core/client.ts` (可选：支持 prompt_id 重用)

---

### 方案 B: 跨 prompt_id 累积（次优）
**核心思路**: 在 GeminiClient 层面维护全局的工具调用计数，不依赖 prompt_id 重置。

**优点**:
- 改动最小，只修改 GeminiClient 和 LoopDetectionService
- 不需要改动 VSCode AIService 的 prompt_id 生成逻辑

**缺点**:
- 需要新增累积机制，更复杂
- 需要定义何时重置全局计数

**修复位置**:
- `packages/core/src/core/client.ts`
- `packages/core/src/services/loopDetectionService.ts`

---

### 方案 C: Preview 模型特殊处理（最小改动）
**核心思路**: 对 Preview 模型，使用更激进的检测（不等待 reset）。

**优点**:
- 改动最小
- 快速见效

**缺点**:
- 不解决根本问题
- 只是治疗症状

**修复位置**:
- `packages/core/src/services/loopDetectionService.ts`

---

## ✅ 推荐方案: A - 统一 prompt_id

### 为什么选择方案 A

1. **设计最清晰**: 一个用户交互 = 一个 prompt_id = 一个 loop 检测周期
2. **维护最简单**: 不改动核心 loop detection 逻辑
3. **兼容性最好**: 符合原始设计意图
4. **测试最容易**: 清晰的 prompt_id 传递链条

### 实现步骤

#### Step 1: 在 AIService 中生成和保存 prompt_id

**文件**: `packages/vscode-ui-plugin/src/services/aiService.ts`

**修改位置**: `processChatMessage()` 方法

```typescript
// 旧代码（第 1406-1421 行）
async processChatMessage(message: ChatMessage, context?: ContextInfo): Promise<void> {
  const responseId = `ai-response-${Date.now()}`;
  // ...
  const result = await ContextBuilder.buildContextualContent(message.content, context);
  await this.processStreamingResponseWithParts(message.id, result.parts, responseId);
}

// 新代码
async processChatMessage(message: ChatMessage, context?: ContextInfo): Promise<void> {
  // 🎯 为整个用户消息生成统一的 prompt_id
  // 这个 prompt_id 将被用于所有相关的 sendMessageStream 调用
  // 包括: 初始响应、工具结果提交、继续生成等
  const sharedPromptId = `user-message-${message.id}-${Date.now()}`;
  const responseId = `ai-response-${Date.now()}`;

  try {
    if (!this.isInitialized) {
      throw new Error('AI service is not initialized');
    }

    this.currentUserMessageId = message.id;
    this.logger.info(`📝 Processing user message: ${message.id}`);

    const result = await ContextBuilder.buildContextualContent(message.content, context);
    // 🎯 传递 sharedPromptId 代替 message.id
    await this.processStreamingResponseWithParts(sharedPromptId, result.parts, responseId);

  } catch (error) {
    this.logger.error('❌ Failed to process AI chat', error instanceof Error ? error : undefined);
    if (this.communicationService && this.sessionId) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
      await this.communicationService.sendChatError(this.sessionId, errorMessage);
    }
  }
}
```

#### Step 2: 在 AIService 中保存 prompt_id 用于工具结果提交

**文件**: `packages/vscode-ui-plugin/src/services/aiService.ts`

**修改位置**: 添加实例变量

```typescript
export class AIService {
  // ... 现有变量 ...

  // 🎯 新增：当前用户消息对应的 prompt_id（用于工具结果提交）
  private currentPromptId: string | null = null;

  // ...
}
```

**修改位置**: `processChatMessage()` 中保存

```typescript
async processChatMessage(message: ChatMessage, context?: ContextInfo): Promise<void> {
  const sharedPromptId = `user-message-${message.id}-${Date.now()}`;

  // 🎯 保存 prompt_id，供 submitToolResultsToLLM 使用
  this.currentPromptId = sharedPromptId;

  const responseId = `ai-response-${Date.now()}`;
  // ...
}
```

#### Step 3: 修改工具结果提交使用相同的 prompt_id

**文件**: `packages/vscode-ui-plugin/src/services/aiService.ts`

**修改位置**: `submitToolResultsToLLM()` 方法（第 1231-1315 行）

```typescript
// 旧代码
private async submitToolResultsToLLM(tools: VSCodeToolCall[]) {
  if (!this.geminiClient || tools.length === 0) return;
  if (!this.canAbortFlow || !this.isProcessing) return;

  try {
    const toolResponseParts: any[] = [];
    // ... 构建 toolResponseParts ...

    const abortController = new AbortController();
    this.abortController = abortController;

    const stream = this.geminiClient.sendMessageStream(
      toolResponseParts,
      abortController.signal,
      `tool-results-${Date.now()}`  // ❌ 新的 prompt_id
    );
    // ...
  } catch (error) {
    // ...
  }
}

// 新代码
private async submitToolResultsToLLM(tools: VSCodeToolCall[]) {
  if (!this.geminiClient || tools.length === 0) return;
  if (!this.canAbortFlow || !this.isProcessing) return;

  try {
    const toolResponseParts: any[] = [];
    // ... 构建 toolResponseParts ...

    const abortController = new AbortController();
    this.abortController = abortController;

    // 🎯 关键修改: 使用保存的 sharedPromptId，而不是生成新的
    // 这样工具结果提交仍属于同一个"提示"周期
    const promptIdForToolResults = this.currentPromptId || `tool-results-${Date.now()}`;

    const stream = this.geminiClient.sendMessageStream(
      toolResponseParts,
      abortController.signal,
      promptIdForToolResults  // ✓ 重用相同的 prompt_id
    );

    // ...
  } catch (error) {
    // ...
  }
}
```

#### Step 4: 修改递归调用也使用相同的 prompt_id

**文件**: `packages/vscode-ui-plugin/src/services/aiService.ts`

**修改位置**: `processEditMessageAndRegenerate()` 方法

```typescript
// 旧代码
async processEditMessageAndRegenerate(messageId: string, newContent: any, context: ContextInfo): Promise<void> {
  // ...
  const result = await ContextBuilder.buildContextualContent(newContent, context);
  await this.processStreamingResponseWithParts(messageId, result.parts, `ai-response-${Date.now()}`);
  // ...
}

// 新代码
async processEditMessageAndRegenerate(messageId: string, newContent: any, context: ContextInfo): Promise<void> {
  // 🎯 重用当前的 prompt_id，保持回滚和重新生成在同一循环检测周期内
  const promptId = this.currentPromptId || `edit-${messageId}-${Date.now()}`;
  const responseId = `ai-response-${Date.now()}`;

  try {
    if (!this.isInitialized) {
      throw new Error('AI service is not initialized');
    }

    await this.rollbackHistoryToMessage(messageId);

    const updatedMessage: ChatMessage = {
      id: messageId,
      type: 'user',
      content: newContent,
      timestamp: Date.now()
    };

    const result = await ContextBuilder.buildContextualContent(newContent, context);
    // 🎯 使用统一的 prompt_id
    await this.processStreamingResponseWithParts(promptId, result.parts, responseId);

  } catch (error) {
    // ...
  }
}
```

#### Step 5: 在消息处理完成时清空 currentPromptId

**文件**: `packages/vscode-ui-plugin/src/services/aiService.ts`

**修改位置**: `processGeminiStreamEvents()` 方法中

```typescript
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
        // ... 其他情况 ...

        case GeminiEventType.LoopDetected:
          // 🎯 循环检测后，清空 currentPromptId
          // 这样下一个消息会生成新的 prompt_id
          this.currentPromptId = null;
          await this.handleLoopDetected((event as any).value);
          toolCallRequests.length = 0;
          return;

        case GeminiEventType.Finished:
          this.logger.info('Stream finished');
          // 🎯 消息处理完成后清空 currentPromptId
          if (toolCallRequests.length === 0) {
            this.currentPromptId = null;
          }
          break;
      }
    }

    this.isCurrentlyResponding = false;

    if (toolCallRequests.length === 0) {
      this.setProcessingState(false, null, false);
      // 🎯 清空 prompt_id
      this.currentPromptId = null;

      if (this.communicationService && this.sessionId) {
        await this.communicationService.sendChatComplete(this.sessionId, responseId, this.currentTokenUsage);
      }

      await this.saveSessionHistoryIfAvailable();
    }

    if (toolCallRequests.length > 0 && this.coreToolScheduler) {
      await this.scheduleToolCalls(toolCallRequests, signal);
    }

  } catch (streamError) {
    // ...
    // 🎯 异常情况下也清空
    this.currentPromptId = null;
    // ...
  }
}
```

---

## 🔍 验证和测试

### Test Case 1: 基本 Preview 模型循环检测

**步骤**:
1. 使用 Preview 模型（如 `gemini-3-pro-preview`）
2. 触发一个需要多个 read_file 调用的任务
3. 观察日志输出

**期望**:
```log
[LoopDetection] Detected preview model: gemini-3-pro-preview, enabling strict tool-name checking
[LoopDetection] Preview model loop detected: tool 'read_file' called 4 times (threshold: 4)
[GeminiEventType.LoopDetected] Loop detected after 4 read_file calls
```

**验证点**:
- ✓ "Detected preview model" 消息出现在初始 prompt 处理时
- ✓ "Preview model loop detected" 在超过阈值时出现
- ✓ LoopDetected 事件被发送给 VSCode

### Test Case 2: prompt_id 跨调用一致性

**步骤**:
1. 在 `GeminiClient.sendMessageStream()` 的 reset() 调用前添加日志
2. 处理一个包含工具调用和结果的消息
3. 观察 prompt_id 值

**期望日志**:
```log
// 第一个 sendMessageStream 调用
[GeminiClient] sendMessageStream called with prompt_id: user-message-msg1-1735000000123
[LoopDetection] reset(user-message-msg1-1735000000123)

// 工具结果提交
[GeminiClient] sendMessageStream called with prompt_id: user-message-msg1-1735000000123  ← 相同!
[LoopDetection] reset skipped (same prompt_id)  ← 不会重置

// 继续生成
[GeminiClient] sendMessageStream called with prompt_id: user-message-msg1-1735000000123  ← 仍然相同!
```

**验证点**:
- ✓ 同一用户消息的所有 sendMessageStream 调用使用相同的 prompt_id
- ✓ reset() 仅在 prompt_id 首次出现时调用

### Test Case 3: 工具调用计数累积

**步骤**:
1. 使用 Preview 模型
2. 在 `checkPreviewModelToolNameLoop()` 处添加日志输出计数
3. 处理一个触发多次工具调用的消息

**期望日志**:
```log
[LoopDetection] Tool count updated: read_file = 1 (threshold: 4)
[LoopDetection] Tool count updated: read_file = 2 (threshold: 4)
[LoopDetection] Tool count updated: read_file = 3 (threshold: 4)
[LoopDetection] Tool count updated: read_file = 4 (threshold: 4)
[LoopDetection] Preview model loop detected: tool 'read_file' called 4 times (threshold: 4)
```

**验证点**:
- ✓ 计数连续递增
- ✓ 不会因为 reset() 而重置回 1
- ✓ 一旦达到阈值立即检测

### Test Case 4: Model 检测精确性

**步骤**:
1. 在 `reset()` 方法中添加日志记录 model 名称和 isPreviewModel 值
2. 使用不同的模型测试

**期望**:
```log
// Preview 模型
[LoopDetection] reset() called with model: gemini-3-pro-preview
[LoopDetection] isPreviewModel = true ✓

// 非 Preview 模型
[LoopDetection] reset() called with model: gemini-2.5-pro
[LoopDetection] isPreviewModel = false

[LoopDetection] reset() called with model: auto
[LoopDetection] isPreviewModel = false
```

**验证点**:
- ✓ Preview 模型正确识别
- ✓ 其他模型不误触发

---

## 🎯 关键修改点汇总

| 文件 | 方法/位置 | 修改 | 优先级 |
|------|---------|------|--------|
| aiService.ts | 类声明 | 添加 `currentPromptId` 变量 | P1 |
| aiService.ts | processChatMessage() | 生成和保存 sharedPromptId | P1 |
| aiService.ts | submitToolResultsToLLM() | 使用保存的 prompt_id | P1 |
| aiService.ts | processEditMessageAndRegenerate() | 使用保存的 prompt_id | P2 |
| aiService.ts | processGeminiStreamEvents() | 完成后清空 currentPromptId | P2 |
| client.ts | sendMessageStream() | （可选）日志记录 reset 情况 | P3 |
| loopDetectionService.ts | reset() | （可选）日志记录 model 和 isPreviewModel | P3 |

---

## 📝 实现检查清单

### 前置检查
- [ ] 确认当前 VSCode 中使用的实际 model 值
- [ ] 确认 Preview 模型名称格式（应包含 "preview"）
- [ ] 备份现有代码

### 实现步骤
- [ ] Step 1: 修改 processChatMessage() 生成 sharedPromptId
- [ ] Step 2: 添加 currentPromptId 实例变量
- [ ] Step 3: 修改 submitToolResultsToLLM() 使用 sharedPromptId
- [ ] Step 4: 修改 processEditMessageAndRegenerate() 使用 sharedPromptId
- [ ] Step 5: 修改 processGeminiStreamEvents() 清空 currentPromptId

### 验证步骤
- [ ] 编译通过，无 TypeScript 错误
- [ ] 单元测试通过（如果有）
- [ ] 手动测试 Test Case 1-4
- [ ] 日志输出验证
- [ ] 性能影响评估（应该无显著影响）

### 可选优化
- [ ] 添加日志开关，便于调试
- [ ] 添加指标收集（reset 次数、工具调用计数等）
- [ ] 添加详细的循环检测诊断信息

---

## ⚠️ 潜在风险和缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 多个消息同时处理 | currentPromptId 冲突 | 由于 VSCode 是单线程事件处理，风险低；如有并发需考虑用 Map |
| 长会话中 prompt_id 重复 | 歧义 | 使用 timestamp + message.id 组合，冲突概率极低 |
| 内存泄漏 | currentPromptId 未清空 | 在 Finished/LoopDetected/Error 时清空 |
| 向后兼容性 | CLI 模式是否受影响 | CLI 仍使用单 sendMessageStream，不受影响 |

---

## 🚀 部署步骤

1. **开发环境测试** (1-2 天)
   - 按照实现步骤逐步修改
   - 运行 Test Case 1-4
   - 修复任何发现的问题

2. **Beta 测试** (3-5 天)
   - 在受控环境中测试 Preview 模型
   - 收集反馈和日志
   - 性能和稳定性验证

3. **生产部署** (1 天)
   - 合并到 main 分支
   - 发布新版本
   - 监控错误日志和用户反馈

---

## 📚 相关文档

- `LOOP_DETECTION_ROOT_CAUSE_ANALYSIS.md` - 根本原因详细分析
- `packages/core/src/services/loopDetectionService.ts` - Loop Detection Service 源码
- `packages/vscode-ui-plugin/src/services/aiService.ts` - VSCode AI Service 源码
- `packages/core/src/core/client.ts` - GeminiClient 源码

