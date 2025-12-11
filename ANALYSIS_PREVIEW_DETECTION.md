# DeepV Code: Preview Model Detection Logic Analysis
## 预览模型重复调用检测详细分析报告

**分析日期**: 2025-01-11
**分析范围**: Core包 vs VSCode-UI-Plugin的重复工具调用检测机制
**关键发现**: ✅ CLI有效，❌ VSCode插件失效

---

## 1. 核心发现总结

| 方面 | Core包 (CLI) | VSCode-UI-Plugin | 状态 |
|------|--------------|------------------|------|
| LoopDetectionService存在 | ✅ 有 | ❌ 无 | 关键差异 |
| 初始化方式 | GeminiClient构造函数 | 无此服务 | 检测失败 |
| 检测逻辑实现 | 完整 | 无 | 检测失败 |
| LoopDetected事件处理 | ✅ 在client.ts中产生 | ❌ processGeminiStreamEvents无处理 | 事件丢失 |
| 预览模型检测 | ✅ /preview/i.test() | 无 | 完全缺失 |

---

## 2. 核心包 (packages/core) - 完整实现

### 2.1 LoopDetectionService初始化

**文件**: `packages/core/src/core/client.ts`

```typescript
// L42: 导入服务
import { LoopDetectionService } from '../services/loopDetectionService.js';

// L77: 声明服务实例
private readonly loopDetector: LoopDetectionService;

// L93: 在GeminiClient构造函数中初始化
constructor(private config: Config) {
  // ...其他初始化
  this.loopDetector = new LoopDetectionService(config);
}
```

### 2.2 预览模型检测逻辑

**文件**: `packages/core/src/services/loopDetectionService.ts`

#### 2.2.1 初始化时检测预览模型

```typescript
// L574-578: 在reset()方法中检测
private isPreviewModel: boolean = false;

reset(promptId: string): void {
  this.promptId = promptId;

  // 检测当前模型是否为预览模型
  const currentModel = this.config.getModel();
  this.isPreviewModel = /preview/i.test(currentModel);
  if (this.isPreviewModel) {
    console.log(
      `[LoopDetection] Detected preview model: ${currentModel}, ` +
      `enabling strict tool-name checking`
    );
  }

  this.resetToolCallCount();
  this.resetContentTracking();
  this.resetLlmCheckTracking();
  this.loopDetected = false;
  this.detectedLoopType = null;
}
```

#### 2.2.2 预览模型严格检测阈值

```typescript
// L22-43: 预览模型特殊处理的配置常量

/**
 * Preview models exhibit different loop patterns:
 * They often call the same tool with different args excessively
 * which our standard hash-based detection (name+args) can miss.
 */
const PREVIEW_TOOL_NAME_LOOP_THRESHOLD = 5;  // 普通工具：5次调用检测

/**
 * High-overhead I/O tools that preview models tend to abuse.
 * These should have stricter detection for preview models.
 */
const PREVIEW_INTENSIVE_TOOLS = new Set([
  'read_file',
  'read_many_files',
  'glob',
  'search_file_content',
  'ls',
]);

// 严格工具：4次调用检测
const PREVIEW_INTENSIVE_TOOL_THRESHOLD = 4;
```

#### 2.2.3 预览模型检测机制详解

```typescript
// L230-262: checkPreviewModelToolNameLoop方法

/**
 * Strict loop detection for preview models.
 * Preview models often call the same tool repeatedly with different args,
 * which can exhaust context and API quotas without making meaningful progress.
 */
private checkPreviewModelToolNameLoop(
  toolCall: { name: string; args: object }
): boolean {
  const toolName = toolCall.name;
  const currentCount = (this.toolNameCallCounts.get(toolName) || 0) + 1;
  this.toolNameCallCounts.set(toolName, currentCount);

  // 确定阈值：根据工具类型选择
  const isIntensiveTool = PREVIEW_INTENSIVE_TOOLS.has(toolName);
  const threshold = isIntensiveTool
    ? PREVIEW_INTENSIVE_TOOL_THRESHOLD    // read_file等: 4次
    : PREVIEW_TOOL_NAME_LOOP_THRESHOLD;   // 其他: 5次

  if (currentCount >= threshold) {
    console.warn(
      `[LoopDetection] Preview model loop detected: tool '${toolName}' ` +
      `called ${currentCount} times (threshold: ${threshold})`
    );
    this.detectedLoopType = LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS;
    logLoopDetected(
      this.config,
      new LoopDetectedEvent(
        LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
        this.promptId,
      ),
    );
    return true;
  }

  return false;
}
```

