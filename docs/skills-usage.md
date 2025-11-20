# DeepV Code Skills System 使用指南

本文档基于 `master` 分支与当前开发分支的对比分析，详细说明了新增的 Skills 系统架构及使用方法。

## 1. 系统架构概述

Skills 系统采用三层架构设计，旨在模块化扩展 AI 的能力：

1.  **Marketplace (市场)**: 顶层容器，通常是一个 Git 仓库或本地目录，包含多个 Plugin。
2.  **Plugin (插件)**: 逻辑分组，包含一组相关的 Skills。
3.  **Skill (技能)**: 最小的功能单元，由 `SKILL.md` 定义，可包含可执行脚本。

## 2. CLI 命令使用说明

DeepV Code CLI 新增了 `/skill` 命令族，用于管理整个生命周期。

### 2.1 Marketplace 管理

管理技能来源（市场）。

*   **列出市场**:
    ```bash
    /skill marketplace list
    ```
*   **添加市场**:
    支持 Git URL 或本地路径。
    ```bash
    /skill marketplace add <git-url-or-local-path> [--name <custom-name>]
    # 示例
    /skill marketplace add https://github.com/anthropics/anthropic-agent-skills.git
    ```
*   **更新市场**:
    从 Git 拉取最新更改。
    ```bash
    /skill marketplace update <marketplace-name>
    ```
*   **浏览市场内容**:
    查看市场中可用的插件。
    ```bash
    /skill marketplace browse <marketplace-name> [search-query]
    ```
*   **移除市场**:
    ```bash
    /skill marketplace remove <marketplace-name> [--delete-files]
    ```

### 2.2 Plugin 管理

管理具体的插件安装与启停。

*   **列出插件**:
    如果不带参数，列出已安装插件；带市场名则列出该市场的可用插件。
    ```bash
    /skill plugin list [marketplace-name]
    ```
*   **安装插件**:
    ```bash
    /skill plugin install <marketplace-name> <plugin-name>
    ```
*   **卸载插件**:
    ```bash
    /skill plugin uninstall <plugin-id>
    ```
*   **启用/禁用插件**:
    ```bash
    /skill plugin enable <plugin-id>
    /skill plugin disable <plugin-id>
    ```
*   **查看插件信息**:
    ```bash
    /skill plugin info <plugin-id>
    ```

### 2.3 Skill 查看

查看已加载的具体技能。

*   **列出所有技能**:
    ```bash
    /skill list
    ```
*   **查看技能详情**:
    ```bash
    /skill info <skill-id>
    ```
*   **查看统计信息**:
    ```bash
    /skill stats
    ```

## 3. 开发自定义 Skill

要创建一个新的 Skill，需要遵循特定的目录结构和文件格式。

### 3.1 目录结构

一个标准的 Skill 目录结构如下：

```text
my-plugin/
└── my-skill/
    ├── SKILL.md          # 核心定义文件 (必需)
    ├── scripts/          # 可执行脚本目录 (可选)
    │   ├── script.py
    │   └── tool.js
    ├── LICENSE.txt       # 许可证 (可选)
    └── README.md         # 补充文档 (可选)
```

### 3.2 SKILL.md 格式

`SKILL.md` 文件由 YAML Frontmatter 和 Markdown 正文组成。

```markdown
---
name: my-skill-name           # 技能名称 (小写字母、数字、连字符)
description: 简短描述         # 用于 AI 检索
license: MIT                  # 许可证
allowedTools:                 # 允许使用的工具白名单
  - run_shell_command
dependencies: []              # 依赖的其他 Skills
---

# 使用说明

这里是详细的 Markdown 文档，指导 AI 如何使用此技能。

## Workflow (工作流)

如果包含脚本，必须在此处详细说明如何调用脚本。

Example:
run_shell_command("python3 scripts/script.py --input ...")
```

### 3.3 脚本支持

Skills 系统支持 Python (`.py`)、Bash (`.sh`, `.bash`) 和 Node.js (`.js`, `.mjs`, `.cjs`) 脚本。
*   脚本应放置在 `scripts/` 子目录下。
*   AI 会被强制要求直接调用这些脚本，而不是重新编写代码。

## 4. AI 交互机制

系统为 AI 提供了 `use_skill` 工具来调用技能。

### 4.1 调用流程

1.  **发现**: AI 在上下文中看到可用的 Skills 列表（元数据级别）。
2.  **激活**: AI 调用 `use_skill(skillName="name")`。
3.  **加载**: 系统加载 `SKILL.md` 的完整内容。
    *   **含脚本的 Skill**: 系统会发出**严重警告**，强制 AI 使用 `run_shell_command` 执行预置脚本，禁止 AI 编写新代码来实现相同功能。
    *   **纯知识 Skill**: 系统将 Markdown 内容注入上下文，作为操作指南。

### 4.2 安全与限制

*   **脚本优先**: 如果 Skill 提供了脚本，AI 必须使用它们。
*   **工具白名单**: Skill 可以限制 AI 在执行任务时能使用的底层工具。
*   **沙箱执行**: 建议在沙箱环境中运行 Skill 脚本以确保安全。
