# DeepV Code Skills 系统完整实现方案

**版本**: 2.0 Final
**日期**: 2025-01-17
**状态**: ✅ 准备实施

---

## 📋 目录

1. [执行摘要](#执行摘要)
2. [架构对比分析](#架构对比分析)
3. [核心概念与设计](#核心概念与设计)
4. [技术实现方案](#技术实现方案)
5. [完整 TODO 清单](#完整-todo-清单)
6. [性能与成本指标](#性能与成本指标)
7. [安全与质量保证](#安全与质量保证)
8. [参考资料](#参考资料)

---

## 执行摘要

### 项目目标

为 DeepV Code 实现与 Claude Code 对齐的 **Skills 系统**，使 AI 能够：
- 安装和管理知识库（Skills）
- 根据任务自动激活相关 Skills
- 执行脚本而不加载代码到 Context（节省 40%+ Token）
- 支持三层市场架构（Marketplace → Plugin → Skill）

### 关键成果

✅ **完整架构设计** - 基于 Claude Code 官方实现分析
✅ **双层存储方案** - 个人级 + Marketplace，无项目级
✅ **三级加载策略** - L1元数据(100 tokens) → L2指令(1500 tokens) → L3资源(按需)
✅ **命令系统设计** - `/plugin marketplace|plugin|info|list` 完整命令树
✅ **安全框架** - 5类威胁防护、allowed-tools 白名单、审计日志

### 核心优势

| 特性 | Claude Code | DVCode Skills | 说明 |
|-----|-------------|---------------|------|
| 三层市场 | ✅ | ✅ | Marketplace → Plugin → Skill |
| 命令前缀 | `/plugin` | `/skill` | 完全对齐 |
| 双层存储 | ✅ 个人+项目 | ✅ 个人+Marketplace | DVCode简化为2层 |
| 三级加载 | ✅ | ✅ | L1/L2/L3 渐进式加载 |
| 脚本执行 | ✅ 0 tokens | ✅ 0 tokens | 只输出进 context |
| Token优化 | 40%+ | 目标 40%+ | 智能缓存和按需加载 |
| 安全审计 | ✅ | ✅ | 5类威胁检测 |

---

## 架构对比分析

### DVCode 现有 Extension 系统 vs Claude Code Skills

#### 对比表格

| 维度 | DVCode Extension | Claude Code Skills | 差异分析 |
|-----|------------------|-------------------|---------|
| **概念模型** | Extension（扩展） | Marketplace → Plugin → Skill（三层） | Skills 更细粒度 |
| **存储架构** | ~/.deepv/extensions/ | ~/.claude/plugins/marketplaces/ | Skills 有 marketplace 层 |
| **配置文件** | gemini-extension.json | marketplace.json + SKILL.md | Skills 使用 YAML frontmatter |
| **上下文注入** | 完整加载 GEMINI.md | 三级渐进加载（L1/L2/L3） | Skills 更节省 Token |
| **命令前缀** | /extensions | /plugin | Skills 更简洁 |
| **市场支持** | ❌ 无 | ✅ Git仓库、本地目录 | Skills 原生支持市场 |
| **依赖管理** | npm (package.json) | dependencies (YAML) | 都支持依赖 |
| **MCP集成** | ✅ 原生支持 | ⚠️ 独立系统 | Extension 更强 MCP 集成 |
| **工具白名单** | excludeTools（黑名单） | allowed-tools（白名单） | Skills 更安全 |
| **脚本执行** | ❌ 不支持 | ✅ scripts/ 目录 | Skills 独有特性 |
| **自定义命令** | ✅ TOML格式 | ❌ 不支持 | Extension 独有特性 |

#### 架构图对比

**DVCode Extension 架构**:
```
Extension (单层结构)
├── gemini-extension.json    # 配置
├── GEMINI.md                 # 上下文（完整加载）
├── commands/*.toml           # 自定义命令（DVCode独有）
├── package.json              # npm依赖
└── dist/                     # MCP服务器
```

**Claude Code Skills 架构**:
```
Marketplace (三层结构)
├── .claude-plugin/marketplace.json
└── Plugins/
    └── Plugin/
        └── Skills/
            ├── SKILL.md          # L1元数据 + L2指令
            ├── scripts/          # L3资源（0 tokens）
            ├── references/       # L3参考文档
            └── assets/           # L3输出资产
```

### 关键差异分析

#### 1. **三层市场 vs 单层扩展**

**Claude Code Skills** 使用三层架构：
- **Marketplace**: GitHub仓库或本地目录，包含多个 Plugins
- **Plugin**: 逻辑组，包含多个相关 Skills
- **Skill**: 最小工作单位（SKILL.md + 可选资源）

**DVCode Extension** 使用单层架构：
- **Extension**: 直接安装和管理，没有 Marketplace 和 Plugin 层级

**影响**:
- Skills 支持官方市场和社区市场
- Skills 便于按主题组织（如 document-skills 包含 pdf/docx/pptx/xlsx）
- Extensions 更简单直接，但缺乏组织层次

#### 2. **渐进式加载 vs 完整加载**

**Claude Code Skills** 三级加载：
```
启动时: L1 元数据（100 tokens/skill）
触发时: L2 完整SKILL.md（1500 tokens/skill）
按需时: L3 参考文档和脚本执行（0-N tokens）
```

**DVCode Extension** 完整加载：
```
启动时: 完整加载 GEMINI.md（全部 tokens）
```

**Token成本对比**（10个扩展/技能，使用3个）:
- Skills: 1000 (L1) + 4500 (L2) = 5500 tokens
- Extensions: 10 × 2000 = 20000 tokens
- **节省**: 72%

#### 3. **脚本执行框架**

**Claude Code Skills** 特有：
```python
# scripts/fill_fillable_fields.py
# AI通过 run_shell_command 执行
python scripts/fill_fillable_fields.py input.pdf fields.json output.pdf

# 只有输出进入 context，脚本代码不加载（0 tokens）
```

**DVCode Extension** 不支持脚本执行。

**优势**:
- 可复用的确定性代码（如PDF处理、Excel公式计算）
- 大幅节省 Token（不加载代码，只加载结果）
- 避免 AI 重复生成相同代码

#### 4. **安全模型**

| 安全特性 | DVCode Extension | Claude Code Skills |
|---------|------------------|-------------------|
| 工具控制 | excludeTools（黑名单） | allowed-tools（白名单） |
| 默认策略 | 允许所有（除非明确禁止） | 禁止所有（除非明确允许） |
| 脚本审计 | ❌ 不适用 | ✅ 脚本安全检查 |
| 来源验证 | ⚠️ 基本验证 | ✅ 信任列表 + 审计日志 |

**Skills 更安全** - 白名单模式减少攻击面。

### DVCode Extension 独有优势

尽管 Skills 系统功能强大，DVCode Extension 也有独特优势：

#### 1. **原生 MCP 集成**

Extensions 可直接定义 MCP 服务器：
```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["${extensionPath}/dist/example.js"]
    }
  }
}
```

Skills 无此功能（MCP 是独立系统）。

#### 2. **自定义 Slash 命令**

Extensions 支持 TOML 格式自定义命令：
```toml
# commands/analyze.toml
description = "Analyze code performance"
prompt = """
Analyze {{args}} for performance issues.
Use profiling data: !{node --prof {{args}}}
"""
```

Skills 不支持自定义命令。

#### 3. **npm 生态集成**

Extensions 支持 package.json 和 postinstall 脚本：
```json
{
  "dependencies": {
    "typescript": "^5.0.0"
  },
  "scripts": {
    "postinstall": "npm run build"
  }
}
```

Skills 依赖管理较弱。

---

## 核心概念与设计

### 1. 三层市场架构

```
┌──────────────────────────────────────────────────────┐
│                   Marketplace                        │
│  (GitHub仓库 或 本地目录)                            │
│                                                      │
│  ├── .claude-plugin/marketplace.json                │
│  │                                                   │
│  ├── Plugin 1: document-skills                      │
│  │   ├── Skill: pdf/                               │
│  │   ├── Skill: docx/                              │
│  │   └── Skill: xlsx/                              │
│  │                                                   │
│  └── Plugin 2: example-skills                       │
│      ├── Skill: mcp-builder/                       │
│      └── Skill: skill-creator/                     │
└──────────────────────────────────────────────────────┘
```

**关系定义**:
- **Marketplace** (1) ← has many → (N) **Plugin**
- **Plugin** (1) ← has many → (N) **Skill**
- **Skill** (1) ← has many → (N) **Resource** (scripts/references/assets)

### 2. 双层存储架构

```
~/.deepv/
├── skills/                         # 个人级 Skills（用户手动创建）
│   └── my-custom-skill/
│       └── SKILL.md
│
└── marketplace/                    # Marketplace 管理的 Skills
    ├── known_marketplaces.json     # 已添加的市场列表
    ├── installed_plugins.json      # 已安装的插件
    └── repositories/
        ├── anthropic-agent-skills/  # 官方市场
        │   └── document-skills/
        │       └── pdf/
        │           └── SKILL.md
        └── my-company-skills/       # 企业市场
```

**不支持项目级的原因**:
1. ❌ 避免配置冲突（多项目间切换）
2. ❌ 简化权限管理（避免恶意项目注入）
3. ❌ 统一用户体验（跨项目一致）
4. ✅ 性能优化（启动时间 <300ms）

### 3. 三级加载策略

```
┌─────────────────────────────────────────────────────┐
│  Level 1: 元数据 (Metadata Only)                    │
│  ├─ 加载时机: 启动时                                │
│  ├─ 加载内容: name + description                    │
│  ├─ Token成本: ~100 tokens/skill                    │
│  └─ 用途: AI决策哪些Skills相关                      │
└─────────────────────────────────────────────────────┘
                     ↓ (AI触发)
┌─────────────────────────────────────────────────────┐
│  Level 2: 完整指令 (Full Instructions)              │
│  ├─ 加载时机: Skill被触发时                         │
│  ├─ 加载内容: YAML frontmatter + Markdown body      │
│  ├─ Token成本: ~1500 tokens/skill                   │
│  └─ 用途: 提供详细执行指令                          │
└─────────────────────────────────────────────────────┘
                     ↓ (按需)
┌─────────────────────────────────────────────────────┐
│  Level 3: 资源 (Resources On-Demand)                │
│  ├─ 脚本: 执行但不加载代码 (0 tokens)               │
│  ├─ 参考文档: 按需加载 (variable tokens)            │
│  ├─ 资产文件: 用于输出，不加载 (0 tokens)           │
│  └─ 用途: 提供工具和深度参考                        │
└─────────────────────────────────────────────────────┘
```

### 4. Skill 目录结构

**最小 Skill**:
```
my-skill/
└── SKILL.md                # 必需
```

**完整 Skill** (参考 pdf skill):
```
pdf/
├── SKILL.md                # 必需: YAML + Markdown
├── LICENSE.txt             # 可选: 许可证
├── scripts/                # 可选: 可执行脚本
│   ├── fill_fillable_fields.py
│   ├── extract_form_field_info.py
│   └── convert_pdf_to_images.py
├── references/             # 可选: L3参考文档
│   ├── reference.md
│   └── forms.md
└── assets/                 # 可选: 输出资产
    └── templates/
```

### 5. 核心数据格式

#### marketplace.json

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
      "description": "Collection of document processing suite...",
      "source": "./",
      "strict": false,
      "skills": [
        "./document-skills/pdf",
        "./document-skills/docx"
      ]
    }
  ]
}
```

#### SKILL.md

```markdown
---
name: pdf
description: Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.
license: Proprietary. LICENSE.txt has complete terms
allowed-tools:
  - run_shell_command
  - read_file
  - write_file
---

# PDF Processing Guide

## Overview

This guide covers essential PDF processing operations...

## Quick Start

\`\`\`python
from pypdf import PdfReader

reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")
\`\`\`
```

### 6. 命令系统设计

```bash
# Marketplace 管理
/plugin marketplace list                    # 列出已添加的市场
/plugin marketplace add <url>               # 添加市场（GitHub/本地）
/plugin marketplace update <name>           # 更新市场（git pull）
/plugin marketplace remove <name>           # 移除市场
/plugin marketplace browse                  # 浏览可用市场

# Plugin 管理
/plugin plugin list                         # 列出已安装插件
/plugin plugin install <plugin@marketplace> # 安装插件
/plugin plugin enable <pluginId>            # 启用插件
/plugin plugin disable <pluginId>           # 禁用插件
/plugin plugin info <pluginId>              # 查看插件详情
/plugin plugin uninstall <pluginId>         # 卸载插件

# Skill 查询
/plugin list                                # 列出已启用的技能
/plugin info <skillName>                    # 查看技能详情（包括脚本、参考文档）
```

**命令命名规则**:
- 完全对齐 Claude Code 的 `/skill` 前缀
- 使用 `marketplace`、`plugin` 子命令区分层级
- 简洁的动词: `list`、`add`、`install`、`enable`、`info`

---

## 技术实现方案

### 架构总览

```
┌─────────────────────────────────────────────────────┐
│            Claude AI 模型                            │
│   ┌─────────────────────────────────────────┐      │
│   │ Context Window                          │      │
│   │ ├─ L1: 所有Skill元数据 (~1000 tokens)  │      │
│   │ ├─ L2: 激活的Skills指令 (~4500 tokens)  │      │
│   │ └─ L3: 脚本输出结果 (~300 tokens)       │      │
│   └─────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────────┐
│      SkillContextInjector                           │
│      ├─ injectLevel1Metadata()                      │
│      ├─ injectLevel2Instructions()                  │
│      └─ executeLevel3Scripts()                      │
└─────────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────────┐
│      SkillLoader                                    │
│      ├─ scanPersonalSkills()                        │
│      ├─ scanMarketplaceSkills()                     │
│      ├─ parseSkillMd()                              │
│      └─ discoverResources()                         │
└─────────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────────┐
│      MarketplaceManager | PluginInstaller           │
│      ├─ addMarketplace()                            │
│      ├─ installPlugin()                             │
│      └─ enablePlugin()                              │
└─────────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────────┐
│      SkillSettingsManager                           │
│      ├─ known_marketplaces.json                     │
│      ├─ installed_plugins.json                      │
│      └─ settings.json (enabledPlugins)              │
└─────────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────────┐
│      文件系统                                        │
│      ├─ ~/.deepv/skills/                           │
│      └─ ~/.deepv/marketplace/repositories/         │
└─────────────────────────────────────────────────────┘
```

### 核心模块设计

#### 1. 类型定义 (types.ts)

```typescript
// 基础类型
export interface Marketplace {
  name: string;
  owner: { name: string; email: string };
  metadata: { description: string; version: string };
  plugins: Plugin[];
  // 运行时属性
  localPath?: string;
  source?: string;
  type?: 'git' | 'local';
}

export interface Plugin {
  name: string;
  description: string;
  source: string;
  strict: boolean;
  skills: string[];  // 相对路径列表
  // 运行时属性
  marketplace?: string;
  pluginId?: string;  // "plugin-name@marketplace-name"
}

export interface Skill {
  // YAML frontmatter
  name: string;
  description: string;
  license?: string;
  allowedTools?: string[];
  forbiddenTools?: string[];
  metadata?: Record<string, string>;

  // 运行时属性
  skillId: string;      // "skill-name@plugin-name@marketplace-name"
  skillPath: string;    // 绝对路径
  skillMdPath: string;
  markdownBody: string;

  // 资源
  scripts: string[];
  references: string[];
  assets: string[];

  // 加载状态
  level: 1 | 2 | 3;
}

// 配置类型
export interface KnownMarketplace {
  name: string;
  type: 'git' | 'local';
  source: string;
  clonedPath?: string;
  lastUpdated?: string;
}

export interface InstalledPlugin {
  pluginId: string;
  marketplace: string;
  pluginName: string;
  installedAt: string;
  enabled: boolean;
  skills: string[];
}

export interface SkillSettings {
  enabledPlugins: Record<string, boolean>;
  skillsSystem: {
    loadingStrategy: 'progressive' | 'eager';
    preloadMetadata: boolean;
    cacheMetadata: boolean;
    security: {
      enableAudit: boolean;
      trustLevel: 'strict' | 'moderate' | 'permissive';
      trustedSources: string[];
    };
  };
}
```

#### 2. 设置管理器 (SkillSettingsManager)

```typescript
export class SkillSettingsManager {
  private settingsPath: string;
  private marketplacesPath: string;
  private pluginsPath: string;

  constructor() {
    const deepvDir = path.join(os.homedir(), '.deepv');
    this.settingsPath = path.join(deepvDir, 'settings.json');
    this.marketplacesPath = path.join(deepvDir, 'marketplace', 'known_marketplaces.json');
    this.pluginsPath = path.join(deepvDir, 'marketplace', 'installed_plugins.json');
    this.ensureDirectories();
  }

  getSettings(): SkillSettings;
  saveSettings(settings: Partial<SkillSettings>): void;
  getKnownMarketplaces(): KnownMarketplace[];
  saveKnownMarketplaces(marketplaces: KnownMarketplace[]): void;
  getInstalledPlugins(): InstalledPlugin[];
  saveInstalledPlugins(plugins: InstalledPlugin[]): void;
}
```

#### 3. Marketplace 管理器 (MarketplaceManager)

```typescript
export class MarketplaceManager {
  async addMarketplace(source: string): Promise<Marketplace> {
    // Git URL: git clone
    // 本地路径: 直接加载
    // 验证 .claude-plugin/marketplace.json 存在
    // 保存到 known_marketplaces.json
  }

  async listMarketplaces(): Promise<Marketplace[]> {
    // 读取 known_marketplaces.json
    // 加载每个 marketplace.json
    // 返回 Marketplace 对象列表
  }

  async updateMarketplace(name: string): Promise<void> {
    // git pull（仅 git 类型）
    // 更新 lastUpdated 时间戳
  }

  async removeMarketplace(name: string): Promise<void> {
    // 删除克隆目录（git 类型）
    // 从 known_marketplaces.json 移除
    // 卸载相关 plugins
  }

  async getPlugins(marketplaceName: string): Promise<Plugin[]> {
    // 返回指定 Marketplace 的所有 Plugins
  }

  loadMarketplace(path: string): Marketplace {
    // 读取 .claude-plugin/marketplace.json
    // 解析 JSON
    // 解析相对路径为绝对路径
  }
}
```

#### 4. Plugin 安装器 (PluginInstaller)

```typescript
export class PluginInstaller {
  async installPlugin(
    marketplaceName: string,
    pluginName: string
  ): Promise<Plugin> {
    // 1. 查找 Marketplace
    // 2. 找到 Plugin 定义
    // 3. 验证所有 Skill 路径存在
    // 4. 添加到 installed_plugins.json
    // 5. 默认启用
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    // 从 installed_plugins.json 移除
    // 从 settings.json 移除 enabled 状态
  }

  async enablePlugin(pluginId: string): Promise<void> {
    // 更新 installed_plugins.json enabled = true
    // 更新 settings.json enabledPlugins
  }

  async disablePlugin(pluginId: string): Promise<void> {
    // 更新 installed_plugins.json enabled = false
    // 更新 settings.json enabledPlugins
  }

  async listInstalledPlugins(): Promise<InstalledPlugin[]> {
    // 读取 installed_plugins.json
  }

  async getPluginInfo(pluginId: string): Promise<Plugin & InstalledPlugin> {
    // 合并 Plugin 定义和安装信息
  }
}
```

#### 5. Skill 加载器 (SkillLoader)

```typescript
export class SkillLoader {
  async loadEnabledSkills(): Promise<Skill[]> {
    // 1. 扫描个人级 Skills (~/.deepv/skills/)
    // 2. 扫描 Marketplace Skills（仅已启用的 Plugins）
    // 3. 解析 SKILL.md
    // 4. 发现资源（scripts/references/assets）
    // 5. 返回 Skill 列表
  }

  async parseSkillFile(skillDir: string): Promise<Skill> {
    // 1. 读取 SKILL.md
    // 2. 提取 YAML frontmatter
    // 3. 验证必需字段
    // 4. 解析 Markdown body
    // 5. 发现资源文件
  }

  async discoverSkillsInDirectory(dir: string): Promise<Skill[]> {
    // 递归扫描目录
    // 查找包含 SKILL.md 的目录
    // 解析每个 Skill
  }

  private discoverResources(skillDir: string): {
    scripts: string[];
    references: string[];
    assets: string[];
  } {
    // 扫描 scripts/ → *.py, *.sh, *.js
    // 扫描 references/ → *.md
    // 扫描 assets/ → *
  }
}
```

#### 6. Context 注入器 (SkillContextInjector)

```typescript
export class SkillContextInjector {
  async injectSkillsContext(
    enabledPlugins: Record<string, boolean>
  ): Promise<string> {
    // Level 1: 注入所有 Skill 元数据
    const skills = await this.skillLoader.loadEnabledSkills();
    return this.formatLevel1Context(skills);
  }

  private formatLevel1Context(skills: Skill[]): string {
    // 格式化为 AI Context
    // 每个 Skill 包含: name, description, skillId
    // Markdown 列表格式
  }

  async loadSkillLevel2(skillId: string): Promise<string> {
    // 加载完整 SKILL.md（YAML + Markdown）
    // 返回格式化的 Context 字符串
  }

  async executeScript(
    skillId: string,
    scriptName: string,
    args: string[]
  ): Promise<string> {
    // 执行脚本
    // 捕获输出
    // 返回输出字符串（进入 Context）
  }

  async loadReference(
    skillId: string,
    referenceName: string
  ): Promise<string> {
    // 加载参考文档（Level 3）
    // 返回 Markdown 内容
  }
}
```

#### 7. 安全审计器 (SecurityAuditor)

```typescript
export class SecurityAuditor {
  async auditSkill(skill: Skill): Promise<SecurityReport> {
    // 1. 检查 allowed-tools 合法性
    // 2. 审计脚本内容（危险命令检测）
    // 3. 验证来源（是否在信任列表）
    // 4. 检查外部数据引用
    // 5. 生成审计报告
  }

  async validateSource(marketplace: Marketplace): Promise<boolean> {
    // 检查是否在 trustedSources 列表
  }

  async checkAllowedTools(
    skill: Skill,
    requestedTool: string
  ): Promise<boolean> {
    // 验证工具是否在 allowed-tools 白名单
    // 如果 allowed-tools 未定义，返回 true（允许所有）
  }

  logToolUsage(skill: Skill, tool: string, args: unknown[]): void {
    // 记录工具使用到审计日志
  }
}

interface SecurityReport {
  safe: boolean;
  threats: ThreatType[];
  recommendations: string[];
}

enum ThreatType {
  MALICIOUS_INSTRUCTIONS = 'malicious_instructions',
  MALICIOUS_SCRIPT = 'malicious_script',
  EXTERNAL_DATA_INJECTION = 'external_data_injection',
  DATA_LEAKAGE = 'data_leakage',
  TOOL_ABUSE = 'tool_abuse',
}
```

### 文件组织

```
packages/cli/src/
├── commands/plugin/
│   ├── marketplace.command.ts      # /skill marketplace 命令
│   ├── plugin.command.ts           # /skill plugin 命令
│   ├── list.command.ts             # /skill list 命令
│   ├── info.command.ts             # /skill info 命令
│   └── skills.tsx                  # 主入口 (Ink UI)
│
├── services/skill/
│   ├── types.ts                    # TypeScript 类型定义
│   ├── marketplace-manager.ts      # Marketplace CRUD
│   ├── plugin-installer.ts         # Plugin 安装管理
│   ├── skill-loader.ts             # Skill 扫描解析
│   ├── skill-context-injector.ts   # AI Context 注入
│   ├── security-auditor.ts         # 安全审计
│   └── validators.ts               # YAML/结构验证
│
├── config/
│   ├── skill-settings-manager.ts   # 设置持久化
│   └── marketplace-init.ts         # 目录初始化
│
└── utils/
    └── skill-utils.ts              # 工具函数
```

### 数据流

```
用户输入命令
  ↓
CommandParser (yargs)
  ↓
SkillCommand Router
  ├─ /skill marketplace → MarketplaceManager
  ├─ /skill plugin → PluginInstaller
  └─ /skill list/info → SkillLoader
  ↓
更新配置文件
  ├─ known_marketplaces.json
  ├─ installed_plugins.json
  └─ settings.json
  ↓
（如需）重新加载 Skills
  ↓
SkillContextInjector.injectSkillsContext()
  ↓
更新 AI Context
  ↓
AI 可使用新 Skills
```

---

## 完整 TODO 清单

### Phase 1: 核心基础（Week 1）

#### 1.1 类型定义和数据结构 ⏱️ 1天
- [ ] 创建 `packages/cli/src/services/skill/types.ts`
  - [ ] 定义 `Marketplace` 接口
  - [ ] 定义 `Plugin` 接口
  - [ ] 定义 `Skill` 接口
  - [ ] 定义 `SkillYamlFrontmatter` 接口
  - [ ] 定义 `KnownMarketplace` 接口
  - [ ] 定义 `InstalledPlugin` 接口
  - [ ] 定义 `SkillSettings` 接口
- [ ] 定义错误类型
  - [ ] `SkillError` 基类
  - [ ] `ValidationError` 验证错误
  - [ ] `MarketplaceError` 市场错误
- [ ] **验收**: 编译无错误、类型完整、注释清晰

#### 1.2 配置管理系统 ⏱️ 2天
- [ ] 创建 `packages/cli/src/config/skill-settings-manager.ts`
  - [ ] 实现 `getSettings()` - 读取设置
  - [ ] 实现 `saveSettings()` - 保存设置
  - [ ] 实现 `getKnownMarketplaces()` - 读取市场列表
  - [ ] 实现 `saveKnownMarketplaces()` - 保存市场列表
  - [ ] 实现 `getInstalledPlugins()` - 读取插件列表
  - [ ] 实现 `saveInstalledPlugins()` - 保存插件列表
  - [ ] 实现 `ensureDirectories()` - 初始化目录结构
- [ ] 编写单元测试
  - [ ] 测试设置读写
  - [ ] 测试市场列表管理
  - [ ] 测试插件列表管理
  - [ ] 测试并发安全
- [ ] **验收**: 测试覆盖率 >90%、并发安全

#### 1.3 Marketplace 管理器 ⏱️ 3天
- [ ] 创建 `packages/cli/src/services/skill/marketplace-manager.ts`
  - [ ] 实现 `addMarketplace()` - 添加市场（Git/本地）
    - [ ] Git 仓库克隆逻辑
    - [ ] 本地目录验证逻辑
  - [ ] 实现 `listMarketplaces()` - 列出市场
  - [ ] 实现 `updateMarketplace()` - 更新市场（git pull）
  - [ ] 实现 `removeMarketplace()` - 删除市场
  - [ ] 实现 `getPlugins()` - 获取市场的插件列表
  - [ ] 实现 `loadMarketplace()` - 加载 marketplace.json
- [ ] 编写单元测试
  - [ ] 测试 Git 克隆成功
  - [ ] 测试本地市场加载
  - [ ] 测试 marketplace.json 解析
  - [ ] 测试更新和删除
- [ ] **验收**: GitHub 克隆成功、结构识别正确

### Phase 2: Plugin 和命令系统（Week 2）

#### 2.1 Plugin 安装器 ⏱️ 3天
- [ ] 创建 `packages/cli/src/services/skill/plugin-installer.ts`
  - [ ] 实现 `installPlugin()` - 安装插件
    - [ ] 验证 Plugin 结构
    - [ ] 验证所有 Skill 路径存在
    - [ ] 更新 installed_plugins.json
  - [ ] 实现 `uninstallPlugin()` - 卸载插件
  - [ ] 实现 `enablePlugin()` - 启用插件
  - [ ] 实现 `disablePlugin()` - 禁用插件
  - [ ] 实现 `listInstalledPlugins()` - 列出已安装插件
  - [ ] 实现 `getPluginInfo()` - 获取插件详情
- [ ] 依赖检查（YAML frontmatter dependencies）
- [ ] 编写单元测试
  - [ ] 测试安装流程
  - [ ] 测试启用/禁用
  - [ ] 测试卸载
- [ ] **验收**: 安装流程完整、配置正确更新

#### 2.2 用户命令系统 ⏱️ 4天
- [ ] 创建 `packages/cli/src/commands/plugin/marketplace.command.ts`
  - [ ] `/plugin marketplace list`
  - [ ] `/plugin marketplace add <url>`
  - [ ] `/plugin marketplace update <name>`
  - [ ] `/plugin marketplace remove <name>`
  - [ ] `/plugin marketplace browse` (可选)
- [ ] 创建 `packages/cli/src/commands/plugin/plugin.command.ts`
  - [ ] `/plugin plugin list`
  - [ ] `/plugin plugin install <plugin@marketplace>`
  - [ ] `/plugin plugin enable <pluginId>`
  - [ ] `/plugin plugin disable <pluginId>`
  - [ ] `/plugin plugin info <pluginId>`
  - [ ] `/plugin plugin uninstall <pluginId>`
- [ ] 创建 `packages/cli/src/commands/plugin/list.command.ts`
  - [ ] `/plugin list` - 列出已启用的 Skills
- [ ] 创建 `packages/cli/src/commands/plugin/info.command.ts`
  - [ ] `/plugin info <skillName>` - 显示 Skill 详情
- [ ] 创建 `packages/cli/src/commands/plugin/skills.tsx`
  - [ ] Ink UI 主界面
  - [ ] 命令路由
  - [ ] 进度显示
  - [ ] 错误提示
- [ ] 编写集成测试
  - [ ] 测试所有命令可用
  - [ ] 测试 UI 显示正确
  - [ ] 测试错误处理
- [ ] **验收**: 所有命令可用、UI 清晰、错误处理完整

### Phase 3: Skill 加载和 AI 集成（Week 3）

#### 3.1 Skill 加载器 ⏱️ 3天
- [ ] 创建 `packages/cli/src/services/skill/skill-loader.ts`
  - [ ] 实现 `loadEnabledSkills()` - 加载已启用的 Skills
    - [ ] 扫描个人级 Skills (~/.deepv/skills/)
    - [ ] 扫描 Marketplace Skills（已启用的 Plugins）
  - [ ] 实现 `parseSkillFile()` - 解析 SKILL.md
    - [ ] 提取 YAML frontmatter (使用 gray-matter)
    - [ ] 验证必需字段（name, description）
    - [ ] 解析 Markdown body
  - [ ] 实现 `discoverSkillsInDirectory()` - 递归发现 Skills
  - [ ] 实现 `discoverResources()` - 发现资源文件
    - [ ] scripts/ 目录扫描
    - [ ] references/ 目录扫描
    - [ ] assets/ 目录扫描
- [ ] 创建 `packages/cli/src/services/skill/validators.ts`
  - [ ] Skill 名称规则验证
  - [ ] YAML schema 验证
  - [ ] 目录结构验证
- [ ] 元数据缓存机制
  - [ ] 缓存文件设计 (~/.deepv/cache/skill-metadata.json)
  - [ ] 文件哈希检测（MD5）
  - [ ] 缓存失效策略
- [ ] 编写单元测试
  - [ ] 测试 SKILL.md 解析
  - [ ] 测试资源发现
  - [ ] 测试缓存机制
- [ ] **验收**: 解析正确、性能 <500ms

#### 3.2 Context 注入系统 ⏱️ 3天
- [ ] 创建 `packages/cli/src/services/skill/skill-context-injector.ts`
  - [ ] 实现 `injectSkillsContext()` - 三级加载主入口
  - [ ] 实现 Level 1: `formatLevel1Context()` - 元数据注入
    - [ ] 格式化为 Markdown 列表
    - [ ] 包含 name, description, skillId
    - [ ] Token 统计
  - [ ] 实现 Level 2: `loadSkillLevel2()` - 完整 SKILL.md 加载
    - [ ] 触发条件检测
    - [ ] 加载 YAML + Markdown
    - [ ] Token 统计
  - [ ] 实现 Level 3: `loadReference()` - 参考文档按需加载
    - [ ] 按需加载策略
    - [ ] Token 统计
  - [ ] 实现 Level 3: `executeScript()` - 脚本执行
    - [ ] Bash 脚本执行
    - [ ] Python 脚本执行
    - [ ] 只输出进 context（脚本代码 0 token）
    - [ ] 超时控制
    - [ ] 错误处理
- [ ] 集成到 AI 模型 Context
  - [ ] 修改 `packages/core/src/config/config.ts`
  - [ ] 在启动时注入 Level 1 metadata
  - [ ] 提供 Level 2/3 按需加载接口
- [ ] 编写单元测试
  - [ ] 测试 Context 格式正确
  - [ ] 测试 Token 优化（目标 40%+）
  - [ ] 测试脚本执行
- [ ] **验收**: Context 格式正确、Token 优化 40%+

### Phase 4: 安全和优化（Week 4）

#### 4.1 安全审计系统 ⏱️ 3天
- [ ] 创建 `packages/cli/src/services/skill/security-auditor.ts`
  - [ ] 实现 `auditSkill()` - 综合审计
  - [ ] 5 类威胁检测
    - [ ] 恶意 Skill 指令检测
    - [ ] 恶意脚本检测（关键词匹配）
    - [ ] 外部数据注入检测
    - [ ] 数据泄露风险检测
    - [ ] 工具滥用检测
  - [ ] 实现 `validateSource()` - 来源验证
    - [ ] 检查是否在信任列表
  - [ ] 实现 `checkAllowedTools()` - 工具白名单检查
  - [ ] 实现 `logToolUsage()` - 审计日志记录
    - [ ] 日志文件路径: ~/.deepv/logs/skill-audit.log
    - [ ] 日志格式: JSON Lines
- [ ] 编写单元测试
  - [ ] 测试威胁检测有效性
  - [ ] 测试白名单机制
  - [ ] 测试审计日志记录
- [ ] **验收**: 威胁检测有效、无已知漏洞

#### 4.2 性能优化 ⏱️ 2天
- [ ] Token 追踪和分析工具
  - [ ] Level 1/2/3 Token 统计
  - [ ] 对比优化前后
- [ ] 缓存策略优化
  - [ ] 元数据缓存命中率统计
  - [ ] 缓存大小优化
- [ ] 并行加载
  - [ ] 个人 Skills 和 Marketplace Skills 并行扫描
- [ ] 启动时间优化
  - [ ] 目标: <300ms
  - [ ] 性能分析工具
- [ ] **验收**: 性能指标达成

#### 4.3 调试工具 ⏱️ 1天
- [ ] `--debug-skills` 命令行参数
  - [ ] 显示加载过程
  - [ ] 显示 Token 成本
  - [ ] 显示缓存状态
- [ ] Token 成本可视化
  - [ ] 表格输出
  - [ ] 对比优化效果
- [ ] 加载过程追踪
  - [ ] 时间戳记录
  - [ ] 阶段耗时统计
- [ ] **验收**: 调试信息完整

### Phase 5: 国际化和高级功能（Week 5）

#### 5.1 国际化支持 ⏱️ 2天
- [ ] i18n 框架集成
  - [ ] 选择 i18n 库（如 i18next）
  - [ ] 配置语言文件结构
- [ ] 英文和中文翻译
  - [ ] 所有用户可见文案
  - [ ] 错误提示
  - [ ] 命令描述
- [ ] **验收**: 双语支持完整

#### 5.2 依赖管理 ⏱️ 2天
- [ ] YAML dependencies 解析
  - [ ] 解析 dependencies 字段
  - [ ] 支持版本范围
- [ ] 依赖检查和提示
  - [ ] 安装时检查依赖
  - [ ] 提示缺失依赖
- [ ] **验收**: 依赖验证正确

### Phase 6: 测试、文档和发布（Week 6）

#### 6.1 完整测试 ⏱️ 3天
- [ ] 单元测试
  - [ ] 每个模块测试覆盖率 >90%
  - [ ] 边界条件测试
  - [ ] 错误处理测试
- [ ] 集成测试
  - [ ] Marketplace → Plugin → Skill 完整流程
  - [ ] 命令系统集成测试
  - [ ] AI Context 集成测试
- [ ] E2E 测试
  - [ ] 真实 Marketplace 测试（anthropic-agent-skills）
  - [ ] 完整用户流程测试
- [ ] **验收**: 所有测试通过

#### 6.2 文档完善 ⏱️ 2天
- [ ] API 文档
  - [ ] 所有公共类和方法
  - [ ] TypeDoc 生成
- [ ] 用户指南
  - [ ] 快速开始
  - [ ] 命令参考
  - [ ] 最佳实践
- [ ] 开发者文档
  - [ ] 创建 Skill 指南
  - [ ] 创建 Marketplace 指南
- [ ] 故障排查手册
  - [ ] 常见问题 FAQ
  - [ ] 调试步骤
- [ ] **验收**: 文档完整清晰

#### 6.3 发布准备 ⏱️ 1天
- [ ] 发行说明
  - [ ] 新功能列表
  - [ ] 已知问题
  - [ ] 升级指南
- [ ] 版本号管理
  - [ ] 遵循语义化版本
- [ ] 社区反馈处理
  - [ ] GitHub Issue 模板
  - [ ] 贡献指南
- [ ] **验收**: 发布检查清单完成

---

## 性能与成本指标

### Token 成本模型

#### 场景 1: 安装 10 个 Skills，不使用

```
Level 1 元数据: 10 skills × 100 tokens = 1,000 tokens
Level 2: 未触发 = 0 tokens
Level 3: 未触发 = 0 tokens
────────────────────────────────────────────────
总计: 1,000 tokens

vs. 不使用 Skills（每次生成代码）: 0 tokens (启动时)
但每次任务需要生成代码: ~2,000 tokens/task
```

#### 场景 2: 使用 3 个 Skills（无脚本）

```
Level 1 元数据: 10 × 100 = 1,000 tokens
Level 2 SKILL.md: 3 × 1,500 = 4,500 tokens
Level 3: 未使用 = 0 tokens
────────────────────────────────────────────────
总计: 5,500 tokens

vs. 动态生成等效代码:
  - 3 个任务 × 2,000 tokens = 6,000+ tokens
节省: ~8%
```

#### 场景 3: 使用 2 个 Skills + 脚本执行

```
Level 1 元数据: 10 × 100 = 1,000 tokens
Level 2 SKILL.md: 2 × 1,500 = 3,000 tokens
Level 3 脚本代码: 0 tokens (不加载，只执行)
Level 3 脚本输出: ~300 tokens
────────────────────────────────────────────────
总计: 4,300 tokens

vs. 动态生成等效代码:
  - AI 生成脚本代码: ~1,500 tokens/script
  - 2 个脚本 = 3,000 tokens
  - 总计: 6,000+ tokens
节省: ~28%
```

#### 场景 4: 复杂任务（5个 Skills，其中 3 个有脚本）

```
Level 1 元数据: 10 × 100 = 1,000 tokens
Level 2 SKILL.md: 5 × 1,500 = 7,500 tokens
Level 3 脚本执行: 3 × 0 = 0 tokens (代码不加载)
Level 3 脚本输出: 3 × 300 = 900 tokens
────────────────────────────────────────────────
总计: 9,400 tokens

vs. 动态生成:
  - 5 个任务指令生成: 5 × 2,000 = 10,000 tokens
  - 3 个脚本生成: 3 × 1,500 = 4,500 tokens
  - 总计: 14,500+ tokens
节省: 35%
```

### 启动时间目标

```
冷启动（首次运行，无缓存）:
├─ 加载个人 Skills: +50-100ms
├─ 加载 Marketplace 元数据: +100-200ms
├─ 缓存生成: +50ms
└─ 总计: <300ms

热启动（有缓存）:
├─ 读取缓存: +20ms
├─ 验证缓存有效性: +10ms
└─ 总计: <50ms

目标: 冷启动 <300ms, 热启动 <50ms
```

### 内存占用

```
Level 1 元数据（10 Skills）: ~50KB
Level 2 完整 SKILL.md（3 Skills）: ~150KB
缓存文件: ~100KB
────────────────────────────────────────
总计: ~300KB

可忽略不计，对系统无影响
```

---

## 安全与质量保证

### 安全框架

#### 五类威胁和防护

| 威胁类型 | 描述 | 防护措施 |
|---------|------|---------|
| **恶意 Skill 指令** | SKILL.md 包含误导性或恶意指令 | 代码审查、来源验证、审计日志 |
| **恶意脚本** | scripts/ 中的脚本执行危险操作 | 脚本审计、权限检查、超时控制、沙箱 |
| **外部数据注入** | Skill 引用外部恶意数据 | 来源限制、内容验证、仅 HTTPS |
| **数据泄露** | Skill 尝试泄露用户数据 | 网络限制、allowed-tools 白名单、审计 |
| **工具滥用** | 滥用允许的工具进行攻击 | allowed-tools 白名单、沙箱、日志 |

#### 安全配置

```json
{
  "skillsSystem": {
    "security": {
      "enableAudit": true,              // 启用审计日志
      "trustLevel": "strict",           // strict | moderate | permissive
      "trustedSources": [
        "anthropic",                    // 官方市场
        "github.com/my-company"         // 企业市场
      ],
      "requireReview": true,            // 安装前需要审查
      "allowUntrustedSources": false,   // 禁止不受信任的来源
      "maxScriptTimeout": 30000,        // 脚本超时（ms）
      "sandboxScripts": true            // 沙箱执行脚本
    }
  }
}
```

#### 审计日志格式

```json
{
  "timestamp": "2025-01-17T10:30:00Z",
  "event": "TOOL_USAGE",
  "skillId": "pdf@document-skills@anthropic-agent-skills",
  "tool": "run_shell_command",
  "args": ["python", "scripts/fill_fillable_fields.py", "input.pdf"],
  "result": "success",
  "user": "username"
}
```

### 质量保证标准

#### 每个 Phase 必须满足

- [ ] ✅ 代码编译无错误
- [ ] ✅ 单元测试覆盖率 >90%
- [ ] ✅ 无 ESLint 警告
- [ ] ✅ 代码审查通过
- [ ] ✅ 功能验收通过

#### 发布标准

- [ ] ✅ 功能完整（所有 Phase 完成）
- [ ] ✅ 性能达标（启动 <300ms，Token 优化 40%+）
- [ ] ✅ 安全认证（无已知漏洞）
- [ ] ✅ 测试覆盖 >90%
- [ ] ✅ 文档完善（用户指南、API 文档）

---

## 参考资料

### 官方 Marketplace 参考

**路径**: `/Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills`

**核心文件**:
- `.claude-plugin/marketplace.json` - Marketplace 配置
- `document-skills/pdf/SKILL.md` - Skill 示例
- `document-skills/pdf/scripts/` - 脚本示例

### 测试命令

```bash
# 查看 Marketplace 结构
ls -la /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills

# 查看 Marketplace 配置
cat /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/.claude-plugin/marketplace.json

# 查看 Skill 示例
cat /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/document-skills/pdf/SKILL.md

# 查看脚本
ls -la /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/document-skills/pdf/scripts/
```

### 相关文档

- `SKILLS-DEVELOPMENT-PLAN.md` - 原始开发计划
- `SKILLS-REFERENCE-STRUCTURE.md` - 官方结构参考
- `SKILLS-STORAGE-ARCHITECTURE.md` - 存储架构说明

---

## 附录

### A. 关键决策记录

| 决策点 | 方案 | 原因 |
|--------|------|------|
| 存储结构 | 双层（个人 + Marketplace） | 避免项目级配置冲突、简化管理 |
| 市场配置 | .claude-plugin/marketplace.json | 与官方格式对齐 |
| Skill 格式 | SKILL.md + YAML frontmatter | 与官方格式对齐 |
| 加载策略 | 三级渐进式 | 最小化 Token 成本 |
| Context 注入 | 启动时 L1 + 按需 L2/L3 | 平衡启动速度和功能 |
| 脚本执行 | 只输出进 context | 节省 50%+ Token |
| 安全策略 | allowed-tools 白名单 | 默认拒绝，更安全 |
| 命令前缀 | /skill | 与 Claude Code 对齐 |

### B. 开发准备

```bash
# 创建目录结构
cd /Users/yangbiao/cmcm.com/deepv-code/DeepVcodeClient
mkdir -p packages/cli/src/commands/plugin
mkdir -p packages/cli/src/services/skill
mkdir -p packages/cli/src/config

# 创建初始文件
touch packages/cli/src/services/skill/types.ts
touch packages/cli/src/config/skill-settings-manager.ts
touch packages/cli/src/services/skill/marketplace-manager.ts
```

### C. 验收测试清单

#### 功能验收
- [ ] 添加 GitHub Marketplace 成功
- [ ] 添加本地 Marketplace 成功
- [ ] 安装 Plugin 成功
- [ ] 启用/禁用 Plugin 成功
- [ ] Skill 正确加载到 AI Context
- [ ] 脚本执行成功且只输出进 context
- [ ] 所有命令正常工作

#### 性能验收
- [ ] 冷启动 <300ms
- [ ] 热启动 <50ms
- [ ] Token 优化 >40%
- [ ] 内存占用 <500KB

#### 安全验收
- [ ] allowed-tools 白名单生效
- [ ] 恶意脚本检测有效
- [ ] 审计日志正确记录
- [ ] 不受信任来源被阻止

---

**文档版本**: 2.0 Final
**最后更新**: 2025-01-17
**状态**: ✅ 准备实施
**预计工期**: 6 周
**团队规模**: 2-3 名开发者
