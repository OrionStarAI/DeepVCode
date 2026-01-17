# DeepV Code CLI 帮助知识库

> 本知识库包含 DeepV Code CLI 的所有命令和功能详细说明，供智能帮助系统使用。

## 📌 常见问题快速索引

### Q1: 如何切换 AI 模型？
**A:** 使用 `/model` 命令进行交互式切换：
1. 输入 `/model` 后按空格
2. 会显示可用模型列表
3. 使用方向键选择目标模型
4. 按回车确认切换，或者直接输入可用的模型名称后按回车



---

### Q2: 如何回滚到某个代码检查点？
**A:** 使用 `/restore` 命令：
1. 直接输入 `/restore` 后按空格，你可以用方向键查看所有可恢复的检查点
2. 输入 `/restore <检查点ID>` 回滚到指定检查点（在创建检查点时屏幕上会显示）
**用途：**
- 撤销文件编辑、回滚代码变更



---

### Q3: 如何保存和恢复会话？
**A:** 使用 `/session` 命令的子命令：
- **恢复会话：** `/chat select <ID>`
  - 示例：`/chat select 1`
- **查看所有会话详情：** `/session list`
- **新建干净的会话：** `/session new`


---

### Q4: 如何升级 DeepV Code CLI？
**A:** 使用 `dvcode -u` 命令进行升级。


---

### Q5: 如何让 CLI 感知 VS Code 中打开的文件或选中的代码？
**A:** DeepV Code CLI 可以通过 VS Code 扩展与编辑器进行深度集成。
1. **安装扩展：** 在 VS Code 扩展市场搜索并安装 `DeepV Code Companion` 扩展。
2. **启动 CLI：** 在 VS Code 的内置终端中启动 DeepV Code CLI。
3. **确认连接：** 当 CLI 成功启动后，你会在 VS Code 右下角看到一个绿色的指示器，显示 `IDE 已连接`。这表示 CLI 已成功与 VS Code 建立连接，可以感知你打开的文件和选中的代码。


---

### Q6: 如何添加自定义斜杠命令？
**A:** 创建 TOML 格式的命令定义文件：

**位置选择：**
- 全局命令：`~/.deepv/commands/`（所有项目可用）
- 项目命令：`<项目根目录>/.deepvcode/commands/`（仅当前项目）

**文件格式示例：**
```toml
# 文件：~/.deepv/commands/git/commit.toml
# 命令名：/git:commit

description = "生成符合规范的 git commit 消息"
prompt = """
请分析当前的 git staged 变更，生成一条符合 Conventional Commits 规范的 commit 消息。

格式要求：
- type(scope): subject
- type 可以是：feat、fix、docs、style、refactor、test、chore
- subject 简洁明确，不超过 50 字符
"""
```

**使用参数：**
```toml
prompt = "请重构以下代码为纯函数：{{args}}"
```
调用：`/refactor:pure some code here`

**相关文档：** 查看 `docs/cli/commands.md` 的 "Custom Commands" 章节

---

### Q7: 如何配置 MCP 服务器？
**A:** 在 `settings.json` 中配置 `mcpServers` 字段：

**位置选择：**
- 全局命令：`~/.deepv/`（所有项目可用）
- 项目命令：`<项目根目录>/.deepv/`（仅当前项目）

#### 方式一：标准模式（通过命令启动）

适用于本地 MCP 服务器，通过命令行启动进程。

```json
{
  "mcpServers": {
    "myPythonServer": {
      "command": "python",
      "args": ["mcp_server.py", "--port", "8080"],
      "cwd": "./mcp_tools/python",
      "timeout": 5000,
      "includeTools": ["safe_tool", "file_reader"]
    },
    "myNodeServer": {
      "command": "node",
      "args": ["mcp_server.js"],
      "excludeTools": ["dangerous_tool"]
    }
  }
}
```

**字段说明：**
- `command`（必需）：启动服务器的命令
- `args`（可选）：命令参数数组
- `env`（可选）：环境变量对象
- `cwd`（可选）：工作目录
- `timeout`（可选）：请求超时（毫秒）
- `trust`（可选）：信任服务器，跳过确认
- `includeTools`（可选）：白名单，仅启用指定工具
- `excludeTools`（可选）：黑名单，排除指定工具

#### 方式二：Streamable HTTP 模式（推荐用于云服务）

适用于支持 HTTP 的远程 MCP 服务器，无需本地启动进程。

```json
{
  "mcpServers": {
    "Web-Search-by-Z.ai": {
      "httpUrl": "https://open.bigmodel.cn/api/mcp-broker/proxy/web-search/mcp",
      "headers": {
        "Authorization": "Bearer **************************"
      }
    },
    "myHttpServer": {
      "httpUrl": "https://api.example.com/mcp/endpoint",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY",
        "Custom-Header": "custom-value"
      }
    }
  }
}
```

**Streamable HTTP 模式字段说明：**
- `httpUrl`（必需）：MCP 服务器的 HTTP 端点 URL
- `headers`（可选）：HTTP 请求头对象，用于认证或传递自定义信息
  - 常用认证方式：`Authorization: Bearer <token>`
- 其他字段（`includeTools`、`excludeTools`、`trust` 等）同样适用

**两种模式对比：**

| 特性 | 标准模式 | Streamable HTTP 模式 |
|-----|---------|---------------------|
| **连接方式** | 本地启动进程 | HTTP 请求 |
| **适用场景** | 本地 MCP 服务器 | 云服务、远程 MCP |
| **配置复杂度** | 需要配置命令、路径 | 只需 URL 和可选 Headers |
| **资源占用** | 本地进程资源 | 无本地进程 |
| **网络要求** | 无需网络 | 需要网络连接 |

**查看 MCP 状态：** `/mcp` 或 `/mcp desc`

**快捷键：** `Ctrl+T` 切换工具描述显示

---

### Q8: 如何切换主题？
**A:** 使用 `/theme` 命令：
1. 输入 `/theme` 打开主题选择对话框
2. 浏览可用主题
3. 选择并应用

---

### Q9: 有没有在 VSCode 中使用的图形化界面版/扩展/插件/GUI 版？
**A:** 是的，DeepV Code 也支持 VSCode 扩展！
你可以在 VSCode 扩展市场中搜索 **DeepV Code for VSCode** 在线安装，即可在 VSCode 中使用图形化界面版本。

**安装方式：**
1. 打开 VSCode
2. 进入扩展市场（快捷键：`Ctrl+Shift+X` 或 `Cmd+Shift+X`）
3. 搜索 `DeepV Code for VSCode`
4. 点击安装

**特点：**
- 图形化界面操作，更直观便捷
- 与 VSCode 深度集成
- 支持文件感知、代码选中等 IDE 功能
- 与 CLI 版本功能互补，可根据需求选择使用

---

### Q10: 如何快速调整主题、模型、Agent风格等常用设置？
**A:** 使用 `/config` 命令打开**交互式设置面板**：
1. 直接输入 `/config` 并按回车。
2. 你将看到一个可视化菜单，集成了所有常用设置：
   - **🎨 主题 (Theme)**：快速切换界面配色。
   - **🤖 AI 模型 (Model)**：在不同的 AI 模型间切换。
   - **🧠 Agent 风格 (Style)**：调整助手的行为风格（如默认、Codex、Cursor、Windsurf、Claude Code 等）。
   - **🚀 YOLO 模式**：开启/关闭工具调用自动批准。
   - **Vim 模式**：切换内置输入的 Vim 体验。
   - **🌐 语言偏好**：设置 AI 的回复语言。
3. 使用方向键上下移动，按回车进入子菜单或确认选择，按 `Esc` 返回或退出。

---

### Q11: 如何配置自定义模型（OpenAI/Claude API）？
**A:** DeepV Code 支持配置 OpenAI 兼容格式和 Anthropic Claude API 格式的自定义模型。

#### 📝 配置文件位置

自定义模型配置保存在：`~/.deepv/custom-models.json`

**为什么使用独立文件？**
- 避免与 `settings.json` 产生冲突
- 防止云端模型更新覆盖自定义配置
- 支持多个 DeepV Code 实例并发运行

#### 🚀 方式一：使用配置向导（推荐）

在 CLI 中输入：

```
/add-model
```

按照向导提示填写：
1. **选择提供商类型**：OpenAI Compatible / Anthropic Claude
2. **输入显示名称**：如 `GPT-4 Turbo`
3. **输入 API 基础 URL**：如 `https://api.openai.com/v1`
4. **输入 API 密钥**：推荐使用环境变量格式 `${OPENAI_API_KEY}`
5. **输入模型 ID**：如 `gpt-4-turbo`
6. **最大 Token 数**（可选）：如 `128000`
7. **确认配置**：输入 `y` 保存

#### ⚙️ 方式二：手动编辑配置文件

编辑 `~/.deepv/custom-models.json`：

```json
{
  "models": [
    {
      "displayName": "GPT-4 Turbo",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "${OPENAI_API_KEY}",
      "modelId": "gpt-4-turbo",
      "maxTokens": 128000,
      "enabled": true
    },
    {
      "displayName": "Claude Sonnet",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "modelId": "claude-sonnet-4-5",
      "maxTokens": 200000,
      "enabled": true
    },
    {
      "displayName": "Local Llama",
      "provider": "openai",
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "not-needed",
      "modelId": "llama-3-70b",
      "maxTokens": 8192,
      "enabled": true
    }
  ]
}
```

#### 📋 配置字段说明

**必需字段：**
- `displayName` - 显示名称（也作为唯一标识符）
- `provider` - 提供商类型：`openai` 或 `anthropic`
- `baseUrl` - API 基础 URL（不要以 `/` 结尾）
- `apiKey` - API 密钥（支持环境变量：`${VAR_NAME}`）
- `modelId` - 实际的模型名称（传递给 API）

