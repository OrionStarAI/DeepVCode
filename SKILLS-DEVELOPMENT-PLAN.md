# DeepV Code Skills 系统开发计划

## 项目概述

为 DeepV Code 实现与 Claude Code 对齐的 Skills 系统，使用户能够安装和管理 AI Skills（知识库和工作流指导）。

### 核心概念

```
Marketplace → Plugin → Skill
    ↓          ↓        ↓
  仓库源    逻辑组    最小单元
```

- **Marketplace**: GitHub 仓库或本地目录，包含多个 Plugins
- **Plugin**: 逻辑组，包含多个相关 Skills
- **Skill**: 最小工作单位（SKILL.md + 可选资源和脚本）

### 关键特性

- **双层存储**: 个人级（~/.deepv/skills/）+ Marketplace（~/.deepv/marketplace/）
- **三级加载**: Level 1 元数据（~100 tokens）→ Level 2 指令（~1500 tokens）→ Level 3 资源（按需）
- **模型自主调用**: AI 根据 description 自动使用 Skill
- **安全控制**: allowed-tools 白名单、来源验证、审计日志

> **注意**: 不支持项目级 Skills（.deepv/skills/），所有 Skills 统一在用户个人目录管理

---

## 开发 TODO 清单

### Phase 1: 核心基础

#### 1.1 类型定义和数据结构
- [ ] 创建 `types.ts` - 定义 Marketplace/Plugin/Skill 类型
- [ ] 定义错误类型（SkillError, ValidationError, MarketplaceError）
- [ ] 定义配置接口（Settings, InstalledPluginsRecord）
- [ ] 验收: 编译无错误、类型完整、注释清晰

#### 1.2 配置管理系统
- [ ] 实现 `SettingsManager` - 读写 settings.json
- [ ] 支持 enabledPlugins 管理
- [ ] 实现配置备份机制
- [ ] 初始化脚本 - 创建目录结构和默认文件
- [ ] 验收: 测试覆盖率 >90%、并发安全

#### 1.3 Marketplace 管理器
- [ ] 实现 `MarketplaceManager` 核心类
- [ ] Git 仓库克隆和更新
- [ ] 发现 Marketplace 结构（扫描目录、解析 marketplace.json）
- [ ] CRUD 操作（添加/删除/更新 Marketplace）
- [ ] 验收: GitHub 克隆成功、结构识别正确

### Phase 2: Plugin 和命令系统

#### 2.1 Plugin 安装器
- [ ] 实现 `PluginInstaller` - 安装/卸载/启用/禁用
- [ ] Plugin 结构验证
- [ ] 更新 installed_plugins.json
- [ ] 依赖检查（YAML frontmatter）
- [ ] 验收: 安装流程完整、配置正确更新

#### 2.2 用户命令系统
- [ ] `/skill marketplace` 命令 - list/add/browse/update
- [ ] `/skill plugin` 命令 - list/install/enable/disable/info/uninstall
- [ ] `/skill` 命令 - list/info
- [ ] Ink UI 交互界面
- [ ] 错误提示和进度显示
- [ ] 验收: 所有命令可用、UI 清晰、错误处理完整

### Phase 3: Skill 加载和 AI 集成

#### 3.1 Skill 加载器
- [ ] 实现 `SkillLoader` - 扫描和解析 Skill
- [ ] SKILL.md 解析（YAML frontmatter + Markdown body）
- [ ] 双层存储扫描（个人级 ~/.deepv/skills/ + Marketplace）
- [ ] Skill 验证（名称规则、必需字段）
- [ ] 元数据缓存机制
- [ ] 验收: 解析正确、性能 <500ms

#### 3.2 Context 注入系统
- [ ] 实现 `SkillContextInjector` - 三级加载
- [ ] Level 1: 元数据注入（启动时）
- [ ] Level 2: 完整 SKILL.md 加载（触发时）
- [ ] Level 3: 资源和脚本按需加载
- [ ] 集成到 AI 模型 context
- [ ] 验收: Context 格式正确、Token 优化 40%+

