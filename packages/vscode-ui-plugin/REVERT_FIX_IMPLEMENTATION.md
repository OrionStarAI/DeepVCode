# 版本回退失败修复实现指南

## 问题症状
```
Error: Version node not found for turn: user-1761818318738-iy0420bcl
```

---

## 根本原因

### 问题链条
```
1. AIService 在处理工具完成时捕获 currentUserMessageId
   ↓
2. 如果 currentUserMessageId 为 null，则退而求其次使用 currentProcessingMessageId
   ↓
3. 如果都为 null，则生成 turn-{timestamp} 作为 fallback
   ↓
4. 使用捕获的 turnId 创建版本节点，存储在 turnRefs 中
   ↓
5. 回退时，前端发送的 messageId 与 turnRefs 中的 turnId 不匹配
   ↓
6. findNodeByTurnRef 无法找到对应的版本节点
```

### 关键问题点

#### 问题 1：turnId 的三级回退机制不可靠
```typescript
// aiService.ts, L822
const turnId = capturedUserMessageId || capturedProcessingMessageId || `turn-${Date.now()}`;
```

**风险：** 如果前两个都为 null，会生成一个随机的 `turn-{timestamp}`，而前端回退时发送的是 messageId（格式为 `user-{timestamp}-{random}`），导致无法匹配。

#### 问题 2：sessionId 可能在多 session 场景中不一致
- 记录版本时：使用 `this.sessionId`（AIService 内部）
- 回退时：使用 前端发送的 `sessionId`（extension.ts）
- 如果这两个不一致，就会查询错误的 VersionControlService

#### 问题 3：currentUserMessageId 的设置时机问题
```typescript
// aiService.ts, L1112
async processChatMessage(message: ChatMessage, context?: ContextInfo): Promise<void> {
  this.currentUserMessageId = message.id;  // ← 这里设置
  // ...
  await this.processStreamingResponseWithParts(message.id, result.parts, responseId);
}
```

**风险：** 如果在处理响应期间，用户又发送了新消息，currentUserMessageId 会被覆盖。

---

## 修复方案

### 修复 1：确保 turnId 绝对不为 null

**文件：** `aiService.ts`

**改动位置：** `handleToolBatchCompleteWithIds()` 方法

```typescript
// 🎯 改动前
const capturedUserMessageId = this.currentUserMessageId;
const capturedProcessingMessageId = this.currentProcessingMessageId;

this.handleToolBatchCompleteWithIds(completedVSCodeTools, capturedUserMessageId, capturedProcessingMessageId);

// 🎯 改动后
const capturedUserMessageId = this.currentUserMessageId;
const capturedProcessingMessageId = this.currentProcessingMessageId;

// 验证至少有一个消息ID被捕获
if (!capturedUserMessageId && !capturedProcessingMessageId) {
  this.logger.error('❌ CRITICAL: No message ID captured for tool completion');
  this.logger.error('   - currentUserMessageId:', this.currentUserMessageId);
  this.logger.error('   - currentProcessingMessageId:', this.currentProcessingMessageId);
  this.logger.error('   - sessionId:', this.sessionId);
}

this.handleToolBatchCompleteWithIds(completedVSCodeTools, capturedUserMessageId, capturedProcessingMessageId);
```

### 修复 2：强制使用有效的 turnId

**文件：** `aiService.ts`

**改动位置：** `recordVersionForCompletedToolsWithIds()` 方法

```typescript
private async recordVersionForCompletedToolsWithIds(
  completedTools: VSCodeToolCall[],
  capturedUserMessageId: string | null,
  capturedProcessingMessageId: string | null
) {
  if (!this.versionControlManager || !this.sessionId) {
    this.logger.debug('Version control manager or sessionId not available');
    return;
  }

  // 🎯 确保 turnId 有有效的来源
  let turnId = capturedUserMessageId || capturedProcessingMessageId;

  // 🎯 关键改动：如果都没有，也不要生成 turn-{timestamp}
  // 而是立即返回，避免创建无法回退的版本节点
  if (!turnId) {
    this.logger.warn('⚠️ Cannot record version: no valid turn ID available', {
      capturedUserMessageId,
      capturedProcessingMessageId,
      sessionId: this.sessionId,
      tools: completedTools.length
    });
    return;  // ← 不创建版本节点
  }

  // ... 验证 capturedUserMessageId
  this.logger.info(`🎯 Recording version for turnId: ${turnId}`);
  this.logger.info(`   - capturedUserMessageId: ${capturedUserMessageId}`);
  this.logger.info(`   - capturedProcessingMessageId: ${capturedProcessingMessageId}`);
  this.logger.info(`   - sessionId: ${this.sessionId}`);
  this.logger.info(`   - tools: ${completedTools.length}`);

  // ... 记录版本节点
  try {
    const versionNodeId = await this.versionControlManager.recordAppliedChanges(
      this.sessionId,
      turnId,
      fileModifyingTools,
      `Applied ${fileModifyingTools.length} file changes`
    );
    // ...
  } catch (error) {
    this.logger.error('❌ Failed to record version for completed tools', error instanceof Error ? error : undefined);
  }
}
```