**可选字段：**
- `maxTokens` - 最大上下文窗口大小（数字）
- `enabled` - 是否启用（`true`/`false`，默认 `true`）
- `headers` - 额外的 HTTP 请求头（键值对对象）
- `timeout` - 请求超时时间（毫秒）
- `enableThinking` - 启用 Anthropic 扩展思考（仅 `anthropic` 提供商）

#### 🔌 支持的提供商类型

**OpenAI Compatible (`openai`)：**
- OpenAI 官方 API
- Azure OpenAI
- 本地模型（LM Studio, Ollama, text-generation-webui）
- 第三方兼容服务（Groq, Together AI, DeepInfra 等）

**Anthropic Claude (`anthropic`)：**
- Claude API 官方端点
- 支持 Anthropic 扩展思考功能（`enableThinking: true`）

#### 💡 常见配置示例

**OpenAI 官方 API：**
```json
{
  "displayName": "GPT-4 Turbo",
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "${OPENAI_API_KEY}",
  "modelId": "gpt-4-turbo"
}
```

**Azure OpenAI：**
```json
{
  "displayName": "Azure GPT-4",
  "provider": "openai",
  "baseUrl": "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
  "apiKey": "${AZURE_OPENAI_KEY}",
  "modelId": "gpt-4",
  "headers": {
    "api-version": "2024-02-01"
  }
}
```

**Groq：**
```json
{
  "displayName": "Groq Llama 3",
  "provider": "openai",
  "baseUrl": "https://api.groq.com/openai/v1",
  "apiKey": "${GROQ_API_KEY}",
  "modelId": "llama-3-70b-8192"
}
```

**本地 LM Studio：**
```json
{
  "displayName": "Local Llama",
  "provider": "openai",
  "baseUrl": "http://localhost:1234/v1",
  "apiKey": "not-needed",
  "modelId": "local-model"
}
```

**Claude API（带扩展思考）：**
```json
{
  "displayName": "Claude Sonnet (Thinking)",
  "provider": "anthropic",
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "modelId": "claude-sonnet-4-5",
  "enableThinking": true
}
```

#### 🎯 使用自定义模型

**通过模型选择对话框：**
```
/model
```
自定义模型会显示 `[Custom]` 标签和青色，使用方向键选择。

**直接切换：**
```
/model custom:openai:gpt-4-turbo@abc123
```

#### 🔧 环境变量设置

**Linux/macOS：**
```bash
export OPENAI_API_KEY="sk-your-key-here"
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

**Windows PowerShell：**
```powershell
$env:OPENAI_API_KEY="sk-your-key-here"
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

**Windows CMD：**
```cmd
set OPENAI_API_KEY=sk-your-key-here
set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

#### ⚠️ 注意事项

- **安全性**：推荐使用环境变量存储 API 密钥，避免明文写入配置文件
- **Base URL 格式**：必须以 `http://` 或 `https://` 开头，不要以 `/` 结尾
- **重启生效**：修改配置后需要重启 DeepV Code
- **Token 计费**：自定义模型不消耗 DeepV 积分，直接向提供商付费
- **功能限制**：某些高级功能可能因提供商 API 限制而不可用

#### 🐛 故障排除

| 问题 | 解决方案 |
|-----|---------|
| 模型不显示 | 检查 `enabled` 是否为 `true`，重启 CLI |
| API 调用失败 | 验证 API Key、Base URL、Model ID 是否正确 |
| 环境变量未生效 | 确保使用 `${VAR_NAME}` 格式（带花括号） |
| 网络错误 | 检查网络连接，确认 URL 可访问 |

#### 📚 更多文档

- [自定义模型快速入门](../../docs/custom-models-quickstart.md)
- [自定义模型完整指南](../../docs/custom-models-guide.md)
- [自定义模型架构说明](../../docs/custom-models-architecture.md)

---

## 📖 斜杠命令完整列表 (Slash Commands `/`)
1. 输入斜杠则可以看到所有支持的斜杠命令

---


### `/clear` - 清空屏幕
清空终端显示，包括可见的会话历史和滚动缓冲区。

**用法：** `/clear`

**快捷键：** `Ctrl+L`

**注意：** 上下文数据会保留，仅清除视觉显示。

---

### `/compress` - 压缩上下文
用摘要替换整个聊天上下文，节省 token 用量。
当上下文不足 20% 时，CLI也会自动执行压缩。

**用法：** `/compress`

**作用：**
- 保留高层次摘要
- 大幅减少 token 消耗
- 适用于长时间会话

**注意：** 会丢失详细的历史记录，不可逆操作。

---

### `/copy` - 复制最后输出
将 AI 的最后一条输出复制到剪贴板。

**用法：** `/copy`

**使用场景：**
- 快速复制生成的代码
- 分享 AI 的回答
- 保存重要输出

---

### `/editor` - 选择编辑器
打开编辑器选择对话框，用于查看 diff。

**用法：** `/editor`

**支持的编辑器：**
- VSCode
- Sublime Text
- Vim
- 其他...

**配置：** 在 `settings.json` 中设置 `preferredEditor`

---

### `/help` 或 `/?` - 显示帮助
显示传统的命令列表帮助对话框。

**用法：** `/help` 或 `/?`

---

### `/help-ask` - AI 智能帮助助手
**（你现在正在使用的功能！）**

启动 AI 智能帮助系统，可以询问任何关于 CLI 功能的问题。

**用法：** `/help-ask`

**特点：**
- 基于完整的 CLI 知识库回答问题
- 使用 Auto 模型（会消耗 token）
- 支持中英文问答
- 按 Esc 键退出帮助模式

**退出帮助：** 按 `Esc` 键

**注意：** 此功能会消耗 API token，如果只想查看命令列表，请使用 `/help`

---

### `/init` - 初始化项目上下文
自动分析项目并生成 `DEEPV.md` 文件，提供项目上下文。

**用法：** `/init`

**功能：**
1. 分析项目结构
2. 识别项目类型（代码项目 vs 非代码项目）
3. 生成包含以下内容的 `DEEPV.md`：
   - 项目概述
   - 主要技术栈
   - 构建/运行命令
   - 开发规范
   - 特殊配置

**注意：** 如果 `DEEPV.md` 已存在，此命令则无法执行。

**相关：** `/memory refresh`

---

### `/mcp` - MCP 服务器管理
列出配置的 Model Context Protocol (MCP) 服务器及其工具。

**用法：** `/mcp [子命令]`

**子命令：**
- `desc` / `descriptions`：显示详细的工具描述
- `nodesc` / `nodescriptions`：隐藏工具描述，仅显示名称
- `schema`：显示工具参数的完整 JSON schema

**快捷键：** `Ctrl+T` - 切换工具描述显示

**配置：** 参见 Q5 或 `docs/cli/configuration.md`

---

### `/memory` - 记忆管理
管理 AI 的指令上下文（从 `DEEPV.md` 文件加载）。

**子命令：**
- `add <text>` - 添加文本到 AI 记忆
- `show` - 显示当前加载的完整分层记忆
- `refresh` - 重新加载所有  `DEEPV.md` 文件

**用法示例：**
```
/memory add 使用 TypeScript strict 模式
/memory show
/memory refresh
```

**记忆文件层次（优先级递增）：**
1. 全局：`~/.deepv/DEEPV.md`
2. 项目根及父目录：`<项目路径>/DEEPV.md`
3. 子目录：项目内各子目录的 `DEEPV.md`



---

### `/model` - 切换模型
交互式选择 AI 模型。

**用法：** `/model [模型名]`

**交互式：**
1. 输入 `/model` 后按空格
2. 显示可用模型列表
3. 方向键选择
4. 回车确认

**直接指定：** `/model Claude-Sonnet-4.5`

**查看统计：** `/stats model`

---

### `/quit` 或 `/exit` - 退出 CLI
退出 DeepV Code CLI。

**用法：** `/quit` 或 `/exit`

**注意：** 未保存的会话状态将丢失

---

### `/restore` - 恢复检查点
将项目文件恢复到某个工具执行前的状态。

**用法：** `/restore [checkpoint_id]`

**无参数：** 列出所有可用的检查点

**指定 ID：** 恢复到指定检查点


**用途：**
- 撤销文件编辑
- 回滚代码变更
- 恢复删除的文件

**相关文档：** `docs/checkpointing.md`

---

### `/stats` - 统计信息
显示当前会话的详细统计信息。

**用法：** `/stats [子命令]`

**子命令：**
- 无参数：显示总体统计（token 用量、缓存节省、会话时长）
- `model [模型名]`：显示模型统计（支持 Tab 补全）
- `tools`：显示工具使用统计

**示例：**
```
/stats
/stats model gemini-2.0-flash-exp
/stats tools
```

**注意：** 缓存 token 信息仅在使用 API key 认证时显示。

---

### `/theme` - 切换主题
打开主题选择对话框。

**用法：** `/theme`

**配置：**
```json
{
  "theme": "GitHub"
}
```

**自定义主题：**
```json
{
  "customThemes": {
    "MyTheme": {
      "primary": "#00FF00",
      "background": "#000000"
    }
  }
}
```

**相关文档：** `docs/cli/themes.md`

---

### `/auth` - 认证设置
打开认证对话框，用于重新登录认证。

**用法：** `/auth`

**支持的认证方式：**
- 根据您所在的组织会有不同的认证支持，具体看界面引导即可。

---

### `/config` - 统一配置菜单
打开交互式设置面板，让您可以直观地配置 DeepV Code 的各种设置。常用的设置如主题、模型、Agent 风格等都在这里了。

**用法：** `/config [子命令]`

**功能：**
- **交互式面板：** 直接输入 `/config` 回车，打开可视化菜单。
- **常用设置：** 面板集成了主题、编辑器、模型切换、Vim 模式、Agent 风格、YOLO 模式、健康使用提醒及语言偏好。
- **快捷操作：** 支持键盘上下移动、回车进入子菜单、`Esc` 返回或关闭。

