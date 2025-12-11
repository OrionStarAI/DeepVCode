# 🔍 Loop Detection Service 循环检测完全失效根本原因分析

## 执行摘要

VSCode Preview 模型中的循环检测完全失效，主要原因是**多个 prompt_id 导致的 LoopDetectionService 重复重置**。Loop Detection Service 被设计为单次提示（single prompt）的检测器，但 VSCode 中的消息流涉及多个不同的 prompt_id，导致每次 prompt_id 变化都会重置整个检测状态。

---

## 🎯 7 大根本原因

### 1. **🔴 CRITICAL: 工具结果提交触发重置（最严重）**

**位置**: `packages/vscode-ui-plugin/src/services/aiService.ts:1288-1291`

```typescript
const stream = this.geminiClient.sendMessageStream(
  toolResponseParts,
  abortController.signal,
  `tool-results-${Date.now()}` // ← 新的 prompt_id！
);
```

**问题流程**:
```
1. 初始消息: sendMessageStream("ai-response-1735000000123")
   ↓
   LoopDetectionService.reset("ai-response-1735000000123")
   isPreviewModel = true (假设)
   toolNameCallCounts.clear() ✓ 初始化
   ↓
   收到 5 个 read_file 工具调用
   toolNameCallCounts['read_file'] = 5
   ↓

2. 工具结果提交: sendMessageStream("tool-results-1735000000124")
   ↓
   LoopDetectionService.reset("tool-results-1735000000124") ← 🔴 RESET!
   isPreviewModel 可能重新计算
   toolNameCallCounts.clear() ← 🔴 CLEAR!
   ↓
   之前的 read_file 计数丢失
   ↓

3. 继续响应中的 3 个 read_file 调用
   toolNameCallCounts['read_file'] = 3 (从头开始)
   ↓
   总共 5+3=8 次调用，但分两次 reset，最多只看到 5 次
   无法检测到阈值 (preview_intensive: 4)
```

**影响**: 对于任何涉及工具调用和工具结果的交互，循环计数器都会被重置，导致无法累积跨多个 sendMessageStream 调用的工具调用计数。

---

### 2. **Preview 模型标识可能失效**

**位置**: `packages/core/src/services/loopDetectionService.ts:571-578`

```typescript
reset(promptId: string): void {
  this.promptId = promptId;

  // Detect if current model is a preview model for stricter checking
  const currentModel = this.config.getModel();
  this.isPreviewModel = /preview/i.test(currentModel);
  if (this.isPreviewModel) {
    console.log(`[LoopDetection] Detected preview model: ${currentModel}, enabling strict tool-name checking`);
  }
  // ...
}
```

**问题**:
- VSCode 中 config.getModel() 可能返回 `"auto"` 或其他不包含 "preview" 的值
- 即使使用了实际 Preview 模型（如 `"gemini-3-pro-preview"`），也需要正确传递
- 正则表达式 `/preview/i` 区分大小写（case-insensitive），但依赖 "preview" 字样出现
- VSCode 插件初始化时，model 可能尚未正确设置

**验证点**:
```typescript
// 在 VSCode aiService.ts:138-146
let modelToUse: string;
if (memoryOptions?.sessionModel) {
  modelToUse = memoryOptions.sessionModel;
} else {
  const vscodeConfig = vscode.workspace.getConfiguration('deepv');
  modelToUse = vscodeConfig.get<string>('preferredModel', 'auto'); // ← 可能是 "auto"
}
```

**后果**: 即使 isPreviewModel 被设为 true，一旦第二次 reset() 被调用时 model 不包含 "preview"，isPreviewModel 就被设为 false，以后的严格检查就不会启动。

---

### 3. **GeminiClient 实例生命周期管理问题**

**位置**: `packages/core/src/config/config.ts:419-424` 和 `packages/vscode-ui-plugin/src/services/aiService.ts:189`

```typescript
// config.ts refreshAuth()
this.geminiClient = new GeminiClient(this);
await this.geminiClient.initialize(this.contentGeneratorConfig);

// aiService.ts initialize()
this.geminiClient = this.config.getGeminiClient();
```

**问题**:
- GeminiClient 在整个会话中被重用（这是好的）
- 但 `lastPromptId` 是 GeminiClient 的实例变量
- 每个新消息都有不同的 prompt_id，导致频繁重置

**流程**:
```
Session 开始
├─ GeminiClient 创建一次 ✓
├─ lastPromptId = undefined
├─ 消息1: prompt_id="ai-response-1"
│  ├─ if (lastPromptId !== "ai-response-1") → true
│  ├─ loopDetector.reset("ai-response-1")
│  └─ lastPromptId = "ai-response-1"
├─ 消息1工具结果: prompt_id="tool-results-1"
│  ├─ if (lastPromptId !== "tool-results-1") → true ← 不同！
│  ├─ loopDetector.reset("tool-results-1") ← RESET
│  └─ lastPromptId = "tool-results-1"
└─ (循环继续，每次都 reset)
```