### 修复 3：增强 sessionId 的验证

**文件：** `versionControlManager.ts`

**改动位置：** `recordAppliedChanges()` 方法

```typescript
async recordAppliedChanges(
  sessionId: string,
  turnId: string,
  toolCalls: ToolCall[],
  description?: string
): Promise<string | null> {
  try {
    // 🎯 添加参数验证
    if (!sessionId) {
      this.logger.error('❌ recordAppliedChanges: sessionId is required');
      return null;
    }

    if (!turnId) {
      this.logger.error('❌ recordAppliedChanges: turnId is required');
      return null;
    }

    const service = this.getOrCreateVersionService(sessionId);

    this.logger.info(`📌 recordAppliedChanges START`, {
      sessionId,
      turnId,
      toolCount: toolCalls.length,
      versionServiceId: service.sessionId  // ← 验证service中的sessionId
    });

    // 🎯 验证service的sessionId与传入的sessionId一致
    if (service.sessionId !== sessionId) {
      this.logger.error('❌ SessionId mismatch in version service', {
        expected: sessionId,
        actual: service.sessionId
      });
      return null;
    }

    // ... rest of code ...
  } catch (error) {
    this.logger.error('❌ recordAppliedChanges FAILED:', error instanceof Error ? error : undefined);
    return null;
  }
}
```

### 修复 4：增强 revertToTurn 中的诊断

**文件：** `versionControlManager.ts`

**改动位置：** `revertToTurn()` 方法

```typescript
async revertToTurn(
  sessionId: string,
  turnId: string,
  options?: RevertOptions
): Promise<RevertResult> {
  try {
    // 🎯 参数验证
    if (!sessionId || !turnId) {
      this.logger.error('❌ Invalid parameters for revertToTurn', {
        sessionId,
        turnId
      });
      return {
        success: false,
        revertedFiles: [],
        conflictFiles: [],
        error: 'Invalid parameters: sessionId and turnId are required',
        executionTime: 0
      };
    }

    const service = this.getOrCreateVersionService(sessionId);

    this.logger.info(`🔄 Starting revert to turn: ${turnId} in session: ${sessionId}`);

    // 通过turnId找到对应的版本节点
    const node = this.findNodeByTurnId(service, turnId);
    if (!node) {
      const availableNodes = service.getAllNodes();

      // 🎯 增强诊断信息，帮助定位问题
      const allTurnRefs = availableNodes.flatMap(n => n.turnRefs);
      const possibleMatches = allTurnRefs.filter(ref => {
        // 模糊匹配可能的候选
        return ref === turnId ||
               ref.includes(turnId.split('-')[0]) ||  // 匹配时间戳部分
               turnId.includes(ref);
      });

      const diagnosticInfo = {
        targetTurnId: turnId,
        sessionId: sessionId,
        totalNodes: availableNodes.length,
        allTurnRefs: allTurnRefs,
        possibleMatches: possibleMatches,
        nodeDetails: availableNodes.slice(0, 5).map(n => ({  // 显示前5个节点
          nodeId: n.nodeId,
          turnRefs: n.turnRefs,
          nodeType: n.nodeType
        })),
        timestamp: new Date().toISOString()
      };

      this.logger.error(`❌ Version node not found for turn: ${turnId}`, diagnosticInfo);

      // 🎯 返回更详细的错误信息
      const errorMsg = possibleMatches.length > 0
        ? `Version node not found for turn: ${turnId}. Possible matches: ${possibleMatches.join(', ')}`
        : `Version node not found for turn: ${turnId}. Available: ${allTurnRefs.join(', ') || 'none'}`;

      throw new Error(errorMsg);
    }

    this.logger.info(`✅ Located version node: ${node.nodeId} for turnId: ${turnId}, executing revert...`);
    const result = await service.revertTo(node.nodeId, options);

    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    this.logger.error('Failed to revert to turn:', error instanceof Error ? error : undefined);

    return {
      success: false,
      revertedFiles: [],
      conflictFiles: [],
      error: errorMsg,
      executionTime: 0
    };
  }
}
```

### 修复 5：修正 currentUserMessageId 的设置逻辑

**文件：** `aiService.ts`

**改动位置：** `processChatMessage()` 方法

```typescript
async processChatMessage(message: ChatMessage, context?: ContextInfo): Promise<void> {
  const responseId = `ai-response-${Date.now()}`;

  try {
    if (!this.isInitialized) {
      throw new Error('AI service is not initialized');
    }

    // 🎯 明确记录消息ID的设置
    this.currentUserMessageId = message.id;
    this.logger.info(`📝 Processing user message: ${message.id}`, {
      sessionId: this.sessionId,
      timestamp: Date.now()
    });

    // ... rest of code ...

    const result = await ContextBuilder.buildContextualContent(message.content, context);
    await this.processStreamingResponseWithParts(message.id, result.parts, responseId);

  } catch (error) {
    this.logger.error('❌ Failed to process AI chat', error instanceof Error ? error : undefined);

    if (this.communicationService && this.sessionId) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
      await this.communicationService.sendChatError(this.sessionId, errorMessage);
    }
  }
}
```

