# Anthropic Extended Thinking Budget 优化

## 📋 概述

将 Anthropic Extended Thinking 的 `budget_tokens` 从 **10,000** 提升到官方推荐的 **31,999**，以获得更好的思考质量。

## 🎯 修改原因

根据 Anthropic 官方文档和最佳实践：
- 官方推荐的 `budget_tokens` 值为 **31,999**
- 更大的思考预算可以让模型进行更深入的推理
- 对于复杂问题，充足的思考 token 能显著提升回答质量

## 📊 修改对比

| 参数 | 修改前 | 修改后 | 说明 |
|------|--------|--------|------|
| `budget_tokens` | 10,000 | 31,999 | 官方推荐值 |
| `maxTokens` (默认) | 16,000 | 32,000 | 确保足够空间 |
| `max_tokens` (最小值) | 16,000 | 32,000 | 容纳 thinking + 回复 |

## 🔧 技术细节

### 计算逻辑

```typescript
const maxTokens = modelConfig.maxTokens || 32000; // 默认 32000
requestBody.thinking = {
  type: 'enabled',
  budget_tokens: Math.min(maxTokens - 1, 31999), // 取较小值
};
requestBody.max_tokens = Math.max(maxTokens, 32000); // 至少 32000
```

### 实际场景

#### 场景 1: 用户未设置 `maxTokens`
```typescript
// 用户配置
{
  provider: "anthropic",
  modelId: "claude-sonnet-4-5"
  // maxTokens 未设置
}

// 实际请求
{
  "max_tokens": 32000,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 31999  // min(32000-1, 31999) = 31999
  }
}
```

#### 场景 2: 用户设置 `maxTokens: 8000`
```typescript
// 用户配置
{
  provider: "anthropic",
  modelId: "claude-sonnet-4-5",
  maxTokens: 8000
}

// 实际请求
{
  "max_tokens": 32000,  // max(8000, 32000) = 32000
  "thinking": {
    "type": "enabled",
    "budget_tokens": 7999  // min(8000-1, 31999) = 7999
  }
}
```

#### 场景 3: 用户设置 `maxTokens: 64000`
```typescript
// 用户配置
{
  provider: "anthropic",
  modelId: "claude-sonnet-4-5",
  maxTokens: 64000
}

// 实际请求
{
  "max_tokens": 64000,  // max(64000, 32000) = 64000
  "thinking": {
    "type": "enabled",
    "budget_tokens": 31999  // min(64000-1, 31999) = 31999 (上限)
  }
}
```

## 📈 预期效果

### 性能影响
- **Token 消耗**: 可能增加（仅在模型实际使用更多思考 token 时）
- **响应时间**: 可能略微增加（更深入的思考需要时间）
- **回答质量**: 预期提升（尤其是复杂问题）

### 成本影响
- Anthropic 的计费方式：thinking tokens 和 output tokens 分开计费
- Thinking tokens 通常比 output tokens 便宜
- 只有在模型实际需要更多思考时才会消耗额外 token

### 适用场景
- ✅ **复杂推理问题**: 数学、逻辑、编程难题
- ✅ **多步骤任务**: 需要规划和分解的任务
- ✅ **深度分析**: 代码审查、架构设计
- ⚠️ **简单问答**: 可能不会用完全部预算（无额外成本）

## 🔄 修改的文件

### 核心代码
1. **`packages/core/src/core/customModelAdapter.ts`**
   - 非流式调用: L758-763
   - 流式调用: L1046-1051

### 类型定义
2. **`packages/core/src/types/customModel.ts`**
   - 更新 `enableThinking` 注释，说明默认值为 31999

### 测试文件
3. **`packages/core/src/core/customModelAdapter.test.ts`**
   - 更新测试预期值: 10000 → 31999
   - 更新 max_tokens 预期: 16000 → 32000

### 文档
4. **`docs/anthropic-thinking-auto-enable.md`**
   - 更新 API 请求示例
   - 更新参数说明

## ✅ 测试结果

```bash
✓ src/core/customModelAdapter.test.ts (31 tests) 21ms
Test Files  1 passed (1)
Tests  31 passed (31)
```

所有测试通过，包括：
- ✅ `should use budget_tokens capped at 31999 when enableThinking is true`
- ✅ `should auto-enable thinking for all Anthropic models`
- ✅ `should respect explicit enableThinking=false to disable thinking`

## 💡 用户指南

### 默认行为（推荐）
无需任何配置，自动使用最佳设置：
```json
{
  "provider": "anthropic",
  "modelId": "claude-sonnet-4-5",
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "${ANTHROPIC_API_KEY}"
}
```
→ 自动使用 `budget_tokens: 31999`, `max_tokens: 32000`

### 自定义更大的 max_tokens
如果需要更长的回复：
```json
{
  "provider": "anthropic",
  "modelId": "claude-sonnet-4-5",
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "maxTokens": 64000
}
```
→ `budget_tokens: 31999` (上限), `max_tokens: 64000`

### 降低思考预算（节省成本）
如果想减少思考 token 消耗：
```json
{
  "provider": "anthropic",
  "modelId": "claude-sonnet-4-5",
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "maxTokens": 8000
}
```
→ `budget_tokens: 7999`, `max_tokens: 32000`

### 完全禁用思考
如果不需要思考功能：
```json
{
  "provider": "anthropic",
  "modelId": "claude-sonnet-4-5",
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "enableThinking": false
}
```
→ 不发送 `thinking` 参数

## 📚 参考资料

- [Anthropic Extended Thinking 官方文档](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
- [Claude API 参数说明](https://docs.anthropic.com/en/api/messages)
- [Thinking Tokens 计费说明](https://www.anthropic.com/pricing)

## 🎯 总结

| 方面 | 改进 |
|------|------|
| **思考质量** | ⬆️ 提升（更大的思考空间） |
| **默认体验** | ✅ 使用官方推荐值 |
| **灵活性** | ✅ 保持用户可配置 |
| **向后兼容** | ✅ 完全兼容 |

通过将 `budget_tokens` 提升到官方推荐的 31,999，用户可以在不需要任何配置的情况下，获得最佳的思考质量。同时保持了完全的可配置性，用户可以根据自己的需求调整。

---

**修改日期**: 2026-01-17
**版本**: v1.0.271
**影响范围**: Anthropic Extended Thinking 功能