**子命令：**
- `/config theme` - 打开主题选择
- `/config model` - 打开模型选择
- `/config agent-style` - 切换 Agent 风格
- `/config yolo [on|off]` - 切换 YOLO 自动批准模式
- `/config language [name]` - 设置回复语言偏好

**示例：**
```
/config
/config model claude
/config yolo on
```

---

### `/tools` - 工具列表
显示当前可用的所有工具（内置 + MCP）。

**用法：** `/tools [子命令]`

**子命令：**
- 默认：显示工具名称和描述
- `nodesc` / `nodescriptions`：仅显示工具名称
- `desc` / `descriptions`：显示详细描述（旧版，现为默认）

**示例：**
```
/tools
/tools nodesc
```

**相关：** `/mcp`、`/mcp schema`

---

### `/extensions` - 扩展管理
管理 DeepV Code 的扩展。

**用法：** `/extensions [子命令]`

**子命令：**
- `list` - 列出所有可用的扩展
- `info` - 查看扩展的安装和卸载相关知识

**示例：**
```
/extensions list
/extensions info
```

**功能说明：**
- `/extensions list`：显示当前可用的所有扩展列表
- `/extensions info`：获取关于如何安装、配置和卸载扩展的详细信息

---

### `/ext:` - 使用已安装的扩展命令
调用已安装的 context 类型扩展提供的斜杠命令。

**用法：** `/ext:<扩展名> [参数]`

**说明：**
- 当安装了扩展后，扩展可能提供自定义的斜杠命令
- 使用 `/ext:` 前缀可以调用这些已安装的 context 类型扩展
- 扩展命令会在已安装扩展列表中显示

**示例：**
```
/ext:myExtension
/ext:customCommand --option value
```

---

### `/vim` - Vim 模式
切换 vim 模式。

**用法：** `/vim`

**功能：**
- **NORMAL 模式：** `h`、`j`、`k`、`l` 导航；`w`、`b`、`e` 跳词；`0`、`# DeepV Code CLI 帮助知识库

> 本知识库包含 DeepV Code CLI 的所有命令和功能详细说明，供智能帮助系统使用。

## 📌 常见问题快速索引

### Q1: 如何切换 AI 模型？
**A:** 使用 `/model` 命令进行交互式切换：
1. 输入 `/model` 后按空格
2. 会显示可用模型列表
3. 使用方向键选择目标模型
4. 按回车确认切换，或者直接输入可用的模型名称后按回车



---

### Q2: 如何回滚到某个代码检查点？
**A:** 使用 `/restore` 命令：
1. 直接输入 `/restore` 后按空格，你可以用方向键查看所有可恢复的检查点
2. 输入 `/restore <检查点ID>` 回滚到指定检查点（在创建检查点时屏幕上会显示）
**用途：**
- 撤销文件编辑、回滚代码变更



---

### Q3: 如何保存和恢复会话？
**A:** 使用 `/session` 命令的子命令：
- **恢复会话：** `/chat select <ID>`
  - 示例：`/chat select 1`
- **查看所有会话详情：** `/session list`
- **新建干净的会话：** `/session new`


---

### Q4: 如何升级 DeepV Code CLI？
**A:** 使用 `dvcode -u` 命令进行升级。


---

### Q5: 如何让 CLI 感知 VS Code 中打开的文件或选中的代码？
**A:** DeepV Code CLI 可以通过 VS Code 扩展与编辑器进行深度集成。
1. **安装扩展：** 在 VS Code 扩展市场搜索并安装 `DeepV Code Companion` 扩展。
2. **启动 CLI：** 在 VS Code 的内置终端中启动 DeepV Code CLI。
3. **确认连接：** 当 CLI 成功启动后，你会在 VS Code 右下角看到一个绿色的指示器，显示 `IDE 已连接`。这表示 CLI 已成功与 VS Code 建立连接，可以感知你打开的文件和选中的代码。


---

### Q6: 如何添加自定义斜杠命令？
**A:** 创建 TOML 格式的命令定义文件：

**位置选择：**
- 全局命令：`~/.deepv/commands/`（所有项目可用）
- 项目命令：`<项目根目录>/.deepvcode/commands/`（仅当前项目）

**文件格式示例：**
```toml
# 文件：~/.deepv/commands/git/commit.toml
# 命令名：/git:commit

description = "生成符合规范的 git commit 消息"
prompt = """
请分析当前的 git staged 变更，生成一条符合 Conventional Commits 规范的 commit 消息。

格式要求：
- type(scope): subject
- type 可以是：feat、fix、docs、style、refactor、test、chore
- subject 简洁明确，不超过 50 字符
"""
```

**使用参数：**
```toml
prompt = "请重构以下代码为纯函数：{{args}}"
```
调用：`/refactor:pure some code here`

**相关文档：** 查看 `docs/cli/commands.md` 的 "Custom Commands" 章节

---

### Q7: 如何配置 MCP 服务器？
**A:** 在 `settings.json` 中配置 `mcpServers` 字段：

**位置选择：**
- 全局命令：`~/.deepv/`（所有项目可用）
- 项目命令：`<项目根目录>/.deepv/`（仅当前项目）

#### 方式一：标准模式（通过命令启动）

适用于本地 MCP 服务器，通过命令行启动进程。

```json
{
  "mcpServers": {
    "myPythonServer": {
      "command": "python",
      "args": ["mcp_server.py", "--port", "8080"],
      "cwd": "./mcp_tools/python",
      "timeout": 5000,
      "includeTools": ["safe_tool", "file_reader"]
    },
    "myNodeServer": {
      "command": "node",
      "args": ["mcp_server.js"],
      "excludeTools": ["dangerous_tool"]
    }
  }
}
```

**字段说明：**
- `command`（必需）：启动服务器的命令
- `args`（可选）：命令参数数组
- `env`（可选）：环境变量对象
- `cwd`（可选）：工作目录
- `timeout`（可选）：请求超时（毫秒）
- `trust`（可选）：信任服务器，跳过确认
- `includeTools`（可选）：白名单，仅启用指定工具
- `excludeTools`（可选）：黑名单，排除指定工具

#### 方式二：Streamable HTTP 模式（推荐用于云服务）

适用于支持 HTTP 的远程 MCP 服务器，无需本地启动进程。

```json
{
  "mcpServers": {
    "Web-Search-by-Z.ai": {
      "httpUrl": "https://open.bigmodel.cn/api/mcp-broker/proxy/web-search/mcp",
      "headers": {
        "Authorization": "Bearer **************************"
      }
    },
    "myHttpServer": {
      "httpUrl": "https://api.example.com/mcp/endpoint",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY",
        "Custom-Header": "custom-value"
      }
    }
  }
}
```

**Streamable HTTP 模式字段说明：**
- `httpUrl`（必需）：MCP 服务器的 HTTP 端点 URL
- `headers`（可选）：HTTP 请求头对象，用于认证或传递自定义信息
  - 常用认证方式：`Authorization: Bearer <token>`
- 其他字段（`includeTools`、`excludeTools`、`trust` 等）同样适用

**两种模式对比：**

| 特性 | 标准模式 | Streamable HTTP 模式 |
|-----|---------|---------------------|
| **连接方式** | 本地启动进程 | HTTP 请求 |
| **适用场景** | 本地 MCP 服务器 | 云服务、远程 MCP |
| **配置复杂度** | 需要配置命令、路径 | 只需 URL 和可选 Headers |
| **资源占用** | 本地进程资源 | 无本地进程 |
| **网络要求** | 无需网络 | 需要网络连接 |

**查看 MCP 状态：** `/mcp` 或 `/mcp desc`

**快捷键：** `Ctrl+T` 切换工具描述显示

---

### Q8: 如何切换主题？
**A:** 使用 `/theme` 命令：
1. 输入 `/theme` 打开主题选择对话框
2. 浏览可用主题
3. 选择并应用

---

### Q9: 有没有在 VSCode 中使用的图形化界面版/扩展/插件/GUI 版？
**A:** 是的，DeepV Code 也支持 VSCode 扩展！
你可以在 VSCode 扩展市场中搜索 **DeepV Code for VSCode** 在线安装，即可在 VSCode 中使用图形化界面版本。

**安装方式：**
1. 打开 VSCode
2. 进入扩展市场（快捷键：`Ctrl+Shift+X` 或 `Cmd+Shift+X`）
3. 搜索 `DeepV Code for VSCode`
4. 点击安装

**特点：**
- 图形化界面操作，更直观便捷
- 与 VSCode 深度集成
- 支持文件感知、代码选中等 IDE 功能
- 与 CLI 版本功能互补，可根据需求选择使用

---

### Q10: 如何快速调整主题、模型、Agent风格等常用设置？
**A:** 使用 `/config` 命令打开**交互式设置面板**：
1. 直接输入 `/config` 并按回车。
2. 你将看到一个可视化菜单，集成了所有常用设置：
   - **🎨 主题 (Theme)**：快速切换界面配色。
   - **🤖 AI 模型 (Model)**：在不同的 AI 模型间切换。
   - **🧠 Agent 风格 (Style)**：调整助手的行为风格（如默认、Codex、Cursor、Windsurf、Claude Code 等）。
   - **🚀 YOLO 模式**：开启/关闭工具调用自动批准。
   - **Vim 模式**：切换内置输入的 Vim 体验。
   - **🌐 语言偏好**：设置 AI 的回复语言。
3. 使用方向键上下移动，按回车进入子菜单或确认选择，按 `Esc` 返回或退出。

---

### Q11: 如何配置自定义模型（OpenAI/Claude API）？
**A:** DeepV Code 支持配置 OpenAI 兼容格式和 Anthropic Claude API 格式的自定义模型。

#### 📝 配置文件位置

自定义模型配置保存在：`~/.deepv/custom-models.json`

**为什么使用独立文件？**
- 避免与 `settings.json` 产生冲突
- 防止云端模型更新覆盖自定义配置
- 支持多个 DeepV Code 实例并发运行

#### 🚀 方式一：使用配置向导（推荐）

在 CLI 中输入：

```
/add-model
```

按照向导提示填写：
1. **选择提供商类型**：OpenAI Compatible / Anthropic Claude
2. **输入显示名称**：如 `GPT-4 Turbo`
3. **输入 API 基础 URL**：如 `https://api.openai.com/v1`
4. **输入 API 密钥**：推荐使用环境变量格式 `${OPENAI_API_KEY}`
5. **输入模型 ID**：如 `gpt-4-turbo`
6. **最大 Token 数**（可选）：如 `128000`
7. **确认配置**：输入 `y` 保存

