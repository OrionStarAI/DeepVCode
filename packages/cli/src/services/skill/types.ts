/**
 * DeepV Code Skills System - Type Definitions
 *
 * Core types for Marketplace, Plugin, Skill management system
 * Aligned with Claude Code's Skills architecture
 */

/**
 * 三级层次结构:
 * Marketplace (仓库源) → Plugin (逻辑组) → Skill (最小单元)
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Marketplace - GitHub 仓库或本地目录，包含多个 Plugins
 */
export interface Marketplace {
  /** Marketplace 唯一标识符（来源于仓库名或目录名） */
  id: string;
  /** Marketplace 显示名称 */
  name: string;
  /** Marketplace 描述 */
  description?: string;
  /** Marketplace 版本 */
  version?: string;
  /** 所有者信息 */
  owner?: {
    name: string;
    email?: string;
  };
  /** 来源类型 */
  source: MarketplaceSource;
  /** Git 仓库 URL (如果是 Git 来源) */
  url?: string;
  /** 本地路径 (如果是本地来源) */
  path?: string;
  /** 包含的 Plugins */
  plugins: Plugin[];
  /** Marketplace 配置文件路径 (.claude-plugin/marketplace.json) */
  configPath?: string;
  /** 最后更新时间 */
  lastUpdated?: Date;
  /** 是否为官方 Marketplace */
  official?: boolean;
}

/**
 * Marketplace 来源类型
 */
export enum MarketplaceSource {
  /** GitHub 仓库 */
  GIT = 'git',
  /** 本地目录 */
  LOCAL = 'local',
}

/**
 * Skill 类型
 */
export enum SkillType {
  SKILL = 'skill',
  COMMAND = 'command',
  AGENT = 'agent',
}

/**
 * 技能来源类型
 */
export enum SkillSource {
  MARKETPLACE = 'marketplace',  // 市场技能（现有）
  USER_GLOBAL = 'user_global',    // 用户全局技能（新增）
  USER_PROJECT = 'user_project',  // 用户项目技能（新增）
}

/**
 * Plugin Item - 插件包含的具体项（Skill/Command/Agent）
 */
export interface PluginItem {
  path: string;
  type: SkillType;
}

/**
 * Plugin - 逻辑组，包含多个相关 Skills
 */
export interface Plugin {
  /** Plugin 唯一标识符 (marketplace:plugin-name) */
  id: string;
  /** Plugin 显示名称 */
  name: string;
  /** Plugin 描述 */
  description: string;
  /** 所属 Marketplace ID */
  marketplaceId: string;
  /** Plugin 来源路径（相对于 Marketplace 根目录） */
  source: string | PluginSource;
  /** 是否为严格模式 */
  strict: boolean;
  /** 包含的 Skills 路径列表 (Legacy) */
  skillPaths: string[];
  /** 包含的 Items 列表 (New) */
  items?: PluginItem[];
  /** 解析后的 Skill 列表 */
  skills?: Skill[];
  /** 安装状态 */
  installed: boolean;
  /** 启用状态 */
  enabled: boolean;
  /** 安装时间 */
  installedAt?: Date;
  /** 版本 */
  version?: string;
  /** 作者信息 */
  author?: { name: string; email?: string };
  /** 主页 */
  homepage?: string;
  /** 仓库地址 */
  repository?: string;
  /** 许可证 */
  license?: string;
  /** 关键字 */
  keywords?: string[];
  /** 分类 */
  category?: string;
  /** 标签 */
  tags?: string[];
}

/**
 * Plugin 来源定义
 * 支持官方文档中的所有 source 格式
 */
export type PluginSource =
  | string  // 相对路径: "./plugin" 或简写: "github:owner/repo"
  | {
      source: 'github';
      repo: string;       // owner/repo
      ref?: string;       // 分支、tag 或 commit hash
      path?: string;      // 仓库内的子目录路径
    }
  | {
      source: 'git';
      url: string;        // Git 仓库 URL
      ref?: string;       // 分支、tag 或 commit hash
      path?: string;      // 仓库内的子目录路径
    }
  | {
      source: 'url';
      url: string;        // 直接 URL (保留用于未来支持 tarball)
    };

