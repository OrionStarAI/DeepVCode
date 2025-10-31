# 版本回退失败修复方案

## 问题诊断

### 错误信息
```
回退失败: Version node not found for turn: user-1761817192514-4x1kim46r
```

### 根本原因
版本回退功能存在**架构不匹配**的问题：

1. **版本节点创建路径正确**：
   - AIService 调用 `versionControlManager.recordAppliedChanges()`
   - 版本节点被正确创建，且包含正确的 `turnRefs: [messageId]`
   - 节点存储在 `VersionControlService.state.nodes` 中

2. **版本节点查询路径错误**：
   - 回退处理器调用了 `cursorStyleRevertService.revertToMessage()`
   - 该服务维护独立的文件备份 Map，不查询版本节点
   - 导致即使版本节点存在，回退时也找不到它

### 示意图
```
创建流程 ✅                      查询流程 ❌
────────────────────────────────────────────
AIService                        Extension.ts
  ↓                                ↓
recordAppliedChanges            onRevertToMessage
  ↓                                ↓
VersionControlManager             cursorStyleRevertService  ← 错误的服务!
  ↓                                ↓
VersionControlService            FileBackupMap (不包含版本节点)
  ↓                                ✗ 查询失败
创建 VersionNode ✅
```

## 修复方案

### 1. 修复回退处理器（Extension.ts）
**文件**: `src/extension.ts` (line ~364)

**修改前**:
```typescript
communicationService.onRevertToMessage(async (payload) => {
  const result = await cursorStyleRevertService.revertToMessage(messageId);
  // ❌ 调用了错误的服务
});
```

**修改后**:
```typescript
communicationService.onRevertToMessage(async (payload) => {
  // 🎯 首先尝试使用版本控制管理器
  let result = await versionControlManager.revertToTurn(sessionId, messageId);

  if (result.success) {
    // ✅ 成功
  } else {
    // 降级方案：使用文件备份
    const fallbackResult = await cursorStyleRevertService.revertToMessage(messageId);
  }
});
```

**改进点**：
- 调用正确的服务：`versionControlManager.revertToTurn()`
- 添加降级方案：如果版本控制失败，使用文件备份
- 更详细的日志记录

### 2. 改进错误诊断（VersionControlManager.ts）

**改进1**：增强 `findNodeByTurnId()` 方法
- 列出所有可用的 turnRefs 供调试
- 记录详细的节点信息

**改进2**：改进 `revertToTurn()` 方法
- 添加诊断日志，包括可用的版本节点列表
- 错误信息包含具体的可用 turnRefs

**改进3**：改进 `getRollbackableMessageIds()` 方法
- 显示节点总数和详细的 turnRef 列表
- 便于前端了解哪些消息可以回退

### 3. 增强版本节点创建的可追踪性

**文件**: `src/services/versionControlService.ts`

**改进**：
- `applyOpsAsBatch()` 添加详细的日志链
- 记录每一步创建流程（创建节点 → 添加到 Map → 更新父节点等）
- 最终验证节点是否真的被存储

**文件**: `src/services/versionControlManager.ts`

**改进**：
- `recordAppliedChanges()` 添加完整的诊断日志
- 验证创建的节点是否真的存在于服务中
- 即使没有文件操作，也创建占位版本节点

### 4. 添加调试命令
**命令**: `deepv.debugVersionNodes`

用途：诊断当前会话的版本节点状态
- 显示可回滚的消息列表
- 显示完整的版本时间线
- 显示所有版本节点的详细信息

## 对比 Cursor 的实现

### Cursor 的版本回退机制
1. **自动快照**：每次应用修改前自动创建快照
2. **简单的树结构**：每次应用形成一个版本节点
3. **快速查询**：通过 messageId 直接查找对应版本

### DeepV Code 改进后的实现
1. **版本树结构**：支持更复杂的版本管理（支持分支等）
2. **统一查询**：通过 `turnRefs` 关联消息和版本节点
3. **双重保障**：版本控制 + 文件备份双重降级方案

## 测试步骤