#### ⚙️ 方式二：手动编辑配置文件

编辑 `~/.deepv/custom-models.json`：

```json
{
  "models": [
    {
      "displayName": "GPT-4 Turbo",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "${OPENAI_API_KEY}",
      "modelId": "gpt-4-turbo",
      "maxTokens": 128000,
      "enabled": true
    },
    {
      "displayName": "Claude Sonnet",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "modelId": "claude-sonnet-4-5",
      "maxTokens": 200000,
      "enabled": true
    },
    {
      "displayName": "Local Llama",
      "provider": "openai",
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "not-needed",
      "modelId": "llama-3-70b",
      "maxTokens": 8192,
      "enabled": true
    }
  ]
}
```

#### 📋 配置字段说明

**必需字段：**
- `displayName` - 显示名称（也作为唯一标识符）
- `provider` - 提供商类型：`openai` 或 `anthropic`
- `baseUrl` - API 基础 URL（不要以 `/` 结尾）
- `apiKey` - API 密钥（支持环境变量：`${VAR_NAME}`）
- `modelId` - 实际的模型名称（传递给 API）

**可选字段：**
- `maxTokens` - 最大上下文窗口大小（数字）
- `enabled` - 是否启用（`true`/`false`，默认 `true`）
- `headers` - 额外的 HTTP 请求头（键值对对象）
- `timeout` - 请求超时时间（毫秒）
- `enableThinking` - 启用 Anthropic 扩展思考（仅 `anthropic` 提供商）

#### 🔌 支持的提供商类型

**OpenAI Compatible (`openai`)：**
- OpenAI 官方 API
- Azure OpenAI
- 本地模型（LM Studio, Ollama, text-generation-webui）
- 第三方兼容服务（Groq, Together AI, DeepInfra 等）

**Anthropic Claude (`anthropic`)：**
- Claude API 官方端点
- 支持 Anthropic 扩展思考功能（`enableThinking: true`）

#### 💡 常见配置示例

**OpenAI 官方 API：**
```json
{
  "displayName": "GPT-4 Turbo",
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "${OPENAI_API_KEY}",
  "modelId": "gpt-4-turbo"
}
```

**Azure OpenAI：**
```json
{
  "displayName": "Azure GPT-4",
  "provider": "openai",
  "baseUrl": "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
  "apiKey": "${AZURE_OPENAI_KEY}",
  "modelId": "gpt-4",
  "headers": {
    "api-version": "2024-02-01"
  }
}
```

**Groq：**
```json
{
  "displayName": "Groq Llama 3",
  "provider": "openai",
  "baseUrl": "https://api.groq.com/openai/v1",
  "apiKey": "${GROQ_API_KEY}",
  "modelId": "llama-3-70b-8192"
}
```

**本地 LM Studio：**
```json
{
  "displayName": "Local Llama",
  "provider": "openai",
  "baseUrl": "http://localhost:1234/v1",
  "apiKey": "not-needed",
  "modelId": "local-model"
}
```

**Claude API（带扩展思考）：**
```json
{
  "displayName": "Claude Sonnet (Thinking)",
  "provider": "anthropic",
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "modelId": "claude-sonnet-4-5",
  "enableThinking": true
}
```

#### 🎯 使用自定义模型

**通过模型选择对话框：**
```
/model
```
自定义模型会显示 `[Custom]` 标签和青色，使用方向键选择。

**直接切换：**
```
/model custom:openai:gpt-4-turbo@abc123
```

#### 🔧 环境变量设置

**Linux/macOS：**
```bash
export OPENAI_API_KEY="sk-your-key-here"
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

**Windows PowerShell：**
```powershell
$env:OPENAI_API_KEY="sk-your-key-here"
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

**Windows CMD：**
```cmd
set OPENAI_API_KEY=sk-your-key-here
set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

#### ⚠️ 注意事项

- **安全性**：推荐使用环境变量存储 API 密钥，避免明文写入配置文件
- **Base URL 格式**：必须以 `http://` 或 `https://` 开头，不要以 `/` 结尾
- **重启生效**：修改配置后需要重启 DeepV Code
- **Token 计费**：自定义模型不消耗 DeepV 积分，直接向提供商付费
- **功能限制**：某些高级功能可能因提供商 API 限制而不可用

#### 🐛 故障排除

| 问题 | 解决方案 |
|-----|---------|
| 模型不显示 | 检查 `enabled` 是否为 `true`，重启 CLI |
| API 调用失败 | 验证 API Key、Base URL、Model ID 是否正确 |
| 环境变量未生效 | 确保使用 `${VAR_NAME}` 格式（带花括号） |
| 网络错误 | 检查网络连接，确认 URL 可访问 |

#### 📚 更多文档

- [自定义模型快速入门](../../docs/custom-models-quickstart.md)
- [自定义模型完整指南](../../docs/custom-models-guide.md)
- [自定义模型架构说明](../../docs/custom-models-architecture.md)

---

## 📖 斜杠命令完整列表 (Slash Commands `/`)
1. 输入斜杠则可以看到所有支持的斜杠命令

---


### `/clear` - 清空屏幕
清空终端显示，包括可见的会话历史和滚动缓冲区。

**用法：** `/clear`

**快捷键：** `Ctrl+L`

**注意：** 上下文数据会保留，仅清除视觉显示。

---

### `/compress` - 压缩上下文
用摘要替换整个聊天上下文，节省 token 用量。
当上下文不足 20% 时，CLI也会自动执行压缩。

**用法：** `/compress`

**作用：**
- 保留高层次摘要
- 大幅减少 token 消耗
- 适用于长时间会话

**注意：** 会丢失详细的历史记录，不可逆操作。

---

### `/copy` - 复制最后输出
将 AI 的最后一条输出复制到剪贴板。

**用法：** `/copy`

**使用场景：**
- 快速复制生成的代码
- 分享 AI 的回答
- 保存重要输出

---

### `/editor` - 选择编辑器
打开编辑器选择对话框，用于查看 diff。

**用法：** `/editor`

**支持的编辑器：**
- VSCode
- Sublime Text
- Vim
- 其他...

**配置：** 在 `settings.json` 中设置 `preferredEditor`

---

### `/help` 或 `/?` - 显示帮助
显示传统的命令列表帮助对话框。

**用法：** `/help` 或 `/?`

---

### `/help-ask` - AI 智能帮助助手
**（你现在正在使用的功能！）**

启动 AI 智能帮助系统，可以询问任何关于 CLI 功能的问题。

**用法：** `/help-ask`

**特点：**
- 基于完整的 CLI 知识库回答问题
- 使用 Auto 模型（会消耗 token）
- 支持中英文问答
- 按 Esc 键退出帮助模式

**退出帮助：** 按 `Esc` 键

**注意：** 此功能会消耗 API token，如果只想查看命令列表，请使用 `/help`

---

### `/init` - 初始化项目上下文
自动分析项目并生成 `DEEPV.md` 文件，提供项目上下文。

**用法：** `/init`

**功能：**
1. 分析项目结构
2. 识别项目类型（代码项目 vs 非代码项目）
3. 生成包含以下内容的 `DEEPV.md`：
   - 项目概述
   - 主要技术栈
   - 构建/运行命令
   - 开发规范
   - 特殊配置

**注意：** 如果 `DEEPV.md` 已存在，此命令则无法执行。

**相关：** `/memory refresh`

---

### `/mcp` - MCP 服务器管理
列出配置的 Model Context Protocol (MCP) 服务器及其工具。

**用法：** `/mcp [子命令]`

**子命令：**
- `desc` / `descriptions`：显示详细的工具描述
- `nodesc` / `nodescriptions`：隐藏工具描述，仅显示名称
- `schema`：显示工具参数的完整 JSON schema

**快捷键：** `Ctrl+T` - 切换工具描述显示

**配置：** 参见 Q5 或 `docs/cli/configuration.md`

---

### `/memory` - 记忆管理
管理 AI 的指令上下文（从 `DEEPV.md` 文件加载）。

**子命令：**
- `add <text>` - 添加文本到 AI 记忆
- `show` - 显示当前加载的完整分层记忆
- `refresh` - 重新加载所有  `DEEPV.md` 文件

**用法示例：**
```
/memory add 使用 TypeScript strict 模式
/memory show
/memory refresh
```

**记忆文件层次（优先级递增）：**
1. 全局：`~/.deepv/DEEPV.md`
2. 项目根及父目录：`<项目路径>/DEEPV.md`
3. 子目录：项目内各子目录的 `DEEPV.md`



---

### `/model` - 切换模型
交互式选择 AI 模型。

**用法：** `/model [模型名]`

**交互式：**
1. 输入 `/model` 后按空格
2. 显示可用模型列表
3. 方向键选择
4. 回车确认

**直接指定：** `/model Claude-Sonnet-4.5`

**查看统计：** `/stats model`

---

### `/quit` 或 `/exit` - 退出 CLI
退出 DeepV Code CLI。

**用法：** `/quit` 或 `/exit`

**注意：** 未保存的会话状态将丢失

---

### `/restore` - 恢复检查点
将项目文件恢复到某个工具执行前的状态。

**用法：** `/restore [checkpoint_id]`

**无参数：** 列出所有可用的检查点

**指定 ID：** 恢复到指定检查点


**用途：**
- 撤销文件编辑
- 回滚代码变更
- 恢复删除的文件

**相关文档：** `docs/checkpointing.md`

