# Custom Models Feature

## 概述

DeepV Code 现在支持自定义模型配置，允许用户添加任何 OpenAI 兼容格式或 Claude API 格式的模型端点。

## 主要特性

### 1. 灵活的模型配置
- ✅ 支持 OpenAI 兼容格式 API
- ✅ 支持 Anthropic Claude API
- ✅ 支持自定义 DeepV 端点
- ✅ 环境变量支持（如 `${OPENAI_API_KEY}`）
- ✅ 自定义 HTTP headers 和超时设置

### 2. UI 视觉区分
- 🎨 自定义模型使用**青色（Cyan）**显示
- 🏷️ 自动添加 `[Custom]` 标签
- 💰 不显示积分消耗信息
- 🔄 与云端模型无缝共存

### 3. 完整功能支持
- ✅ 在模型选择对话框中显示
- ✅ 支持 `/model` 命令切换
- ✅ 支持自动完成
- ✅ 会话持久化
- ✅ 与云端模型混合使用

## 快速开始

### 方式一：图形化配置向导（推荐）🎯

使用 `/add-model` 命令启动交互式配置向导：

```
/add-model
```

向导将逐步引导你完成配置：

1. **选择提供商类型**
   - OpenAI Compatible (OpenAI API、Azure OpenAI、本地模型等)
   - Anthropic Claude (Claude API)
   - DeepV Custom (自定义端点)

2. **输入显示名称**
   - 示例：GPT-4 Turbo

3. **输入模型ID**
   - 必须以 `custom-` 开头
   - 示例：custom-openai-gpt4

4. **输入API基础URL**
   - 示例：https://api.openai.com/v1

5. **输入API密钥**
   - 可以直接输入或使用环境变量
   - 示例：${OPENAI_API_KEY}

6. **输入模型名称**
   - 传递给API的实际模型ID
   - 示例：gpt-4-turbo

7. **输入最大Token数（可选）**
   - 按 Enter 跳过

8. **确认配置**
   - 输入 y 保存，n 取消

配置完成后，自动保存到 `~/.deepv/custom-models.json`！

**💡 为什么使用独立文件？**
- 避免与 `settings.json` 的并发冲突
- 防止多个实例互相覆盖配置
- 云端模型更新不会影响自定义模型

### 方式二：手动编辑配置文件

编辑 `~/.deepv/custom-models.json`：

```json
{
  "models": [
    {
      "id": "custom-openai-gpt4",
      "displayName": "GPT-4 Turbo",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "${OPENAI_API_KEY}",
      "modelId": "gpt-4-turbo",
      "maxTokens": 128000,
      "enabled": true
    }
  ]
}
```

### 设置环境变量

```bash
# Linux/macOS
export OPENAI_API_KEY="your-api-key-here"

# Windows PowerShell
$env:OPENAI_API_KEY="your-api-key-here"

# Windows CMD
set OPENAI_API_KEY=your-api-key-here
```

### 使用自定义模型

启动 DeepV Code 后：

```
/model
```

选择带有 `[Custom]` 标签的模型即可。

## 命令参考

| 命令 | 说明 |
|------|------|
| `/add-model` | 启动配置向导添加自定义模型 |
| `/model` | 打开模型选择对话框 |
| `/model <model-id>` | 直接切换到指定模型 |

## 配置字段说明

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识符（必须以 `custom-` 开头）|
| `displayName` | string | 在 UI 中显示的名称 |
| `provider` | string | 提供商类型：`openai`、`anthropic` 或 `deepv` |
| `baseUrl` | string | API 基础 URL |
| `apiKey` | string | API 密钥（支持环境变量） |
| `modelId` | string | 传递给 API 的实际模型 ID |

### 可选字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxTokens` | number | - | 最大 token 数 |
| `enabled` | boolean | true | 是否启用 |
| `headers` | object | - | 额外的 HTTP headers |
| `timeout` | number | 300000 | 请求超时时间（毫秒）|

## 支持的提供商

### OpenAI 兼容 (`provider: "openai"`)

适用于任何遵循 OpenAI Chat Completions API 格式的服务：
- OpenAI 官方 API
- Azure OpenAI
- 本地模型（LM Studio, Ollama 等）
- 第三方 OpenAI 兼容服务（Groq, Together 等）

### Claude API (`provider: "anthropic"`)

适用于 Anthropic Claude API 端点。

### DeepV 自定义 (`provider: "deepv"`)

适用于自定义 DeepV 兼容端点（使用 OpenAI 格式）。

## 示例配置

完整示例请参考：[docs/examples/custom-models-settings.json](./examples/custom-models-settings.json)

