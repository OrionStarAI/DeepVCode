## DeepV Code Added Memories
- DeepV Code 项目结构：
- `cli`: 命令行界面，与 `core` 交互。
- `core`: 核心功能，处理 AI 模型通信、文件解析、代码仓库操作。
- `vscode-ide-companion`: VS Code 伴侣扩展，提供工作区访问。
- `vscode-ui-plugin`: VS Code UI 插件，提供可视化 AI 编码辅助功能。
- AI 应该始终使用 `npm run build` 来测试代码是否能通过编译。CLI 交互式测试交给人类验证。
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

## 扩展系统 Windows 兼容性检查（2025-11-05）
**修改内容：**
- 改进扩展安装反馈，在安装完成后显示详细扩展信息
- 放宽上下文文件验证（从阻止错误改为友好警告）
- 显示上下文文件时使用 `path.basename()` 只显示文件名而非完整路径

**Windows 兼容性验证结果：✅ PASS**
1. **路径处理**：所有路径操作使用 `path.join()`、`path.resolve()` 和 `os.homedir()`，已验证跨平台兼容
2. **Home 目录**：使用 `os.homedir()` 代替硬编码路径
3. **临时目录**：使用 `os.tmpdir()` 代替 `/tmp`
4. **npm 命令**：使用 `execSync('npm install', { cwd: path })` 支持所有平台
5. **文件显示**：使用 `path.basename()` 处理不同平台的路径分隔符（\ vs /）
6. **文件系统操作**：所有 fs 操作都支持跨平台，包括 `mkdirSync`、`rmSync` 等

**关键代码位置：**
- `packages/cli/src/commands/extensions/install.ts`：显示完整扩展信息
- `packages/cli/src/config/extension-manager.ts`：`toOutputString()` 使用 `path.basename()`