### 2.3 检测流程集成

**文件**: `packages/core/src/core/client.ts`

#### 2.3.1 Turn开始时的LLM检查

```typescript
// L606-613: sendMessageStream方法中

const loopDetected = await this.loopDetector.turnStarted(signal);
if (loopDetected) {
  const loopType = this.loopDetector.getDetectedLoopType();
  yield {
    type: GeminiEventType.LoopDetected,
    value: loopType ? loopType.toString() : undefined
  };
  // 添加反馈给AI
  this.addLoopDetectionFeedbackToHistory(loopType);
  return turn;
}
```

#### 2.3.2 流事件中的实时检查

```typescript
// L617-626: 处理流事件时的检查

const resultStream = turn.run(request, signal);
for await (const event of resultStream) {
  // 检查每个事件是否包含循环
  if (this.loopDetector.addAndCheck(event)) {
    const loopType = this.loopDetector.getDetectedLoopType();
    yield {
      type: GeminiEventType.LoopDetected,
      value: loopType ? loopType.toString() : undefined
    };
    this.addLoopDetectionFeedbackToHistory(loopType);
    return turn;
  }

  // 继续处理其他事件...
  yield event;
}
```

### 2.4 检测策略详解

```typescript
// L199-223: checkToolCallLoop方法中的两阶段检测

private checkToolCallLoop(toolCall: { name: string; args: object }): boolean {
  // 检查1: 标准精确匹配 (name + args hash)
  const key = this.getToolCallKey(toolCall);  // SHA256 hash
  if (this.lastToolCallKey === key) {
    this.toolCallRepetitionCount++;
  } else {
    this.lastToolCallKey = key;
    this.toolCallRepetitionCount = 1;
  }

  // 标准模型: 10次相同调用触发
  if (this.toolCallRepetitionCount >= TOOL_CALL_LOOP_THRESHOLD) {
    this.detectedLoopType = LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS;
    logLoopDetected(...);
    return true;
  }

  // 检查2: 预览模型严格检查 (仅name，忽略args)
  if (this.isPreviewModel) {
    return this.checkPreviewModelToolNameLoop(toolCall);
  }

  return false;
}
```

---

## 3. VSCode-UI-Plugin包 - 缺失实现

### 3.1 关键缺失: LoopDetectionService

**文件**: `packages/vscode-ui-plugin/src/services/aiService.ts`

✅ **有导入的内容**:
```typescript
// L20: 导入GeminiClient（包含loopDetector）
import {
  GeminiClient,
  Config,
  // ...其他导入
  ServerGeminiStreamEvent,
  GeminiEventType,
  // ...
}
```

❌ **缺失的处理**:
- 没有直接导入或使用LoopDetectionService
- LoopDetectionService在GeminiClient内部，但aiService没有感知其存在

### 3.2 事件处理缺陷

**文件**: `packages/vscode-ui-plugin/src/services/aiService.ts` - L1469-1530

