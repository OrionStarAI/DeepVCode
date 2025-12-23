/**
 * 国际化消息常量
 *
 * 用于存储插件中所有用户可见的文本
 * 支持未来扩展多语言支持
 */

// =============================================================================
// 行内补全相关消息
// =============================================================================

export const INLINE_COMPLETION_MESSAGES = {
  // 🎯 状态栏显示
  STATUS_BAR_TEXT: 'DeepV Suggestions',
  STATUS_BAR_TEXT_ZH: 'DeepV代码补全',
  STATUS_BAR_ENABLED_TOOLTIP: 'DeepV Suggestions: Enabled (Click to disable)',
  STATUS_BAR_ENABLED_TOOLTIP_ZH: 'DeepV 代码补全：已启用（点击关闭）',
  STATUS_BAR_DISABLED_TOOLTIP: 'DeepV Suggestions: Disabled (Click to enable)',
  STATUS_BAR_DISABLED_TOOLTIP_ZH: 'DeepV 代码补全：已禁用（点击启用）',

  // 🎯 命令标题
  TOGGLE_COMMAND_TITLE: 'Toggle DeepV Suggestions',
  TOGGLE_COMMAND_TITLE_ZH: '切换代码补全',

  // 🎯 提示信息
  COMPLETION_ENABLED: 'DeepV Suggestions enabled',
  COMPLETION_ENABLED_ZH: 'DeepV代码补全已启用',
  COMPLETION_DISABLED: 'DeepV Suggestions disabled',
  COMPLETION_DISABLED_ZH: 'DeepV代码补全已禁用',
} as const;

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
// 循环检测相关消息
// =============================================================================

export const LOOP_DETECTION_MESSAGES = {
  // 🎯 连续工具调用循环
  CONSECUTIVE_TOOL_CALLS_TITLE: '🔄 Repetitive Tool Calls Detected',
  CONSECUTIVE_TOOL_CALLS_DESCRIPTION: 'The AI model is repeatedly calling the same tool, exhausting context and API quota without making meaningful progress.\n\nWhy this happens:\n• The AI may be stuck exploring the same path\n• The current approach is not working\n• The task description may be unclear or missing key information\n\nWhat you should do:\n1. Review the task: Is the request clear and specific enough?\n2. Provide new guidance: Tell the AI to try a different direction or provide new information\n3. Start fresh if needed: Use /session new to clear context and begin again\n\nExamples:\n• ❌ "Read all files in the project" (unclear)\n• ✅ "Read and analyze the authentication logic in src/auth/ to identify security issues"',
  CONSECUTIVE_TOOL_CALLS_ACTION: 'Quick actions:\n• Continue with a more specific request\n• Ask the AI to try a different approach\n• Use /session new to start fresh',

  // 🎯 重复句子循环
  CHANTING_IDENTICAL_SENTENCES_TITLE: '🔄 Repetitive Content Detected',
  CHANTING_IDENTICAL_SENTENCES_DESCRIPTION: 'The AI model is repeatedly generating the same text or responses.',
  CHANTING_IDENTICAL_SENTENCES_ACTION: 'How to fix:\n• The model may be stuck on a specific pattern\n• Try breaking the pattern with a new instruction\n• Ask the AI to try a different approach\n• Continue the conversation with new context or /session new to restart',

  // 🎯 LLM检测到的循环
  LLM_DETECTED_LOOP_TITLE: '⚠️ Unproductive Loop Detected',
  LLM_DETECTED_LOOP_DESCRIPTION: 'The AI model appears to be stuck without making meaningful progress on the task.',
  LLM_DETECTED_LOOP_ACTION: 'How to break the loop:\n• Provide clearer instructions or constraints\n• Suggest a different approach\n• Offer additional context or examples\n• Start a new session if the task needs to be redefined',

  // 🎯 中文消息
  CONSECUTIVE_TOOL_CALLS_TITLE_ZH: '🔄 检测到重复工具调用',
  CONSECUTIVE_TOOL_CALLS_DESCRIPTION_ZH: 'AI模型在反复调用相同的工具，浪费上下文和API配额，没有取得实质进展。\n\n为什么会发生：\n• AI可能被困在同一个方向的探索中\n• 当前的方法不可行\n• 任务描述不清楚或缺少关键信息\n\n应该做什么：\n1. 检查任务：请求是否足够清晰和具体？\n2. 提供新指导：告诉AI尝试不同的方向或提供新信息\n3. 如需要可重启：使用 /session new 清空上下文重新开始\n\n举例：\n• ❌ "读所有文件" (不清楚)\n• ✅ "阅读并分析 src/auth/ 中的身份验证逻辑，找出安全问题"',
  CONSECUTIVE_TOOL_CALLS_ACTION_ZH: '快速操作：\n• 继续提供更具体的请求\n• 要求AI尝试不同的方法\n• 使用 /session new 清空上下文重新开始',

  CHANTING_IDENTICAL_SENTENCES_TITLE_ZH: '🔄 检测到重复内容',
  CHANTING_IDENTICAL_SENTENCES_DESCRIPTION_ZH: 'AI模型在反复生成相同的文本或响应。',
  CHANTING_IDENTICAL_SENTENCES_ACTION_ZH: '解决方案：\n• 模型可能陷入特定的文本模式\n• 尝试用新的指示打破这个模式\n• 要求AI采用不同的方法\n• 继续对话并提供新的上下文，或执行 /session new 重新开始',

  LLM_DETECTED_LOOP_TITLE_ZH: '⚠️ 检测到无进展循环',
  LLM_DETECTED_LOOP_DESCRIPTION_ZH: 'AI模型似乎陷入困境，在任务上没有取得有意义的进展。',
  LLM_DETECTED_LOOP_ACTION_ZH: '如何打破循环：\n• 提供更清晰的指令或约束\n• 建议采用不同的方法\n• 提供额外的上下文或示例\n• 如果需要重新定义任务，请开始新会话',
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
  INLINE_COMPLETION: INLINE_COMPLETION_MESSAGES,
  ROLLBACK: ROLLBACK_MESSAGES,
  EDIT: EDIT_MESSAGES,
  FILE_OPERATION: FILE_OPERATION_MESSAGES,
  LOOP_DETECTION: LOOP_DETECTION_MESSAGES,
  PLATFORM: PLATFORM_MESSAGES,
  COMMON: COMMON_MESSAGES,
} as const;

export default I18N_MESSAGES;

