/**
 * 工具调用相关常量定义
 * 集中管理所有字符串枚举，避免硬编码
 */

// 工具状态常量 - 与types/index.ts中的ToolCallStatus枚举保持一致
export const TOOL_CALL_STATUS = {
  SCHEDULED: 'scheduled',
  VALIDATING: 'validating',
  EXECUTING: 'executing',
  WAITING_FOR_CONFIRMATION: 'awaiting_approval',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCELED: 'cancelled',
  BACKGROUND_RUNNING: 'background_running'  // 🎯 后台运行中
} as const;

// 工具名称常量
export const TOOL_NAMES = {
  WRITE_FILE: 'write_file',
  READ_FILE: 'read_file',
  BASH: 'bash',
  TERMINAL: 'terminal',
  WEB_SEARCH: 'web_search',
  GREP: 'grep',
  DELETE_FILE: 'delete_file',
  SEARCH_REPLACE: 'search_replace',
  LIST_DIR: 'list_dir',
  RUN_TERMINAL_CMD: 'run_terminal_cmd'
} as const;

// 关键参数名称常量
export const PARAM_NAMES = {
  FILE_PATH: 'file_path',
  TARGET_FILE: 'target_file',
  PATH: 'path',
  COMMAND: 'command',
  QUERY: 'query',
  PATTERN: 'pattern',
  OLD_STRING: 'old_string',
  NEW_STRING: 'new_string',
  CONTENT: 'content'
} as const;

// 风险级别常量
export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
} as const;

// 结果状态常量
export const RESULT_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error'
} as const;

// CSS 类名常量
export const CSS_CLASSES = {
  TOOL_CALL_ITEM: 'tool-call-item',
  TOOL_CALL_HEADER: 'tool-call-header',
  TOOL_STATUS: 'tool-status',
  CONFIRM_BTN: 'confirm-btn',
  CONFIRM_CANCEL: 'cancel',
  CONFIRM_APPROVE: 'approve',
  TOOL_RESULT: 'tool-result',
  EXPAND_BTN: 'expand-btn'
} as const;

// 按重要性排序的参数顺序
export const PARAM_PRIORITY_ORDER = [
  PARAM_NAMES.FILE_PATH,
  PARAM_NAMES.TARGET_FILE,
  PARAM_NAMES.PATH,
  PARAM_NAMES.COMMAND,
  PARAM_NAMES.QUERY,
  PARAM_NAMES.PATTERN,
  PARAM_NAMES.OLD_STRING,
  PARAM_NAMES.NEW_STRING,
  PARAM_NAMES.CONTENT
] as const;

// 工具状态颜色映射
export const STATUS_COLORS = {
  [TOOL_CALL_STATUS.SCHEDULED]: '#fbbf24',
  [TOOL_CALL_STATUS.VALIDATING]: '#f59e0b',
  [TOOL_CALL_STATUS.EXECUTING]: '#3b82f6',
  [TOOL_CALL_STATUS.WAITING_FOR_CONFIRMATION]: '#f59e0b',
  [TOOL_CALL_STATUS.SUCCESS]: '#10b981',
  [TOOL_CALL_STATUS.ERROR]: '#ef4444',
  [TOOL_CALL_STATUS.CANCELED]: '#6b7280',
  [TOOL_CALL_STATUS.BACKGROUND_RUNNING]: '#f59e0b'  // 🎯 黄色 - 后台运行中
} as const;

// 类型定义
export type ToolCallStatus = typeof TOOL_CALL_STATUS[keyof typeof TOOL_CALL_STATUS];
export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];
export type ParamName = typeof PARAM_NAMES[keyof typeof PARAM_NAMES];
export type RiskLevel = typeof RISK_LEVELS[keyof typeof RISK_LEVELS];
export type ResultStatus = typeof RESULT_STATUS[keyof typeof RESULT_STATUS];