---

### 4. **Loop Detection Service 的设计假设不符合 VSCode 架构**

**位置**: `packages/core/src/services/loopDetectionService.ts:115-130`

设计假设:
- 一个 "prompt" = 一次用户输入 + 所有相关的 AI 响应和工具调用
- 在整个 prompt 期间，loopDetector 保持状态
- 当新 prompt 开始时，重置

**VSCode 实际流程**:
```
用户输入消息 → sendMessageStream("ai-response-X")
  ├─ AI 响应 + 5 个 tool_call_request 事件
  ├─ loopDetector.addAndCheck() 被调用 5 次
  ├─ toolNameCallCounts 被更新
  └─ 返回

处理工具结果 → sendMessageStream("tool-results-X")  ← 不同的 prompt_id!
  ├─ loopDetector.reset() 被调用 ← 🔴 状态丢失
  ├─ AI 再次响应 + 3 个 tool_call_request
  ├─ toolNameCallCounts 从 0 开始
  └─ 返回

继续... → sendMessageStream("continuation-X") ← 又是不同的 prompt_id!
  ├─ loopDetector.reset() 被调用 ← 🔴 状态丢失
  └─ ...
```

**问题**: Loop Detection Service 在单个 prompt 内工作良好，但 VSCode 的多 sendMessageStream 调用架构导致频繁重置。

---

### 5. **工具调用数据流验证**

**工具调用路径** ✓ 正确:
1. `Turn.run()` → `handlePendingFunctionCall()`
2. 创建 `ToolCallRequestInfo` 事件
3. `GeminiClient.sendMessageStream()` 中调用 `loopDetector.addAndCheck(event)`
4. 事件传递给 VSCode

**但**:
- 每次 addAndCheck() 都在同一 prompt_id 的生命周期内
- prompt_id 变化时，历史被完全清除

---

### 6. **工具结果递归调用的状态问题**

**位置**: `packages/vscode-ui-plugin/src/services/aiService.ts:1484-1557`

```typescript
const toolCallRequests: ToolCallRequestInfo[] = [];

for await (const event of stream) {
  switch (event.type) {
    case GeminiEventType.ToolCallRequest:
      toolCallRequests.push(event.value);  // 累积在这个周期
      break;

    case GeminiEventType.LoopDetected:
      toolCallRequests.length = 0;  // 清空
      return;
  }
}

// ... 处理工具调用 ...

if (toolCallRequests.length > 0 && this.coreToolScheduler) {
  await this.scheduleToolCalls(toolCallRequests, signal);
}
```

**流程**:
```
处理消息流程 1
├─ 累积工具调用列表
├─ 工具调用被执行 (通过 CoreToolScheduler)
└─ 调用 submitToolResultsToLLM()

submitToolResultsToLLM()
├─ 创建新的 sendMessageStream("tool-results-X") ← 新的 prompt_id!
├─ loopDetector.reset() ← 状态丢失
├─ processGeminiStreamEvents() 再次调用
│  └─ 累积更多工具调用
└─ 返回
```

**问题**: 虽然工具调用流经 loopDetector，但每次递归 sendMessageStream 都会重置，导致跨递归的累积计数无法进行。

---

### 7. **Preview 模型严格检测阈值设置**

**位置**: `packages/core/src/services/loopDetectionService.ts:27-45`

```typescript
const PREVIEW_TOOL_NAME_LOOP_THRESHOLD = 5;           // 普通工具
const PREVIEW_INTENSIVE_TOOL_THRESHOLD = 4;           // read_file 等

const PREVIEW_INTENSIVE_TOOLS = new Set([
  'read_file',
  'read_many_files',
  'glob',
  'search_file_content',
  'ls',
]);
```

**问题**:
- 这些阈值只有在 `isPreviewModel === true` 时才生效
- 而 isPreviewModel 依赖于 model 名称包含 "preview"
- VSCode 中 model 设置可能不正确
- 即使设置正确，多次 reset 也会导致计数不累积

**示例**:
```
假设 read_file 被调用 6 次，阈值是 4
阶段 1: 调用 1-4 次 (prompt_id="ai-response-1")
  → toolNameCallCounts['read_file'] = 4
  → 未达到阈值（4 < 4 不成立）... 等等，应该是 4 >= 4？

阶段 2: reset() 被调用 (prompt_id="tool-results-1")
  → toolNameCallCounts.clear() ← 计数重置到 0
  → isPreviewModel 可能变为 false
  → checkPreviewModelToolNameLoop() 可能不被调用

阶段 3: 继续调用 2 次 (in "tool-results-1")
  → toolNameCallCounts['read_file'] = 2
  → 只看到 2 次，无法达到阈值 4
```

