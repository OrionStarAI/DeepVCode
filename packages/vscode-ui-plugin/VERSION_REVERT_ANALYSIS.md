# 版本回退失败根本原因分析

## 错误现象
```
Version node not found for turn: user-1761818318738-iy0420bcl
```

---

## 完整流程链条分析

### 1. **版本节点创建流程**

#### 1.1 何时调用 recordAppliedChanges

**调用点：** `aiService.ts` - `handleToolBatchCompleteWithIds()`

```typescript
// aiService.ts, L711-750
private async handleToolBatchCompleteWithIds(
  completedTools: VSCodeToolCall[],
  capturedUserMessageId: string | null,
  capturedProcessingMessageId: string | null
) {
  // ...
  await this.recordVersionForCompletedToolsWithIds(completedTools, capturedUserMessageId, capturedProcessingMessageId);
}
```

#### 1.2 turnId 的来源

**关键代码位置：** `aiService.ts`, L822 和 L862

```typescript
// L822 - 降级方案中的turnId
const turnId = capturedUserMessageId || capturedProcessingMessageId || `turn-${Date.now()}`;

// L862 - 实际版本记录中的turnId
const turnId = capturedUserMessageId || capturedProcessingMessageId || `turn-${Date.now()}`;
```

**turnId 优先级：**
1. `capturedUserMessageId` - 来自 `processChatMessage()` 中设置的 `this.currentUserMessageId`
2. `capturedProcessingMessageId` - 来自 `setProcessingState()` 中设置的 `this.currentProcessingMessageId`
3. 缺省值：`turn-${Date.now()}`

#### 1.3 验证 turnId 是否正确是 messageId

**是的，turnId 就是 messageId：**

```typescript
// aiService.ts, L1112
async processChatMessage(message: ChatMessage, context?: ContextInfo): Promise<void> {
  // ...
  // 🎯 保存当前用户消息ID，用于版本控制
  this.currentUserMessageId = message.id;  // ← 这里将 message.id 保存为 currentUserMessageId
  this.logger.info(`📝 Processing user message: ${message.id}`);

  // 然后调用 processStreamingResponseWithParts(message.id, ...)
  await this.processStreamingResponseWithParts(message.id, result.parts, responseId);
}
```

所以：
- `currentUserMessageId = message.id` (用户消息的ID)
- `turnId = currentUserMessageId` (确实是messageId)

#### 1.4 版本节点是否真的被创建

**检查 recordAppliedChanges 中的验证：** `versionControlManager.ts`, L156-182

```typescript
async recordAppliedChanges(
  sessionId: string,
  turnId: string,
  toolCalls: ToolCall[],
  description?: string
): Promise<string | null> {
  const service = this.getOrCreateVersionService(sessionId);

  const ops = await service.computeOps(turnId, toolCalls);
  // ...

  // 批量应用操作并生成版本节点
  const nodeId = await service.applyOpsAsBatch(turnId, ops, description);

  // 🎯 验证版本节点是否被正确创建并存储
  const createdNode = service.getNode(nodeId);
  if (createdNode) {
    this.logger.info(`✅ recordAppliedChanges COMPLETE - node: ${nodeId}, turnRefs: ${JSON.stringify(createdNode.turnRefs)}`);
  } else {
    this.logger.error(`❌ VERSION NODE CREATION FAILED: Node ${nodeId} not found in service`);
  }

  return nodeId;
}
```

**版本节点的 turnRefs 设置：** `versionControlService.ts`, L103-122

```typescript
async applyOpsAsBatch(
  turnId: string,
  ops: EditOperation[],
  description?: string
): Promise<string> {
  // 创建新的版本节点 ← turnId 作为参数传入
  const newNode = this.createVersionNode(
    this.state.currentNodeId,
    [turnId],  // ← turnRefs 被设置为 [turnId]
    ops,
    'ai_edit',
    description
  );

  this.logger.info(`📝 Created version node: ${newNode.nodeId} with turnRefs: ${JSON.stringify(newNode.turnRefs)}`);

  // 将节点添加到状态树
  this.state.nodes.set(newNode.nodeId, newNode);
  // ...
}
```

**所以版本节点确实被创建，且 turnRefs 包含了 turnId。**

---

### 2. **sessionId 的一致性问题**

#### 2.1 extension.ts 中的 sessionId

**获取来源：** `extension.ts`, L365-367

```typescript
communicationService.onRevertToMessage(async (payload) => {
  try {
    const { sessionId, messageId } = payload;
    logger.info(`🔄 Reverting to message: ${messageId} in session: ${sessionId}`);

    // 🎯 首先尝试使用版本控制管理器进行版本回退
    let result = await versionControlManager.revertToTurn(sessionId, messageId);
```