### LM Studio（本地）

```json
{
  "id": "custom-lm-studio",
  "displayName": "LM Studio Local",
  "provider": "openai",
  "baseUrl": "http://localhost:1234/v1",
  "apiKey": "not-needed",
  "modelId": "local-model",
  "enabled": true
}
```

### Azure OpenAI

```json
{
  "id": "custom-azure-gpt4",
  "displayName": "Azure GPT-4",
  "provider": "openai",
  "baseUrl": "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
  "apiKey": "${AZURE_OPENAI_KEY}",
  "modelId": "gpt-4",
  "headers": {
    "api-version": "2024-02-01"
  },
  "enabled": true
}
```

### Groq

```json
{
  "id": "custom-groq-llama",
  "displayName": "Groq Llama 3",
  "provider": "openai",
  "baseUrl": "https://api.groq.com/openai/v1",
  "apiKey": "${GROQ_API_KEY}",
  "modelId": "llama-3-70b-8192",
  "enabled": true
}
```

## 技术实现

### 架构设计

```
┌─────────────────┐
│  Model Dialog   │ (UI层 - CLI/VSCode)
│  ModelCommand   │
└────────┬────────┘
         │
         ├─ 云端模型（DeepV Server）
         │   └─ /v1/chat/messages
         │
         └─ 自定义模型
             ├─ OpenAI Compatible
             │   └─ /v1/chat/completions
             ├─ Anthropic Claude
             │   └─ /v1/messages
             └─ DeepV Custom
                 └─ /v1/chat/completions
```

### 核心组件

1. **配置管理**
   - `packages/core/src/types/customModel.ts` - 类型定义
   - `packages/cli/src/config/settings.ts` - 配置加载
   - `packages/core/src/config/config.ts` - Config 类扩展

2. **模型调用**
   - `packages/core/src/core/customModelAdapter.ts` - API 适配器
   - `packages/core/src/core/DeepVServerAdapter.ts` - 统一调用入口

3. **UI 集成**
   - `packages/cli/src/ui/components/ModelDialog.tsx` - 模型选择对话框
   - `packages/cli/src/ui/commands/modelCommand.ts` - 模型命令
   - `packages/cli/src/utils/modelUtils.ts` - 工具函数

### 代码示例

#### 检查是否为自定义模型

```typescript
import { isCustomModel } from 'deepv-code-core';

if (isCustomModel('custom-openai-gpt4')) {
  // 这是一个自定义模型
}
```

#### 获取自定义模型配置

```typescript
const customModel = config.getCustomModelConfig('custom-openai-gpt4');
if (customModel) {
  console.log(customModel.displayName); // "GPT-4 Turbo [Custom]"
  console.log(customModel.provider);    // "openai"
}
```

## 限制和注意事项

### 当前限制

1. **流式传输**: 自定义模型目前仅支持非流式模式
2. **工具调用**: 取决于提供商的 API 能力
3. **高级特性**: 某些 DeepV 特有功能可能不可用

### 安全建议

1. ✅ 使用环境变量存储 API 密钥
2. ✅ 保护 `settings.json` 文件安全
3. ❌ 不要将 API 密钥提交到版本控制
4. ✅ 定期轮换 API 密钥

### 性能考虑

1. 本地模型可能需要较长的超时设置
2. 建议根据模型能力调整 `maxTokens`
3. 慢速网络环境可增加 `timeout` 值

## 故障排除

### 模型未显示

1. 检查 `id` 是否以 `custom-` 开头
2. 确认 `enabled` 不为 `false`
3. 重启 DeepV Code

### API 调用错误

1. 验证 API 密钥正确且有效
2. 检查 baseUrl 格式（不应以 `/` 结尾）
3. 确认 modelId 正确
4. 检查网络连接

### 环境变量未生效

1. 确保变量已在 shell 环境中设置
2. 使用 `${VAR_NAME}` 格式（带花括号）
3. 重启 DeepV Code

## 更新日志

### v1.0.271
- ✨ 新增自定义模型配置功能
- 🎨 自定义模型 UI 视觉区分
- 🔧 支持 OpenAI/Claude/DeepV 三种格式
- 📝 完整的文档和示例

## 相关文档

- [自定义模型配置指南](./custom-models-guide.md)
- [示例配置文件](./examples/custom-models-settings.json)
- [Settings 配置说明](./cli/configuration.md)

## 反馈和支持

如遇到问题或有功能建议，请通过以下方式联系：
- GitHub Issues: https://github.com/OrionStarAI/DeepVCode/issues
- 社区讨论: https://discord.gg/deepvcode
