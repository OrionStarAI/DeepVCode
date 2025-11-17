# Skills 参考结构说明

基于官方 Anthropic Agent Skills Marketplace 的实际结构分析。

## 参考路径

**本地已安装的官方 Marketplace**:
```
/Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills
```

---

## Marketplace 结构

### 顶层目录

```
anthropic-agent-skills/
├── .claude-plugin/              # Marketplace 配置目录
│   └── marketplace.json         # 核心配置文件
├── .git/                        # Git 仓库
├── .gitignore
├── README.md                    # 说明文档
├── agent_skills_spec.md         # Skill 规范
├── THIRD_PARTY_NOTICES.md       # 第三方声明
├── template-skill/              # Skill 模板
│
├── document-skills/             # Plugin 1（文档处理套件）
│   ├── pdf/                     # Skill: PDF 处理
│   ├── docx/                    # Skill: Word 文档
│   ├── pptx/                    # Skill: PowerPoint
│   └── xlsx/                    # Skill: Excel
│
└── algorithmic-art/             # Plugin 2（单独 Skill）
└── artifacts-builder/           # Plugin 3
└── brand-guidelines/            # Plugin 4
└── canvas-design/               # Plugin 5
└── frontend-design/             # Plugin 6
└── internal-comms/              # Plugin 7
└── mcp-builder/                 # Plugin 8
└── skill-creator/               # Plugin 9
└── slack-gif-creator/           # Plugin 10
└── theme-factory/               # Plugin 11
└── webapp-testing/              # Plugin 12

总计:
- 1 个 Marketplace
- 2 个明确的 Plugins (document-skills, example-skills)
- 15 个 Skills
```

---

## 配置文件结构

### marketplace.json

**位置**: `.claude-plugin/marketplace.json`

```json
{
  "name": "anthropic-agent-skills",
  "owner": {
    "name": "Keith Lazuka",
    "email": "klazuka@anthropic.com"
  },
  "metadata": {
    "description": "Anthropic example skills",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "document-skills",
      "description": "Collection of document processing suite including Excel, Word, PowerPoint, and PDF capabilities",
      "source": "./",
      "strict": false,
      "skills": [
        "./document-skills/xlsx",
        "./document-skills/docx",
        "./document-skills/pptx",
        "./document-skills/pdf"
      ]
    },
    {
      "name": "example-skills",
      "description": "Collection of example skills demonstrating various capabilities...",
      "source": "./",
      "strict": false,
      "skills": [
        "./algorithmic-art",
        "./artifacts-builder",
        "./brand-guidelines",
        "./canvas-design",
        "./frontend-design",
        "./internal-comms",
        "./mcp-builder",
        "./skill-creator",
        "./slack-gif-creator",
        "./theme-factory",
        "./webapp-testing"
      ]
    }
  ]
}
```

**关键字段**:
- `name`: Marketplace 名称
- `owner`: 所有者信息
- `metadata.version`: 版本号
- `plugins[]`: Plugin 列表
- `plugins[].skills[]`: Skill 路径列表（相对路径）

---

## Plugin 结构

### 类型 1: 多 Skill 组合（document-skills）

```
document-skills/
├── pdf/
│   ├── SKILL.md              # 必需
│   ├── reference.md          # 可选：参考文档
│   ├── forms.md              # 可选：额外文档
│   ├── LICENSE.txt           # 可选：许可证
│   └── scripts/              # 可选：脚本目录
│       ├── fill_fillable_fields.py
│       ├── extract_form_field_info.py
│       ├── check_fillable_fields.py
│       ├── convert_pdf_to_images.py
│       ├── create_validation_image.py
│       ├── check_bounding_boxes.py
│       └── fill_pdf_form_with_annotations.py
│
├── docx/
│   ├── SKILL.md
│   ├── reference.md
│   └── scripts/
│
├── pptx/
│   └── SKILL.md
│
└── xlsx/
    └── SKILL.md
```

### 类型 2: 单一 Skill（algorithmic-art）

```
algorithmic-art/
├── SKILL.md                  # 必需
├── reference.md              # 可选
└── scripts/                  # 可选
```

---

## Skill 文件结构

### SKILL.md 格式