#### 3.3 脚本执行框架
- [ ] Bash 脚本执行（cat/python/node）
- [ ] 只输出进入 context（脚本代码 0 token）
- [ ] 超时和资源限制
- [ ] 错误处理和日志
- [ ] 验收: 脚本正常执行、输出正确

### Phase 4: 安全和优化

#### 4.1 安全审计系统
- [ ] 实现 `SecurityAuditor` - 5 类威胁检测
- [ ] 来源验证（信任列表）
- [ ] allowed-tools 控制
- [ ] 脚本安全审计
- [ ] 审计日志记录
- [ ] 验收: 威胁检测有效、无已知漏洞

#### 4.2 性能优化
- [ ] Token 追踪和分析工具
- [ ] 缓存策略优化
- [ ] 并行加载
- [ ] 启动时间优化（<500ms）
- [ ] 验收: 性能指标达成

#### 4.3 调试工具
- [ ] `--debug-skills` 命令行参数
- [ ] Token 成本可视化
- [ ] 加载过程追踪
- [ ] 验收: 调试信息完整

### Phase 5: 国际化和高级功能

#### 5.1 国际化支持
- [ ] i18n 框架集成
- [ ] 英文和中文翻译
- [ ] 错误提示国际化
- [ ] 验收: 双语支持完整

#### 5.2 依赖管理
- [ ] YAML dependencies 解析
- [ ] 依赖检查和提示
- [ ] 验收: 依赖验证正确

### Phase 6: 测试、文档和发布

#### 6.1 完整测试
- [ ] 单元测试（>90% 覆盖率）
- [ ] 集成测试（模块交互）
- [ ] E2E 测试（完整流程）
- [ ] 验收: 所有测试通过

#### 6.2 文档完善
- [ ] API 文档
- [ ] 用户指南
- [ ] 最佳实践文档
- [ ] 故障排查手册
- [ ] 验收: 文档完整清晰

#### 6.3 发布准备
- [ ] 发行说明
- [ ] 版本号管理
- [ ] 社区反馈处理
- [ ] 验收: 发布检查清单完成

---

## 核心实现方案

### 架构设计

```
┌─────────────────────────────────────────┐
│         Claude AI 模型                   │
│  三级加载:                               │
│  L1: 元数据 (100 tokens/skill)          │
│  L2: 指令 (1500 tokens/skill)           │
│  L3: 资源 (按需, 0 tokens)              │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│    SkillContextInjector                 │
│    └─ 管理三级加载策略                  │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│    SkillLoader                          │
│    └─ 扫描、解析、验证、缓存            │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│    MarketplaceManager / PluginInstaller │
│    └─ CRUD 操作、Git 管理               │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│    SettingsManager                      │
│    └─ 配置持久化                        │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│    文件系统                              │
│    ├─ ~/.deepv/skills/ (个人级)        │
│    └─ ~/.deepv/marketplace/ (市场)     │
└─────────────────────────────────────────┘
```

### 关键技术决策

