# DeepV Code Skills 系统 - 快速开始指南

## 🎯 什么是 Skills？

Skills 是为 AI 提供的专业知识和工作流指导。通过安装 Skills，你可以让 AI 具备处理特定任务的专业能力，比如：

- 📄 PDF 文档处理
- 📊 Excel 数据分析
- 🎨 算法艺术生成
- 📝 Word 文档编辑
- 更多...

## 📦 三级架构

```
Marketplace (市场)
    ↓
Plugin (插件包)
    ↓
Skill (技能)
```

- **Marketplace**: GitHub 仓库或本地目录，包含多个 Plugins
- **Plugin**: 逻辑组，包含多个相关的 Skills
- **Skill**: 最小工作单位，一个具体的专业能力

## 🚀 5分钟快速上手

### 1. 添加官方 Marketplace

```bash
/skill marketplace add https://github.com/anthropics/anthropic-agent-skills.git
```

这会克隆 Anthropic 官方的 Skills 仓库到你的本地。

### 2. 浏览可用的 Plugins

```bash
/skill marketplace browse anthropic-agent-skills
```

你会看到类似这样的输出：

```
Found 2 plugin(s) in anthropic-agent-skills:

🔌 document-skills ❌
   ID: anthropic-agent-skills:document-skills
   Description: Collection of document processing suite...
   Skills: 4

🔌 example-skills ❌
   ID: anthropic-agent-skills:example-skills
   Description: Example skills for learning...
   Skills: 11
```

### 3. 安装一个 Plugin

```bash
/skill plugin install anthropic-agent-skills document-skills
```

输出：

```
✅ Successfully installed: document-skills
   ID: anthropic-agent-skills:document-skills
   Skills: 4
   Status: Enabled
```

### 4. 查看已安装的 Skills

```bash
/skill list
```

你会看到所有可用的 Skills：

```
Available skills (4):

📦 anthropic-agent-skills

  🔌 document-skills

    ⚡ pdf
       Comprehensive PDF manipulation toolkit...
       Tools: read_file, write_file, shell

    ⚡ docx
       Word document processing...

    ⚡ xlsx
       Excel spreadsheet operations...

    ⚡ pptx
       PowerPoint presentation handling...
```

### 5. 使用 Skills

现在，当你和 AI 对话时，AI 会自动知道这些 Skills 的存在，并在合适的时候使用它们！

例如，你可以说：

```
帮我从这个 PDF 文件中提取表格数据
```

AI 会自动使用 `pdf` Skill 来处理！

## 📚 常用命令

### Marketplace 管理

```bash
# 列出所有 Marketplaces
/skill marketplace list

# 添加 Git Marketplace
/skill marketplace add <git-url>

# 添加本地 Marketplace
/skill marketplace add /path/to/marketplace

# 更新 Marketplace (git pull)
/skill marketplace update <marketplace-name>

# 删除 Marketplace
/skill marketplace remove <marketplace-name>

# 浏览 Marketplace 中的 Plugins
/skill marketplace browse <marketplace-name>
```

### Plugin 管理

```bash
# 列出已安装的 Plugins
/skill plugin list

# 列出某个 Marketplace 中的所有 Plugins
/skill plugin list <marketplace-name>

# 安装 Plugin
/skill plugin install <marketplace> <plugin-name>

# 卸载 Plugin
/skill plugin uninstall <plugin-id>

# 启用 Plugin
/skill plugin enable <plugin-id>

# 禁用 Plugin
/skill plugin disable <plugin-id>

# 查看 Plugin 详情
/skill plugin info <plugin-id>
```

### Skill 查看

```bash
# 列出所有 Skills
/skill list

# 按 Marketplace 过滤
/skill list --marketplace anthropic-agent-skills

# 按 Plugin 过滤
/skill list --plugin anthropic-agent-skills:document-skills

# 搜索 Skills
/skill list --search pdf

# 查看 Skill 详细信息
/skill info <skill-id>

# 查看统计信息
/skill stats
```

## 🔍 进阶用法