---

## 📊 问题影响矩阵

| 方面 | 影响 | 严重度 |
|------|------|--------|
| **prompt_id 重置** | 跨消息阶段无法累积工具调用计数 | 🔴 CRITICAL |
| **Model 检测** | Preview 模式可能不激活 | 🟠 HIGH |
| **GeminiClient 生命周期** | lastPromptId 导致频繁重置 | 🟠 HIGH |
| **架构设计不匹配** | 单 prompt 设计不符合多 sendMessageStream 流程 | 🟠 HIGH |
| **工具调用累积** | 分散在多个 prompt_id 中 | 🟠 HIGH |
| **递归调用** | 每次 submitToolResults 都重置 | 🟡 MEDIUM |
| **阈值设置** | 阈值本身正确，但前置条件失效 | 🟡 MEDIUM |

---

## 🔧 核心问题描述

**问题**: Loop Detection Service 在 VSCode 中的 Preview 模型支持完全失效。

**根本原因**:
1. **立即原因**: `prompt_id` 在每次 `sendMessageStream` 调用时变化，导致 `loopDetector.reset()` 被频繁调用
2. **直接后果**: 工具调用计数无法跨 prompt_id 累积
3. **最终结果**: Preview 模型的严格循环检测（阈值 4-5）永远无法触发

**设计缺陷**:
- Loop Detection Service 设计为处理单个 prompt 的状态机
- VSCode 使用多个 sendMessageStream 调用来处理一个用户消息 + 工具结果序列
- 这两个架构不兼容

---

## ✅ 验证点清单

### 已验证 ✓
- [x] **reset() 何时被调用**: 在 `sendMessageStream()` 第 508-510 行，当 `lastPromptId !== prompt_id` 时
- [x] **reset() 参数**: 从 `prompt_id` 参数获取，在 VSCode 中每次都不同
- [x] **Preview 检测机制**: 使用 `/preview/i.test(config.getModel())` 在 reset() 中
- [x] **工具调用流**: 通过 Turn → GeminiClient.sendMessageStream → loopDetector.addAndCheck() ✓ 正确
- [x] **GeminiClient 实例**: 全局创建一次，被 VSCode AIService 重用 ✓
- [x] **工具结果提交**: 创建新的 sendMessageStream 调用，触发 reset ✓
- [x] **多实例问题**: 仅有一个 GeminiClient，不存在多实例状态不同步

### 尚需验证 ❓
- [ ] VSCode 中 config.getModel() 实际返回的值
- [ ] session 中 model 名称是否包含 "preview"
- [ ] Preview 模型在 VSCode 中实际使用的模型名称

---

## 🎯 7 大问题的交互关系

```
┌─────────────────────────────────────────────────────────────┐
│           VSCode 消息处理流程（问题关系图）                 │
└─────────────────────────────────────────────────────────────┘

用户消息
    │
    ├─→ processChatMessage()
    │      │
    │      └─→ processStreamingResponseWithParts(prompt_id="ai-response-X")
    │            │
    │            └─→ sendMessageStream(prompt_id="ai-response-X")
    │                 │
    │ ┌──────────────────────────────────────────────────┐
    │ │ ❌ 问题 1: reset() 被调用                        │
    │ │ ❌ 问题 2: isPreviewModel 被设置                │
    │ │ ✓  问题 4: 架构设计不匹配（开始）               │
    │ └──────────────────────────────────────────────────┘
    │                 │
    │                 ├─→ 收到 N 个 ToolCallRequest 事件
    │                 │   ├─→ loopDetector.addAndCheck()
    │                 │   │   └─→ checkPreviewModelToolNameLoop()
    │                 │   │       └─→ toolNameCallCounts['read_file']++
    │                 │   │           (计数: 1, 2, 3, ...)
    │                 │
    │                 └─→ 返回 toolCallRequests 列表
    │                     │
    │                     └─→ CoreToolScheduler 执行工具
    │                         │
    │                         └─→ submitToolResultsToLLM()
    │                            │
    │ ┌───────────────────────────────────┐
    │ │ ❌ 问题 1 触发:                   │
    │ │ sendMessageStream()               │
    │ │  prompt_id="tool-results-X"       │
    │ │  (不同的 prompt_id)               │
    │ └───────────────────────────────────┘
    │                            │
    │                            └─→ loopDetector.reset()
    │                                 ├─→ ❌ 问题 2: isPreviewModel 重新计算
    │                                 ├─→ ❌ 问题 5: toolNameCallCounts.clear()
    │                                 │   (所有之前的计数丢失!)
    │                                 └─→ turnsInCurrentPrompt = 0
    │                                     (新的 prompt 周期开始)
    │
    │                            └─→ 返回新的工具调用 (计数: 1, 2, 3, ...)
    │
    │ ❌ 问题 6: 递归调用导致状态丢失
    │ ❌ 问题 7: 阈值检查在 reset 后失效
    │
    ├─→ (循环继续，每次都重置)
```