**PDF Skill 示例**:

```markdown
---
name: pdf
description: Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Processing Guide

## Overview

This guide covers essential PDF processing operations using Python libraries...

## Quick Start

\`\`\`python
from pypdf import PdfReader, PdfWriter

# Read a PDF
reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")
\`\`\`

## Python Libraries

### pypdf - Basic Operations

...
```

**必需字段** (YAML frontmatter):
- `name`: Skill 名称（小写字母、数字、连字符）
- `description`: 详细描述，影响 Claude 的使用决策

**可选字段**:
- `license`: 许可证说明
- `allowed-tools`: 允许使用的工具列表
- `forbidden-tools`: 禁止使用的工具列表
- `dependencies`: 依赖项（如 Python 版本）

### 脚本目录

**位置**: `scripts/`

**示例** (pdf/scripts/):
```
scripts/
├── fill_fillable_fields.py           # 填充 PDF 表单
├── extract_form_field_info.py        # 提取表单字段信息
├── check_fillable_fields.py          # 检查可填充字段
├── convert_pdf_to_images.py          # PDF 转图片
├── create_validation_image.py        # 创建验证图片
├── check_bounding_boxes.py           # 检查边界框
├── check_bounding_boxes_test.py      # 测试
└── fill_pdf_form_with_annotations.py # 带注释填充
```

**脚本特点**:
- 语言：主要是 Python
- 命名：描述性命名（snake_case）
- 用途：提供具体的 PDF 操作功能
- 执行：由 Claude 通过 bash 调用

### 参考文档

**位置**: 与 SKILL.md 同级

**示例** (pdf/):
- `reference.md`: 完整 API 参考和高级示例
- `forms.md`: PDF 表单处理专题
- `LICENSE.txt`: 许可证文本

**用途**:
- Level 3 加载：按需引用
- 不计入初始 token
- 提供详细技术文档

---

## 实际测试命令

### 查看 Marketplace 结构

```bash
ls -la /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills
```

### 查看 Marketplace 配置

```bash
cat /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/.claude-plugin/marketplace.json
```

### 查看 Plugin 结构

```bash
ls -la /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/document-skills/
```

### 查看 Skill 结构

```bash
ls -la /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/document-skills/pdf/
```

### 查看 SKILL.md

```bash
cat /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/document-skills/pdf/SKILL.md
```

### 查看脚本

```bash
ls -la /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/document-skills/pdf/scripts/
```

---

## 关键发现

### 1. Plugin 可以是目录或单独的 Skill

- **document-skills**: 包含多个 Skill 的目录
- **algorithmic-art**: 本身就是一个 Skill

### 2. marketplace.json 是核心配置

- 定义了所有 Plugins
- 使用相对路径引用 Skills
- `strict: false` 表示非严格模式

### 3. SKILL.md 格式标准

- YAML frontmatter 必需
- name 和 description 是核心字段
- Markdown body 包含详细指令

### 4. 脚本执行模式

- 脚本存放在 `scripts/` 目录
- 主要使用 Python
- 通过 bash 调用执行
- 只有输出进入 context

### 5. 文档分层

- SKILL.md: 核心指令（Level 2）
- reference.md: 详细参考（Level 3）
- forms.md: 专题文档（Level 3）

---

## 测试用例设计建议

基于此结构，可设计以下测试用例：

1. **Marketplace 发现测试**
   - 扫描目录找到 `.claude-plugin/marketplace.json`
   - 解析 JSON 文件
   - 提取 plugins 列表

2. **Plugin 识别测试**
   - 根据 `plugins[].skills[]` 路径
   - 判断是目录型还是单 Skill 型
   - 验证每个 Skill 路径存在 SKILL.md

3. **SKILL.md 解析测试**
   - 提取 YAML frontmatter
   - 验证必需字段（name, description）
   - 解析 Markdown body

4. **脚本发现测试**
   - 扫描 `scripts/` 目录
   - 识别可执行脚本
   - 测试脚本调用

5. **参考文档加载测试**
   - 发现额外 .md 文件
   - 按需加载机制
   - Token 计数验证

---

**文档版本**: 1.0
**最后更新**: 2025-01-17
**数据来源**: `/Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills`
