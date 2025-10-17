# 🚀 DeepV Code CLI 使用说明

> ✨ **DeepV Code** 是一款由 **AI大模型驱动** 的 **代码生成 Agent 终端应用**。
我们致力于打造开放、智能的代码助手，帮助开发者更高效地构建未来。
🧡 本项目为 **开源项目**，欢迎社区贡献你的奇思妙想！

---

## 🧩 开发说明

下面是你在开发过程中常用的命令指南👇

依赖 NodeJS 20+ 环境。

| 🏷️ 命令 | 🧠 说明 |
|:---:|:---|
| 🧰 `npm i` | **首次安装依赖**。安装项目所需的全部依赖包。 |
| 🏗️ `npm run build` | **日常构建**。打包编译项目源码（在每次改动后执行）。 |
| 🧪 `npm run dev` | **构建后测试**。用于本地运行或验证构建成果是否正常。 |
| 📦 `npm run pack:prod` | **生产环境打包**。生成适用于发布或交付的最终版本.tgz包。 |
| 🧹 `npm run clean` | **清理缓存与构建产物**。⚠️ 执行后需重新运行 `npm i` 以恢复依赖和重新构建。 |

---

## 🔌 VSCode 扩展说明

DeepV Code 项目包含两个 VSCode 扩展，位于 `packages/` 目录下：

### 📡 vscode-ide-companion（CLI 的 VSCode 伴侣）

**作用**：让 VSCode 与内置终端内运行的 CLI 连接，感知当前打开的文件和选中的代码片段。

**构建与打包**：
```bash
cd packages/vscode-ide-companion
npm i                    # 首次安装依赖
npm run build            # 构建扩展
npm run package          # 打包为 .vsix 文件
```

### 🎨 vscode-ui-plugin（图形化 UI 扩展）

**作用**：DeepV Code 的图形化 UI 扩展 for VSCode，提供可视化的操作界面。

**构建与打包**：
```bash
cd packages/vscode-ui-plugin
npm i                    # 首次安装依赖
cd webview
npm i && npm run build   # 构建 webview（仅首次需要）
cd ..
npm run build            # 构建扩展
npm run package          # 打包为 .vsix 文件
```

> 💡 **提示**：打包后的 `.vsix` 文件可以在 VSCode 中通过"从 VSIX 安装..."选项进行安装。

---

## 💡 CLI 开发建议

- 🔄 **每次修改代码后执行一次 `npm run build`**，确保你的更改正确生效, 然后再运行 `npm run dev`启动。
- 📁 **如发现打包异常，可先执行 `npm run clean` 再重新安装依赖**。
- 🧩 **欢迎提 Merge Request 共建让 DeepV Code ，让我们的 AI Native 组织越来越强大。
- 🧩 **使用 dvcode 自我开发，效果最佳，因为项目内有DEEPV.md为模型约定了开发规范。由 dvcode的斜杠命令 /init 生成，可定义重新执行。推荐用Haiku4.5模型生成。
---

## 🤝 一起构建未来

💬 **DeepV Code** 相信：
> “AI 不只是工具，更是每位开发者的伙伴。”

欢迎通过分享你的建议或 Bug，
让我们一起让 AI 代码生成更聪明、更可靠！💪🤖

---

🪄 **Happy Coding with DeepV Code CLI!** 💻✨
