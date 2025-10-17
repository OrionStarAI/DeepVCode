# 空会话清理功能

## 问题描述

用户启动DeepV Code CLI后，如果没有进行任何对话就直接退出，会在会话记录中留下空的会话记录。这些空会话没有任何实际内容，但会显示在会话列表中，影响用户体验。

示例问题：
```
📋 可用的会话记录：

  1. Session 2025/9/10 14:39:12
     📅 创建时间: 2025/9/10 14:39:12
     🕒 最后活动: 2025/9/10 14:39:13
     💬 消息数量: 0
     🎯 Token消耗: 0
     🔗 Session ID: 8af7054e-b4e1-4354-b457-4311ddcfdebe
```

## 解决方案

实现了在程序退出时自动清理空会话的功能，确保只有包含实际对话内容的会话被保留。

### 核心功能

1. **空会话检测** (`isSessionEmpty`)
   - 检查会话的历史记录文件
   - 判断是否包含用户消息 (`type: 'user'`)
   - 只有包含用户消息的会话才被视为有效会话

2. **退出时清理** (`cleanupCurrentEmptySessionOnExit`)
   - 在程序退出时自动调用
   - 检查当前会话是否为空
   - 如果为空，删除会话目录并更新索引
   - 错误处理：静默处理清理错误，避免影响正常退出

### 实现位置

#### SessionManager (packages/core/src/services/sessionManager.ts)

新增方法：
- `isSessionEmpty(sessionId: string): Promise<boolean>`
- `cleanupCurrentEmptySessionOnExit(sessionId: string): Promise<void>`

#### 主程序集成 (packages/cli/src/gemini.tsx)

1. **信号处理器**：添加了SIGINT和SIGTERM处理器
2. **交互模式**：在registerCleanup中注册会话清理函数
3. **非交互模式**：在命令执行完成后手动清理空会话

#### 清理工具 (packages/cli/src/utils/cleanup.ts)

更新了cleanup函数以支持async操作，确保会话清理能够正确等待完成。

### 测试覆盖

添加了完整的测试套件以验证：
- 空会话检测的准确性
- 空会话清理的正确性
- 有内容会话的保护
- 错误处理的鲁棒性
- 会话索引的正确更新

### 使用场景

1. **启动后立即退出**：用户启动CLI但没有输入任何内容就退出
2. **Ctrl+C中断**：用户在输入阶段按Ctrl+C中断程序
3. **非交互模式**：通过管道或参数传入空内容后退出

### 行为说明

- ✅ **会被清理**：没有用户消息的会话
- ❌ **不会清理**：包含任何用户消息的会话（即使只有一条）
- 🔄 **自动更新**：会话索引会自动更新，移除被清理的会话
- 🛡️ **错误安全**：清理失败不会影响程序正常退出

### 配置选项

目前使用默认行为（自动清理空会话），未来可以考虑添加配置选项：
- `autoCleanupEmptySessions`: 是否启用自动清理
- `preserveEmptySessionsCount`: 保留最近的N个空会话

## 效果

实现后，用户启动CLI但没有进行对话就退出时，不会在会话记录中留下任何痕迹，保持会话列表的清洁和有用性。