/**
 * 技能位置信息
 */
export interface SkillLocation {
  /** 技能来源类型 */
  type: SkillSource;
  /** 技能实际文件路径 */
  path: string;
  /** 根目录路径 */
  rootPath: string;
  /** 相对路径 */
  relativePath: string;
}

/**
 * Skill - 最小工作单位 (SKILL.md + 可选资源和脚本)
 * 支持自定义技能和位置追踪
 */
export interface Skill {
  /** Skill 唯一标识符 */
  id: string;
  /** Skill 类型 */
  type?: SkillType;
  /** Skill 名称 (来自 YAML frontmatter 的 name) */
  name: string;
  /** Skill 描述 (来自 YAML frontmatter 的 description) */
  description: string;
  /** 所属 Plugin ID */
  pluginId: string;
  /** 所属 Marketplace ID */
  marketplaceId: string;
  /** Skill 目录路径 */
  path: string;
  /** SKILL.md 文件路径 */
  skillFilePath: string;
  /** YAML frontmatter 元数据 */
  metadata: SkillMetadata;
  /** Markdown 内容（完整指令） */
  content?: string;
  /** 脚本目录路径 */
  scriptsPath?: string;
  /** 脚本列表 */
  scripts?: SkillScript[];
  /** 引用文档路径列表 */
  references?: string[];
  /** License 文件路径 */
  licensePath?: string;
  /** 启用状态 */
  enabled: boolean;
  /** 加载级别（用于三级加载） */
  loadLevel: SkillLoadLevel;
  /** 位置信息 */
  location?: SkillLocation;
  /** 是否为内置技能 */
  isBuiltIn: boolean;
  /** 是否为自定义技能 */
  isCustom: boolean;
}

/**
 * Skill 元数据（YAML frontmatter）
 */
export interface SkillMetadata {
  /** Skill 名称（必需） */
  name: string;
  /** Skill 描述（必需） */
  description: string;
  /** License 信息 */
  license?: string;
  /** 允许使用的工具白名单 */
  allowedTools?: string[];
  /** 依赖的其他 Skills */
  dependencies?: string[];
  /** 自定义属性 */
  [key: string]: unknown;
}

/**
 * Skill 加载级别（三级加载策略）
 */
export enum SkillLoadLevel {
  /** Level 1: 仅元数据 (~100 tokens/skill) - 启动时加载 */
  METADATA = 'metadata',
  /** Level 2: 完整 SKILL.md (~1500 tokens/skill) - 触发时加载 */
  FULL = 'full',
  /** Level 3: 资源和脚本 (0 tokens) - 按需加载 */
  RESOURCES = 'resources',
}

/**
 * Skill 脚本信息
 */
export interface SkillScript {
  /** 脚本名称 */
  name: string;
  /** 脚本路径 */
  path: string;
  /** 脚本类型 */
  type: ScriptType;
  /** 脚本描述 */
  description?: string;
}

/**
 * 脚本类型
 */
