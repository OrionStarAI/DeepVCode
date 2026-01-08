/**
 * Session Management Constants and Enums
 * 会话管理相关的常量和枚举定义
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

// =============================================================================
// Session状态枚举
// =============================================================================

export enum SessionStatus {
  /** 会话初始化中 */
  INITIALIZING = 'initializing',
  /** 会话活跃 */
  ACTIVE = 'active',
  /** 会话空闲 */
  IDLE = 'idle',
  /** 会话正在处理请求 */
  PROCESSING = 'processing',
  /** 会话等待用户确认 */
  CONFIRMING = 'confirming',
  /** 会话出现错误 */
  ERROR = 'error',
  /** 会话已关闭 */
  CLOSED = 'closed'
}

export enum SessionType {
  /** 默认聊天会话 */
  CHAT = 'chat',
  /** 代码审查会话 */
  CODE_REVIEW = 'code_review',
  /** 调试辅助会话 */
  DEBUG = 'debug',
  /** 文档生成会话 */
  DOCUMENTATION = 'documentation',
  /** 重构建议会话 */
  REFACTORING = 'refactoring',
  /** 自定义会话 */
  CUSTOM = 'custom'
}

// =============================================================================
// Session操作枚举
// =============================================================================

export enum SessionAction {
  /** 创建会话 */
  CREATE = 'create',
  /** 切换会话 */
  SWITCH = 'switch',
  /** 重命名会话 */
  RENAME = 'rename',
  /** 删除会话 */
  DELETE = 'delete',
  /** 复制会话 */
  DUPLICATE = 'duplicate',
  /** 清空会话 */
  CLEAR = 'clear',
  /** 导出会话 */
  EXPORT = 'export',
  /** 导入会话 */
  IMPORT = 'import'
}

// =============================================================================
// 常量定义
// =============================================================================

export const SESSION_CONSTANTS = {
  /** 默认会话ID前缀 */
  DEFAULT_SESSION_PREFIX: 'session',

  /** 默认会话名称 */
  DEFAULT_SESSION_NAME: '新建会话',

  /** 最大会话数量 */
  MAX_SESSIONS: 10,

  /** 最大会话名称长度 */
  MAX_SESSION_NAME_LENGTH: 50,

  /** 会话ID最大长度 */
  MAX_SESSION_ID_LENGTH: 36,

  /** 会话空闲超时时间（毫秒） */
  IDLE_TIMEOUT_MS: 30 * 60 * 1000, // 30分钟

  /** 会话自动保存间隔（毫秒） */
  AUTO_SAVE_INTERVAL_MS: 5 * 1000, // 5秒

  /** 单个会话最大消息数 */
  MAX_MESSAGES_PER_SESSION: 1000,

  /** 会话历史保留天数 */
  SESSION_HISTORY_DAYS: 30
} as const;

export const SESSION_UI_CONSTANTS = {
  /** Session选择器最小宽度 */
  SELECTOR_MIN_WIDTH: 120,

  /** Session选择器最大宽度 */
  SELECTOR_MAX_WIDTH: 200,

  /** Session标签页高度 */
  TAB_HEIGHT: 32,

  /** Session图标大小 */
  ICON_SIZE: 16,

  /** 动画持续时间（毫秒） */
  ANIMATION_DURATION_MS: 200,

  /** Toast消息显示时间（毫秒） */
  TOAST_DURATION_MS: 3000
} as const;

// =============================================================================
// Session模板定义
// =============================================================================