```typescript
/**
 * 🎯 处理Gemini流式事件
 */
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
          // ✅ 处理内容事件
          if (this.communicationService && this.sessionId) {
            await this.communicationService.sendChatChunk(this.sessionId, {
              content: event.value,
              messageId: responseId,
              isComplete: false
            });
          }
          break;

        case GeminiEventType.Reasoning:
          // ✅ 处理推理事件
          if (this.communicationService && this.sessionId) {
            await this.communicationService.sendChatReasoning(
              this.sessionId,
              event.value.text,
              responseId
            );
          }
          break;

        case GeminiEventType.ToolCallRequest:
          // ✅ 处理工具调用请求
          toolCallRequests.push(event.value);
          break;

        case GeminiEventType.TokenUsage:
          // ✅ 处理Token使用
          await this.handleTokenUsage(event.value);
          break;

        case GeminiEventType.Error:
          // ✅ 处理错误
          if (this.communicationService && this.sessionId) {
            await this.communicationService.sendChatError(
              this.sessionId,
              `❌ AI响应时出现错误：${event.value.error?.message || 'Unknown error'}`
            );
          }
          return;

        case GeminiEventType.Finished:
          // ✅ 处理完成
          this.logger.info('Stream finished');
          break;

        // ❌ 【关键缺失】没有处理LoopDetected事件！
        // case GeminiEventType.LoopDetected:
        //   // 这里应该处理循环检测事件
        //   break;
      }
    }

    this.isCurrentlyResponding = false;

    if (toolCallRequests.length === 0) {
      this.setProcessingState(false, null, false);

      // 发送完成事件
      if (this.communicationService && this.sessionId) {
        await this.communicationService.sendChatComplete(
          this.sessionId,
          responseId,
          this.currentTokenUsage
        );
      }

      // 保存历史
      await this.saveSessionHistoryIfAvailable();
    }

    // 直接调度工具
    if (toolCallRequests.length > 0 && this.coreToolScheduler) {
      await this.scheduleToolCalls(toolCallRequests, signal);
    }

  } catch (error) {
    this.logger.error('❌ Failed processing stream events', error instanceof Error ? error : undefined);

    if (this.communicationService && this.sessionId) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
      await this.communicationService.sendChatError(this.sessionId, errorMessage);
    }
  }
}
```

### 3.3 完整的事件流对比

```
Core包(CLI) 流程：
========================================
1. GeminiClient.sendMessageStream()
   ↓
2. 初始化: loopDetector.reset(prompt_id)
   ├─ 检测模型: /preview/i.test(model)
   ├─ isPreviewModel = true/false
   ↓
3. Turn.run()开始前: await loopDetector.turnStarted(signal)
   ├─ LLM循环检查 (可选)
   ├─ 返回: loopDetected = true/false
   ↓
4. Turn.run() 生成流事件
   ↓
5. 每个事件: loopDetector.addAndCheck(event)
   ├─ 检查工具调用:
   │  ├─ 标准: name+args hash, 阈值=10
   │  ├─ 预览: name only, 阈值=5/4
   ├─ 返回: loopDetected = true/false
   ↓
6. 检测到循环 → yield LoopDetected事件 ✅
   ↓
7. 调用者处理事件并停止流 ✅


VSCode插件 流程：
========================================
1. AIService.geminiClient.sendMessageStream()
   ↓
2. GeminiClient内部:
   ├─ loopDetector.reset() ✅
   ├─ 检测预览模型 ✅
   ├─ loopDetector.turnStarted() ✅
   ├─ 产生LoopDetected事件 ✅
   ↓
3. AIService.processGeminiStreamEvents()
   ↓
4. for await (const event of stream)
   ├─ event.type === LoopDetected?
   │  ❌ 无处理! 事件被忽略!
   ↓
5. 流继续运行，循环未被停止 ❌
```

---

## 4. 详细代码对比

### 4.1 模型检测

| 方面 | Core | VSCode-UI-Plugin |
|------|------|------------------|
| **位置** | loopDetectionService.ts:574-578 | 无 |
| **触发时机** | reset()方法调用时 | 永不触发 |
| **代码** | `this.isPreviewModel = /preview/i.test(currentModel)` | 无 |
| **日志输出** | `[LoopDetection] Detected preview model: ...` | 无 |
| **结果** | 启用严格工具名检查 | 无此机制 |

### 4.2 工具调用检测

#### Core包中的两层检测

