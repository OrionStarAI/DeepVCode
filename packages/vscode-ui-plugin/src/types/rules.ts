/**
 * Custom Rules Management Types
 * 自定义规则管理类型定义
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

// =============================================================================
// 规则类型枚举
// =============================================================================

/**
 * 规则应用类型
 */
export enum RuleApplyType {
  /** 始终自动应用到每次对话 */
  ALWAYS_APPLY = 'always_apply',
  /** 手动选择应用 */
  MANUAL_APPLY = 'manual_apply',
  /** 基于上下文自动应用（文件类型、路径等） */
  CONTEXT_AWARE = 'context_aware'
}

/**
 * 规则优先级
 */
export enum RulePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

// =============================================================================
// 规则定义接口
// =============================================================================

/**
 * YAML Frontmatter 配置
 */
export interface RuleFrontmatter {
  /** 规则标题 */
  title?: string;
  /** 规则应用类型 */
  type: RuleApplyType;
  /** 规则优先级 */
  priority?: RulePriority;
  /** 规则描述（用于 AI 自动检测相关性） */
  description?: string;
  /** 触发条件（用于 context_aware 类型） */
  triggers?: RuleTrigger;
  /** 是否启用 */
  enabled?: boolean;
  /** 规则标签 */
  tags?: string[];
}

/**
 * 触发条件配置
 */
export interface RuleTrigger {
  /** 文件类型匹配（如: [".ts", ".tsx"]） */
  fileExtensions?: string[];
  /** 文件路径模式（glob 模式，如: "src/components/**"） */
  pathPatterns?: string[];
  /** 编程语言（如: "typescript", "python"） */
  languages?: string[];
}

/**
 * 完整规则定义
 */
export interface CustomRule {
  /** 唯一标识符 */
  id: string;
  /** Frontmatter 配置 */
  frontmatter: RuleFrontmatter;
  /** Markdown 内容（规则正文） */
  content: string;
  /** 文件路径（相对于工作区根目录） */
  filePath?: string;
  /** 是否为内置规则 */
  isBuiltIn?: boolean;
  /** 创建时间 */
  createdAt?: number;
  /** 更新时间 */
  updatedAt?: number;
}

// =============================================================================
// 规则匹配上下文
// =============================================================================

/**
 * 规则匹配上下文
 */
export interface RuleMatchContext {
  /** 当前活动文件路径 */
  activeFilePath?: string;
  /** 当前文件扩展名 */
  fileExtension?: string;
  /** 当前编程语言 */
  language?: string;
  /** 工作区根路径 */
  workspaceRoot?: string;
}

// =============================================================================
// 规则操作结果
// =============================================================================

/**
 * 规则加载结果
 */
export interface RuleLoadResult {
  success: boolean;
  rules: CustomRule[];
  errors: Array<{
    filePath: string;
    error: string;
  }>;
}

/**
 * 规则应用结果
 */
export interface RuleApplyResult {
  /** 应用的规则列表 */
  appliedRules: CustomRule[];
  /** 拼接后的规则文本 */
  combinedText: string;
  /** 警告信息 */
  warnings?: string[];
}

// =============================================================================
// 默认配置
// =============================================================================

/**
 * 默认 Frontmatter
 */
export const DEFAULT_RULE_FRONTMATTER: RuleFrontmatter = {
  type: RuleApplyType.MANUAL_APPLY,
  priority: RulePriority.MEDIUM,
  enabled: true,
  tags: []
};

/**
 * 规则文件默认位置
 */
export const RULE_FILE_LOCATIONS = {
  /** 规则目录 */
  RULES_DIR: '.deepvcode/rules',
  /** 代理配置文件（自动加载为规则） */
  AGENTS_CONFIG: 'AGENTS.md'
} as const;