export enum ScriptType {
  PYTHON = 'python',
  BASH = 'bash',
  NODE = 'node',
  UNKNOWN = 'unknown',
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Skills 系统配置（存储在 ~/.deepv/skills/settings.json）
 */
export interface SkillsSettings {
  /** 启用的 Plugins 记录 {pluginId: enabled} */
  enabledPlugins: Record<string, boolean>;
  /** Marketplace 配置 */
  marketplaces: MarketplaceConfig[];
  /** 安全配置 */
  security?: SecurityConfig;
  /** 性能配置 */
  performance?: PerformanceConfig;
  /** 最后更新时间 */
  lastUpdated?: string;
}

/**
 * Marketplace 配置
 */
export interface MarketplaceConfig {
  /** Marketplace ID */
  id: string;
  /** Marketplace 名称 */
  name: string;
  /** 来源类型 */
  source: MarketplaceSource;
  /** Git URL 或本地路径 */
  location: string;
  /** 是否启用 */
  enabled: boolean;
  /** 添加时间 */
  addedAt: string;
}

/**
 * 安全配置
 */
export interface SecurityConfig {
  /** 是否启用审计 */
  enableAudit: boolean;
  /** 信任级别 */
  trustLevel: 'strict' | 'moderate' | 'permissive';
  /** 信任的来源列表 */
  trustedSources: string[];
  /** 是否需要审查 */
  requireReview: boolean;
}

/**
 * 性能配置
 */
export interface PerformanceConfig {
  /** 是否启用缓存 */
  enableCache: boolean;
  /** 缓存 TTL (秒) */
  cacheTTL: number;
  /** 最大并行加载数 */
  maxParallelLoads: number;
  /** 启动时最大加载时间 (毫秒) */
  maxStartupTime: number;
}

/**
 * 已安装 Plugins 记录（存储在 ~/.deepv/skills/installed_plugins.json）
 */
export interface InstalledPluginsRecord {
  /** 已安装的 Plugins {pluginId: pluginInfo} */
  plugins: Record<string, InstalledPluginInfo>;
  /** 最后更新时间 */
  lastUpdated: string;
}

/**
 * 已安装 Plugin 信息
 */
export interface InstalledPluginInfo {
  /** Plugin ID */
  id: string;
  /** Plugin 名称 */
  name: string;
  /** Plugin 描述 */
  description?: string;
  /** Marketplace ID */
  marketplaceId: string;
  /** 本地安装路径（绝对路径） */
  installPath?: string;
  /** 安装时间 */
  installedAt: string;
  /** 启用状态 */
  enabled: boolean;
  /** 版本（默认 "unknown"） */
  version?: string;
  /** Skills 数量 */
  skillCount: number;
  /** 是否为本地插件（true = 本地路径，false = Git 克隆） */
  isLocal?: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Skills 系统基础错误
 */
export class SkillError extends Error {
  constructor(
    message: string,
    public code: SkillErrorCode,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'SkillError';
  }
}

/**
 * 验证错误
 */
export class ValidationError extends SkillError {
  constructor(message: string, details?: unknown) {
    super(message, SkillErrorCode.VALIDATION_FAILED, details);
    this.name = 'ValidationError';
  }
}

/**
 * Marketplace 错误
 */
export class MarketplaceError extends SkillError {
  constructor(message: string, code: SkillErrorCode, details?: unknown) {
    super(message, code, details);
    this.name = 'MarketplaceError';
  }
}

/**
 * Plugin 错误
 */
export class PluginError extends SkillError {
  constructor(message: string, code: SkillErrorCode, details?: unknown) {
    super(message, code, details);
    this.name = 'PluginError';
  }
}

/**
 * 安全错误
 */
export class SecurityError extends SkillError {
  constructor(message: string, details?: unknown) {
    super(message, SkillErrorCode.SECURITY_VIOLATION, details);
    this.name = 'SecurityError';
  }
}

/**
 * 错误代码
 */
export enum SkillErrorCode {
  // 通用错误
  UNKNOWN = 'UNKNOWN',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INVALID_INPUT = 'INVALID_INPUT',

  // 验证错误
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_FORMAT = 'INVALID_FORMAT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Marketplace 错误
  MARKETPLACE_NOT_FOUND = 'MARKETPLACE_NOT_FOUND',
  MARKETPLACE_CLONE_FAILED = 'MARKETPLACE_CLONE_FAILED',
  MARKETPLACE_UPDATE_FAILED = 'MARKETPLACE_UPDATE_FAILED',
  MARKETPLACE_PARSE_FAILED = 'MARKETPLACE_PARSE_FAILED',

  // Plugin 错误
  PLUGIN_NOT_FOUND = 'PLUGIN_NOT_FOUND',
  PLUGIN_INSTALL_FAILED = 'PLUGIN_INSTALL_FAILED',
  PLUGIN_ALREADY_INSTALLED = 'PLUGIN_ALREADY_INSTALLED',