```typescript
// 第一层: 标准模型检测 (所有模型适用)
TOOL_CALL_LOOP_THRESHOLD = 10
- 检测: name + args完全相同
- 方式: SHA256哈希比较
- 应用: 所有模型

// 第二层: 预览模型严格检测 (仅预览模型)
if (isPreviewModel) {
  // 工具A (高开销): read_file, read_many_files, glob, search_file_content, ls
  PREVIEW_INTENSIVE_TOOL_THRESHOLD = 4

  // 工具B (普通): 其他
  PREVIEW_TOOL_NAME_LOOP_THRESHOLD = 5

  检测: name仅 (忽略args差异)
  方式: 计数器跟踪
  应用: 仅预览模型
}
```

#### VSCode插件中的检测

```
❌ 完全无此机制
```

### 4.3 初始化时序

| 步骤 | Core | VSCode-UI-Plugin |
|------|------|------------------|
| 1. GeminiClient构造 | ✅ 创建LoopDetectionService | ✅ GeminiClient有loopDetector |
| 2. sendMessageStream调用 | ✅ loopDetector.reset() | ✅ loopDetector.reset()执行 |
| 3. 模型检测 | ✅ /preview/i.test() | ❓ 执行但不使用 |
| 4. 流处理 | ✅ addAndCheck()每个事件 | ✅ 执行但结果被忽略 |
| 5. 事件产生 | ✅ yield LoopDetected | ✅ 被产生但 |
| 6. 事件处理 | ✅ client.ts处理 | ❌ 无handler |
| 7. 流停止 | ✅ 立即返回 | ❌ 继续运行 |

---

## 5. 执行流分析

### 5.1 Core包 - 预览模型 (gemini-3-pro-preview)

```
时刻T1: GeminiClient constructor
  → new LoopDetectionService()

时刻T2: sendMessageStream(parts, signal, 'msg-123')
  → loopDetector.reset('msg-123')
    → const model = config.getModel() // 'gemini-3-pro-preview'
    → isPreviewModel = /preview/i.test(model) // TRUE ✅
    → console.log('[LoopDetection] Detected preview model: gemini-3-pro-preview...')

时刻T3: turn.run() 开始
  → await loopDetector.turnStarted(signal)
  → 可能的LLM检查

时刻T4: 工具调用事件1
  Event: {type: 'tool_call_request', value: {name: 'read_file', args: {path: 'a.ts'}}}
  → loopDetector.addAndCheck(event)
    → checkToolCallLoop({name: 'read_file', args: {...}})
      → key = hash('read_file:{...}')
      → toolCallRepetitionCount = 1
      → isPreviewModel = true ✅
        → checkPreviewModelToolNameLoop()
          → toolNameCallCounts['read_file'] = 1
          → isIntensiveTool = true (read_file在PREVIEW_INTENSIVE_TOOLS中)
          → threshold = 4 ✅
          → 1 < 4, return false

时刻T5: 工具调用事件2 (相同工具，不同args)
  Event: {type: 'tool_call_request', value: {name: 'read_file', args: {path: 'b.ts'}}}
  → loopDetector.addAndCheck(event)
    → checkToolCallLoop()
      → key = hash('read_file:{path: b.ts}') // 不同hash!
      → lastToolCallKey !== key
      → toolCallRepetitionCount = 1 (重置)
      → isPreviewModel = true ✅
        → checkPreviewModelToolNameLoop()
          → toolNameCallCounts['read_file'] = 2
          → 2 < 4, return false

时刻T6: 工具调用事件3-4 (继续同一工具)
  → toolNameCallCounts['read_file'] 递增到3, 4

时刻T7: 工具调用事件4 (read_file第4次)
  → loopDetector.addAndCheck(event)
    → checkPreviewModelToolNameLoop()
      → toolNameCallCounts['read_file'] = 4
      → 4 >= 4 ✅
      → console.warn('[LoopDetection] Preview model loop detected: tool "read_file" called 4 times')
      → logLoopDetected()
      → return true

时刻T8: 返回sendMessageStream
  → if (loopDetector.addAndCheck(event)) {
      yield { type: GeminiEventType.LoopDetected, value: ... }
      return turn
    }

时刻T9: 流停止，AI停止响应 ✅
```

### 5.2 VSCode插件 - 同样场景

