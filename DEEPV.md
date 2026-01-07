## DeepV Code Added Memories
- DeepV Code 项目结构：
- `cli`: 命令行界面，与 `core` 交互。
- `core`: 核心功能，处理 AI 模型通信、文件解析、代码仓库操作。
- `vscode-ide-companion`: VS Code 伴侣扩展，提供工作区访问。
- `vscode-ui-plugin`: VS Code UI 插件，提供可视化 AI 编码辅助功能。
- 注意AI 应该始终使用 `npm run build` 来测试代码是否能通过编译。因为 CLI 交互式测试要交给人类验证。
- AI 可以自己编写临时脚本来验证特定的修改和功能。如果脚本有问题，可以尝试修复。但请务必记得清理自己生成的临时测试脚本文件。
- 作为AI不要使用 npm run dev 来试图启动DeepV Code项目，请由人类进行。因为这会导致启动交互式CLI，而AI无法处理这种情况。
- DeepV Code项目开发规范：对最终用户设计的UI上的可见的文案，请务必i18n（国际化）。开发调试所用的日志可以不考虑i18n，但尽量使用英文。
- DeepV Code项目完整架构：

**项目结构树：**
```
DeepV Code (Monorepo)
├── packages/
│   ├── cli/                     # 主要命令行界面 (binary: "gemini")
│   │   ├── src/ui/              # React-based terminal UI (Ink框架)
│   │   ├── src/services/        # 服务层
│   │   ├── src/auth/            # 身份认证
│   │   ├── src/config/          # 配置管理
│   │   └── gemini.tsx           # 主入口点
│   ├── core/                    # 核心功能库 (被其他包依赖)
│   │   ├── src/tools/           # 工具系统 (文件操作、shell、web等)
│   │   ├── src/core/            # 核心逻辑 (AI客户端、prompt管理)
│   │   ├── src/auth/            # 身份认证系统
│   │   ├── src/mcp/             # Model Context Protocol
│   │   └── src/code_assist/     # 代码辅助功能
│   ├── vscode-ui-plugin/        # 完整VSCode扩展
│   └── vscode-ide-companion/    # VSCode IDE集成伙伴(轻量级)
├── docs/                        # 全面文档系统
├── scripts/                     # 构建和工具脚本
└── 配置文件(package.json, tsconfig.json等)
```

**内部依赖关系：** cli → core；两个VSCode扩展独立运行
**技术栈：** TypeScript + Node.js + React(Ink) + esbuild + Vitest
**核心特点：** 单仓库架构、分层设计、丰富工具系统、MCP集成、双VSCode扩展策略
- 用户偏好：尽量不生成 .md 文件，除非用于 AI 自己的任务记忆，且用完后必须删除
- DeepV Code 项目是一个 monorepo，包含 4 个主要包：cli、core、vscode-ui-plugin、vscode-ide-companion，使用 Node.js 20+、TypeScript、React(Ink)、esbuild 等技术栈。
- 用户偏好：尽量不使用 sequentialthinking 工具