### 修复 6：添加版本节点存在性验证

**文件：** `versionControlService.ts`

**改动位置：** `getNode()` 方法，添加更详细的日志

```typescript
getNode(nodeId: string): VersionNode | undefined {
  const node = this.state.nodes.get(nodeId);

  if (!node) {
    this.logger.warn(`⚠️ getNode: Node not found: ${nodeId}`, {
      totalNodes: this.state.nodes.size,
      nodeIds: Array.from(this.state.nodes.keys())
    });
  } else {
    this.logger.debug(`✅ getNode: Retrieved node ${nodeId}`, {
      turnRefs: node.turnRefs,
      opsCount: node.ops.length
    });
  }

  return node;
}
```

---

## 修改检查清单

### 需要修改的文件

- [ ] `src/services/aiService.ts`
  - [ ] 修复 1：在 `handleToolBatchCompleteWithIds()` 中添加验证
  - [ ] 修复 2：在 `recordVersionForCompletedToolsWithIds()` 中避免生成无效 turnId
  - [ ] 修复 5：在 `processChatMessage()` 中改进日志

- [ ] `src/services/versionControlManager.ts`
  - [ ] 修复 3：在 `recordAppliedChanges()` 中添加参数验证
  - [ ] 修复 4：在 `revertToTurn()` 中增强诊断信息

- [ ] `src/services/versionControlService.ts`
  - [ ] 修复 6：在 `getNode()` 中添加详细日志

### 验证步骤

1. **编译检查**
   ```bash
   npm run build
   ```

2. **单元测试**
   - 验证 turnId 的捕获逻辑
   - 验证 sessionId 的一致性
   - 验证版本节点的创建和查询

3. **集成测试**
   - 单 session 场景的回退
   - 多 session 场景的回退
   - 快速消息切换的回退

4. **日志验证**
   - 检查日志中是否有 `[TOOLS-COMPLETE]`、`[VERSION-RECORD]`、`[REVERT-TURN]` 等关键日志
   - 验证 sessionId 和 turnId 在整个流程中的一致性

---

## 测试场景

### 场景 1：单消息回退
```
1. 用户发送消息 A（ID: msg-001）
2. AI 返回建议，执行工具
3. 点击回退到消息 A
4. 预期结果：成功回退
```

**验证：**
- 日志中 turnId = msg-001
- 版本节点的 turnRefs 包含 msg-001
- 回退时能找到该节点

### 场景 2：快速连续发送消息
```
1. 用户快速发送消息 A、B、C
2. 处理完成后点击回退到 A
3. 预期结果：成功回退到 A
```

**验证：**
- 确认 currentUserMessageId 在各阶段的值
- 确认捕获的 turnId 与回退时的 turnId 一致

### 场景 3：多 session 回退
```
1. 创建 session-1，发送消息，执行工具
2. 切换到 session-2，发送消息，执行工具
3. 回到 session-1，点击回退
4. 预期结果：只影响 session-1
```

**验证：**
- recordAppliedChanges 的 sessionId 与回退时的 sessionId 一致
- 不同 session 的版本节点互不干扰

---

## 常见问题排查

### 问题：修改后仍然找不到版本节点

**排查步骤：**

1. 查看 `recordAppliedChanges` 的日志
   ```
   ✅ recordAppliedChanges COMPLETE - node: xxx, turnRefs: [...]
   ```
   - 验证 turnRefs 中确实包含了消息ID

2. 查看 `handleToolBatchCompleteWithIds` 的日志
   ```
   [TOOLS-COMPLETE] Using derived turnId: xxx
   ```
   - 验证 turnId 是否正确

3. 查看 `revertToTurn` 的诊断日志
   ```
   ❌ Version node not found for turn: xxx
   ```
   - 检查 allTurnRefs 中是否有该 ID

### 问题：修改后编译失败

**排查：**
- 检查 VersionControlService 是否有 sessionId 属性
- 检查类型定义是否正确

### 问题：修改后影响其他功能

**排查：**
- 检查是否意外改变了函数的返回值
- 检查是否改变了 Map 的数据结构
- 运行现有的单元测试

---

## 预期改进

修复后，版本回退应该能够：

1. ✅ 正确捕获和保存 turnId（messageId）
2. ✅ 确保 sessionId 的一致性
3. ✅ 在多 session 场景中不互相干扰
4. ✅ 提供更详细的诊断信息帮助定位问题
5. ✅ 避免创建无法回退的"孤立"版本节点

