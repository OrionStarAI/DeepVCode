# 自定义模型配置快速指南

## 🚀 5分钟快速上手

### 第一步：启动配置向导

在 DeepV Code 中输入：

```
/add-model
```

### 第二步：按照提示填写信息

#### 1. 选择提供商类型

```
▶ OpenAI Compatible
  OpenAI API, Azure OpenAI, LM Studio, Ollama, etc.

  Anthropic Claude
  Claude API (claude.ai)

  DeepV Custom
  Custom DeepV-compatible endpoint (OpenAI format)
```

使用 ↑/↓ 或 k/j 选择，按 Enter 确认

#### 2. 输入显示名称

```
> Enter Display Name
  This name will appear in the model selection dialog

> GPT-4 Turbo█
  Example: GPT-4 Turbo
```

#### 3. 输入模型ID

```
> Enter Model ID
  Unique identifier (must start with "custom-", e.g., custom-my-model)

> custom-openai-gpt4█
  Example: custom-openai-gpt4
```

#### 4. 输入API基础URL

```
> Enter API Base URL
  API endpoint base URL (e.g., https://api.openai.com/v1)

> https://api.openai.com/v1█
  Example: https://api.openai.com/v1
```

#### 5. 输入API密钥

```
> Enter API Key
  Your API key (or use ${ENV_VAR} for environment variable)

> ${OPENAI_API_KEY}█
  Example: ${OPENAI_API_KEY} or sk-...
```

💡 **推荐使用环境变量**，格式：`${变量名}`

#### 6. 输入模型名称

```
> Enter Model Name
  The model name to use with the API (e.g., gpt-4-turbo)

> gpt-4-turbo█
  Example: gpt-4-turbo
```

#### 7. 输入最大Token数（可选）

```
> Enter Max Tokens (Optional)
  Maximum context window size (press Enter to skip)

> 128000█
  Example: 128000
```

按 Enter 跳过此项

#### 8. 确认配置

```
✨ Please review your configuration:

  Provider:     OpenAI Compatible
  Display Name: GPT-4 Turbo
  ID:           custom-openai-gpt4
  Base URL:     https://api.openai.com/v1
  API Key:      ${OPENAI_API_KEY}
  Model ID:     gpt-4-turbo
  Max Tokens:   128000

Save this configuration? (y/n):
```

输入 `y` 保存，`n` 取消

### 第三步：设置环境变量

如果使用了环境变量格式（推荐），需要设置：

**Linux/macOS:**
```bash
export OPENAI_API_KEY="sk-your-api-key-here"
```

**Windows PowerShell:**
```powershell
$env:OPENAI_API_KEY="sk-your-api-key-here"
```

**Windows CMD:**
```cmd
set OPENAI_API_KEY=sk-your-api-key-here
```

### 第四步：使用自定义模型

输入 `/model` 打开模型选择对话框，选择你刚添加的模型（带 [Custom] 标签）

## 📋 常见配置示例

### OpenAI官方API

```
Provider:     OpenAI Compatible
Display Name: GPT-4 Turbo
ID:           custom-openai-gpt4
Base URL:     https://api.openai.com/v1
API Key:      ${OPENAI_API_KEY}
Model Name:   gpt-4-turbo
Max Tokens:   128000
```

### Azure OpenAI

```
Provider:     OpenAI Compatible
Display Name: Azure GPT-4
ID:           custom-azure-gpt4
Base URL:     https://your-resource.openai.azure.com/openai/deployments/your-deployment
API Key:      ${AZURE_OPENAI_KEY}
Model Name:   gpt-4
Max Tokens:   8192
```

### Claude API

```
Provider:     Anthropic Claude
Display Name: Claude Sonnet
ID:           custom-claude-sonnet
Base URL:     https://api.anthropic.com
API Key:      ${ANTHROPIC_API_KEY}
Model Name:   claude-sonnet-4-5
Max Tokens:   200000
```

### 本地LM Studio

```
Provider:     OpenAI Compatible
Display Name: Local Llama
ID:           custom-lm-studio
Base URL:     http://localhost:1234/v1
API Key:      not-needed
Model Name:   llama-3-70b
Max Tokens:   8192
```

### Groq

```
Provider:     OpenAI Compatible
Display Name: Groq Llama
ID:           custom-groq-llama
Base URL:     https://api.groq.com/openai/v1
API Key:      ${GROQ_API_KEY}
Model Name:   llama-3-70b-8192
Max Tokens:   8192
```

## 💡 使用技巧

### 1. 使用环境变量存储密钥

✅ **推荐**：`${OPENAI_API_KEY}`
❌ **不推荐**：直接输入明文密钥

### 2. ID命名规范

- ✅ 必须以 `custom-` 开头
- ✅ 只能包含小写字母、数字和连字符
- ✅ 示例：`custom-openai-gpt4`, `custom-my-model`
- ❌ 错误：`openai-gpt4`, `Custom-Model`, `custom_model`

### 3. Base URL格式

- ✅ 必须以 `http://` 或 `https://` 开头
- ✅ 不要以 `/` 结尾
- ✅ 示例：`https://api.openai.com/v1`
- ❌ 错误：`api.openai.com`, `https://api.openai.com/v1/`

### 4. 修改已有配置

使用 `/add-model` 添加相同ID的模型会自动覆盖旧配置。

### 5. 查看所有模型

使用 `/model` 命令可以看到所有可用模型，自定义模型会以青色显示。

## 🔧 故障排除

### 向导打不开？
- 确保使用最新版本的 DeepV Code
- 尝试重启 DeepV Code

### 配置保存失败？
- 检查 `~/.deepv` 目录是否有写入权限
- 查看错误提示信息

### 模型不显示？
- 检查 ID 是否以 `custom-` 开头
- 检查 `enabled` 字段是否为 `true`
- 重启 DeepV Code

### API调用失败？
- 验证 API Key 是否正确
- 检查 Base URL 格式
- 确认 Model Name 正确
- 测试网络连接

### 环境变量未生效？
- 确保使用 `${VAR_NAME}` 格式（带花括号）
- 检查环境变量是否已设置
- 重启 DeepV Code

## 📚 更多信息

- [完整配置指南](./custom-models-guide.md)
- [功能说明文档](./custom-models-README.md)
- [示例配置文件](./examples/custom-models-settings.json)

## 🎯 命令速查

| 命令 | 说明 |
|------|------|
| `/add-model` | 启动配置向导 |
| `/model` | 打开模型选择对话框 |
| `/model <id>` | 直接切换到指定模型 |
| `/help` | 查看所有命令 |