---

### `/stats` - 统计信息
显示当前会话的详细统计信息。

**用法：** `/stats [子命令]`

**子命令：**
- 无参数：显示总体统计（token 用量、缓存节省、会话时长）
- `model [模型名]`：显示模型统计（支持 Tab 补全）
- `tools`：显示工具使用统计

**示例：**
```
/stats
/stats model gemini-2.0-flash-exp
/stats tools
```

**注意：** 缓存 token 信息仅在使用 API key 认证时显示。

---

### `/theme` - 切换主题
打开主题选择对话框。

**用法：** `/theme`

**配置：**
```json
{
  "theme": "GitHub"
}
```

**自定义主题：**
```json
{
  "customThemes": {
    "MyTheme": {
      "primary": "#00FF00",
      "background": "#000000"
    }
  }
}
```

**相关文档：** `docs/cli/themes.md`

---

### `/auth` - 认证设置
打开认证对话框，用于重新登录认证。

**用法：** `/auth`

**支持的认证方式：**
- 根据您所在的组织会有不同的认证支持，具体看界面引导即可。

---

### `/config` - 统一配置菜单
打开交互式设置面板，让您可以直观地配置 DeepV Code 的各种设置。常用的设置如主题、模型、Agent 风格等都在这里了。

**用法：** `/config [子命令]`

**功能：**
- **交互式面板：** 直接输入 `/config` 回车，打开可视化菜单。
- **常用设置：** 面板集成了主题、编辑器、模型切换、Vim 模式、Agent 风格、YOLO 模式、健康使用提醒及语言偏好。
- **快捷操作：** 支持键盘上下移动、回车进入子菜单、`Esc` 返回或关闭。

**子命令：**
- `/config theme` - 打开主题选择
- `/config model` - 打开模型选择
- `/config agent-style` - 切换 Agent 风格
- `/config yolo [on|off]` - 切换 YOLO 自动批准模式
- `/config language [name]` - 设置回复语言偏好

**示例：**
```
/config
/config model claude
/config yolo on
```

---

### `/tools` - 工具列表
显示当前可用的所有工具（内置 + MCP）。

**用法：** `/tools [子命令]`

**子命令：**
- 默认：显示工具名称和描述
- `nodesc` / `nodescriptions`：仅显示工具名称
- `desc` / `descriptions`：显示详细描述（旧版，现为默认）

**示例：**
```
/tools
/tools nodesc
```

**相关：** `/mcp`、`/mcp schema`

---

### `/extensions` - 扩展管理
管理 DeepV Code 的扩展。

**用法：** `/extensions [子命令]`

**子命令：**
- `list` - 列出所有可用的扩展
- `info` - 查看扩展的安装和卸载相关知识

**示例：**
```
/extensions list
/extensions info
```

**功能说明：**
- `/extensions list`：显示当前可用的所有扩展列表
- `/extensions info`：获取关于如何安装、配置和卸载扩展的详细信息

---

### `/ext:` - 使用已安装的扩展命令
调用已安装的 context 类型扩展提供的斜杠命令。

**用法：** `/ext:<扩展名> [参数]`

**说明：**
- 当安装了扩展后，扩展可能提供自定义的斜杠命令
- 使用 `/ext:` 前缀可以调用这些已安装的 context 类型扩展
- 扩展命令会在已安装扩展列表中显示

**示例：**
```
/ext:myExtension
/ext:customCommand --option value
```

---

### `/vim` - Vim 模式
切换 vim 模式。

**用法：** `/vim`

**功能：**
- **NORMAL 模式：** `h`、`j`、`k`、`l` 导航；`w`、`b`、`e` 跳词；`0`、`^` 行首尾；`G`、`gg` 跳行
- **INSERT 模式：** 标准输入，`Esc` 返回 NORMAL
- **编辑：** `x`（删除）、`d`（删除）、`c`（修改）、`i`、`a`、`o`、`O`（插入）
- **复合：** `dd`、`cc`、`dw`、`cw`
- **计数：** `3h`、`5w`、`10G`
- **重复：** `.` 重复上次编辑

**状态指示：** 页脚显示 `[NORMAL]` 或 `[INSERT]`

**持久化：** 偏好保存到 `~/.deepv/settings.json`

**配置：**
```json
{
  "vimMode": true
}
```

---

### `/agent-style` - AI 风格切换
切换 AI 工作风格：包括默认风格、Codex 极速风格，以及受 Cursor、Augment 等工具启发的一系列专业风格。

**用法：** `/agent-style [子命令]`

**子命令：**
- 无参数或 `status` - 显示当前风格及使用说明
- `default` - 切换到默认风格（🧠 强调计划、解释）
- `codex` - 切换到 Codex 风格（⚡ 快速确认后静默执行）
- `cursor` - 切换到 Cursor 风格（🎯 语义搜索优先，高并发调用）
- `augment` - 切换到 Augment 风格（🚀 任务列表驱动，严格验证）
- `claude-code` - 切换到 Claude Code 风格（⌨️ 极致极简，极高响应效率）
- `antigravity` - 切换到 Antigravity 风格（💎 知识库优先，高端协作流程）
- `windsurf` - 切换到 Windsurf 风格（🌊 基于 AI Flow 范式的独立与协作平衡）

**工作模式对比：**

| 风格 | 特点 | 适合场景 |
|-----|------|---------|
| **Default** 🧠 | 详细计划、充分解释、步骤确认 | 学习、复杂任务、需要理解过程 |
| **Codex** ⚡ | 快速执行、最少输出、静默完成 | 熟练场景、重复任务、追求效率 |
| **Cursor** 🎯 | 语义搜索增强、详细代码风格规范 | 大规模代码库探索、对代码质量有极高要求 |
| **Augment** 🚀 | 任务列表驱动、严格的版本控制和验证 | 复杂多步骤重构、需要严格执行流程的场景 |
| **Claude Code** ⌨️ | 极简响应、直接行动、杜绝废话 | 高频 CLI 交互、追求极致开发心流 |
| **Antigravity** 💎 | 知识发现优先、高端协作美学 | 深度研究、追求极致协同体验 |
| **Windsurf** 🌊 | AI Flow 范式、独立与协作平衡 | 现代 AI 驱动的全流程开发 |

**示例：**
```
/agent-style          # 查看当前状态
/agent-style cursor   # 切换到 Cursor 风格
/agent-style status   # 查看当前状态
```

**注意：**
- Codex 模式自动启用 YOLO（跳过工具确认）
- 切换后配置会持久化，重启后保持
- 立即生效于当前会话

---

### `/plan` - 计划模式（只读分析）
启用计划模式，让 AI 只能读取和分析代码，不能执行修改操作。

**用法：** `/plan [子命令]`

**子命令：**
- `/plan` 或 `/plan on` - 启用计划模式
- `/plan off` - 退出计划模式
- `/plan status` - 查看当前状态

**适用场景：**
- 项目初期的需求讨论和架构规划
- 纯代码审查和分析
- 担心 AI 误修改代码时使用
- 想让 AI "先动脑不动手"的场景

**计划模式特性：**
- ✅ **允许使用读取类工具：** `read_file`、`read_many_files`、`list_directory`、`glob`、`search_file_content`、`task` 等
- 🚫 **禁用修改类工具：** `write_file`、`replace`、`run_shell_command`、`lint_fix`、`delete_file` 等
- 💡 **专注于：** 需求理解、方案讨论、架构设计、代码分析
- 🎨 **界面提示：** 显示绿色边框指示器 "📋 plan mode - read only"
- 📝 **输入提示：** "计划模式：可读取代码分析，禁止修改 (/plan off 退出)"

**典型使用流程：**
```
你: /plan on
系统: 📋 已进入计划模式（只读分析）

你: 帮我分析这个项目的认证模块设计
AI: [使用 read_file、search_file_content 等工具分析代码]
AI: [给出架构分析和改进建议]

你: /plan off
系统: [向 AI 发送退出通知]

你: 按照刚才的建议帮我重构认证模块
AI: [使用 write_file、replace 等工具执行修改]
```

**注意事项：**
- 启用计划模式后，AI 会在每条消息前收到模式提示
- 退出计划模式时，系统会自动通知 AI 恢复正常权限
- 计划模式不影响对话历史记录

**配置：**
计划模式状态会自动保存到配置中，重启 CLI 后会保持。

**一句话总结：** 让 AI 先动脑不动手，确认方案后再让它干活！

---

### Q9: 自定义命令
用户可创建自定义斜杠命令。

---

**位置：**
- 全局：`~/.deepv/commands/`
- 项目：`<项目根>/.deepvcode/commands/`

#### 文件格式：TOML（`.toml` 扩展名）

#### 命名：文件路径决定命令名
- `~/.deepv/commands/test.toml` → `/test`
- `<项目>/.deepv/commands/git/commit.toml` → `/git:commit`

#### 必需字段：
- `prompt`（字符串）：发送给模型的 prompt

#### 可选字段：
- `description`（字符串）：命令描述（显示在帮助中）

#### 参数处理：
1. **简写注入 `{{args}}`**
   ```toml
   prompt = "分析代码并修复：{{args}}"
   ```
   调用：`/fix TypeError in line 42`

2. **默认追加**（无 `{{args}}`）
   - 有参数：追加到 prompt 末尾（两个换行分隔）
   - 无参数：原样发送 prompt

**示例：**
```toml
# ~/.deepv/commands/changelog.toml
description = "添加新条目到 CHANGELOG.md"
prompt = """
请将用户提供的变更添加到 CHANGELOG.md。
格式：/changelog <version> <type> <message>
type 可以是：added、changed、fixed、removed
"""
```

**相关文档：** `docs/cli/commands.md` 的 "Custom Commands" 章节

---

## 📄 At 命令 (File Inclusion `@`)

### `@<路径>` - 包含文件内容
将文件或目录内容注入到 prompt 中。支持多种文件格式，包括代码文件、文档文件等。

