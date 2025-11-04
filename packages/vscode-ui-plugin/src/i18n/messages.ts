/**
 * 国际化消息常量
 * 
 * 用于存储插件中所有用户可见的文本
 * 支持未来扩展多语言支持
 */

// =============================================================================
// 回退功能相关消息
// =============================================================================

export const ROLLBACK_MESSAGES = {
  // 🎯 回退操作日志消息
  ROLLBACK_INITIATED: '开始执行回退操作',
  ROLLBACK_COMPLETED: '回退操作已完成',
  ROLLBACK_FAILED: '回退操作失败',
  
  // 🎯 回退验证消息
  MESSAGE_NOT_FOUND: '回退失败：找不到目标消息',
  CANNOT_ROLLBACK_LAST_MESSAGE: '无法回退：这是最后一条消息',
  INVALID_MESSAGE_ID: '回退失败：无效的消息ID',
  
  // 🎯 文件回滚消息
  FILE_ROLLBACK_STARTED: '开始文件系统回滚操作',
  FILE_ROLLBACK_COMPLETED: '文件回滚完成',
  FILE_ROLLBACK_FAILED: '文件回滚失败',
  FILE_RESTORED: '文件已恢复',
  FILE_DELETED: '文件已删除',
  FILE_REVERTED: '文件内容已回滚',
  NO_FILES_TO_ROLLBACK: '目标消息之后没有文件修改，无需回滚',
  WORKSPACE_NOT_FOUND: '未找到工作区根目录，跳过文件回滚',
  
  // 🎯 用户界面消息
  BUTTON_ROLLBACK_TOOLTIP: '回退到此消息',
  BUTTON_ROLLBACK_ARIA_LABEL: '回退到此消息',
  
  // 🎯 错误提示消息
  ERROR_NO_MESSAGE_ID: '执行回退失败：缺少目标消息ID',
  ERROR_AI_INTERRUPT_FAILED: '中断AI处理流程失败',
  ERROR_MESSAGE_UPDATE_FAILED: '更新消息列表失败',
  ERROR_BACKEND_REQUEST_FAILED: '发送回退请求到后端失败',
  
  // 🎯 文件操作错误消息
  ERROR_FILE_NOT_FOUND: '文件不存在',
  ERROR_FILE_RESTORE_FAILED: '恢复文件失败',
  ERROR_FILE_DELETE_FAILED: '删除文件失败',
  ERROR_FILE_REVERT_FAILED: '回滚文件内容失败',
  ERROR_MISSING_ORIGINAL_CONTENT: '无法恢复文件：缺少原始内容',
  ERROR_DIRECTORY_CREATE_FAILED: '创建目录失败',
  ERROR_FILE_WRITE_FAILED: '写入文件失败',
  
  // 🎯 状态描述消息
  STATUS_ANALYZING_MESSAGES: '正在分析消息历史',
  STATUS_TRUNCATING_HISTORY: '正在截断消息历史',
  STATUS_UPDATING_UI: '正在更新用户界面',
  STATUS_ROLLING_BACK_FILES: '正在回滚文件',
  STATUS_WAITING_BACKEND: '等待后端文件回滚完成',
  
  // 🎯 统计信息消息
  STATS_MESSAGES_DELETED: (count: number) => `已删除 ${count} 条消息`,
  STATS_FILES_ROLLED_BACK: (count: number) => `已回滚 ${count} 个文件`,
  STATS_FILES_FAILED: (count: number) => `${count} 个文件回滚失败`,
  STATS_TOTAL_FILES: (count: number) => `共 ${count} 个文件`,
} as const;

// =============================================================================
// 编辑功能相关消息
// =============================================================================

export const EDIT_MESSAGES = {
  // 🎯 编辑操作消息
  EDIT_STARTED: '开始编辑消息',
  EDIT_CANCELLED: '取消编辑消息',
  EDIT_CONFIRMED: '确认编辑并重新生成',
  
  // 🎯 用户界面消息
  BUTTON_EDIT_TOOLTIP: '编辑消息',
  BUTTON_EDIT_ARIA_LABEL: '编辑消息',
  CONFIRM_DIALOG_TITLE: '确认编辑',
  CONFIRM_DIALOG_MESSAGE: '编辑后将重新生成回复，之前的回复将被删除。确定要继续吗？',
  CONFIRM_BUTTON_TEXT: '确认编辑',
  CANCEL_BUTTON_TEXT: '取消',
} as const;