---

## 🚨 为什么 Preview 模型循环检测完全失效

### 完整失效链条

```
初始状态:
  prompt_id = "ai-response-1"
  loopDetector.reset("ai-response-1")
  ↓
  config.getModel() 返回 "gemini-3-pro-preview"? (不确定)
  → isPreviewModel = /preview/i.test("gemini-3-pro-preview") = true ✓

  read_file 被调用 4 次:
  → toolNameCallCounts['read_file'] = 4
  → 阈值是 4 (PREVIEW_INTENSIVE_TOOL_THRESHOLD)
  → 4 >= 4? 否（需要严格大于）
  → 或者等于判断有问题?

收到工具结果:
  prompt_id = "tool-results-1"
  loopDetector.reset("tool-results-1")
  ↓
  config.getModel() 返回什么? (未知)
  → 可能返回 "auto" 或其他值
  → isPreviewModel = /preview/i.test("auto") = false ✗
  → 以后的调用不再检查 checkPreviewModelToolNameLoop()

  read_file 再被调用 2 次:
  → checkPreviewModelToolNameLoop() 未被调用
  → 即使被调用，计数也是从 1 开始
  → toolNameCallCounts['read_file'] = 2
  → 2 < 4，无法触发检测

最终结果:
  6 次 read_file 调用，但分散在两个 prompt_id 中
  - 第一阶段: 4 次，isPreviewModel=true，计数=4，未达到阈值（或达到了但...)
  - 第二阶段: reset 后 isPreviewModel=false，计数=2，检查被跳过
  → 循环检测完全失效
```

---

## 📋 关键代码位置速查表

| 问题 | 文件 | 行号 | 代码 |
|------|------|------|------|
| 1 - prompt_id 重置 | `client.ts` | 508-510 | `if (this.lastPromptId !== prompt_id) { this.loopDetector.reset(prompt_id);` |
| 1 - 工具结果新 ID | `aiService.ts` | 1290-1292 | `` const stream = this.geminiClient.sendMessageStream(..., `tool-results-${Date.now()}`)`` |
| 2 - Preview 检测 | `loopDetectionService.ts` | 575-578 | `this.isPreviewModel = /preview/i.test(currentModel);` |
| 3 - GeminiClient 创建 | `config.ts` | 419-424 | `this.geminiClient = new GeminiClient(this);` |
| 3 - AIService 获取 | `aiService.ts` | 189 | `this.geminiClient = this.config.getGeminiClient();` |
| 4 - 设计假设 | `loopDetectionService.ts` | 115-130 | `export class LoopDetectionService { ... }` |
| 5 - 工具调用 | `turn.ts` | 406-418 | `toolCallRequest: ToolCallRequestInfo = { ... };` |
| 6 - 递归处理 | `aiService.ts` | 1544 | `await this.scheduleToolCalls(toolCallRequests, signal);` |
| 7 - 阈值定义 | `loopDetectionService.ts` | 27-45 | `const PREVIEW_INTENSIVE_TOOL_THRESHOLD = 4;` |

---

## 💡 根本问题总结

**一句话**:
> LoopDetectionService 在 VSCode 中因频繁的 prompt_id 变化而反复重置，导致跨越多个 sendMessageStream 调用的工具调用计数无法累积，Preview 模型的严格循环检测永远无法触发。

**三个关键失效点**:
1. **架构不匹配**: 单 prompt 设计 vs 多 sendMessageStream 实现
2. **状态丢失**: 每个 prompt_id 变化都导致 reset()，计数清零
3. **检测失效**: Preview 模型检测 + 严格阈值 + 计数重置 三重打击

---

## 📌 建议的调查顺序

1. **立即验证**: VSCode 会话中 config.getModel() 返回的实际值
2. **追踪**: 在 reset() 和 checkPreviewModelToolNameLoop() 中添加详细日志
3. **测试**: 使用已知的 Preview 模型（如 `gemini-3-pro-preview`）进行手动测试
4. **确认**: prompt_id 变化频率和 reset() 调用频率
5. **分析**: Preview 模型阈值是否在第一阶段正确设置