**支持的文件格式：**
- **代码文件：** `.ts`, `.js`, `.py`, `.java`, `.cpp` 等所有文本文件
- **文档文件：** `.pdf`, `.docx` (Word), `.xlsx` / `.xls` (Excel)
- **图片文件：** `.png`, `.jpg`, `.gif`, `.webp`, `.svg`, `.bmp`
- **Markdown：** `.md`

**用法：**
- `@path/to/file.txt` - 单个文件
- `@src/components/` - 整个目录
- `@README.md 解释这个文件` - 结合问题
- `@report.pdf` - PDF 文档
- `@data.xlsx` - Excel 表格
- `@document.docx` - Word 文档

**示例：**
```
@src/utils/helper.ts 重构这个文件
@docs/ 总结这个目录的文档
解释这段代码 @main.py
@项目报告.pdf 总结这份报告的关键内容
@数据统计.xlsx 分析这个表格中的数据趋势
@需求文档.docx 提取功能需求列表
```

**智能文件识别：**
- AI 会根据文件扩展名自动识别文件类型
- 无需特殊语法，像读取代码文件一样使用 `@` 命令即可
- AI 也可以在认为有必要时主动读取这些文档文件

### `@` - 粘贴剪贴板中的截图
使用 `@` 符号可以将剪贴板中的截图或图片内容粘贴到对话中。

**用法：**
1. 输入 `@` 符号
2. 系统会弹出选项菜单
3. 选择 `clipboardPaste clipboard content` 选项
4. 剪贴板中的截图会被插入到对话中

**快捷键（直接粘贴，无需菜单）：**
- **macOS/Linux：** `Ctrl+V` - 直接粘贴剪贴板中的截图
- **Windows：** `Ctrl+G` - 直接粘贴剪贴板中的截图

**示例：**
```
# 方法一：使用快捷键（推荐）
截取屏幕截图后：
Ctrl+V     # macOS/Linux 下直接粘贴
Ctrl+G     # Windows 下直接粘贴

# 方法二：使用 @ 符号
@          # 输入 @ 符号
           # 在弹出的菜单中选择 "clipboardPaste clipboard content"

# 截图插入后，继续输入问题
分析这个截图中的错误信息
```

**注意：**
- 快捷键可以直接粘贴，无需选择菜单
- 如果快捷键不起作用，使用 `@` 符号通过菜单选择是可靠的备用方案
- 支持的图片格式取决于你的操作系统剪贴板

**特性：**
- **Git 感知：** 默认排除 `.gitignore` 文件（如 `node_modules/`、`dist/`、`.env`）
- **路径空格：** 使用反斜杠转义：`@My\ Documents/file.txt`
- **工具调用：** 内部使用 `read_many_files` 工具

**配置：**
```json
{
  "fileFiltering": {
    "respectGitIgnore": true,
    "enableRecursiveFileSearch": true
  }
}
```

**错误处理：**
- 路径不存在：显示错误，不发送 query
- 权限问题：报告错误

### `@` - 纯 @ 符号
单独的 `@` 会原样传递给模型（不作为命令处理）。

---

## 🖥️ Shell 模式 (Shell Commands `!`)

### `!<命令>` - 执行 Shell 命令
在 CLI 内直接执行 shell 命令。

**用法：** `!<shell_command>`

**示例：**
```
!ls -la
!git status
!npm install
!python script.py
```

**平台：**
- Linux/macOS：使用 `bash`
- Windows：使用 `cmd.exe`

**环境变量：** 执行时自动设置 `GEMINI_CLI=1`

**注意：** 命令具有与终端相同的权限和影响。

### `!` - 切换 Shell 模式
单独的 `!` 切换 shell 模式。

**用法：** `!`

**Shell 模式特性：**
- 不同的颜色提示
- Shell 模式指示器
- 输入直接作为 shell 命令执行
- 再次输入 `!` 退出 shell 模式

**使用场景：**
- 需要执行多个连续 shell 命令
- 临时进入 shell 环境

---

## ⚙️ 配置系统

### 配置层次（优先级递增）
1. **默认值**：硬编码默认值
2. **用户设置**：`~/.deepv/settings.json`（全局）
3. **项目设置**：`<项目根>/.deepv/settings.json`（项目专用）


### 环境变量

#### 从 `.env` 文件加载
CLI 自动加载 `.env` 文件，搜索顺序：
1. 当前工作目录
2. 父目录（直到项目根或用户主目录）
3. 用户主目录 `~/.env`

#### 变量引用
在 `settings.json` 中可引用环境变量：
```json
{
  "apiKey": "$MY_API_TOKEN"
}
```

或：
```json
{
  "apiKey": "${MY_API_TOKEN}"
}
```



### 命令行参数

- `--model <name>` / `-m <name>`：指定模型
- `--prompt <text>` / `-p <text>`：非交互模式 prompt
- `--output-format <format>`：非交互模式的输出格式
  - `stream-json`：以 JSONL 格式（一行一个 JSON 对象）输出结果，适合自动化和第三方工具集成
  - 示例：`dvcode --output-format stream-json --yolo "你的prompt内容"`
- `--yolo`：自动批准所有工具调用
- `--cloud-mode`：云模式，以便从Web上远程控制本机CLI工作

**非交互式模式适用场景：**
- **CI/CD 集成**：在自动化工作流中无需人工确认
- **第三方工具集成**：通过 JSONL 格式与其他程序交互
- **批量处理**：在脚本中自动处理大量代码文件
- **监控和告警**：自动分析日志和代码并触发告警
- **自动化代码审查**：在代码提交时自动审查代码质量

**非交互式模式示例：**
```bash
# 标准输出
dvcode --prompt "解释 main.py" -a

# JSONL 格式（一行一个 JSON 对象）
dvcode --output-format stream-json --yolo "分析代码并生成改进建议" @src/

# 与其他工具组合
dvcode --output-format stream-json --yolo "生成代码" @schema.json | jq '.content'
```

**其他参数示例：**
```bash
dvcode --model gemini-2.0-flash-exp --debug
dvcode --checkpointing --sandbox
dvcode -e my-extension -e another
```

---

## 🗂️ 上下文文件（分层记忆）

### 文件名
默认：`GEMINI.md`

可通过 `contextFileName` 设置自定义：
```json
{
  "contextFileName": "DEEPV.md"
}
```

### 作用
向 AI 提供项目特定的指令、编码规范、背景信息。

### 层次结构（优先级递增）
1. **全局：** `~/.deepv/GEMINI.md`（所有项目）
2. **项目根及父目录：** 从当前目录向上搜索（直到项目根或主目录）
3. **子目录：** 项目内的子目录（限制 200 个目录，可通过 `memoryDiscoveryMaxDirs` 配置）

### 内容示例
```markdown
# 项目：My TypeScript Library

## 通用指令
- 遵循现有代码风格
- 函数和类需要 JSDoc 注释
- 优先使用函数式编程
- 兼容 TypeScript 5.0 和 Node.js 20+

## 编码规范
- 2 空格缩进
- 接口名前缀 `I`（如 `IUserService`）
- 私有成员前缀 `_`
- 使用严格相等 `===` 和 `!==`

## 特定组件：src/api/client.ts
- 处理所有出站 API 请求
- 新增 API 函数需包含错误处理和日志
- GET 请求使用 `fetchWithRetry` 工具

## 依赖
- 避免引入新依赖（除非必要）
- 如需新依赖，请说明原因
```

### 管理命令
- `/memory show`：查看当前加载的完整记忆
- `/memory refresh`：重新加载所有上下文文件
- `/memory add <text>`：添加临时记忆

### UI 指示
页脚显示已加载的上下文文件数量。

---

## 🔒 沙箱模式

### 启用方式
- 命令行：`dvcode --sandbox` 或 `dvcode -s`
- 环境变量：`GEMINI_SANDBOX=true`
- 配置：`{"sandbox": true}` 或 `{"sandbox": "docker"}`
- YOLO 模式：默认启用沙箱

### 默认行为
使用预构建的 `gemini-cli-sandbox` Docker 镜像。

### 自定义沙箱
在项目根创建 `.deepv/sandbox.Dockerfile`：
```dockerfile
FROM gemini-cli-sandbox

RUN apt-get update && apt-get install -y some-package
COPY ./my-config /app/my-config
```

构建并使用：
```bash
BUILD_SANDBOX=1 dvcode -s
```

### macOS Seatbelt
使用 `SEATBELT_PROFILE` 环境变量：
- `permissive-open`（默认）：限制写入项目文件夹
- `strict`：严格模式
- `<profile_name>`：自定义 profile（`.deepv/sandbox-macos-<profile_name>.sb`）

---

## 📊 使用统计

### 收集内容
- **工具调用：** 名称、成功/失败、耗时（不含参数和返回值）
- **API 请求：** 模型、时长、成功状态（不含 prompt/response）
- **会话信息：** 配置、启用工具、审批模式

### 不收集内容
- 个人身份信息 (PII)
- Prompt 和 Response 内容
- 文件内容

### 关闭统计
```json
{
  "usageStatisticsEnabled": false
}
```

---

## 🎓 常见使用场景

### 场景 1：开始新项目
```bash
cd my-new-project
dvcode --init  # 生成 DEEPV.md
dvcode         # 启动 CLI
```

CLI 内：
```
/memory show   # 查看加载的上下文
@src/ 分析这个项目的架构
```

### 场景 2：调试代码
```
@src/buggy-file.ts 这里有个 TypeError，帮我找出原因

# AI 分析后给出修复建议

/chat save debug-session  # 保存会话以便后续继续
```

### 场景 3：切换任务
```
/chat save feature-login  # 保存当前任务
/chat list                # 查看所有保存的会话
/chat resume feature-payment  # 切换到支付功能任务
```

### 场景 4：配置 MCP 服务器
编辑 `.deepv/settings.json`：
```json
{
  "mcpServers": {
    "database": {
      "command": "python",
      "args": ["db_mcp_server.py"],
      "env": {
        "DB_URL": "$DATABASE_URL"
      }
    }
  }
}
```

