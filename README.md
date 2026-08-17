<div align="center">

# 🚀 Easy Code

### **AI 驱动的智能编程助手**

*赋能开发者，加速创新*

> ℹ️ **品牌升级提示**：本项目原名 **Easy Code**，现已统一更名为 **Easy Code**。
> 包名、命令名、配置目录在过渡期内保留旧名（`easycode-ai` / `easycode` / `.easycode/` 等）以保证向后兼容；后续新文档与界面均使用新品牌名。

<br>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-43853D.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![npm](https://img.shields.io/badge/npm-easycode--code-CB3837.svg?logo=npm)](https://www.npmjs.com/package/easycode-ai)
[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC.svg?logo=visual-studio-code)](https://code.visualstudio.com/)

<br>

[English](./README_EN.md) | **简体中文**

<br>

<!-- 如果有演示 GIF，取消下面这行注释 -->
<!-- <img src="docs/assets/demo.gif" alt="Easy Code Demo" width="800"> -->

</div>

---

## 📖 目录

- [项目简介](#-项目简介)
- [为什么选择 Easy Code](#-为什么选择-easycode-ai)
- [核心特性](#-核心特性)
- [快速安装](#-快速安装)
- [快速开始](#-快速开始)
- [CLI 命令参考](#-cli-命令参考)
- [交互式斜杠命令](#-交互式斜杠命令)
- [项目架构](#️-项目架构)
- [VS Code 扩展](#-vs-code-扩展)
- [内置工具系统](#️-内置工具系统)
- [MCP 协议支持](#-mcp-协议支持)
- [Hooks 钩子机制](#-hooks-钩子机制)
- [配置文件](#️-配置文件)
- [开发指南](#-开发指南)
- [常见问题](#-常见问题)
- [贡献指南](#-贡献指南)
- [路线图](#️-路线图)
- [许可证](#-许可证)
- [相关链接](#-相关链接)

---

## ✨ 项目简介

**Easy Code** 是一款革命性的 AI 驱动智能编程助手，通过深度整合人工智能技术，全面提升软件开发的效率、质量和创新能力。

不同于传统的代码补全工具，Easy Code 是一个能够**理解整个项目上下文**、**自主编排工具完成复杂任务**的智能代理（Agent）。它将开发者从繁琐重复的工作中解放出来，让你专注于更高层次的创新和问题解决。

### 💡 Easy Code 能做什么？

```
👤 你：帮我分析这个项目的架构，找出性能瓶颈，并给出优化方案

🤖 Easy Code：
   ├── 📂 扫描项目结构，理解模块依赖
   ├── 🔍 分析代码热点和复杂度
   ├── 📊 识别潜在的性能问题
   ├── 💡 生成优化建议和重构方案
   └── ✏️ 自动应用修改（经你确认后）
```

---

## 🌟 为什么选择 Easy Code

<table>
<tr>
<td width="50%">

### 🎯 与传统 AI 编码助手的区别

| 特性 | 传统工具 | Easy Code |
|:---:|:---:|:---:|
| 上下文范围 | 单文件 | **整个项目** |
| 交互方式 | 被动补全 | **主动代理** |
| 任务复杂度 | 简单补全 | **复杂工作流** |
| 工具调用 | 无 | **Shell/文件/Web** |
| 会话管理 | 无 | **持久化会话** |
| 可扩展性 | 受限 | **MCP/Hooks/Skills** |

</td>
<td width="50%">

### 🚀 核心优势

- **🧠 深度理解** - 通过 MCP 协议构建完整项目认知
- **🛠️ 自主执行** - AI 可调用工具完成实际操作
- **🔄 持续对话** - 会话保存/恢复，上下文不丢失
- **🎨 多端支持** - CLI + VS Code 插件
- **🔌 高度可扩展** - Hooks、Skills、MCP 服务器
- **🔒 安全可控** - 敏感操作需用户确认

</td>
</tr>
</table>

---

## 🎯 核心特性

### 🧠 AI 驱动的代码生成与重构

- **智能代码生成** - 根据自然语言描述生成完整的函数、类、模块甚至整个应用
- **代码重构建议** - 识别代码异味，提供优化方案，自动统一代码风格
- **Bug 智能修复** - 分析错误堆栈，定位问题根源，生成修复代码
- **多语言支持** - TypeScript、JavaScript、Python、Go、Rust、Java 等主流语言

### 🔍 智能调试与问题解决

- **错误日志分析** - 深入解析错误信息，快速定位问题
- **堆栈追踪诊断** - 理解调用链路，找出异常根因
- **自动修复执行** - 生成修复方案，一键应用（需确认）
- **增强调试控制台** - `Ctrl+O` 三状态循环：全部日志 → 仅错误 → 关闭，智能过滤错误信息

### 📦 高级上下文管理 (MCP)

Model Context Protocol (MCP) 是 Easy Code 的核心创新：

- **全局项目视图** - 理解文件结构、模块依赖、代码语义
- **跨文件分析** - 追踪函数调用链、类型引用、导入导出
- **智能上下文选择** - 自动识别与任务相关的文件和代码段
- **第三方 MCP 服务器** - 接入外部数据源和工具

### 🛠️ 可扩展工具系统

AI 通过工具与外部环境交互，内置丰富工具集：

```
📁 文件操作    → read_file, write_file, replace, delete_file, glob
🔍 代码搜索    → grep (ripgrep), read_many_files
💻 命令执行    → shell (bash/powershell)
🌐 网络访问    → web_fetch, web_search (Google)
🧩 MCP 工具    → 调用任意 MCP 服务器提供的工具
📊 代码分析    → task (启动分析子 Agent)
📝 任务管理    → todo_write
💾 记忆系统    → memory (长期记忆)
```

### 🪝 Hooks 钩子机制

在关键工作流节点注入自定义逻辑：

- **PreToolExecution** - 工具执行前触发
- **PostToolExecution** - 工具执行后触发
- **OnSessionStart** - 会话开始时触发
- **OnSessionEnd** - 会话结束时触发

支持自动化代码检查、格式化、提交前验证等场景。

### 🔄 会话管理

- **会话持久化** - 自动保存对话历史和上下文
- **会话恢复** - 随时继续之前的工作
- **历史压缩** - 智能压缩对话历史，节省 Token
- **检查点恢复** - 文件修改可回滚到之前状态

---

## 📦 快速安装

### 系统要求

- **Node.js** 20.0.0 或更高版本
- **操作系统** Windows / macOS / Linux
- **终端** 支持 ANSI 颜色的终端模拟器

### 方式一：npm 全局安装（推荐）

```bash
# 使用 npm
npm install -g easycode-ai

# 使用 yarn
yarn global add easycode-ai

# 使用 pnpm
pnpm add -g easycode-ai
```

安装完成后，验证安装：

```bash
easycode --version
```

### 方式二：从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/OrionStarAI/EasyCodeCode.git
cd EasyCode

# 2. 安装依赖
npm install

# 3. 构建项目
npm run build

# 4. 本地开发运行
npm run dev

# 5. (可选) 生产环境打包
npm run pack:prod
```

---

## 🚀 快速开始

### 第一步：启动 Easy Code

在任意项目目录中运行：

```bash
easycode
```

首次启动会引导你完成身份认证。

### 第二步：开始对话

```
┌─────────────────────────────────────────────────────────────┐
│  🚀 Easy Code - AI 驱动的智能编程助手                    │
│─────────────────────────────────────────────────────────────│
│                                                             │
│  👋 你好！我是 Easy Code，你的 AI 编程助手。                  │
│                                                             │
│  💡 试试这些命令开始：                                        │
│     • "分析这个项目的架构"                                    │
│     • "帮我写一个用户登录的 API"                              │
│     • "这段代码有什么问题？"                                  │
│     • /help 查看帮助                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

> 你想做什么？
```

### 第三步：与 AI 协作

```bash
# 示例对话
> 帮我创建一个 Express REST API，包含用户的 CRUD 操作

🤖 好的，我来帮你创建。首先让我了解一下项目结构...

[调用工具: glob] 扫描项目文件...
[调用工具: read_file] 读取 package.json...
[调用工具: write_file] 创建 src/routes/users.js...
[调用工具: write_file] 创建 src/controllers/userController.js...
[调用工具: shell] 安装依赖 express...

✅ 已创建用户 CRUD API，包含以下文件：
   - src/routes/users.js
   - src/controllers/userController.js
   - src/models/User.js

启动服务器：npm run dev
```

---

## 📋 CLI 命令参考

### 全局选项

```bash
easycode [options]
```

| 选项 | 简写 | 说明 |
|:---|:---:|:---|
| `--model <name>` | `-m` | 指定 AI 模型 |
| `--prompt <text>` | `-p` | 非交互模式，执行单次提示 |
| `--prompt-interactive <text>` | `-i` | 执行提示后进入交互模式 |
| `--sandbox` | `-s` | 在沙箱环境中运行（增强安全性） |
| `--debug` | `-d` | 启用调试模式，输出详细日志 |
| `--all-files` | `-a` | 在上下文中包含所有项目文件 |
| `--yolo` | `-y` | YOLO 模式：自动执行所有操作，无需确认 |
| `--continue` | `-c` | 继续上次会话 |
| `--session <id>` | | 恢复指定 ID 的会话 |
| `--list-sessions` | | 列出所有可用会话 |
| `--workdir <path>` | | 指定工作目录 |
| `--version` | `-v` | 显示版本号 |
| `--help` | `-h` | 显示帮助信息 |

### 使用示例

```bash
# 基本启动
easycode

# 使用 Gemini 2.0 Flash 模型
easycode -m gemini-2.0-flash

# 执行单次任务（非交互）
easycode -p "为 src/utils.ts 添加单元测试"

# 继续上次会话
easycode -c

# YOLO 模式（危险：自动执行所有操作）
easycode -y

# 调试模式
easycode -d

# 指定工作目录
easycode --workdir /path/to/project

# 列出所有会话
easycode --list-sessions

# 恢复特定会话
easycode --session abc123
```

---

## ⚡ 交互式斜杠命令

在交互模式下，使用以 `/` 开头的命令快速执行操作：

### 核心命令

| 命令 | 说明 |
|:---|:---|
| `/help` | 显示帮助信息和快速入门指南 |
| `/help-ask` | AI 智能帮助助手，解答使用问题 |
| `/issue <描述>` | 提交 GitHub Issue（自动附带错误日志） |
| `/quit` 或 `/exit` | 退出应用，显示会话统计 |

### 会话与模型

| 命令 | 说明 |
|:---|:---|
| `/session` | 会话管理：`list` / `new` / `select <id>` / `rebuild` |
| `/model [name]` | 切换 AI 模型，不带参数显示选择对话框 |
| `/compress` | 压缩对话历史，减少 Token 消耗 |
| `/stats` | 显示会话统计信息 |

### 工具与扩展

| 命令 | 说明 |
|:---|:---|
| `/tools [nodesc]` | 查看可用工具列表 |
| `/mcp [subcommand]` | MCP 服务器管理：`add` / `auth` / `refresh` |
| `/memory` | 长期记忆管理：`show` / `add` / `refresh` |

### 工作模式

| 命令 | 说明 |
|:---|:---|
| `/plan [on\|off]` | 计划模式：只讨论不修改代码 |
| `/yolo [on\|off]` | YOLO 模式：自动执行所有操作 |
| `/vim` | 切换 Vim 编辑模式 |

### 文件与编辑

| 命令 | 说明 |
|:---|:---|
| `/restore [id]` | 恢复文件到检查点状态 |
| `/refine <text>` | 文本润色，支持 `--tone` / `--lang` / `--level` |
| `/trim-spaces [on\|off]` | 配置是否自动删除行末空格 |
| `/copy` | 复制最后一条 AI 回复到剪贴板 |

### 界面与设置

| 命令 | 说明 |
|:---|:---|
| `/clear` | 清空终端屏幕 |
| `/theme` | 主题选择对话框 |
| `/editor` | 编辑器配置对话框 |
| `/about` | 显示系统和应用信息 |

### 调试控制台

Easy Code 提供增强的调试控制台功能，通过 `Ctrl+O` 快捷键实现三状态循环：

| 快捷键 | 状态 | 说明 |
|:---|:---|:---|
| `Ctrl+O` (第1次) | 📊 全部日志 | 打开调试控制台，显示所有日志信息 |
| `Ctrl+O` (第2次) | ⚠️ 仅错误 | 过滤显示错误日志，显示黄色 `[ERRORS ONLY]` 标识 |
| `Ctrl+O` (第3次) | 🚫 关闭 | 关闭调试控制台 |

**功能特点：**
- 🎯 **智能过滤**：自动识别错误、异常、堆栈跟踪等关键信息
- 🎨 **视觉提示**：错误模式显示醒目的黄色标识
- ⚡ **快速切换**：一键在全部日志和错误过滤间切换
- 🔍 **错误高亮**：自动检测并显示错误关键词和堆栈信息

### 账户与认证

| 命令 | 说明 |
|:---|:---|
| `/auth` | 身份认证管理 |
| `/account` | 账户信息和余额查看 |

### 项目配置

| 命令 | 说明 |
|:---|:---|
| `/init` | 初始化项目配置文件 `EASYCODE.md` |
| `/hooks` | 查看 Hooks 钩子机制帮助文档 |
| `/ide` | IDE 集成管理（VS Code 模式下可用） |

---

## 🏗️ 项目架构

Easy Code 采用现代化的 **Monorepo** 架构，确保代码一致性和高效协作。

### 目录结构

```
EasyCode/
│
├── 📁 packages/                     # 核心包目录
│   │
│   ├── 📁 cli/                      # 命令行界面包
│   │   ├── src/
│   │   │   ├── commands/            # 斜杠命令实现
│   │   │   ├── ui/                  # 终端 UI 组件 (React Ink)
│   │   │   │   ├── components/      # 可复用 UI 组件
│   │   │   │   ├── dialogs/         # 对话框组件
│   │   │   │   └── themes/          # 主题配置
│   │   │   ├── services/            # 服务层
│   │   │   ├── auth/                # 客户端认证
│   │   │   └── utils/               # 工具函数
│   │   └── package.json
│   │
│   ├── 📁 core/                     # 核心功能库
│   │   ├── src/
│   │   │   ├── tools/               # AI 工具集
│   │   │   │   ├── shell.ts         # Shell 命令执行
│   │   │   │   ├── read-file.ts     # 文件读取
│   │   │   │   ├── write-file.ts    # 文件写入
│   │   │   │   ├── edit.ts          # 文件编辑 (replace)
│   │   │   │   ├── glob.ts          # 文件搜索
│   │   │   │   ├── grep.ts          # 内容搜索
│   │   │   │   ├── web-fetch.ts     # 网页抓取
│   │   │   │   ├── web-search.ts    # Google 搜索
│   │   │   │   ├── task.ts          # 子 Agent 任务
│   │   │   │   └── ...
│   │   │   ├── mcp/                 # MCP 引擎
│   │   │   ├── prompts/             # Prompt 模板
│   │   │   ├── auth/                # 认证模块
│   │   │   ├── hooks/               # Hooks 系统
│   │   │   ├── skills/              # Skills 扩展
│   │   │   ├── services/            # 核心服务
│   │   │   ├── config/              # 配置管理
│   │   │   └── utils/               # 工具函数
│   │   └── package.json
│   │
│   ├── 📁 vscode-ide-companion/     # VS Code CLI 伴侣扩展
│   │   ├── src/
│   │   │   └── extension.ts         # 扩展入口
│   │   └── package.json
│   │
│   └── 📁 vscode-ui-plugin/         # VS Code 完整 UI 插件
│       ├── src/                     # 扩展源码
│       ├── webview/                 # React Webview 前端
│       └── package.json
│
├── 📁 docs/                         # 文档目录
│   ├── architecture.md              # 架构设计
│   ├── hooks-user-guide.md          # Hooks 使用指南
│   ├── mcp-improvements-summary.md  # MCP 集成说明
│   └── ...
│
├── 📁 scripts/                      # 构建和工具脚本
│   ├── build.js                     # 主构建脚本
│   ├── build_package.js             # 包构建
│   ├── clean.js                     # 清理脚本
│   └── ...
│
├── 📄 package.json                  # 根配置 (Workspaces)
├── 📄 tsconfig.json                 # TypeScript 配置
├── 📄 eslint.config.js              # ESLint 配置
├── 📄 esbuild.config.js             # esbuild 打包配置
├── 📄 EasyCode_Code_Whitepaper.md      # 产品白皮书
├── 📄 EASYCODE.md                      # 项目 AI 开发规范
└── 📄 LICENSE                       # Apache 2.0 许可证
```

### 技术栈详解

| 类别 | 技术 | 说明 |
|:---:|:---|:---|
| **语言** | TypeScript 5.x | 强类型，提升代码质量 |
| **运行时** | Node.js 20+ | 现代 JavaScript 运行时 |
| **CLI UI** | React + Ink | 声明式终端 UI 框架 |
| **构建** | esbuild | 极速打包，毫秒级构建 |
| **测试** | Vitest | 现代化单元测试框架 |
| **代码规范** | ESLint + Prettier | 统一代码风格 |
| **包管理** | npm Workspaces | Monorepo 管理 |
| **AI SDK** | @google/genai | Google Gemini API |
| **MCP** | @modelcontextprotocol/sdk | MCP 协议实现 |

### 交互流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   用户输入   │────▶│  CLI 包     │────▶│  Core 包    │
│  (终端)     │     │  (UI/交互)   │     │  (业务逻辑)  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
            ┌─────────────┐           ┌─────────────┐            ┌─────────────┐
            │  AI Model   │           │   Tools     │            │    MCP      │
            │  (Gemini)   │           │ (Shell/File)│            │  Servers    │
            └─────────────┘           └─────────────┘            └─────────────┘
```

---

## 🔌 VS Code 扩展

Easy Code 提供两个 VS Code 扩展，满足不同使用场景：

### 📡 IDE Companion（CLI 伴侣）

**轻量级扩展**，让 VS Code 与终端中运行的 CLI 无缝连接。

**功能：**
- 感知当前打开的文件
- 获取选中的代码片段
- 与 CLI 实时同步工作区状态

**构建方法：**

```bash
cd packages/vscode-ide-companion

# 安装依赖
npm install

# 构建
npm run build

# 打包为 .vsix
npm run package
```

### 🎨 UI Plugin（图形化插件）

**完整功能的图形化 AI 编码助手**。

**功能：**
- 📱 侧边栏 AI 对话窗口
- 🖱️ 右键菜单代码操作
  - 解释选中代码
  - 优化代码
  - 生成单元测试
  - 添加到当前对话
- ✨ 代码内联补全建议
- 🔌 MCP 服务器状态管理
- 📜 自定义规则管理
- ⏪ 版本历史和回滚

**构建方法：**

```bash
cd packages/vscode-ui-plugin

# 安装扩展依赖
npm install

# 构建 Webview 前端（首次需要）
cd webview
npm install
npm run build
cd ..

# 构建扩展
npm run build

# 打包为 .vsix
npm run package
```

**安装扩展：**

1. 打开 VS Code
2. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS)
3. 输入 "Install from VSIX"
4. 选择生成的 `.vsix` 文件

---

## 🛠️ 内置工具系统

Easy Code 的 AI 通过工具系统与外部环境交互。所有工具都经过精心设计，确保安全性和可控性。

### 文件操作工具

| 工具 | 说明 | 安全级别 |
|:---|:---|:---:|
| `read_file` | 读取文件内容，支持文本、图片、PDF、Excel、Word | 🟢 只读 |
| `read_many_files` | 批量读取多个文件，支持 glob 模式 | 🟢 只读 |
| `write_file` | 创建新文件或覆盖写入 | 🟡 需确认 |
| `replace` | 精准替换文件中的特定内容 | 🟡 需确认 |
| `delete_file` | 删除文件（会保存备份以便恢复） | 🔴 需确认 |

### 搜索工具

| 工具 | 说明 | 安全级别 |
|:---|:---|:---:|
| `glob` | 按模式搜索文件名，支持 `**/*.ts` 等模式 | 🟢 只读 |
| `grep` | 在文件内容中搜索正则表达式 (ripgrep) | 🟢 只读 |
| `ls` | 列出目录内容 | 🟢 只读 |

### 命令执行

| 工具 | 说明 | 安全级别 |
|:---|:---|:---:|
| `shell` | 执行 Shell 命令 (bash/powershell) | 🔴 需确认 |

### 网络工具

| 工具 | 说明 | 安全级别 |
|:---|:---|:---:|
| `web_fetch` | 抓取网页内容，支持本地和远程 URL | 🟢 只读 |
| `web_search` | Google 搜索 | 🟢 只读 |

### 高级工具

| 工具 | 说明 | 安全级别 |
|:---|:---|:---:|
| `task` | 启动代码分析子 Agent | 🟢 只读 |
| `mcp_tool` | 调用 MCP 服务器提供的工具 | 🟡 视工具而定 |
| `todo_write` | 管理任务列表 | 🟢 只读 |
| `memory` | 保存/读取长期记忆 | 🟢 只读 |

### 代码质量工具

| 工具 | 说明 | 安全级别 |
|:---|:---|:---:|
| `read_lints` | 读取代码 Linter 错误 | 🟢 只读 |
| `lint_fix` | 自动修复 Linter 错误 | 🟡 需确认 |

---

## 🔗 MCP 协议支持

**Model Context Protocol (MCP)** 是 Easy Code 实现深度上下文理解的核心协议。

### 什么是 MCP？

MCP 允许 AI 模型：
- 连接外部数据源和工具
- 获取实时信息
- 与第三方服务交互

### 配置 MCP 服务器

在项目根目录创建 `.easycode/settings.json`：

#### 方式一：标准模式（通过命令启动）

适用于本地 MCP 服务器，通过命令行启动进程。

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/allowed/dir"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "your-token"
      }
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

### 管理 MCP 服务器

```bash
# 查看所有 MCP 服务器状态
/mcp

# 添加新服务器
/mcp add github

# 刷新服务器连接
/mcp refresh github

# 进行 OAuth 认证
/mcp auth github
```

---

## 🤖 自定义模型支持

Easy Code 支持配置 OpenAI 兼容格式和 Anthropic Claude API 格式的自定义模型，让你可以使用任何兼容的 AI 服务。

### 为什么使用自定义模型？

- 🔓 **自由选择** - 使用你最喜爱的 AI 服务商
- 💰 **成本控制** - 直接向服务商付费，无需通过中间商
- 🏠 **本地部署** - 支持本地模型（LM Studio, Ollama 等）
- 🚀 **灵活配置** - 根据需求调整参数和端点

### 快速配置

#### 方式一：使用模型管理界面（推荐）

在 CLI 中输入：

```bash
/model
```

然后选择 **"Model Management"**（模型管理）选项，按向导提示填写：
1. 选择提供商类型（OpenAI Compatible / Anthropic Claude）
2. 输入显示名称
3. 输入 API 基础 URL
4. 输入 API 密钥（推荐使用环境变量格式 `${OPENAI_API_KEY}`）
5. 输入模型 ID
6. 设置最大 Token 数（可选）
7. 确认配置

#### 方式二：手动编辑配置文件

编辑 `~/.easycode-user/custom-models.json`：

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
    }
  ]
}
```

### 支持的提供商

#### OpenAI Compatible (`openai`)

适用于任何遵循 OpenAI Chat Completions 格式的 API：

- **OpenAI 官方 API**
  ```json
  {
    "displayName": "GPT-4 Turbo",
    "provider": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "${OPENAI_API_KEY}",
    "modelId": "gpt-4-turbo"
  }
  ```

- **Azure OpenAI**
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

- **本地模型（LM Studio, Ollama）**
  ```json
  {
    "displayName": "Local Llama",
    "provider": "openai",
    "baseUrl": "http://localhost:1234/v1",
    "apiKey": "not-needed",
    "modelId": "llama-3-70b"
  }
  ```

- **第三方服务（Groq, Together AI 等）**
  ```json
  {
    "displayName": "Groq Llama 3",
    "provider": "openai",
    "baseUrl": "https://api.groq.com/openai/v1",
    "apiKey": "${GROQ_API_KEY}",
    "modelId": "llama-3-70b-8192"
  }
  ```

#### Anthropic Claude (`anthropic`)

适用于 Claude API 端点，支持扩展思考功能：

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

### 配置字段说明

**必需字段：**

| 字段 | 说明 | 示例 |
|-----|------|-----|
| `displayName` | 显示名称 | `GPT-4 Turbo` |
| `provider` | 提供商类型 | `openai` 或 `anthropic` |
| `baseUrl` | API 基础 URL | `https://api.openai.com/v1` |
| `apiKey` | API 密钥 | `${OPENAI_API_KEY}` |
| `modelId` | 模型名称 | `gpt-4-turbo` |

**可选字段：**

| 字段 | 说明 | 默认值 |
|-----|------|--------|
| `maxTokens` | 最大上下文窗口 | 视提供商而定 |
| `enabled` | 是否启用 | `true` |
| `headers` | 额外 HTTP 请求头 | 无 |
| `timeout` | 请求超时（毫秒） | `300000` |
| `enableThinking` | 启用 Anthropic 扩展思考 | `false` |

### 使用自定义模型

#### 通过模型选择对话框

```bash
/model
```

自定义模型会显示 `[Custom]` 标签和青色，使用方向键选择。

#### 直接切换

```bash
/model custom:openai:gpt-4-turbo@abc123
```

### 环境变量设置

推荐使用环境变量存储 API 密钥：

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

### 特性与限制

✅ **支持的功能：**
- 流式和非流式响应
- 工具调用（Function Calling）
- 多模态输入（文本、图片）
- 与 Easy Code 所有功能集成

⚠️ **注意：**
- 自定义模型不消耗 EasyCode 积分
- 需直接向 API 提供商付费
- 某些高级功能可能因提供商限制而不可用
- Token 计数由提供商决定

### 相关文档

- 📖 [自定义模型快速入门](./docs/custom-models-quickstart.md)
- 📖 [自定义模型完整指南](./docs/custom-models-guide.md)
- 📖 [自定义模型架构说明](./docs/custom-models-architecture.md)

---

## 🤝 派发任务给本机 Claude Code / Codex

Easy Code 可以作为 **ACP 编排方**，把编码任务派发给你本机安装并登录的 **Claude Code** 或 **Codex** 执行——尤其适合飞书网关模式：你在飞书里说一句话，Easy Code 要么自己干，要么转交给本机的 cc / codex 干。

### 前提

- 本机已安装并登录 **Claude Code** 和/或 **Codex**（派发会复用其本地登录态，不需要额外配置密钥）。
- Easy Code 通过官方 ACP 桥按需拉起（默认 `npx` 运行，不打入安装包；桥版本已固定，避免上游破坏性更新影响已调好的环境）：
  - Claude Code → `@agentclientprotocol/claude-agent-acp@0.44.0`，可用 `EASYCODE_CLAUDE_CODE_ACP_CMD` 覆盖启动命令（也可借此浮动到 latest）。
  - Codex → `@zed-industries/codex-acp@0.16.0`，可用 `EASYCODE_CODEX_ACP_CMD` 覆盖启动命令。

### 派发方式

| 方式 | 说明 |
|:---|:---|
| **模型自主** | Easy Code 的 AI 会按任务自行判断，必要时调用内置工具 `delegate_to_agent` 派发（可选 `agent: claude-code\|codex`）。 |
| **显式强制（飞书）** | 消息前加 `@cc`（或 `/cc`）派发给 Claude Code、`@codex`（或 `/codex`、`@cdx`）派发给 Codex。例：`@cc 给 src/foo.ts 加单元测试`、`@codex 写个基准测试`。 |
| **群默认（飞书）** | `/bind <项目路径> --agent claude-code\|codex` 把整个群的默认执行方设为对应 agent；`/bind --agent self` 改回 Easy Code 自己。 |

派发期间，外部 agent 的执行进度（消息与工具调用）会通过飞书 CardKit 卡片**实时流式**回传，最终结果汇总返回。

### 📊 多会话管理（飞书 `/sessions`）

在飞书里发送 **`/sessions`**（别名 **`/会话`**）会推送一张 **CardKit 2.0 Dashboard 卡片**，集中展示本机的 Agent 会话：

- **🚀 本机任务**：正在运行 / 最近的派发任务，带实时状态——状态徽章（🟢运行中 / ✅完成 / ❌失败）、当前工具、计划进度（`2/5`）、token 占用（`30%`）、已运行时长。卡片会在任务运行期间**自动刷新**。
- **🗂️ 可续接的历史会话**：自动发现 Claude Code / Codex 各自本机已有的会话（标题、最近活动时间），并为每条给出续接指令。

> 派发任务记录会持久化到 `~/.easycode-user/delegate-tasks/`，**网关重启后历史任务仍可在 `/sessions` 查看**（重启期间运行中的任务会被标记为失败）。

### 🔄 续接已有会话

想接着某个历史会话继续（保留完整上下文），用 `resume` 子语法：

```text
@cc:resume <sessionId> 继续把单元测试补全
@codex:resume <sessionId> 把上次的重构收尾
```

`<sessionId>` 即 `/sessions` 卡片里列出的会话 id。外部 agent 会先 `session/load` 恢复该会话的完整历史，再执行你的新任务。绑定了默认 agent 的群也可直接发 `resume <sessionId> <任务>`。

> ⚠️ 在飞书无人值守场景下，派发的外部 agent 默认**自动放行权限并可改文件**，请仅对可信项目使用。

---

## 🪝 Hooks 钩子机制

Hooks 允许你在关键工作流节点注入自定义逻辑。

### 配置 Hooks

在 `.easycode/settings.json` 中添加：

```json
{
  "hooks": {
    "preToolExecution": [
      {
        "matcher": { "toolName": "write_file" },
        "action": {
          "type": "shell",
          "command": "echo 'About to write file: $TOOL_ARGS'"
        }
      }
    ],
    "postToolExecution": [
      {
        "matcher": { "toolName": "write_file", "exitCode": 0 },
        "action": {
          "type": "shell",
          "command": "npm run lint -- --fix $FILE_PATH"
        }
      }
    ]
  }
}
```

### 使用场景

- **自动格式化** - 文件写入后自动运行 Prettier
- **代码检查** - 修改代码后自动运行 ESLint
- **提交验证** - 执行 Shell 命令前检查分支
- **日志记录** - 记录所有工具调用

### 相关文档

- 📖 [Hooks 使用指南](./docs/hooks-user-guide.md)
- 📖 [Hooks 架构设计](./docs/HOOKS_ARCHITECTURE.md)
- 📖 [Hooks 示例](./docs/hooks-examples.md)

---

## ⚙️ 配置文件

### 项目配置 `EASYCODE.md`

在项目根目录创建 `EASYCODE.md`，为 AI 提供项目特定的上下文和规范：

```markdown
# 项目概述
这是一个基于 React + TypeScript 的前端项目...

# 技术栈
- React 18
- TypeScript 5
- Vite
- TailwindCSS

# 代码规范
- 使用函数组件和 Hooks
- 命名使用 camelCase
- 组件文件使用 PascalCase

# 目录结构说明
- src/components/ - 可复用组件
- src/pages/ - 页面组件
- src/hooks/ - 自定义 Hooks
- src/utils/ - 工具函数
```

使用 `/init` 命令可以自动生成初始配置。

### 用户配置 `.easycode/settings.json`

```json
{
  "preferredModel": "gemini-2.0-flash",
  "theme": "dark",
  "trimSpaces": true,
  "mcpServers": {},
  "hooks": {}
}
```

---

## 🧑‍💻 开发指南

### 环境准备

```bash
# 确保 Node.js 版本 >= 20
node --version

# 克隆仓库
git clone https://github.com/OrionStarAI/EasyCodeCode.git
cd EasyCode

# 安装依赖
npm install
```

### 常用命令

| 命令 | 说明 |
|:---|:---|
| `npm install` | 安装所有依赖 |
| `npm run build` | 构建所有包 |
| `npm run dev` | 开发模式运行（带调试） |
| `npm run test` | 运行所有测试 |
| `npm run lint` | 代码风格检查 |
| `npm run lint:fix` | 自动修复代码风格 |
| `npm run format` | 格式化代码 (Prettier) |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run clean` | 清理构建产物和缓存 |
| `npm run pack:prod` | 生产环境打包 |
| `npm run pack:vscode` | 打包 VS Code 插件 |

### 开发流程

1. **修改代码** - 在相应的 `packages/*/src` 目录下修改
2. **构建** - 运行 `npm run build`
3. **测试** - 运行 `npm run dev` 本地测试
4. **检查** - 运行 `npm run lint && npm run typecheck`
5. **提交** - 确保测试通过后提交代码

### 调试技巧

```bash
# 启用调试模式
npm run debug

# 启用文件日志
LOG_TO_FILE=true npm run dev

# 查看详细日志
FILE_DEBUG=1 npm run dev
```

### 调试控制台功能

**Ctrl+O 三状态循环**：
- **第1次**：打开调试控制台，显示全部日志
- **第2次**：切换到仅错误模式，显示黄色 `[ERRORS ONLY]` 标识
- **第3次**：关闭调试控制台

**智能错误过滤**：自动识别并显示错误、异常、堆栈跟踪等关键信息，帮助开发者快速定位问题。

### 添加新工具

1. 在 `packages/core/src/tools/` 创建工具文件
2. 实现工具接口
3. 在 `tool-registry.ts` 注册工具
4. 添加单元测试

---

## ❓ 常见问题

### 安装问题

<details>
<summary><b>Q: npm install 失败，提示权限错误</b></summary>

**A:** 尝试以下方法：

```bash
# 方法 1: 使用 --unsafe-perm
npm install -g easycode-ai --unsafe-perm

# 方法 2: 修改 npm 全局目录权限
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

</details>

<details>
<summary><b>Q: 提示 Node.js 版本过低</b></summary>

**A:** Easy Code 需要 Node.js 20+。使用 nvm 管理版本：

```bash
nvm install 20
nvm use 20
```

</details>

### 使用问题

<details>
<summary><b>Q: 如何切换 AI 模型？</b></summary>

**A:** 使用 `/model` 命令或启动时指定：

```bash
# 交互模式
/model gemini-2.0-flash

# 启动时指定
easycode -m gemini-2.0-flash
```

</details>

<details>
<summary><b>Q: 如何继续之前的会话？</b></summary>

**A:** 使用 `-c` 参数或 `/session` 命令：

```bash
# 继续最近会话
easycode -c

# 列出所有会话
/session list

# 选择特定会话
/session select 1
```

</details>

<details>
<summary><b>Q: YOLO 模式是什么？</b></summary>

**A:** YOLO 模式下，AI 的所有操作会自动执行，无需用户确认。⚠️ 谨慎使用！

```bash
# 启用
easycode -y
# 或
/yolo on
```

</details>

---

## 🤝 贡献指南

我们欢迎社区贡献！无论是 Bug 修复、新功能还是文档改进。

### 贡献流程

1. **Fork** 本仓库
2. 创建特性分支
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. 提交改动
   ```bash
   git commit -m 'feat: add some amazing feature'
   ```
4. 推送分支
   ```bash
   git push origin feature/AmazingFeature
   ```
5. 提交 **Pull Request**

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `style:` 代码格式
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具

### 报告问题

发现 Bug 或有功能建议？请 [创建 Issue](https://github.com/OrionStarAI/EasyCodeCode/issues)，包含：

- 问题描述
- 复现步骤
- 期望行为
- 环境信息（OS、Node 版本等）

---

## ⭐ Star History

[![Star History Chart](https://star-history.dera.page/svg?repos=OrionStarAI/EasyCodeCode&type=date&legend=top-left)](https://star-history.dera.page/#OrionStarAI/EasyCodeCode&type=date&legend=top-left)

---

## 🗺️ 路线图

### 短期目标 (v1.x)

- [ ] 优化 MCP 上下文理解能力
- [ ] 扩展工具系统，支持更多场景
- [ ] 增强 VS Code 插件体验
- [ ] 支持更多 AI 模型

### 中期目标 (v2.x)

- [ ] 多模态支持（图表、设计稿）
- [ ] 深度架构分析和设计辅助
- [ ] 开放插件生态系统
- [ ] 团队协作功能

### 长期愿景

- [ ] 自主学习和进化
- [ ] 预测开发需求
- [ ] 全自动化软件工程

---

## 📄 许可证与法律信息

本项目基于 [Apache License 2.0](LICENSE) 开源。

| 📄 Legal | |
|:---|:---|
| **License** | [Apache License 2.0](LICENSE) |
| **Terms of Service** | [Terms & Privacy](https://easycode.bot/terms) |
| **Privacy Policy** | [Privacy Policy](https://easycode.bot/privacy) |
| **Security** | [Security Policy](SECURITY.md) |

```
Copyright 2025 Easy Code Team

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

---

## 🔗 相关链接

<div align="center">

| 资源 | 链接 |
|:---:|:---|
| 🌐 **官方网站** | [https://easycode.bot](https://easycode.bot) |
| 📦 **npm 包** | [https://www.npmjs.com/package/easycode-ai](https://www.npmjs.com/package/easycode-ai) |
| 📖 **白皮书** | [EasyCode_Code_Whitepaper.md](./EasyCode_Code_Whitepaper.md) |
| 🐛 **问题反馈** | [GitHub Issues](https://github.com/OrionStarAI/EasyCodeCode/issues) |
| 💬 **讨论区** | [GitHub Discussions](https://github.com/OrionStarAI/EasyCodeCode/discussions) |

</div>

---

<div align="center">

### 💬 "AI 不只是工具，更是每位开发者的伙伴。"

<br>

**⭐ 如果这个项目对你有帮助，请给我们一个 Star！⭐**

<br>

🪄 **Happy Coding with Easy Code!** 💻✨

<br>

---

Made with ❤️ by [Easy Code Team](https://github.com/OrionStarAI)

</div>
