# 版本回退修复验证指南

## 📋 修复内容清单

✅ **已完成的修复**：

1. **添加文件内容快照**
   - EditOperation 类型新增 `beforeContent` 和 `afterContent` 字段
   - 修改前的文件内容现在被正确保存

2. **改进文件内容捕获**
   - `createEditOperationFromToolCall()` 现在读取实际文件内容
   - 计算真实的文件 hash（不再是随机生成）
   - 详细记录捕获过程

3. **实现文件恢复机制**
   - `executePath()` 现在使用 `beforeContent` 恢复文件
   - 支持 create/modify/delete 所有操作类型
   - 错误处理更加完善

4. **增强诊断能力**
   - 详细的日志记录每一步
   - 清晰的成功/失败指示
   - 易于追踪问题

---

## 🧪 完整的验证步骤

### 准备工作

1. **重新构建项目**
   ```bash
   cd packages/vscode-ui-plugin
   npm run build
   ```
   确保看到 ✅ 编译成功

2. **重启 VS Code**
   - 关闭所有 VS Code 窗口
   - 重新打开，让插件重新加载

### 测试场景 1: 修改文件后回退

**目标**: 验证修改操作的回退功能

**步骤**:
```
1. 在工作区创建 test.js（包含初始内容）

   // test.js 初始内容
   function hello() {
     console.log('Hello World');
   }

2. 在聊天中发送:
   "修改 test.js，将 console.log 改为 console.error"

3. 等待 AI 完成，观察文件变化
   预期: 看到文件被修改了

4. 点击该消息旁的回退按钮

5. 观察结果:
   ✅ test.js 应该恢复到原始状态
   ✅ console.error 应该变回 console.log
   ✅ 看到日志: "♻️ Restoring modified file: test.js"

6. 验证成功:
   - 文件内容正确恢复
   - VS Code 状态栏无"modified"标记（或标记消失）
   - 没有错误提示
```

**预期日志输出**:
```
📖 Captured file before content for test.js (XYZ bytes)
Created operation - tool: replace, file: test.js, type: modify, beforeContent: saved
applyOpsAsBatch COMPLETE - nodeId: node-xxx
revertTo START - target: node-xxx, current: node-yyy
Found target node - targetNodeId: node-xxx
Computed revert path - steps: 1, direction: backward
Processing revert for 1 files
Processing modify operation for: test.js
♻️ Restoring modified file: test.js (XYZ bytes)
Applying 1 file operations...
File operations applied successfully
revertTo COMPLETE - success: true
```

---

### 测试场景 2: 删除文件后回退

**目标**: 验证删除操作的回退功能

**步骤**:
```
1. 在工作区创建 temp.js，内容为:
   module.exports = { version: '1.0.0' };

2. 在聊天中发送:
   "删除 temp.js 文件"

3. 等待 AI 完成，观察文件消失

4. 点击该消息旁的回退按钮

5. 观察结果:
   ✅ temp.js 应该重新出现
   ✅ 内容应该完整（包含 version: '1.0.0'）
   ✅ 看到日志: "📝 Restoring deleted file: temp.js"

6. 验证成功:
   - 文件在文件树中可见
   - 文件内容完全相同
   - 没有数据丢失
```

**预期日志输出**:
```
Processing delete operation for: temp.js
📝 Restoring deleted file: temp.js (XXX bytes)
Applying 1 file operations...
File operations applied successfully
revertTo COMPLETE - success: true
```

---

### 测试场景 3: 创建文件后回退

**目标**: 验证创建操作的回退功能（应该已经工作）

**步骤**:
```
1. 确保 new-file.js 不存在

2. 在聊天中发送:
   "创建 new-file.js，内容为 console.log('test')"

3. 等待 AI 完成，观察新文件出现

4. 点击该消息旁的回退按钮

5. 观察结果:
   ✅ new-file.js 应该被删除
   ✅ 看到日志: "🗑️ Deleting created file (revert): new-file.js"

6. 验证成功:
   - 文件在文件树中消失
   - 没有错误提示
```

---

### 测试场景 4: 多个文件操作后回退

**目标**: 验证批量文件操作的回退

**步骤**:
```
1. 在工作区创建:
   - app.js (内容: console.log('app'))
   - config.js (内容: module.exports = {})

2. 在聊天中发送:
   "修改 app.js 和 config.js，添加 version 字段"

3. 等待 AI 完成

4. 点击回退按钮

5. 观察结果:
   ✅ 两个文件都应该恢复到原始状态
   ✅ 看到日志:
      "Processing revert for 2 files"
      "♻️ Restoring modified file: app.js"
      "♻️ Restoring modified file: config.js"

6. 验证成功:
   - 两个文件都恢复了
   - 没有部分恢复的情况
```

---

## 🔍 日志检查清单

运行上述测试时，检查日志中是否出现以下关键词：