重启 CLI，然后：
```
/mcp           # 查看服务器状态
/tools         # 查看新增的数据库工具
```

### 场景 5：创建自定义命令
创建 `~/.deepv/commands/docs/generate.toml`：
```toml
description = "生成 API 文档"
prompt = """
请为以下代码生成详细的 API 文档：{{args}}

文档格式：
- 函数签名
- 参数说明
- 返回值说明
- 使用示例
- 注意事项
"""
```

使用：
```
/docs:generate @src/api/users.ts
```

---

## 🚨 故障排查

### 问题：模型返回错误或无法连接
**检查：**
1. 是否有足够的额度
2. 网络连接是否正常
3. 是否登录已过期，可以尝试 `/auth` 重新登录
4. 尝试切换模型：`/model`


### 问题：MCP 服务器无法连接
**检查：**
1. 服务器命令路径是否正确
2. 环境变量是否设置
3. 服务器日志（启用调试模式）
4. 使用 `/mcp` 查看连接状态


### 问题：自定义命令不显示
**检查：**
1. 文件位置：`~/.deepv/commands/` 或 `<项目>/.deepv/commands/`
2. 文件扩展名：必须是 `.toml`
3. 文件格式：必须包含 `prompt` 字段
4. 重启 CLI

### 问题：记忆文件未加载
**检查：**
1. 文件名是否正确（默认 `DEEPV.md`）
2. 使用 `/memory show` 查看加载状态
3. 使用 `/memory refresh` 重新加载
4. 检查格式是否为合法的 markdown

---

## 🔚 结语

这份知识库涵盖了 DeepV Code CLI 的所有核心功能。如果你有任何问题，请随时询问！

---

### Q10: 如何快速切换 AI 模型？
**A:** 按 **`Ctrl+L`** 快捷键即可快速打开模型选择菜单。

无需输入 `/model` 命令，直接按下 `Ctrl+L` 后，系统会立即弹出可用模型列表，你可以用方向键选择要切换的模型，然后按回车确认。这是切换模型最快的方式。

**快捷键优势：**
- ⚡ 比输入命令更快
- 🎯 随时随地快速切换模型
- 🖱️ 与 `/model` 命令功能完全相同

---

### Q11: 如何在输入时快速移动光标？
**A:** 使用 **`Alt+Left`** 和 **`Alt+Right`** 快捷键可以按单词快速前后移动光标。

- **`Alt+Left`**：光标向左移动一个单词
- **`Alt+Right`**：光标向右移动一个单词

这对于编辑长句子或复杂的代码非常有用，特别是当你需要快速定位到特定单词进行修改时。

**使用场景：**
- 编辑长提示词时快速定位
- 修改多行输入中的特定单词
- 快速跳过空格和符号，精准定位到单词位置

---

### Q12: 如何将 Shell 命令放到后台执行？
**A:** 在 Shell 命令执行过程中按 **`Ctrl+B`** 可以将当前命令转为后台执行。

**使用场景：**
- 执行耗时的 `npm install`、`pip install` 等安装命令
- 运行长时间的 `ping`、`curl` 测试
- 执行编译、构建等需要较长时间的任务
- 不想等待命令完成，想继续和 AI 对话

**操作步骤：**
1. AI 执行 Shell 命令时（如 `ping -n 100 127.0.0.1`）
2. 在命令执行过程中按下 `Ctrl+B`
3. 命令会转入后台继续执行，界面显示 `▸ Running in background...`
4. 你可以继续与 AI 对话，不受影响
5. 后台任务完成后，AI 会自动感知并汇报结果

**后台任务管理：**
- **`↓` 键**：当有后台任务运行时，按下向下箭头打开任务管理面板
- **任务管理面板操作：**
  - `↑`/`↓`：选择任务
  - `K`：终止（Kill）选中的任务
  - `Esc`：关闭面板

**界面提示：**
- 输入框下方会显示：`⎿ Running in background (↓ to manage)`
- 任务 ID 使用短哈希（如 `22e53c2`）便于识别

**AI 自动感知：**
- 后台任务完成、失败或被终止后，AI 会自动收到通知
- 如果当前处于空闲状态，AI 会主动汇报任务结果
- 任务输出（stdout/stderr）会完整保留并展示

**示例：**
```
你：帮我 ping 本地 100 次
AI：[开始执行 ping -n 100 127.0.0.1]
你：[按下 Ctrl+B]
系统：[命令转入后台，Task ID: 22e53c2]
你：继续帮我看看这个代码...
AI：[继续回答你的问题]
...
系统：[后台任务完成通知]
AI：Ping 任务已完成，100 包全部收到，0% 丢包。
```

---

### Q14: 如何在 CLI 中生成图片？
**A:** 使用 `/nanobanana` 命令可以直接在 CLI 中生成图片。

**语法：** `/nanobanana <宽高比> <提示词描述>`

**支持的宽高比：**
- `1:1` - 正方形
- `16:9` - 宽屏横向
- `9:16` - 竖屏纵向
- `4:3` - 传统横向
- `3:4` - 传统纵向

**使用示例：**
```
/nanobanana 16:9 一只可爱的柴犬在樱花树下奔跑
/nanobanana 1:1 赛博朋克风格的城市夜景，霓虹灯闪烁
/nanobanana 9:16 手机壁纸，星空下的雪山
```

**注意事项：**
- 生成后会显示可访问的 URL，如果系统支持也会自动打开浏览器
- 提示词越详细，生成的图片质量越高
- 此功能会消耗一定的积分

---

### Q15: 如何清理 Checkpoint 历史记录释放磁盘空间？
**A:** 使用 `dvcode checkpoint clean` 命令清理所有历史检查点。

**命令用法：**
```bash
# 清理所有 checkpoint 历史（会提示确认）
dvcode checkpoint clean

# 预览将要删除的内容（不实际删除）
dvcode checkpoint clean --dry-run

# 跳过确认直接删除
dvcode checkpoint clean --force
```

**别名：** 可以使用 `dvcode cp clean` 作为简写。

**输出示例：**
```
📊 Checkpoint History Summary:
   Projects: 73
   Total Size: 4.18 GB
   Location: C:\Users\username\.deepv\history

⚠️  This will permanently delete all checkpoint history.
Are you sure? (y/N):
```

**注意事项：**
- 此操作会永久删除所有项目的 checkpoint 历史记录
- 删除后无法恢复，建议先使用 `--dry-run` 预览
- 如果磁盘空间紧张，这是释放空间的有效方式

---

### Q16: 如何使用 `/skills` 命令管理 AI Skills？
**A:** `/skills` 是一套完整的技能管理系统，采用三层架构管理：**Marketplace → Plugin → Skill**。

**核心概念：**
- **Marketplace（市场）：** 技能仓库源，可从 Git 仓库或本地路径加载
- **Plugin（插件）：** 技能集合，一个 Plugin 可包含多个 Skill
- **Skill（技能）：** 最小单位，包含 SKILL.md、可执行脚本等

**快速开始：**
```
# 1. 添加官方 Marketplace
/skill marketplace add anthropics/claude-code

# 成功后会看到类似这样的显示：
# ℹ️✅ Successfully added: claude-code-plugins
#       ID: claude-code
#       Plugins: 13

# 2. 安装具体的 Skill（比如 feature-dev）
/skill plugin install claude-code:feature-dev

# 过程中斜杠命令会自动补全

# 3. 安装后，重启 CLI

# 4. 查看所有已安装的 Skills
/skill list

# 4. 查看单个 Skill 详情
/skill info <skill-id>

# 5. 卸载 Skill
/skill plugin uninstall <marketplace-name> <plugin-name>

**配置和存储：**

Skills 系统数据存储在：
- **目录：** `~/.deepv/skills/` 和 `~/.deepv/marketplace/`
- **配置：** `~/.deepv/skills/settings.json`
- **已安装记录：** `~/.deepv/skills/installed_plugins.json`
- **备份：** `~/.deepv/skills/backups/`

**AI 如何使用 Skills：**

启用的 Plugins 中的 Skills 会在启动时自动注入到 AI 上下文中。AI 可以：
1. 查看所有可用 Skills 的元数据和脚本列表
2. 通过 `/use_skill` 工具加载完整的 SKILL.md 文档
3. 执行 Skill 中的脚本（需要先加载文档）
4. 根据 Skills 提供的工具和指引协助用户

---

### Q17: 如何使用 Hooks 系统进行安全控制和行为自定义？

**A:** DeepV Code 提供了强大的 Hooks 系统，允许你用任何脚本语言（Python、Bash、PowerShell、Batch 等）在关键操作点插入自定义脚本来监控、控制和修改系统行为。

#### 什么是 Hooks？

Hooks 是在 11 个关键事件触发的自定义脚本：
- **工具：** `BeforeTool`（前）、`AfterTool`（后）
- **LLM：** `BeforeAgent`、`AfterAgent`、`BeforeModel`、`AfterModel`
- **工具选择：** `BeforeToolSelection`（限制可用工具）
- **会话：** `SessionStart`、`SessionEnd`
- **其他：** `PreCompress`、`Notification`

#### 快速开始（任选一种语言）

**第 1 步：创建 hooks 目录**
```bash
mkdir -p .deepvcode/hooks
```

**第 2 步：选择你的脚本语言编写 Hook**

**🐧 Linux/macOS（Bash）**
```bash
#!/bin/bash
read INPUT
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
if [[ "$TOOL" == "delete_file" ]]; then
  echo '{"decision":"deny","reason":"Forbidden"}'
else
  echo '{"decision":"allow"}'
fi
```
配置：`"command": "bash .deepvcode/hooks/security.sh"`

**🪟 Windows（Python - 推荐跨平台）**
```python
#!/usr/bin/env python3
import json
import sys

input_data = json.loads(sys.stdin.read())
tool_name = input_data.get('tool_name')