**sessionId 来自前端的 payload，经由 communicationService 传递。**

#### 2.2 AIService 内部使用的 sessionId

**设置点：** `sessionManager.ts`, L625-627 和 L781-783

```typescript
// 轻量级AIService创建时设置
private createLightweightAIService(sessionId: string): AIService {
  const aiService = new AIService(this.logger, this.extensionContext.extensionPath);
  // ...
  aiService.setSessionId(sessionId);
  // ...
}

// 完整AIService创建时也设置
private async createAIServiceForSession(sessionId: string): Promise<AIService> {
  const aiService = new AIService(this.logger, this.extensionContext.extensionPath);
  // ...
  aiService.setSessionId(sessionId);
  // ...
}
```

**AIService 中使用的 sessionId：** `aiService.ts`, L861-870

```typescript
const turnId = capturedUserMessageId || capturedProcessingMessageId || `turn-${Date.now()}`;

this.logger.info(`🔄 Recording version for turnId: ${turnId}`);
this.logger.info(`   - capturedUserMessageId: ${capturedUserMessageId}`);
this.logger.info(`   - capturedProcessingMessageId: ${capturedProcessingMessageId}`);
this.logger.info(`   - currentUserMessageId (live): ${this.currentUserMessageId}`);
this.logger.info(`   - currentProcessingMessageId (live): ${this.currentProcessingMessageId}`);

const versionNodeId = await this.versionControlManager.recordAppliedChanges(
  this.sessionId,  // ← 这里使用的 sessionId
  turnId,
  fileModifyingTools,
  `Applied ${fileModifyingTools.length} file changes`
);
```

**versionControlManager 管理的 sessionId：** `versionControlManager.ts`, L77-85

```typescript
private getOrCreateVersionService(sessionId: string): VersionControlService {
  let service = this.versionServices.get(sessionId);

  if (!service) {
    const sessionStoragePath = path.join(this.storagePath, 'versions', sessionId);
    service = new VersionControlService(
      this.logger,
      sessionId,  // ← 传入sessionId
      this.workspaceRoot,
      sessionStoragePath
    );

    this.versionServices.set(sessionId, service);
    // ...
  }

  return service;
}
```

**sessionId 应该是一致的。问题在于前端传递和后端接收的一致性。**

---

### 3. **版本服务实例管理**

#### 3.1 getOrCreateVersionService 是否返回同一实例

**是的，使用 Map 缓存：** `versionControlManager.ts`, L77-85

```typescript
private versionServices = new Map<string, VersionControlService>();

private getOrCreateVersionService(sessionId: string): VersionControlService {
  let service = this.versionServices.get(sessionId);  // ← 先查询缓存

  if (!service) {
    // ... 创建新实例
    this.versionServices.set(sessionId, service);  // ← 保存到缓存
  }

  return service;  // ← 总是返回同一实例
}
```

**每个 sessionId 对应一个唯一的 VersionControlService 实例。**

---

### 4. **消息 ID 与 turnRef 的映射**

#### 4.1 记录流程

```
processChatMessage(message: ChatMessage)
  ↓
  currentUserMessageId = message.id
  ↓
  processStreamingResponseWithParts(message.id, ...)
  ↓
  scheduleToolCalls()
  ↓
  CoreToolScheduler.schedule()
  ↓
  allToolCallsCompleteHandler()
    ↓
    capturedUserMessageId = this.currentUserMessageId  (捕获ID)
    ↓
    handleToolBatchCompleteWithIds(tools, capturedUserMessageId, ...)
      ↓
      recordVersionForCompletedToolsWithIds()
        ↓
        turnId = capturedUserMessageId  (使用捕获的ID)
        ↓
        versionControlManager.recordAppliedChanges(sessionId, turnId, tools, ...)
          ↓
          service.applyOpsAsBatch(turnId, ops, ...)
            ↓
            createVersionNode(..., [turnId], ...)  ← turnId 存入 turnRefs
```

#### 4.2 回退流程

```
extension.onRevertToMessage({ sessionId, messageId })
  ↓
  versionControlManager.revertToTurn(sessionId, messageId)  ← messageId 作为 turnId
    ↓
    findNodeByTurnId(service, turnId)
      ↓
      service.findNodeByTurnRef(turnRef)
        ↓
        遍历所有节点，查找 node.turnRefs.includes(turnRef)
        ↓
        如果没有找到 → 错误：Version node not found
```

---

## 🔴 **根本原因识别**

### 问题 1：多 Session 中的 VersionControlManager 实例唯一性

**versionControlManager 在 extension.ts 中是全局单例：**

```typescript
let versionControlManager: VersionControlManager;

export async function activate(context: vscode.ExtensionContext) {
  // ...
  versionControlManager = new VersionControlManager(logger, context);
  // ...
  sessionManager.setVersionControlManager(versionControlManager);
}
```