### 版本记录阶段
- [ ] `📖 Captured file before content` - 捕获文件内容
- [ ] `Created operation - tool: XXX, type: YYY, beforeContent: saved` - 操作创建
- [ ] `applyOpsAsBatch COMPLETE` - 版本节点创建成功

### 回退执行阶段
- [ ] `revertTo START` - 开始回退
- [ ] `Found target node` - 找到目标版本节点
- [ ] `Computed revert path` - 计算回退路径
- [ ] `Processing revert for N files` - 处理N个文件

### 文件恢复阶段
- [ ] `♻️ Restoring modified file: XXX.js` (修改文件)
- [ ] `📝 Restoring deleted file: XXX.js` (删除文件)
- [ ] `🗑️ Deleting created file: XXX.js` (创建文件)
- [ ] `File operations applied successfully` - 应用成功

### 完成阶段
- [ ] `revertTo COMPLETE - success: true` - 回退成功

---

## ❌ 故障排查

### 症状 1: "Cannot revert modifications" 警告

```
日志显示:
⚠️ Cannot revert modifications: test.js (no backup content available)
```

**原因**: `beforeContent` 为 undefined

**检查**:
1. 查看是否有 "📖 Captured file before content" 日志
2. 检查文件修改前是否存在
3. 检查文件路径是否正确

**解决**:
- 确保 AI 工具执行前文件可读
- 检查工作区访问权限
- 尝试重启 VS Code

### 症状 2: 回退后文件仍未改变

```
日志显示成功，但文件实际未变
```

**原因**: 可能是以下几种：
1. 文件权限问题
2. VS Code 缓存问题
3. WorkspaceEdit 应用失败

**检查**:
1. 查看是否有错误日志 (❌ Failed to...)
2. 手动编辑该文件确认可写
3. 检查 VS Code 的 undo/redo 功能是否工作

**解决**:
- 检查文件权限: `ls -la`
- 尝试手动编辑文件
- 重启 VS Code
- 检查文件是否被其他程序锁定

### 症状 3: 回退失败，返回错误

```
用户界面显示: "回退失败: XXX"
```

**检查步骤**:
1. 查看完整的错误消息
2. 查看日志中的 ❌ 标记
3. 检查是否有 CRITICAL 日志

**常见错误**:
- `Target version node not found` - 版本检查点不存在（通常是消息ID不匹配）
- `Failed to apply file changes` - WorkspaceEdit 应用失败（通常是权限问题）
- `Failed to open document` - 无法打开文件（通常是文件路径问题）

---

## 📊 预期结果对比表

| 场景 | 文件修改前 | AI 操作后 | 回退后 | 状态 |
|------|-----------|---------|--------|------|
| **修改** | app.js v1 | app.js v2 | app.js v1 | ✅ |
| **删除** | temp.js 存在 | temp.js 删除 | temp.js 恢复 | ✅ |
| **创建** | new.js 不存在 | new.js 创建 | new.js 删除 | ✅ |
| **批量** | file1,2,3 v1 | file1,2,3 v2 | file1,2,3 v1 | ✅ |

---

## 🚀 验证完成标准

✅ **修复已验证成功的条件**:

1. **修改文件可以恢复** - 文件内容回到修改前的状态
2. **删除文件可以恢复** - 删除的文件重新出现，内容完整
3. **创建文件可以回退** - 新文件被正确删除
4. **日志清晰** - 看到详细的操作日志，便于追踪
5. **无错误提示** - 回退操作完成时没有错误消息
6. **状态一致** - VS Code 的文件状态与实际文件一致

---

## 📝 提交反馈

完成验证后，请提供以下信息：

1. **验证结果**
   - [ ] 修改回退: ✅ 正常 / ❌ 失败
   - [ ] 删除回退: ✅ 正常 / ❌ 失败
   - [ ] 创建回退: ✅ 正常 / ❌ 失败
   - [ ] 批量操作: ✅ 正常 / ❌ 失败

2. **遇到的问题** (如有)
   - 错误消息
   - 日志中的关键错误

3. **性能反馈**
   - 回退速度是否可接受
   - 是否遇到延迟或卡顿

4. **建议**
   - 是否需要进一步优化
   - UI 是否需要改进

---

## 📞 获取帮助

如果验证中遇到问题：

1. **收集日志信息**
   - 打开 VS Code 输出面板（Ctrl+Shift+`）
   - 选择 "DeepV Code" 频道
   - 复制相关日志

2. **尝试调试**
   - 运行 `deepv.debugVersionNodes` 命令
   - 查看版本节点信息

3. **反馈问题**
   - 提供完整的日志
   - 说明重现步骤
   - 描述实际vs预期的行为

---

**验证指南版本**: 1.0
**最后更新**: 2025年10月31日
**状态**: 等待用户反馈
