# 简单回退系统 (Simple Revert System)

## 概述

由于之前的版本控制系统过于复杂且难以调试，我们实现了一个新的简单回退系统。这个系统基于Git和文件快照，更加可靠和易于维护。

## 核心特性

### 1. 三重回退机制

系统按优先级尝试三种回退方法：

#### 方案1: Git回退
- 在每个用户消息处理前创建Git commit
- 回退时使用 `git reset --hard` 恢复到指定commit
- 最可靠，能完整恢复所有文件状态

#### 方案2: 文件快照
- 在处理消息前保存相关文件的内容快照
- 回退时从内存中恢复文件内容
- 适用于Git不可用的情况

#### 方案3: 简单撤销
- 删除最近创建的新文件
- 适用于简单的文件创建场景

## 实现架构

```
用户发送消息
    ↓
创建快照 (Git commit + 文件内容)
    ↓
AI处理并修改文件
    ↓
用户点击回退
    ↓
尝试Git回退 → 成功则结束
    ↓ 失败
尝试快照恢复 → 成功则结束
    ↓ 失败
简单撤销新文件
```

## 文件结构

### 新增文件
- `src/services/simpleRevertService.ts` - 简单回退服务核心实现

### 修改文件
- `src/extension.ts` - 集成回退服务，处理消息快照
- `src/services/aiService.ts` - 简化了版本控制相关代码

## 主要API

### SimpleRevertService

```typescript
class SimpleRevertService {
  // 创建快照
  async createSnapshot(messageId: string, filesWillModify?: string[]): Promise<void>
  
  // 回退到指定消息
  async revertToMessage(messageId: string): Promise<SimpleRevertResult>
  
  // 获取可回退的消息ID列表
  getRevertableMessageIds(): string[]
}
```

## 使用方法

1. **自动快照**
   - 每次用户发送消息时，系统自动创建快照
   - 无需手动干预

2. **执行回退**
   - 点击用户消息旁的回退按钮
   - 系统自动选择最佳回退方案
   - 显示回退结果

## 优势对比

### 旧系统（VersionControlService）
- ❌ 复杂的版本节点管理
- ❌ 需要精确匹配工具名称
- ❌ turnId关联容易出错
- ❌ 调试困难

### 新系统（SimpleRevertService）
- ✅ 简单直观的实现
- ✅ 不依赖工具名称
- ✅ 基于Git，更可靠
- ✅ 多重保障机制
- ✅ 易于调试和维护

## 错误处理

系统提供友好的错误提示：
- Git不可用时自动降级到快照方案
- 快照不存在时尝试简单撤销
- 所有方案失败时提供明确说明

## 性能优化

- 自动清理旧快照（默认保留最近10个）
- 快照只保存将要修改的文件
- Git commits使用轻量级消息

## 测试建议

1. 让AI创建新文件，然后回退
2. 让AI修改现有文件，然后回退
3. 连续多次操作后回退到中间状态
4. 在没有Git的环境测试降级方案

## 未来改进

- [ ] 支持部分文件回退
- [ ] 显示回退预览
- [ ] 支持跨会话回退
- [ ] 添加回退历史记录