export const SESSION_TEMPLATES = {
  [SessionType.CHAT]: {
    name: '聊天会话',
    description: '通用AI对话和问答',
    icon: '💬',
    systemPrompt: '你是一个智能助手，可以帮助用户解答问题和完成任务。'
  },
  [SessionType.CODE_REVIEW]: {
    name: '代码审查',
    description: '代码质量检查和改进建议',
    icon: '👀',
    systemPrompt: '你是一个代码审查专家，专注于代码质量、性能优化和最佳实践。'
  },
  [SessionType.DEBUG]: {
    name: '调试助手',
    description: '问题诊断和解决方案',
    icon: '🐛',
    systemPrompt: '你是一个调试专家，帮助定位和解决代码中的问题和错误。'
  },
  [SessionType.DOCUMENTATION]: {
    name: '文档生成',
    description: '生成代码文档和注释',
    icon: '📝',
    systemPrompt: '你是一个文档专家，专门生成清晰、准确的代码文档和注释。'
  },
  [SessionType.REFACTORING]: {
    name: '重构建议',
    description: '代码结构优化和重构',
    icon: '🔧',
    systemPrompt: '你是一个重构专家，提供代码结构改进和优化建议。'
  },
  [SessionType.CUSTOM]: {
    name: '自定义会话',
    description: '用户自定义的专属会话',
    icon: '⚙️',
    systemPrompt: ''
  }
} as const;

// =============================================================================
// 错误消息常量
// =============================================================================

export const SESSION_ERROR_MESSAGES = {
  SESSION_NOT_FOUND: '未找到指定的会话',
  SESSION_LIMIT_EXCEEDED: `会话数量已达到上限 (${SESSION_CONSTANTS.MAX_SESSIONS})`,
  INVALID_SESSION_NAME: `会话名称无效或过长 (最大 ${SESSION_CONSTANTS.MAX_SESSION_NAME_LENGTH} 字符)`,
  INVALID_SESSION_ID: '会话ID格式无效',
  SESSION_CREATION_FAILED: '创建会话失败',
  SESSION_DELETION_FAILED: '删除会话失败',
  SESSION_SWITCH_FAILED: '切换会话失败',
  SESSION_RENAME_FAILED: '重命名会话失败',
  SESSION_EXPORT_FAILED: '导出会话失败',
  SESSION_IMPORT_FAILED: '导入会话失败',
  DUPLICATE_SESSION_NAME: '会话名称已存在',
  CANNOT_DELETE_LAST_SESSION: '无法删除最后一个会话',
  SESSION_SAVE_FAILED: '保存会话失败',
  SESSION_LOAD_FAILED: '加载会话失败'
} as const;

// =============================================================================
// 成功消息常量
// =============================================================================

export const SESSION_SUCCESS_MESSAGES = {
  SESSION_CREATED: '会话创建成功',
  SESSION_DELETED: '会话删除成功',
  SESSION_SWITCHED: '已切换到会话',
  SESSION_RENAMED: '会话重命名成功',
  SESSION_DUPLICATED: '会话复制成功',
  SESSION_CLEARED: '会话内容已清空',
  SESSION_EXPORTED: '会话导出成功',
  SESSION_IMPORTED: '会话导入成功',
  SESSION_SAVED: '会话保存成功'
} as const;

// =============================================================================
// 键盘快捷键常量
// =============================================================================

export const SESSION_SHORTCUTS = {
  /** 新建会话 */
  NEW_SESSION: 'Ctrl+T',

  /** 关闭当前会话 */
  CLOSE_SESSION: 'Ctrl+W',

  /** 切换到下一个会话 */
  NEXT_SESSION: 'Ctrl+Tab',

  /** 切换到上一个会话 */
  PREV_SESSION: 'Ctrl+Shift+Tab',

  /** 重命名会话 */
  RENAME_SESSION: 'F2',

  /** 复制会话 */
  DUPLICATE_SESSION: 'Ctrl+D',

  /** 清空会话 */
  CLEAR_SESSION: 'Ctrl+L'
} as const;

// =============================================================================
// 类型导出
// =============================================================================

/** Session模板类型 */
export type SessionTemplate = typeof SESSION_TEMPLATES[SessionType];

/** Session常量类型 */
export type SessionConstant = typeof SESSION_CONSTANTS;

/** UI常量类型 */
export type SessionUIConstant = typeof SESSION_UI_CONSTANTS;
