# 行内补全模型配置说明

## 📋 概述

行内代码补全功能现已支持**灵活的模型选择**，您可以选择使用与聊天界面相同的模型，或为补全功能单独指定模型。

---

## 🎯 模型选择策略

### 默认行为（`auto` 模式）

```
行内补全模型 = 当前聊天会话使用的模型
```

- ✅ **自动同步**：当您在聊天界面切换模型时，行内补全会自动使用相同的模型
- ✅ **一致体验**：确保代码补全风格与聊天建议保持一致
- ⚠️ **可能较慢**：如果聊天使用 Pro 或 Claude 模型，补全响应可能较慢

### 手动指定模型

您可以为行内补全单独选择优化的模型，独立于聊天会话：

```
行内补全模型 = 用户指定的固定模型（如 gemini-2.5-flash）
```

---

## ⚙️ 配置方法

### 方法 1：通过设置界面

1. 打开 VSCode 设置：`Cmd+,`（Mac）或 `Ctrl+,`（Windows/Linux）
2. 搜索：`DeepV Code: Inline Completion Model`
3. 从下拉菜单选择：
   - **auto**（默认）- 使用聊天会话的模型
   - **gemini-2.5-flash** - 快速响应（推荐用于补全）
   - **gemini-2.5-pro** - 更高质量但较慢
   - **claude-sonnet-4@20250514** - Claude 模型

### 方法 2：通过 settings.json

打开 `settings.json`（`Cmd+Shift+P` → `Preferences: Open User Settings (JSON)`）：

```json
{
  "deepv.inlineCompletionModel": "gemini-2.5-flash"
}
```

---

## 🤖 可用模型对比

| 模型                    | 速度 | 质量 | 推荐场景           | 说明                       |
|-------------------------|------|------|-------------------|---------------------------|
| **auto**                | 变化 | 变化 | 希望与聊天一致     | 自动跟随聊天会话模型       |
| **gemini-2.5-flash**    | ⚡⚡⚡ | ⭐⭐  | 快速补全（推荐）   | 速度最快，适合行内补全     |
| **gemini-2.5-pro**      | ⚡⚡   | ⭐⭐⭐ | 复杂代码补全       | 质量更高，但速度较慢       |
| **claude-sonnet-4**     | ⚡    | ⭐⭐⭐ | 高质量代码生成     | 最高质量，但响应较慢       |

---

## 💡 推荐配置

### 场景 1：追求速度（推荐给大多数用户）

```json
{
  "deepv.inlineCompletionModel": "gemini-2.5-flash",
  "deepv.inlineCompletionDelay": 200
}
```

- ✅ 最快的响应速度
- ✅ 足够准确的补全质量
- ✅ 降低延迟，提升编码流畅度

### 场景 2：追求质量

```json
{
  "deepv.inlineCompletionModel": "gemini-2.5-pro",
  "deepv.inlineCompletionDelay": 500
}
```

- ✅ 更高质量的代码建议
- ⚠️ 响应稍慢，需要更多耐心

### 场景 3：与聊天保持一致

```json
{
  "deepv.inlineCompletionModel": "auto",
  "deepv.inlineCompletionDelay": 300
}
```

- ✅ 自动同步聊天模型
- ✅ 无需手动切换
- ⚠️ 速度取决于聊天使用的模型

---

## 🔄 动态切换

配置更改会**立即生效**，无需重启 VSCode：

1. 修改设置
2. 清除缓存（自动）
3. 下次补全请求使用新模型

---

## 📊 查看当前配置

使用命令查看当前使用的模型：

```
Cmd+Shift+P → "DeepV Code: Test Inline Completion"
```

会显示：
```
📊 行内补全统计：

🤖 当前模型: gemini-2.5-flash
⚙️  配置: gemini-2.5-flash

✅ 总请求数: 12
✅ 成功补全: 10
⏭️  取消请求: 2
❌ 错误数: 0
```

---

## 🚀 性能优化建议

### 1. 选择合适的模型

```
快速编码 → gemini-2.5-flash
复杂项目 → gemini-2.5-pro
高质量生成 → claude-sonnet-4
```

### 2. 调整延迟

- **快速响应**：`100-200ms`（可能增加请求频率）
- **平衡**：`300ms`（推荐）
- **节省资源**：`500-1000ms`

### 3. 缓存策略

- 模型切换时会**自动清除缓存**
- 相同上下文会使用缓存结果
- 最多缓存 100 个补全结果

---

## 🔧 技术实现

### 模型优先级

```typescript
最终模型 = modelOverride || config.getModel() || 'gemini-2.5-flash'
```

1. **用户覆盖**（`inlineCompletionModel` 设置）
2. **Session 配置**（当前聊天会话的模型）
3. **默认值**（`gemini-2.5-flash`）

### 场景映射

行内补全使用 `SceneType.CONTENT_SUMMARY` 而非 `SceneType.CODE_ASSIST`，避免被强制映射到特定模型。

---

## ❓ 常见问题

### Q: 为什么我切换了聊天模型，但补全还是用旧模型？

**A:** 检查 `deepv.inlineCompletionModel` 设置：
- 如果设置为特定模型（如 `gemini-2.5-flash`），则不会跟随聊天模型
- 改为 `auto` 即可自动同步

### Q: 补全速度太慢怎么办？

**A:** 尝试以下优化：
1. 切换到 `gemini-2.5-flash` 模型
2. 减少 `inlineCompletionDelay` 到 200ms
3. 检查网络连接

### Q: 补全质量不高怎么办？

**A:** 尝试：
1. 切换到 `gemini-2.5-pro` 或 `claude-sonnet-4`
2. 提供更多上下文（在关键代码附近触发）
3. 增加延迟让 AI 有更多时间生成

### Q: 如何完全禁用行内补全？

**A:** 设置：
```json
{
  "deepv.enableInlineCompletion": false
}
```

或使用命令：
```
Cmd+Shift+P → "DeepV Code: Toggle Inline Completion"
```

---

## 📝 更新日志

### v1.0.164
- ✅ 新增模型选择配置
- ✅ 支持动态切换模型
- ✅ 优化为默认使用 Flash 模型
- ✅ 添加模型信息显示

---

## 🔗 相关文档

- [行内补全功能完整文档](./inline-completion-feature.md)
- [模型对比与选择指南](./quota-and-pricing.md)

---

**享受自定义的 AI 补全体验！** 🎯