### 测试场景1：版本节点创建测试
```
1. 打开一个 VS Code 工作区
2. 在 DeepV Code 中发送消息：
   "请为我创建一个 test.js 文件，内容为 console.log('hello')"
3. 等待 AI 执行工具
4. 查看日志输出（Ctrl+Shift+`）
5. 验证日志中包含：
   - "Recording changes for turn: user-{timestamp}"
   - "Computed X operations from tool calls"
   - "Created version node: node-{timestamp} with turnRefs: ..."
```

### 测试场景2：版本节点查找测试
```
1. 完成测试场景1
2. 点击消息旁的回退按钮
3. 验证日志中包含：
   - "Reverting to message: user-{timestamp}"
   - "Found version node: node-{timestamp} for turnId"
   - "Revert to turn completed"
4. 文件应该被成功回退
```

### 测试场景3：错误诊断测试
```
1. 运行命令：deepv.debugVersionNodes
2. 应该显示诊断信息 Webview，包含：
   - 会话ID
   - 可回滚消息数量和列表
   - 完整的版本时间线
```

### 测试场景4：降级方案测试
```
1. 如果版本控制回退失败，应该自动使用文件备份降级
2. 验证日志中包含：
   - "Version control revert failed: ..."
   - "attempting fallback..."
   - "Revert completed using fallback"
```

## 日志关键词速查

| 关键词 | 含义 |
|-------|------|
| `recordAppliedChanges START` | 开始记录版本 |
| `Computed X operations` | 计算出的操作数 |
| `Created X placeholder operations` | 创建的占位操作 |
| `applyOpsAsBatch START` | 开始应用操作批次 |
| `Added node to state.nodes` | 节点已添加到存储 |
| `applyOpsAsBatch COMPLETE` | 节点创建完成 |
| `findNodeByTurnId: Searching` | 开始查找节点 |
| `Found version node` | ✅ 成功找到节点 |
| `Version node not found` | ❌ 未找到节点（问题） |
| `Available turnRefs` | 所有可用的 turnRef |

## 问题排查指南

### 如果回退仍然失败，检查以下几点

1. **版本节点没有被创建**
   - 查看日志中是否有 `recordAppliedChanges START`
   - 查看 `Computed X operations` 是否为 0
   - 检查工具执行是否成功（`status: ToolCallStatus.Success`）

2. **版本节点被创建但找不到**
   - 运行 `deepv.debugVersionNodes` 命令
   - 检查 `Available turnRefs` 中是否包含你的 messageId
   - 确认 messageId 格式是否为 `user-{timestamp}-{random}`

3. **版本控制失败，降级方案也失败**
   - 检查 `cursorStyleRevertService` 是否被正确初始化
   - 查看文件备份是否被创建（应该在消息处理前创建）

4. **仅检查特定消息的版本状态**
   ```
   运行诊断命令：deepv.debugVersionNodes
   查看输出中对应消息的版本节点信息
   ```

## 架构图更新

```
┌──────────────────────────────────────────────────────────┐
│  修复后的版本回退架构                                      │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Webview: MessageBubble.handleRevertToMessage()           │
│    ↓                                                       │
│  Extension: onRevertToMessage()                           │
│    ↓                                                       │
│  VersionControlManager.revertToTurn() ← 🎯 正确的路径     │
│    ↓                                                       │
│  VersionControlService.revertTo()                         │
│    ├─ findPath() - 计算回退路径                           │
│    └─ executePath() - 执行文件回退                        │
│                                                            │
│  降级方案：                                                │
│  如果版本控制失败 →                                        │
│  CursorStyleRevertService.revertToMessage()               │
│    ↓                                                       │
│  恢复文件备份 (fileBackup Map)                             │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

## 相关修改清单

✅ `extension.ts` - 修复回退处理器
✅ `versionControlManager.ts` - 改进错误诊断和日志
✅ `versionControlService.ts` - 增强可追踪性
✅ `versionControlManager.ts` - 添加诊断命令

## 参考资源

- [Cursor版本控制实现](https://cursor.sh/)
- [VSCode WorkspaceEdit API](https://code.visualstudio.com/api/references/vscode-api#WorkspaceEdit)
- [DeepV Code版本控制系统设计](../docs/version-control.md)