### 添加自定义 Marketplace

如果你有自己的 Skills 仓库：

```bash
# Git 仓库
/skill marketplace add https://github.com/your-org/your-skills.git

# 本地目录
/skill marketplace add /path/to/your/skills --name my-skills
```

### 批量管理

```bash
# 安装多个 Plugins
/skill plugin install anthropic-agent-skills document-skills
/skill plugin install anthropic-agent-skills example-skills

# 禁用不需要的 Plugin
/skill plugin disable anthropic-agent-skills:example-skills
```

### 查看具体 Skill 的完整信息

```bash
/skill info anthropic-agent-skills:document-skills:pdf
```

这会显示：
- Skill 描述
- 允许使用的工具
- 完整的指令内容
- 可用的脚本
- 参考文档

## 💡 使用技巧

### 1. Skills 是自动的

安装 Skills 后，你**不需要**手动告诉 AI 使用某个 Skill。AI 会根据任务描述自动选择合适的 Skill。

### 2. Skills 提供专业知识

每个 Skill 包含：
- **专业指导**：如何处理特定类型的任务
- **最佳实践**：行业标准和推荐方法
- **工具脚本**：自动化处理工具
- **参考文档**：详细的技术文档

### 3. Token 优化

Skills 系统采用三级加载策略：
- **Level 1 (启动时)**: 仅元数据 (~100 tokens/skill)
- **Level 2 (使用时)**: 完整指令 (~1500 tokens/skill)
- **Level 3 (需要时)**: 脚本执行 (0 tokens，仅输出)

这样可以节省 40-50% 的 Token 成本！

### 4. 定期更新

定期更新 Marketplaces 以获取最新的 Skills：

```bash
/skill marketplace update anthropic-agent-skills
```

## 📂 存储位置

所有 Skills 数据存储在：

```
~/.deepv/
├── skills/
│   ├── settings.json           # 配置文件
│   └── installed_plugins.json  # 已安装的 Plugins
└── marketplace/
    └── anthropic-agent-skills/ # Marketplace 仓库
```

## 🔧 故障排查

### 问题：AI 没有使用我安装的 Skill

**解决方案**：
1. 确认 Plugin 已启用：`/skill plugin list`
2. 重启 DeepV Code 以重新加载 Skills 上下文
3. 检查 Skill 描述是否匹配你的任务

### 问题：无法添加 Git Marketplace

**解决方案**：
1. 确认 Git 已安装：`git --version`
2. 检查网络连接
3. 尝试使用本地 Marketplace

### 问题：Plugin 安装失败

**解决方案**：
1. 检查 Marketplace 是否已添加：`/skill marketplace list`
2. 确认 Plugin 名称正确：`/skill marketplace browse <marketplace>`
3. 查看错误信息

## 📖 更多资源

- **开发文档**: `SKILLS-DEVELOPMENT-PLAN.md`
- **进度报告**: `SKILLS-PROGRESS-REPORT.md`
- **架构文档**: 查看代码注释

## 🎓 示例工作流

### 处理 PDF 文档

```bash
# 1. 安装 document-skills
/skill plugin install anthropic-agent-skills document-skills

# 2. 使用 AI 处理 PDF
"帮我从 report.pdf 中提取所有表格数据，并保存为 CSV 文件"
```

### 数据分析

```bash
# 1. 查看可用的数据处理 Skills
/skill list --search data

# 2. 安装相关 Plugin
/skill plugin install <marketplace> <plugin-name>

# 3. 让 AI 分析数据
"分析这个 Excel 文件，找出销售趋势"
```

### 文档转换

```bash
# 1. 确认已安装 document-skills
/skill plugin list

# 2. 转换文档
"把这个 Word 文档转换成 PDF 格式"
```

## ✨ 下一步

恭喜！你现在已经掌握了 DeepV Code Skills 系统的基本使用。

尝试：
1. 浏览更多 Marketplaces
2. 安装其他有用的 Plugins
3. 创建你自己的 Skills

开始享受 AI 增强的专业能力吧！🚀