```
时刻T1-T7: 同上，都成功执行

时刻T8: yield LoopDetected事件
  → 事件被产生: {type: 'loop_detected', value: '...'}

时刻T9: AIService.processGeminiStreamEvents接收事件
  for await (const event of stream) {
    switch (event.type) {
      case GeminiEventType.Content:
        // 处理
        break;
      case GeminiEventType.ToolCallRequest:
        // 处理
        break;
      // ... 其他cases ...
      // ❌ 没有 case GeminiEventType.LoopDetected:
      //    事件被SILENT IGNORE
    }
  }

时刻T10: 流继续（事件被忽略）
  → for循环继续等待下一个事件
  → 流最终自然结束或AI继续产生事件

结果: ❌ 循环检测被触发但被忽略，流继续运行
```

---

## 6. 关键代码文件位置速查表

| 功能 | 文件 | 行号 | 关键方法 |
|------|------|------|---------|
| 服务定义 | core/src/services/loopDetectionService.ts | 115+ | class LoopDetectionService |
| 初始化 | core/src/core/client.ts | 77, 93 | constructor, loopDetector |
| 预览模型检测 | loopDetectionService.ts | 574-578 | reset() |
| 工具检查 | loopDetectionService.ts | 199-262 | checkToolCallLoop, checkPreviewModelToolNameLoop |
| 流处理(Core) | core/src/core/client.ts | 606-626 | sendMessageStream |
| 流处理(VSCode) | vscode-ui-plugin/src/services/aiService.ts | 1469-1530 | processGeminiStreamEvents |
| 测试 | core/src/services/loopDetectionService.test.ts | 256+ | Preview Model tests |

---

## 7. 问题根本原因

### Root Cause Analysis

```
问题: VSCode插件中preview模型的重复调用检测失效

原因链:
1. LoopDetectionService在GeminiClient内部 ✅ (存在)

2. 预览模型检测在reset()中执行 ✅ (执行)

3. 工具调用检查在addAndCheck()中执行 ✅ (执行)

4. LoopDetected事件被产生 ✅ (产生)

5. ❌ 关键缺陷: AIService.processGeminiStreamEvents()
      没有处理LoopDetected事件的switch case

      → 事件被流解析器消费
      → 但没有switch case处理它
      → 事件被SILENT IGNORE
      → 流继续运行
      → 用户看不到循环检测
```

### 影响范围

- **预览模型**: gemini-3-pro-preview, gemini-pro-preview等
- **工具**: read_file, read_many_files, glob, search_file_content, ls 等
- **调用场景**: VSCode UI中的所有AI交互
- **CLI**: ✅ 不受影响（已处理）

---

## 8. 修复建议

### 8.1 最小化修复方案

在 `AIService.processGeminiStreamEvents()` 中添加处理:

```typescript
// L1521-1527 之间添加

case GeminiEventType.LoopDetected:
  this.logger.warn(`🔴 Loop detected: ${event.value}`);

  // 通知前端
  if (this.communicationService && this.sessionId) {
    await this.communicationService.sendChatError(
      this.sessionId,
      `🔴 LOOP DETECTED: The AI was stuck in a repetitive pattern and stopped. ` +
      `Try providing more context or breaking the task into smaller steps.`
    );
  }

  // 停止处理
  this.isCurrentlyResponding = false;
  this.setProcessingState(false, null, false);
  return;
```

### 8.2 增强修复方案