| 决策点 | 方案 | 原因 | 参考示例 |
|--------|------|------|---------|
| 存储结构 | 双层（个人级 + Marketplace） | 简化管理，避免项目级配置冲突 | ~/.claude/plugins/marketplaces/ |
| Marketplace 配置 | .claude-plugin/marketplace.json | 与官方格式对齐 | anthropic-agent-skills/.claude-plugin/ |
| Skill 格式 | SKILL.md + YAML frontmatter | 与官方格式对齐 | document-skills/pdf/SKILL.md |
| 加载策略 | 三级渐进式加载 | 最小化 Token 成本 | - |
| Context 注入 | 启动时加载元数据 + 按需加载指令 | 平衡启动速度和功能 | - |
| 脚本执行 | Bash 调用，只输出进 context | 节省 50%+ Token | pdf/scripts/*.py |
| 安全策略 | allowed-tools 白名单 + 审计 | 防止恶意 Skill | - |
| 配置格式 | JSON | 易于读写和维护 | marketplace.json |

### 数据流

```
用户执行命令
  ↓
命令处理器解析
  ↓
调用对应 Manager
  ↓
更新配置文件（settings.json/installed_plugins.json）
  ↓
（如需）重新加载 Skills
  ↓
更新 AI Context
  ↓
AI 可使用新 Skills
```

---

## 质量保证

**每个 Phase 必须满足**:
- [ ] 代码编译无错误
- [ ] 单元测试覆盖率 >90%
- [ ] 无 ESLint 警告
- [ ] 代码审查通过
- [ ] 功能验收通过

**发布标准**:
- [ ] 功能完整（所有 Phase 完成）
- [ ] 性能达标（启动 <300ms，Token 优化 40%+）
- [ ] 安全认证（无已知漏洞）
- [ ] 测试覆盖 >90%
- [ ] 文档完善（用户指南、API 文档）

---

## 关键代码模块

### 文件组织

```
packages/cli/src/
├── commands/
│   └── skill/
│       ├── marketplace.command.ts
│       ├── plugin.command.ts
│       ├── list.command.ts
│       ├── info.command.ts
│       └── skills.tsx                (主入口)
│
├── services/
│   └── skill/
│       ├── types.ts
│       ├── marketplace-manager.ts
│       ├── plugin-installer.ts
│       ├── skill-loader.ts
│       ├── skill-context-injector.ts
│       ├── security-auditor.ts
│       └── validators.ts
│
├── config/
│   ├── settings-manager.ts
│   └── marketplace-init.ts
│
└── utils/
    └── skill-utils.ts
```

### 核心类职责

```typescript
// MarketplaceManager - Marketplace CRUD 和 Git 操作
class MarketplaceManager {
  async addMarketplace(url: string): Promise<Marketplace>
  async listMarketplaces(): Promise<Marketplace[]>
  async updateMarketplace(name: string): Promise<void>
  async removeMarketplace(name: string): Promise<void>
  async getPlugins(marketplace: string): Promise<Plugin[]>
}

// PluginInstaller - Plugin 生命周期管理
class PluginInstaller {
  async installPlugin(marketplace: string, name: string): Promise<Plugin>
  async uninstallPlugin(pluginId: string): Promise<void>
  async enablePlugin(pluginId: string): Promise<void>
  async disablePlugin(pluginId: string): Promise<void>
}

// SkillLoader - Skill 发现和解析
class SkillLoader {
  async loadEnabledSkills(): Promise<Skill[]>
  async parseSkillFile(skillDir: string): Promise<Skill>
  async discoverSkillsInDirectory(dir: string): Promise<Skill[]>
}

// SkillContextInjector - AI Context 管理
class SkillContextInjector {
  async injectSkillsContext(enabledPlugins: Record<string, boolean>): Promise<string>
  async formatContextString(skills: Skill[]): string
  async loadSkillLevel2(skillId: string): Promise<string> // 按需加载完整 SKILL.md
}

// SecurityAuditor - 安全审计
class SecurityAuditor {
  async auditSkill(skill: Skill): Promise<SecurityReport>
  async validateSource(marketplace: Marketplace): Promise<boolean>
  async checkAllowedTools(skill: Skill): Promise<void>
}
```

---

## 性能和成本指标

### Token 成本模型

```
场景 1: 安装 10 个 Skills，不使用
  └─ 成本: ~1000 tokens (仅元数据)

场景 2: 使用 3 个 Skills (无脚本)
  ├─ 元数据: ~300 tokens
  ├─ SKILL.md: ~4500 tokens (3 × 1500)
  └─ 总计: ~4800 tokens

场景 3: 使用 2 个 Skills + 脚本执行
  ├─ 元数据: ~200 tokens
  ├─ SKILL.md: ~3000 tokens
  ├─ 脚本代码: 0 tokens (不加载)
  ├─ 脚本输出: ~300 tokens
  └─ 总计: ~3500 tokens

vs 动态生成等效代码: ~6000+ tokens
节省: 40-50%
```

### 启动时间目标

```
冷启动（首次）:
  ├─ 加载个人 Skills: +50-100ms
  └─ 加载 Marketplace 元数据: +100-200ms
  总计: <300ms

热启动（缓存后）:
  └─ <50ms
```

---

## 安全框架

### 五类威胁和防护

```
1. 恶意 Skill 指令
   防护: 代码审查、来源验证、审计日志

2. 恶意脚本
   防护: 脚本审计、权限检查、超时控制

3. 外部数据注入
   防护: 来源限制、内容验证、HTTPS

4. 数据泄露
   防护: 网络限制、allowed-tools、审计

5. 工具滥用
   防护: allowed-tools 白名单、沙箱、日志
```

### 配置示例

```json
{
  "skillsSystem": {
    "security": {
      "enableAudit": true,
      "trustLevel": "strict",
      "trustedSources": ["anthropic", "internal"],
      "requireReview": true
    }
  }
}
```

---

## 参考 Marketplace

### 官方示例

可参考已安装的 Anthropic 官方 Marketplace 进行开发和测试：

**路径**: `/Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills`

**目录结构**:
```
anthropic-agent-skills/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace 配置
├── document-skills/               # Plugin 1
│   ├── pdf/                       # Skill
│   │   ├── SKILL.md              # 核心指令
│   │   ├── reference.md          # 参考文档
│   │   ├── forms.md              # 额外文档
│   │   ├── scripts/              # 执行脚本
│   │   │   ├── fill_fillable_fields.py
│   │   │   ├── extract_form_field_info.py
│   │   │   └── ...
│   │   └── LICENSE.txt
│   ├── docx/
│   ├── pptx/
│   └── xlsx/
├── example-skills/                # Plugin 2
│   ├── algorithmic-art/
│   ├── skill-creator/
│   └── ...
└── README.md

总计:
- 2 个 Plugins (document-skills, example-skills)
- 15 个 Skills
```

**Marketplace 配置示例** (`.claude-plugin/marketplace.json`):
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
        "./document-skills/xlsx",
        "./document-skills/docx",
        "./document-skills/pptx",
        "./document-skills/pdf"
      ]
    }
  ]
}
```

**Skill 示例** (pdf SKILL.md frontmatter):
```yaml
---
name: pdf
description: Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.
license: Proprietary. LICENSE.txt has complete terms
---
```

**关键特征**:
1. **SKILL.md 必需**: 每个 Skill 目录必须包含
2. **YAML frontmatter**: name, description 必需字段
3. **scripts/ 目录**: 可选，包含 Python 脚本
4. **references/**: 可选，额外的参考文档（如 reference.md, forms.md）
5. **License**: 可选，LICENSE.txt

### 测试命令

使用此 Marketplace 进行测试：

```bash
# 测试 Marketplace 发现
ls -la /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills

# 测试 Plugin 扫描
ls -la /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/document-skills/

# 测试 Skill 解析
cat /Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/document-skills/pdf/SKILL.md
```

---

## 快速开始

### 核心概念理解

- Marketplace/Plugin/Skill 关系
- 双层存储结构（个人级 + Marketplace）
- 三级加载策略

### 开发准备

```bash
cd /Users/yangbiao/cmcm.com/deepv-code/DeepVcodeClient
mkdir -p packages/cli/src/services/skill
touch packages/cli/src/services/skill/types.ts
```

### 验证

```bash
npm run type-check
npm run build
```

---

## 验收标准总览

| Phase | 功能 | 质量 | 文档 |
|-------|------|------|------|
| 1 | 核心类型、配置管理、Marketplace 管理 | 测试 >90% | API 注释 |
| 2 | Plugin 安装、所有命令 | 测试 >90% | 命令说明 |
| 3 | Skill 加载、Context 注入、脚本执行 | 测试 >90%、性能达标 | 集成文档 |
| 4 | 安全审计、性能优化、调试工具 | 无漏洞、性能达标 | 安全指南 |
| 5 | i18n、依赖管理 | 测试 >85% | 用户指南 |
| 6 | 完整测试、文档、发布 | E2E 100% | 完整文档 |

---

## 关键成功因素

- ✅ 严格遵循三级加载架构
- ✅ Token 成本优化（目标 40%+）
- ✅ 安全审计系统完整
- ✅ 性能目标达成（启动 <300ms）
- ✅ 测试覆盖率高（>90%）
- ✅ 双层存储架构（个人级 + Marketplace，无项目级）

---

**文档版本**: 1.1
**最后更新**: 2025-01-17
**状态**: ✅ 准备就绪，可开始开发