**这是正确的 - 一个 versionControlManager 管理所有 session 的版本服务。**

### 问题 2：sessionId 在多 Session 场景中可能不匹配

**可能的场景：**

1. **sessionId 类型或值变化：**
   - 前端发送的 `sessionId` 与后端存储的 `sessionId` 格式不同
   - 例如：前端发送 `"user-1761818318738-iy0420bcl"`，但后端处理时可能被转换或修改

2. **sessionId 跨 Session 冲突：**
   - 记录版本时使用 sessionId A
   - 回退时使用 sessionId B
   - 导致在不同的 VersionControlService 中查找

3. **通信链路中的 sessionId 丢失或变化：**
   - `extension.ts` → `versionControlManager.revertToTurn()` 中的 sessionId
   - 与 `aiService` → `versionControlManager.recordAppliedChanges()` 中的 sessionId 不同

### 问题 3：turnId 的生成和传递问题

**可能的场景：**

1. **turnId 生成的三级回退机制：**
   ```typescript
   const turnId = capturedUserMessageId || capturedProcessingMessageId || `turn-${Date.now()}`;
   ```
   - 如果 `capturedUserMessageId` 为 null，会使用 `capturedProcessingMessageId`
   - 如果都为 null，会生成 `turn-${Date.now()}` 这样的临时ID
   - 前端发送的 messageId 可能与这些生成的 turnId 不匹配

2. **messageId 与 turnId 不一致的具体例子：**
   - 记录版本时：`turnId = "user-1761818318738-iy0420bcl"` （来自 currentUserMessageId）
   - 回退时：前端发送 `messageId = "some-other-id"`
   - 导致 turnRef 无法匹配

### 问题 4：捕获 ID 的异步时序问题

**在 allToolCallsCompleteHandler 中：**

```typescript
const allToolCallsCompleteHandler: AllToolCallsCompleteHandler = (completedToolCalls) => {
  // ...
  // 🎯 立即捕获当前的用户消息ID，避免异步执行时被改变
  const capturedUserMessageId = this.currentUserMessageId;
  const capturedProcessingMessageId = this.currentProcessingMessageId;

  // 使用捕获的ID来处理工具完成
  this.handleToolBatchCompleteWithIds(completedVSCodeTools, capturedUserMessageId, capturedProcessingMessageId);
};
```

**但是，如果在 recordVersionForCompletedToolsWithIds 中的异步等待期间，currentUserMessageId 被改变了呢？**

```typescript
private async recordVersionForCompletedToolsWithIds(
  completedTools: VSCodeToolCall[],
  capturedUserMessageId: string | null,
  capturedProcessingMessageId: string | null
) {
  // 异步操作期间，this.currentUserMessageId 可能被新消息覆盖

  const turnId = capturedUserMessageId || capturedProcessingMessageId || `turn-${Date.now()}`;

  // ... 异步调用
  const versionNodeId = await this.versionControlManager.recordAppliedChanges(
    this.sessionId,
    turnId,
    fileModifyingTools,
    `Applied ${fileModifyingTools.length} file changes`
  );
}
```

---

## 🔍 **诊断建议**

### 1. **启用详细日志记录**

在 `aiService.ts` 中添加更多调试信息：

```typescript
// 在 processChatMessage 中
this.logger.info(`[MSG-FLOW] processChatMessage START`, {
  messageId: message.id,
  sessionId: this.sessionId,
  timestamp: Date.now()
});

// 在 allToolCallsCompleteHandler 中
this.logger.info(`[TOOLS-COMPLETE] Handler triggered`, {
  toolCount: completedToolCalls.length,
  currentUserMessageId: this.currentUserMessageId,
  currentProcessingMessageId: this.currentProcessingMessageId,
  sessionId: this.sessionId,
  timestamp: Date.now()
});

// 在 recordVersionForCompletedToolsWithIds 中
this.logger.info(`[VERSION-RECORD] About to record`, {
  capturedUserMessageId,
  capturedProcessingMessageId,
  derivedTurnId: turnId,
  sessionId: this.sessionId,
  timestamp: Date.now()
});
```

### 2. **在 versionControlManager.recordAppliedChanges 中验证**

```typescript
async recordAppliedChanges(
  sessionId: string,
  turnId: string,
  toolCalls: ToolCall[],
  description?: string
): Promise<string | null> {
  this.logger.info(`[RECORD-APPLY] START`, {
    sessionId,
    turnId,
    toolCount: toolCalls.length,
    timestamp: Date.now()
  });

  const service = this.getOrCreateVersionService(sessionId);

  // ... rest of code ...

  const nodeId = await service.applyOpsAsBatch(turnId, ops, description);

  const createdNode = service.getNode(nodeId);
  if (createdNode) {
    this.logger.info(`[RECORD-APPLY] SUCCESS`, {
      nodeId,
      turnRefs: createdNode.turnRefs,
      sessionId,
      timestamp: Date.now()
    });
  }

  return nodeId;
}
```

