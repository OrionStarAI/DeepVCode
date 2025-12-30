# 🚀 DeepV Code LSP (语言服务协议) 使用指南

DeepV Code 现在集成了强大的 **LSP (Language Server Protocol)** 能力。这意味着 AI 不再仅仅是通过“搜索字符串”来猜你的代码，而是像真正的 IDE 一样，能够完全“读懂”代码的语义。

---

## 1. 什么是 LSP？

**LSP (Language Server Protocol)** 是由微软、Google 和 RedHat 共同推出的行业标准。
它将代码分析逻辑（Brain）与编辑器（UI）分离。通过 LSP，DeepV Code 可以调用各语言官方或社区最专业的分析引擎，为 AI 提供极致的代码感知力。

### 为什么 LSP 比传统搜索（Search/Grep）更强？

| 特性 | 传统搜索 (Grep/Search) | LSP 语义感知 |
| :--- | :--- | :--- |
| **理解力** | 只匹配文本字符串 | 理解变量、函数、类和作用域 |
| **准确度** | 容易搜到注释或无关字符串 | 只返回真实的定义和类型 |
| **跨文件** | 只能靠文件名匹配 | 准确追踪 `import` 和依赖链 |
| **深度信息** | 无 | 提供详细的类型推导和文档注释 |

---

## 2. 核心黑科技：小白式“零配置”体验

传统的 LSP 使用需要用户手动安装各种环境（如 `npm install -g ...` 或下载 `.exe`）。
在 DeepV Code 中，我们实现了 **自动二进制管理 (BinaryManager)**：

- **按需触发**：当你第一次询问某种语言的问题时，系统才会启动。
- **静默安装**：如果你的电脑没装对应的 LSP 服务端，DeepV Code 会**自动在后台下载并安装**到隔离目录。
- **无感运行**：用户无需配置环境变量，无需查看安装文档，真正做到“开箱即用”。

---

## 3. 已支持的语言矩阵 (11 种)

目前我们已经支持以下主流开发、配置及运维语言：

| 类别 | 支持语言 | 驱动服务端 |
| :--- | :--- | :--- |
| **通用编程** | TypeScript, JavaScript | `typescript-language-server` |
| | Python | `pyright` |
| | Rust | `rust-analyzer` |
| | Go | `gopls` |
| **底层开发** | C, C++ | `clangd` |
| **Web 前端** | HTML, CSS | `vscode-langservers-extracted` |
| **数据与配置** | JSON | `vscode-json-language-server` |
| | YAML / YML | `yaml-language-server` |
| | SQL | `sql-language-server` |
| **DevOps** | Dockerfile | `dockerfile-language-server-nodejs` |

---

## 4. 如何测试与体验？

### 第一步：确认工具已加载
启动 CLI 后，输入以下命令查看工具列表：
> “你现在有哪些工具？” 或输入 `/tools`

你应该能看到 `lsp_hover` 和 `lsp_goto_definition` 这两个工具。

### 第二步：实战提问 (以精准跳转为例)
找一个有 `import` 关系的文件，问 AI：
> “使用 LSP Goto Definition，帮我看看 `xxx.ts` 文件第 10 行调用的那个函数是在哪里定义的？”

**预期结果**：AI 会直接告诉你目标文件和行号，并能自动展示源码，即使该定义在另一个文件夹甚至 `node_modules` 里。

### 第三步：体验自动安装 (以 YAML 为例)
如果你电脑没装过 YAML 插件，尝试问：
> “使用 LSP Hover 告诉我的 `docker-compose.yml` 里的 `image` 字段代表什么意思？”

**预期结果**：你会看到后台提示正在下载安装 `yaml-language-server`，随后 AI 会给出精准的官方文档说明。

---

**DeepV Code - 赋予 AI 真正的代码直觉。**