// =============================================================================
// 文件操作相关消息
// =============================================================================

export const FILE_OPERATION_MESSAGES = {
  // 🎯 文件状态消息
  FILE_CREATED: '文件已创建',
  FILE_MODIFIED: '文件已修改',
  FILE_DELETED: '文件已删除',
  
  // 🎯 文件类型检测
  FILE_TYPE_NEW: '新建文件',
  FILE_TYPE_MODIFIED: '修改的文件',
  FILE_TYPE_DELETED: '删除的文件',
  
  // 🎯 文件分析消息
  ANALYZING_FILE_CHANGES: '正在分析文件修改',
  EXTRACTING_FILE_DIFFS: '正在提取文件差异',
  CALCULATING_ROLLBACK_OPERATIONS: '正在计算回滚操作',
  
  // 🎯 文件回滚详情
  RESTORING_DELETED_FILE: (fileName: string) => `正在恢复被删除的文件: ${fileName}`,
  DELETING_NEW_FILE: (fileName: string) => `正在删除新建的文件: ${fileName}`,
  REVERTING_MODIFIED_FILE: (fileName: string) => `正在回滚修改的文件: ${fileName}`,
  
  // 🎯 文件回滚结果
  FILE_ALREADY_DELETED: (fileName: string) => `文件 ${fileName} 不存在，无需删除`,
  FILE_ALREADY_AT_TARGET_STATE: (fileName: string) => `文件 ${fileName} 已是目标状态`,
} as const;

// =============================================================================
// 平台兼容性相关消息
// =============================================================================

export const PLATFORM_MESSAGES = {
  // 🎯 平台检测
  PLATFORM_DETECTED: (platform: string) => `检测到平台: ${platform}`,
  PLATFORM_MAC: 'macOS',
  PLATFORM_WINDOWS: 'Windows',
  PLATFORM_LINUX: 'Linux',
  PLATFORM_UNKNOWN: '未知平台',
  
  // 🎯 路径处理
  PATH_NORMALIZED: '路径已规范化',
  PATH_RESOLVED: '路径已解析为绝对路径',
  PATH_SEPARATOR_UNIFIED: '路径分隔符已统一',
  
  // 🎯 兼容性警告
  WARNING_UNC_PATH: 'Windows UNC 路径需要特殊处理',
  WARNING_LONG_PATH: 'Windows 长路径可能需要启用长路径支持',
} as const;

// =============================================================================
// 通用消息
// =============================================================================

export const COMMON_MESSAGES = {
  // 🎯 操作状态
  SUCCESS: '操作成功',
  FAILED: '操作失败',
  CANCELLED: '操作已取消',
  IN_PROGRESS: '操作进行中',
  COMPLETED: '操作已完成',
  
  // 🎯 确认对话框
  CONFIRM: '确认',
  CANCEL: '取消',
  OK: '确定',
  YES: '是',
  NO: '否',
  
  // 🎯 通用错误
  ERROR_UNKNOWN: '未知错误',
  ERROR_TIMEOUT: '操作超时',
  ERROR_NETWORK: '网络错误',
  ERROR_PERMISSION: '权限不足',
  ERROR_NOT_FOUND: '未找到',
  ERROR_INVALID_PARAMETER: '无效的参数',
  
  // 🎯 日志级别标签
  LOG_DEBUG: '[调试]',
  LOG_INFO: '[信息]',
  LOG_WARN: '[警告]',
  LOG_ERROR: '[错误]',
} as const;

// =============================================================================
// 消息工具函数
// =============================================================================

/**
 * 格式化带参数的消息
 * @param template 消息模板函数
 * @param params 参数
 * @returns 格式化后的消息
 */
export function formatMessage<T extends (...args: any[]) => string>(
  template: T,
  ...params: Parameters<T>
): string {
  return template(...params);
}

/**
 * 获取错误消息
 * @param error 错误对象
 * @param fallback 默认消息
 * @returns 错误消息文本
 */
export function getErrorMessage(error: unknown, fallback: string = COMMON_MESSAGES.ERROR_UNKNOWN): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

// =============================================================================
// 导出所有消息常量
// =============================================================================

export const I18N_MESSAGES = {
  ROLLBACK: ROLLBACK_MESSAGES,
  EDIT: EDIT_MESSAGES,
  FILE_OPERATION: FILE_OPERATION_MESSAGES,
  PLATFORM: PLATFORM_MESSAGES,
  COMMON: COMMON_MESSAGES,
} as const;

export default I18N_MESSAGES;