### 3. **在 revertToTurn 中验证 turnId 匹配**

```typescript
async revertToTurn(
  sessionId: string,
  turnId: string,
  options?: RevertOptions
): Promise<RevertResult> {
  const service = this.getOrCreateVersionService(sessionId);

  const allNodes = service.getAllNodes();
  const allTurnRefs = allNodes.flatMap(n => n.turnRefs);

  this.logger.info(`[REVERT-TURN] Search details`, {
    searchingForTurnId: turnId,
    totalNodes: allNodes.length,
    allTurnRefs: allTurnRefs,
    sessionId,
    timestamp: Date.now()
  });

  // ... rest of code ...
}
```

---

## 📋 **根本原因总结**

### 最可能的原因：

**在多 session 场景中，sessionId 或 turnId 的不匹配导致版本节点无法找到。**

具体可能是：

1. **turnId（messageId）变化：**
   - 用户消息 ID：`user-1761818318738-iy0420bcl`
   - 但在 AI 处理期间，这个 ID 被改变或丢失了
   - 导致记录的 turnRef 与回退时查找的 turnId 不同

2. **sessionId 变化：**
   - 记录版本时的 sessionId 与回退时的 sessionId 不同
   - 导致查询了错误的 VersionControlService

3. **异步竞态条件：**
   - 在处理工具完成时，如果快速切换消息或 session
   - currentUserMessageId 可能被新值覆盖
   - 导致使用了错误的 turnId

### 最直接的解决方案：

1. **确保 turnId 在整个流程中的一致性**
2. **在 recordAppliedChanges 中验证 sessionId 和 turnId 的有效性**
3. **添加详细的日志追踪 sessionId 和 turnId 的变化**
4. **在 revertToTurn 中提供更详细的诊断信息**

---

## 🚀 **修复实现步骤**

### 步骤 1：加固 turnId 的捕获和传递

在 `aiService.ts` 中：

```typescript
private async handleToolBatchCompleteWithIds(
  completedTools: VSCodeToolCall[],
  capturedUserMessageId: string | null,
  capturedProcessingMessageId: string | null
) {
  // ... existing code ...

  // 🎯 验证和日志记录捕获的IDs
  if (!capturedUserMessageId && !capturedProcessingMessageId) {
    this.logger.warn('⚠️ Both user and processing message IDs are null, using timestamp fallback');
  }

  // 确保使用的 turnId 被明确记录
  const derivedTurnId = capturedUserMessageId || capturedProcessingMessageId;
  this.logger.info(`[TOOLS-COMPLETE] Using derived turnId: ${derivedTurnId}, sessionId: ${this.sessionId}`);

  // ... rest of code ...
}
```

### 步骤 2：在版本记录中添加验证

在 `versionControlManager.ts` 中：

```typescript
async recordAppliedChanges(
  sessionId: string,
  turnId: string,
  toolCalls: ToolCall[],
  description?: string
): Promise<string | null> {
  // 验证输入参数
  if (!sessionId || !turnId) {
    this.logger.error('❌ Invalid parameters for recordAppliedChanges', {
      sessionId,
      turnId,
      toolCount: toolCalls.length
    });
    return null;
  }

  // ... rest of code ...
}
```

### 步骤 3：增强回退时的诊断

在 `versionControlManager.ts` 的 `revertToTurn` 中：

```typescript
async revertToTurn(
  sessionId: string,
  turnId: string,
  options?: RevertOptions
): Promise<RevertResult> {
  const service = this.getOrCreateVersionService(sessionId);
  const node = this.findNodeByTurnId(service, turnId);

  if (!node) {
    const availableNodes = service.getAllNodes();
    const allTurnRefs = availableNodes.flatMap(n => n.turnRefs);

    // 🎯 增强诊断信息
    const diagnosticInfo = {
      searchingFor: { sessionId, turnId },
      availableNodes: {
        count: availableNodes.length,
        nodes: availableNodes.map(n => ({
          nodeId: n.nodeId,
          turnRefs: n.turnRefs
        }))
      },
      allTurnRefs,
      possibleMatches: allTurnRefs.filter(ref =>
        ref.includes(turnId) || turnId.includes(ref)
      ),
      timestamp: new Date().toISOString()
    };

    this.logger.error('❌ VERSION NODE NOT FOUND', diagnosticInfo);

    // ... rest of error handling ...
  }

  // ... rest of code ...
}
```