  // Skill 错误
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  SKILL_PARSE_FAILED = 'SKILL_PARSE_FAILED',
  SKILL_LOAD_FAILED = 'SKILL_LOAD_FAILED',

  // 安全错误
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  UNTRUSTED_SOURCE = 'UNTRUSTED_SOURCE',
  TOOL_NOT_ALLOWED = 'TOOL_NOT_ALLOWED',

  // 脚本错误
  SCRIPT_EXECUTION_FAILED = 'SCRIPT_EXECUTION_FAILED',
  SCRIPT_TIMEOUT = 'SCRIPT_TIMEOUT',

  // 文件系统错误
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
  FILE_READ_FAILED = 'FILE_READ_FAILED',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Skill Context 注入结果
 */
export interface SkillContextResult {
  /** 注入的 context 字符串 */
  context: string;
  /** Token 估算数量 */
  estimatedTokens: number;
  /** 加载的 Skills 数量 */
  skillCount: number;
  /** 加载级别统计 */
  levelStats: {
    metadata: number;
    full: number;
    resources: number;
  };
}

/**
 * 安全审计报告
 */
export interface SecurityReport {
  /** Skill ID */
  skillId: string;
  /** 审计时间 */
  auditTime: Date;
  /** 是否通过审计 */
  passed: boolean;
  /** 威胁列表 */
  threats: SecurityThreat[];
  /** 警告列表 */
  warnings: string[];
  /** 信任级别 */
  trustLevel: 'high' | 'medium' | 'low';
}

/**
 * 安全威胁
 */
export interface SecurityThreat {
  /** 威胁类型 */
  type: ThreatType;
  /** 威胁描述 */
  description: string;
  /** 严重程度 */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** 建议操作 */
  recommendation: string;
}

/**
 * 威胁类型（五类威胁）
 */
export enum ThreatType {
  /** 恶意 Skill 指令 */
  MALICIOUS_INSTRUCTION = 'malicious_instruction',
  /** 恶意脚本 */
  MALICIOUS_SCRIPT = 'malicious_script',
  /** 外部数据注入 */
  EXTERNAL_DATA_INJECTION = 'external_data_injection',
  /** 数据泄露 */
  DATA_LEAKAGE = 'data_leakage',
  /** 工具滥用 */
  TOOL_ABUSE = 'tool_abuse',
}

/**
 * Skill 搜索选项
 */
export interface SkillSearchOptions {
  /** 搜索关键字 */
  query?: string;
  /** 筛选 Marketplace */
  marketplaceId?: string;
  /** 筛选 Plugin */
  pluginId?: string;
  /** 仅显示已启用 */
  enabledOnly?: boolean;
  /** 排序方式 */
  sortBy?: 'name' | 'plugin' | 'marketplace' | 'installedAt';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Marketplace 扫描结果
 */
export interface MarketplaceScanResult {
  /** Marketplace 信息 */
  marketplace: Marketplace;
  /** 发现的 Plugins 数量 */
  pluginCount: number;
  /** 发现的 Skills 数量 */
  skillCount: number;
  /** 扫描耗时（毫秒） */
  scanDuration: number;
  /** 是否有错误 */
  hasErrors: boolean;
  /** 错误列表 */
  errors: Array<{ path: string; error: string }>;
}

/**
 * 默认配置
 */
export const DEFAULT_SKILLS_SETTINGS: SkillsSettings = {
  enabledPlugins: {},
  marketplaces: [],
  security: {
    enableAudit: true,
    trustLevel: 'moderate',
    trustedSources: ['anthropic', 'official'],
    requireReview: false,
  },
  performance: {
    enableCache: true,
    cacheTTL: 3600, // 1 hour
    maxParallelLoads: 5,
    maxStartupTime: 300, // 300ms
  },
};

/**
 * 默认已安装 Plugins 记录
 */
export const DEFAULT_INSTALLED_PLUGINS: InstalledPluginsRecord = {
  plugins: {},
  lastUpdated: new Date().toISOString(),
};