if tool_name == 'delete_file':
    output = {'decision': 'deny', 'reason': 'Forbidden'}
else:
    output = {'decision': 'allow'}

print(json.dumps(output))
sys.exit(0)
```
配置：`"command": "python .deepvcode/hooks/security.py"`

**🪟 Windows（PowerShell）**
```powershell
$input_text = [Console]::In.ReadToEnd()
$input_data = $input_text | ConvertFrom-Json

if ($input_data.tool_name -eq 'delete_file') {
    $output = @{'decision' = 'deny'; 'reason' = 'Forbidden'}
} else {
    $output = @{'decision' = 'allow'}
}

$output | ConvertTo-Json | Write-Output
```
配置：`"command": "powershell -ExecutionPolicy Bypass .deepvcode/hooks/security.ps1"`

**第 3 步：配置到 `.deepvcode/settings.json`**
```json
{
  "hooks": {
    "BeforeTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python .deepvcode/hooks/security.py",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

**第 4 步：测试**
```bash
echo '{"tool_name":"delete_file"}' | python .deepvcode/hooks/security.py
# 输出：{"decision":"deny","reason":"Forbidden"}
```

#### 常见实用场景

**场景 1：权限控制（基于角色）**

Python 版本：
```python
import json, sys, os
input_data = json.loads(sys.stdin.read())
user_role = os.environ.get('USER_ROLE', 'viewer')

if user_role == 'admin':
    print(json.dumps({'decision': 'allow'}))
else:
    # 限制工具
    print(json.dumps({
        'hookSpecificOutput': {
            'toolConfig': {
                'allowedFunctionNames': ['read_file', 'list_directory']
            }
        }
    }))
```
使用：`USER_ROLE=viewer deepv-cli`

**场景 2：审计日志（记录所有操作）**

Python 版本：
```python
import json, sys
from datetime import datetime

input_data = json.loads(sys.stdin.read())
tool = input_data.get('tool_name')
timestamp = input_data.get('timestamp')

# 记录日志
with open('logs/audit.log', 'a') as f:
    f.write(f"[{timestamp}] Tool: {tool}\n")

print(json.dumps({'decision': 'allow'}))
```

**场景 3：提示安全加固**

Python 版本：
```python
import json, sys

input_data = json.loads(sys.stdin.read())
safety_instruction = """[SECURITY]
- Verify before destructive operations
- Never modify system-critical files
[/SECURITY]"""

print(json.dumps({
    'decision': 'allow',
    'hookSpecificOutput': {
        'additionalContext': safety_instruction
    }
}))
```

**场景 4：LLM 参数优化**

Python 版本：
```python
import json, sys

input_data = json.loads(sys.stdin.read())
prompt = input_data.get('llm_request', {}).get('messages', [{}])[0].get('content', '')

# 根据长度调整参数
temperature = 0.8 if len(prompt) > 2000 else 0.3
max_tokens = 4096 if 'code' in prompt.lower() else 2048

print(json.dumps({
    'hookSpecificOutput': {
        'llm_request': {
            'config': {
                'temperature': temperature,
                'maxOutputTokens': max_tokens
            }
        }
    }
}))
```

#### Hook 数据格式

**输入格式（via stdin）**
```json
{
  "session_id": "abc123",
  "cwd": "/current/dir",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-01-15T10:00:00Z",
  "tool_name": "write_file",
  "tool_input": {"path": "/tmp/file.txt"}
}
```

**输出格式（via stdout，必须是 JSON）**
```json
{
  "decision": "allow",
  "reason": "optional",
  "hookSpecificOutput": {}
}
```

**Exit codes：** `0` (成功) | `1` (警告) | `2` (阻止)

#### 配置参考

```json
{
  "hooks": {
    "BeforeTool": [{
      "matcher": "delete_file|remove_directory",  // 可选：工具名正则
      "sequential": false,                         // 可选：顺序/并行
      "hooks": [{
        "type": "command",
        "command": "python .deepvcode/hooks/hook.py",
        "timeout": 5000                            // 可选：超时毫秒数
      }]
    }]
  }
}
```

#### 最佳实践

1. ✅ 使用 Python 编写（跨平台最简单）
2. ✅ 验证 JSON 输入有效性
3. ✅ 输出必须是有效的 JSON
4. ✅ 设置合理的超时防止卡顿
5. ✅ Hook 失败不会阻止系统运行
6. ✅ 用版本控制管理 Hooks 脚本
7. ✅ 轻量级脚本，复杂逻辑调用外部 API

#### 支持的脚本语言

| 语言 | 平台 | 推荐度 | 示例命令 |
|-----|------|--------|--------|
| **Python** | Windows/Mac/Linux | ⭐⭐⭐ | `python ./hook.py` |
| **Bash** | Mac/Linux | ⭐⭐⭐ | `bash ./hook.sh` |
| **PowerShell** | Windows | ⭐⭐ | `powershell -ExecutionPolicy Bypass ./hook.ps1` |
| Batch | Windows | ⭐ | `cmd /c hook.bat` |
| Node.js | 全平台 | ⭐⭐ | `node ./hook.js` |

**提示：** Python 最推荐，因为一份代码在所有平台都能运行，且有内置的 JSON 模块。

#### 常见问题

**Q：Hook 脚本可以用其他语言吗？**
A：可以！任何能读 stdin、写 stdout 的脚本都支持。Python、Bash、PowerShell、Node.js、Ruby、Go 等都可以。

**Q：Windows 上不能用 Bash 吗？**
A：可以用。安装 WSL（Windows Subsystem for Linux）或 Git Bash 后支持。但推荐用 Python 更方便。

**Q：Hook 失败会导致系统停止吗？**
A：不会。Hook 失败只会记录警告，系统继续运行。除非你的 Hook 返回 exit code 2 并设置了 `decision: deny`。

**Q：多个 Hook 怎样按顺序执行？**
A：在配置中设置 `"sequential": true`，后一个 Hook 可以看到前一个的修改。

#### 更多帮助

- 完整文档：`docs/hooks-user-guide.md`
- 代码示例：`docs/hooks-examples.md`
- 架构说明：`HOOKS_ARCHITECTURE.md`
- **详细用法和配置：** 使用 `/hooks` 命令打开官方文档，或访问 https://dvcode.deepvlab.ai/hooks-help

---

## 🚀 LSP (语言服务协议) 支持

DeepV Code 现在集成了强大的 **LSP (Language Server Protocol)** 能力。这意味着 AI 不再仅仅是通过“搜索字符串”来猜你的代码，而是像真正的 IDE 一样，能够完全“读懂”代码的语义。

### 什么是 LSP？
**LSP** 是由微软、Google 和 RedHat 共同推出的行业标准。它将代码分析逻辑与编辑器分离。通过 LSP，DeepV Code 可以调用各语言官方最专业的分析引擎（如 `typescript-language-server`, `pyright`, `rust-analyzer` 等），为 AI 提供极致的代码感知力。

### 为什么 LSP 比传统搜索更强？
- **语义感知**：理解变量、函数、类和作用域，而不仅仅是匹配文本。
- **准确度高**：只返回真实的定义和类型，不会被同名注释或字符串干扰。
- **跨文件追踪**：准确追踪 `import` 和依赖链，支持跨文件跳转定义。
- **深度信息**：提供详细的类型推导和文档注释。

### 核心特性：小白式“零配置”体验
- **按需触发**：当你第一次询问某种语言的问题时，系统才会启动。
- **自动安装**：如果你的电脑没装对应的 LSP 服务端，DeepV Code 会**自动在后台下载并安装**到隔离目录。
- **无感运行**：用户无需配置环境变量，真正做到“开箱即用”。

### 已支持的语言矩阵
- **通用编程**：TypeScript, JavaScript, Python, Rust, Go
- **底层开发**：C, C++ (`clangd`)
- **Web 前端**：HTML, CSS
- **配置与数据**：JSON, YAML, SQL, Dockerfile

### 核心功能与工具集
DeepV Code 提供了一套完整的语义化工具，帮助 AI 实现“手术刀”级的代码操作：

1.  **`lsp_hover` (悬停详情)**：获取变量、函数或类的类型定义、文档注释和函数签名。
2.  **`lsp_goto_definition` (跳转定义)**：精准定位符号的声明位置，支持跨文件追踪。
3.  **`lsp_find_references` (查找引用)**：分析符号在整个项目中的所有使用位置，是代码重构的必备利器。
4.  **`lsp_document_symbols` (文件大纲)**：一键列出文件内的所有函数、类、变量及其层级结构，快速掌握大文件逻辑。
5.  **`lsp_workspace_symbols` (全局搜索)**：在整个项目中按名称搜索符号，无需打开文件即可精确定位。
6.  **`lsp_implementation` (查找实现)**：查找接口（Interface）或抽象方法的具体实现类。

### 极致的智能体验
- **1-based 坐标系**：所有工具使用的行号/列号与编辑器（如 VS Code）完全一致，AI 感知不再有偏差。
- **自动激活与索引**：当 AI 需要分析代码时，会自动探测项目语言并启动 LSP Server。
- **智能暖机与重试**：针对大型项目索引慢的问题，系统内置了“自动暖机”和“空结果自动重试”机制，确保在服务器扫描项目期间依然能获得稳健的响应。

### 如何测试与体验？
1.  **类型查询**：“`packages/core/src/lsp/index.ts` 中的 `syncDocument` 方法的返回值类型是什么？”
2.  **查找引用**：“项目中哪些地方调用了 `LSPManager` 类？”
3.  **结构分析**：“给我一份 `packages/core/src/config/config.ts` 的结构大纲。”
4.  **全局定位**：“在整个项目中搜索名为 `performAutoLintCheck` 的符号。”

---

**DeepV Code 出品方信息：**
- 官网：https://dvcode.deepvlab.ai/
- 出品公司：Deep X Corporation Limited

**退出智能帮助系统：** 按下ESC键