```typescript
case GeminiEventType.LoopDetected:
  this.logger.warn(`🔴 Loop detected - Type: ${event.value}`);

  const loopMessage = this.getLoopDetectionMessage(event.value);

  if (this.communicationService && this.sessionId) {
    // 发送特定的循环类型消息
    await this.communicationService.sendLoopDetected(
      this.sessionId,
      event.value,
      loopMessage
    );
  }

  // 停止处理
  this.isCurrentlyResponding = false;
  this.setProcessingState(false, null, false);

  // 保存当前状态
  await this.saveSessionHistoryIfAvailable();
  return;

private getLoopDetectionMessage(loopType: string | undefined): string {
  switch (loopType) {
    case 'consecutive_identical_tool_calls':
      return '🔴 LOOP DETECTED: You were repeatedly calling the same tool with different arguments. ' +
             'This wastes context and API quota. Try a different approach or ask for clarification.';
    case 'chanting_identical_sentences':
      return '🔴 LOOP DETECTED: You were generating the same text repeatedly. ' +
             'Take a fresh approach or ask for guidance.';
    case 'llm_detected_loop':
      return '🔴 LOOP DETECTED: The AI analysis shows you\'re not making meaningful progress. ' +
             'Clarify the goal or break it into smaller steps.';
    default:
      return '🔴 LOOP DETECTED: The AI detected a repetitive pattern and stopped to save resources.';
  }
}
```

---

## 9. 测试覆盖

### 9.1 Core包测试 (已存在)

**文件**: `packages/core/src/services/loopDetectionService.test.ts`

```typescript
describe('LoopDetectionService - Preview Model Strict Checking', () => {
  it('should apply strict tool-name checking for preview models', () => {
    // L278-305: 预览模型测试 ✅
  });

  it('should use threshold of 5 for non-intensive tools in preview models', () => {
    // L306-332 ✅
  });

  it('should not apply preview strict checking for non-preview models', () => {
    // L334-351 ✅
  });

  it('should detect glob tool calls exceeding threshold in preview models', () => {
    // L353-377 ✅
  });

  it('should detect search_file_content exceeding threshold in preview models', () => {
    // L379-405 ✅
  });
});
```

### 9.2 VSCode插件测试 (需要添加)

应该添加测试验证:
1. LoopDetected事件被正确处理
2. 流在检测到循环时正确停止
3. 用户收到正确的错误消息
4. 预览模型正确激活严格检查

---

## 10. 总结对比表

| 检测机制 | Core包 | VSCode插件 |
|---------|--------|----------|
| **LoopDetectionService** | ✅ 有 | ✅ 通过GeminiClient |
| **模型检测** | ✅ /preview/i.test() | ✅ 执行但不使用 |
| **工具调用跟踪** | ✅ 工具名+args | ✅ 执行但不检查 |
| **预览模型阈值** | ✅ 4/5 | ❌ 无 |
| **标准阈值** | ✅ 10 | ✅ 执行 |
| **循环检测** | ✅ 产生事件 | ✅ 产生但不处理 |
| **事件处理** | ✅ yield停止 | ❌ SILENT IGNORE |
| **用户反馈** | ✅ 错误消息 | ❌ 无反馈 |
| **流停止** | ✅ return早期 | ❌ 继续运行 |

---

## 11. 关键指标

### 预览模型工具调用阈值

```
模型类型: Non-Preview (e.g., gemini-2.0-flash)
检测规则:
  - 标准: name+args完全相同 → 10次检测
  - 结果: ✅ 正常工作

模型类型: Preview (e.g., gemini-3-pro-preview)
检测规则:
  - 工具A (read_file, read_many_files, glob, search_file_content, ls):
    * 仅按name跟踪 (忽略args)
    * 阈值: 4次
  - 工具B (其他):
    * 仅按name跟踪
    * 阈值: 5次
  - 结果 Core: ✅ 正常工作
  - 结果 VSCode: ❌ 不工作 (事件被忽略)
```

---

## 文件位置索引

### Core包关键文件
- `packages/core/src/services/loopDetectionService.ts` - 核心检测逻辑 (570行+)
- `packages/core/src/services/loopDetectionService.test.ts` - 测试用例 (400+ 行)
- `packages/core/src/core/client.ts` - 初始化和集成 (919行)
- `packages/core/src/core/turn.ts` - 事件类型定义 (418行)

### VSCode插件关键文件
- `packages/vscode-ui-plugin/src/services/aiService.ts` - 需要修复 (1930行)
- `packages/vscode-ui-plugin/src/types/messages.ts` - 消息类型
- `packages/vscode-ui-plugin/src/services/sessionManager.ts` - 会话管理

---

**报告完成** ✅
