/**
 * Message types for communication between Extension and WebView
 */

export interface ContextInfo {
  activeFile?: string;
  selectedText?: string;
  cursorPosition?: {
    line: number;
    character: number;
  };
  workspaceRoot?: string;
  openFiles?: string[];
  projectLanguage?: string;
  gitBranch?: string;
}

export interface ToolExecutionRequest {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  context?: ContextInfo;
  requiresConfirmation?: boolean;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
  toolName: string;
}

// 🎯 新的原始消息内容格式 - 保持编辑器的原始结构
export type MessageContentPart =
  | { type: 'text'; value: string }  // 原始文本片段
  | { type: 'file_reference'; value: { fileName: string; filePath: string } }  // 文件引用（项目中的文件）
  | { type: 'image_reference'; value: { fileName: string; data: string; mimeType: string; originalSize: number; compressedSize: number; width?: number; height?: number } }  // 图片引用
  | { type: 'code_reference'; value: { fileName: string; filePath: string; code: string; startLine?: number; endLine?: number } }  // 🎯 代码引用（带行号）
  | { type: 'text_file_content'; value: { fileName: string; content: string; language?: string; size: number } }  // 文本文件内容（直接嵌入，不依赖文件路径）
  | { type: 'terminal_reference'; value: { terminalId: number; terminalName: string; output: string } };  // 🎯 终端引用（终端输出内容）

export type MessageContent = MessageContentPart[];  // 现在存储原始结构，不是拼装后的内容

export interface ChatMessage {
  id: string;
  content: MessageContent;  // 🎯 直接使用新格式
  context?: ContextInfo;
  timestamp: number;
  type: 'user' | 'assistant' | 'system';
  // 🎯 新增：工具调用相关
  associatedToolCalls?: ToolCall[];
}

export interface ChatResponse {
  id: string;
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

// 🎯 增强的工具调用状态枚举
export enum ToolCallStatus {
  Scheduled = 'scheduled',
  Validating = 'validating',
  Executing = 'executing',
  WaitingForConfirmation = 'awaiting_approval',
  Success = 'success',
  Error = 'error',
  Canceled = 'cancelled',
  BackgroundRunning = 'background_running'  // 🎯 后台运行中
}

// 🎯 工具调用确认详情
export interface ToolCallConfirmationDetails {
  message: string;
  requiresConfirmation: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
  affectedFiles?: string[];
}

// 🎯 增强的工具调用接口 - 参考CLI版本的TrackedToolCall
export interface ToolCall {
  id: string;
  toolName: string; // 原始工具名称，用于内部识别
  displayName?: string; // 显示名称，用于前端展示
  parameters: Record<string, any>;
  result?: ToolExecutionResult;

  // 🎯 工具描述 - 来自tool.getDescription()方法的动态描述
  description?: string;

  // 🎯 新增状态跟踪字段
  status: ToolCallStatus;

  // 🎯 实时输出和进度显示
  liveOutput?: string;
  progressText?: string;

  // 🎯 确认机制
  confirmationDetails?: ToolCallConfirmationDetails;

  // 🎯 子工具调用支持
  subToolCalls?: ToolCall[];

  // 🎯 显示控制
  renderOutputAsMarkdown?: boolean;
  forceMarkdown?: boolean;

  // 🎯 时间戳和元数据
  startTime?: number;
  endTime?: number;
  executionDuration?: number;

  // 🎯 响应状态（用于与AI的交互）
  responseSubmittedToGemini?: boolean;

  // 🎯 工具执行的LLM响应内容（已经过core处理的正确格式）
  responseParts?: any;  // PartListUnion from core
}

// QuickAction removed - not used in actual implementation

// =============================================================================
// Slash Command Types
// =============================================================================

/**
 * 🎯 斜杠命令信息（用于 Webview 展示）
 */
export interface SlashCommandInfo {
  /** Command name (e.g., 'git:commit', 'test') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Command source: 'file' for custom commands, 'built-in' for hardcoded */
  kind: 'file' | 'built-in';
}

// =============================================================================
// Multi-Session Message Interfaces
// =============================================================================

import { SessionInfo } from './sessionTypes';
import { SessionType } from '../constants/sessionConstants';

/** Session创建请求 */
export interface CreateSessionMessagePayload {
  name?: string;
  type: SessionType;
  systemPrompt?: string;
  fromTemplate?: boolean;
}

/** Session更新请求 */
export interface UpdateSessionMessagePayload {
  sessionId: string;
  updates: {
    name?: string;
    type?: SessionType;
    description?: string;
  };
}

/** Session操作请求 */
export interface SessionOperationPayload {
  sessionId: string;
}

/** Session列表更新载荷 */
export interface SessionListUpdatePayload {
  sessions: SessionInfo[];
  currentSessionId: string | null;
}

/** Session导出请求 */
export interface SessionExportPayload {
  sessionIds?: string[];
}

/** Session导入请求 */
export interface SessionImportPayload {
  filePath?: string;
  overwriteExisting?: boolean;
}

// =============================================================================
// Enhanced Message Types with Session Support
// =============================================================================

// Message types from WebView to Extension
export type WebViewToExtensionMessage =
  // 原有消息类型（现在包含sessionId）
  | { type: 'tool_execution_request'; payload: ToolExecutionRequest & { sessionId: string } }
  | { type: 'tool_execution_confirm'; payload: { requestId: string; confirmed: boolean; sessionId?: string } }
  | { type: 'tool_confirmation_response'; payload: { toolId: string; confirmed: boolean; userInput?: string; sessionId: string } }
  | { type: 'tool_cancel_all'; payload: { sessionId: string } }
  | { type: 'flow_abort'; payload: { sessionId: string } }  // 🎯 新增流程中断消息
  | { type: 'chat_message'; payload: ChatMessage & { sessionId: string } }
  | { type: 'edit_message_and_regenerate'; payload: { messageId: string; newContent: any; truncatedMessages: any[]; sessionId: string } }
  | { type: 'get_context'; payload: { sessionId?: string } }
  | { type: 'get_extension_version'; payload: {} }
  | { type: 'check_for_updates'; payload: {} }
  | { type: 'start_services'; payload: {} }
  | { type: 'ready'; payload: {} }
  // 新的多Session消息类型
  | { type: 'session_create'; payload: CreateSessionMessagePayload }
  | { type: 'session_delete'; payload: SessionOperationPayload }
  | { type: 'session_switch'; payload: SessionOperationPayload }
  | { type: 'session_update'; payload: UpdateSessionMessagePayload }
  | { type: 'session_duplicate'; payload: SessionOperationPayload }
  | { type: 'session_clear'; payload: SessionOperationPayload }
  | { type: 'session_export'; payload: SessionExportPayload }
  | { type: 'session_import'; payload: SessionImportPayload }
  | { type: 'export_chat'; payload: { sessionId: string; title: string; content: string; format: string } }
  | { type: 'session_list_request'; payload: { includeAll?: boolean; offset?: number; limit?: number; searchQuery?: string } }
  // 🎯 UI消息保存相关
  | { type: 'save_ui_message'; payload: { sessionId: string; message: ChatMessage } }
  | { type: 'save_session_ui_history'; payload: { sessionId: string; messages: ChatMessage[] } }
  // 🎯 文件搜索相关
  | { type: 'file_search'; payload: { prefix: string } }
  // 🎯 符号搜索相关
  | { type: 'symbol_search'; payload: { query: string } }
  // 🎯 终端列表和输出获取
  | { type: 'get_terminals'; payload: {} }
  | { type: 'get_terminal_output'; payload: { terminalId: number } }
  // 🎯 获取最近打开的文件
  | { type: 'get_recent_files'; payload: {} }
  // 🎯 文件路径解析相关
  | { type: 'resolve_file_paths'; payload: { files: string[] } }
  // 🎯 文件变更接受相关
  | { type: 'acceptFileChanges'; payload: { lastAcceptedMessageId: string } }
  // 🎯 Undo 模块
  | { type: 'undo_file_change'; payload: { sessionId: string; fileName: string; filePath?: string; originalContent: string; isNewFile: boolean; isDeletedFile: boolean } }
  // 🎯 项目设置相关
  | { type: 'project_settings_update'; payload: { yoloMode: boolean } }
  | { type: 'project_settings_request'; payload: {} }
  // 🎯 Diff编辑器相关
  | { type: 'openDiffInEditor'; payload: { fileDiff: string; fileName: string; originalContent: string; newContent: string; filePath?: string } }
  | { type: 'openDeletedFileContent'; payload: { fileName: string; filePath?: string; deletedContent: string } }
  // 🎯 增强的 Lint 智能通知相关
  | { type: 'smart_notification_action'; payload: { sessionId: string; action: string; notificationId?: string; additionalData?: any } }
  | { type: 'quality_dashboard_request'; payload: { sessionId: string; timeRange?: string; scope?: 'workspace' | 'current_file' | 'specific_files'; files?: string[] } }
  | { type: 'fix_suggestion_request'; payload: { sessionId: string; files?: string[]; errorTypes?: string[]; priority?: 'high' | 'medium' | 'low' } }
  // 🎯 升级提示相关（用于解决webview沙箱限制）
  | { type: 'open_external_url'; payload: { url: string } }
  | { type: 'open_extension_marketplace'; payload: { extensionId: string } }
  | { type: 'open_extension_settings'; payload: {} }
  // 🎯 剪贴板缓存请求（用于智能粘贴代码引用）
  | { type: 'request_clipboard_cache'; payload: { code: string } }
  // 🎯 自定义规则管理
  | { type: 'rules_list_request'; payload: {} }
  | { type: 'rules_save'; payload: { rule: any } }
  | { type: 'rules_delete'; payload: { ruleId: string } }
  // 🎯 MCP 相关
  | { type: 'get_mcp_status'; payload: { sessionId: string } }
  | { type: 'open_mcp_settings'; payload: {} }
  | { type: 'set_mcp_enabled'; payload: { serverName: string; enabled: boolean } }
  | { type: 'get_mcp_enabled_states'; payload: { serverNames: string[] } }
  // 🎯 文件路径跳转相关
  | { type: 'open_file'; payload: { filePath: string; line?: number; symbol?: string } }
  | { type: 'goto_symbol'; payload: { symbol: string } }
  | { type: 'goto_line'; payload: { line: number } } // 🎯 跳转到当前文件的指定行
  | { type: 'open_extension_marketplace'; payload: { extensionId: string } }
  // 📝 记忆文件相关
  | { type: 'refresh_memory'; payload: {} }
  // 🎯 版本控制相关
  | { type: 'revert_to_message'; payload: { sessionId: string; messageId: string } }
  | { type: 'version_timeline_request'; payload: { sessionId: string } }
  | { type: 'version_revert_previous'; payload: { sessionId: string } }
  // 🎯 自定义斜杠命令相关
  | { type: 'get_slash_commands'; payload: {} }
  | { type: 'execute_custom_slash_command'; payload: { commandName: string; args: string } }
  // 🎯 用户积分统计请求
  | { type: 'request_user_stats'; payload: {} }
  // 🎯 后台任务管理
  | { type: 'background_task_request'; payload: { action: 'list' | 'kill'; taskId?: string } }
  | { type: 'background_task_move_to_background'; payload: { sessionId: string; toolCallId: string } };

// Message types from Extension to WebView
export type ExtensionToWebViewMessage =
  // 原有消息类型（现在包含sessionId）
  | { type: 'tool_execution_result'; payload: { requestId: string; result: ToolExecutionResult; sessionId: string } }
  | { type: 'tool_execution_error'; payload: { requestId: string; error: string; sessionId: string } }
  | { type: 'tool_execution_confirmation_request'; payload: ToolExecutionRequest & { sessionId: string } }
  | { type: 'tool_confirmation_request'; payload: { sessionId: string; toolCall: { toolId: string; toolName: string; displayName?: string; parameters: Record<string, any>; confirmationDetails: ToolCallConfirmationDetails } } }
  | { type: 'tool_calls_update'; payload: { toolCalls: ToolCall[]; sessionId: string; associatedMessageId?: string } }
  | { type: 'tool_results_continuation'; payload: ChatResponse & { sessionId: string } }
  | { type: 'tool_message'; payload: { id: string; toolId: string; toolName?: string; content: string; timestamp: number; toolMessageType: 'status' | 'output'; toolStatus?: 'executing' | 'success' | 'error' | 'cancelled'; toolParameters?: Record<string, any>; sessionId: string } }
  | { type: 'chat_response'; payload: ChatResponse & { sessionId: string } }
  | { type: 'chat_error'; payload: { error: string; sessionId: string } }
  | { type: 'chat_start'; payload: { messageId: string; sessionId: string } }
  | { type: 'chat_chunk'; payload: { content: string; messageId: string; isComplete?: boolean; sessionId: string } }
  | { type: 'chat_reasoning'; payload: { content: string; messageId: string; sessionId: string } }
  | { type: 'chat_complete'; payload: { messageId: string; sessionId: string; tokenUsage?: any } }
  | { type: 'context_update'; payload: ContextInfo & { sessionId?: string } }
  | { type: 'extension_version_response'; payload: { version: string } }
  | { type: 'update_check_response'; payload: { success: boolean; hasUpdate: boolean; currentVersion: string; latestVersion: string; forceUpdate: boolean; timestamp: string; downloadUrl: string } | { error: string } }
  // 🎯 新增流程状态消息类型
  | { type: 'flow_state_update'; payload: { sessionId: string; isProcessing: boolean; currentProcessingMessageId?: string; canAbort: boolean } }
  | { type: 'flow_aborted'; payload: { sessionId: string } }
  // 新的多Session响应消息类型
  | { type: 'session_list_update'; payload: SessionListUpdatePayload }
  | { type: 'session_history_response'; payload: { sessions: SessionInfo[]; total: number; hasMore: boolean; offset: number } }
  | { type: 'session_created'; payload: { session: SessionInfo } }
  | { type: 'session_updated'; payload: { sessionId: string; session: SessionInfo } }
  | { type: 'session_deleted'; payload: { sessionId: string } }
  | { type: 'session_switched'; payload: { sessionId: string; session: SessionInfo } }
  | { type: 'session_export_complete'; payload: { filePath: string; sessionCount: number } }
  | { type: 'session_import_complete'; payload: { importedSessions: SessionInfo[] } }
  // 🎯 文件回滚相关消息类型
  | { type: 'file_rollback_complete'; payload: { sessionId: string; result: any; targetMessageId: string } }
  | { type: 'file_rollback_failed'; payload: { sessionId: string; error: string; targetMessageId: string } }
  // 🎯 UI消息恢复相关
  | { type: 'restore_ui_history'; payload: { sessionId: string; messages: ChatMessage[]; rollbackableMessageIds: string[] } }
  // 🎯 请求前端发送UI历史记录
  | { type: 'request_ui_history'; payload: { sessionId: string } }
  // 🎯 可回滚消息ID列表更新
  | { type: 'update_rollbackable_ids'; payload: { sessionId: string; rollbackableMessageIds: string[] } }
  // 🎯 文件搜索结果
  | { type: 'file_search_result'; payload: { files: Array<{ label: string; value: string; description?: string }> } }
  // 🎯 符号搜索结果
  | { type: 'symbol_search_result'; payload: { symbols: Array<{ name: string; kind: number; containerName?: string; location?: any }> } }
  // 🎯 终端列表结果
  | { type: 'terminals_result'; payload: { terminals: Array<{ id: number; name: string }> } }
  // 🎯 终端输出结果
  | { type: 'terminal_output_result'; payload: { terminalId: number; name: string; output: string } }
  // 🎯 最近打开的文件结果
  | { type: 'recent_files_result'; payload: { files: Array<{ label: string; value: string; description?: string }> } }
  // 🎯 文件路径解析结果
  | { type: 'file_paths_resolved'; payload: { resolvedFiles: string[] } }
  // 🎯 项目设置相关
  | { type: 'project_settings_response'; payload: { yoloMode: boolean } }
  // 🎯 服务初始化状态
  | { type: 'service_initialization_status'; payload: { status: 'starting' | 'progress' | 'ready' | 'failed'; message: string; timestamp: number } }
  | { type: 'service_initialization_done'; payload: {} }
  // 🎯 SessionManager 初始化完成，所有历史 session 已恢复
  | { type: 'sessions_ready'; payload: { sessionCount: number } }
  // 🎯 增强的 Lint 智能通知
  | { type: 'smart_notification'; payload: { notificationData: any; sessionId: string | null; timestamp: number } }
  | { type: 'lint_suggestions'; payload: { suggestions: any[]; sessionId: string | null; timestamp: number } }
  // 🎯 记忆文件路径信息更新
  | { type: 'memory_files_update'; payload: { filePaths: string[]; fileCount: number } }
  | { type: 'tool_suggestion'; payload: { sessionId: string; toolName: string; params: any; timestamp: number } }
  // 🎯 模型配置相关
  | { type: 'model_response'; payload: { requestId: string; success: boolean; models?: any[]; currentModel?: string; error?: string } }
  // 🎯 预填充消息（用于右键菜单命令 - 自动发送）
  | { type: 'prefill_message'; payload: { message: string } }
  // 🎯 插入代码到输入框（只插入，不自动发送）
  | { type: 'insert_code_to_input'; payload: { fileName: string; filePath: string; code: string; startLine?: number; endLine?: number } }
  // 🎯 剪贴板缓存响应（用于智能粘贴代码引用）
  | { type: 'clipboard_cache_response'; payload: { found: boolean; fileName?: string; filePath?: string; code?: string; startLine?: number; endLine?: number } }
  // 🎯 自定义规则管理
  | { type: 'rules_list_response'; payload: { rules: any[] } }
  | { type: 'rules_save_response'; payload: { success: boolean; error?: string } }
  | { type: 'rules_delete_response'; payload: { success: boolean; error?: string } }
  | { type: 'open_rules_management'; payload: {} }
  // 🎯 NanoBanana 图像生成
  | { type: 'nanobanana_upload_response'; payload: { success: boolean; publicUrl?: string; error?: string } }
  | { type: 'nanobanana_generate_response'; payload: { success: boolean; taskId?: string; estimatedTime?: number; error?: string } }
  | { type: 'nanobanana_status_update'; payload: { taskId: string; status: 'pending' | 'processing' | 'completed' | 'failed'; progress?: number; resultUrls?: string[]; originalUrls?: string[]; errorMessage?: string; creditsDeducted?: number } }
  // 🎯 PPT 生成 (无状态轮询，任务提交后直接返回编辑页面URL)
  | { type: 'ppt_generate_response'; payload: { success: boolean; taskId?: string; editUrl?: string; error?: string } }
  // 🎯 PPT 大纲 AI 优化
  | { type: 'ppt_optimize_outline_response'; payload: { success: boolean; optimizedOutline?: string; error?: string } }
  // 🔌 MCP 相关消息类型
  | { type: 'mcp_status_update'; payload: MCPStatusPayload }
  | { type: 'mcp_enabled_states'; payload: { states: Record<string, boolean> } }
  // 🎯 自定义斜杠命令相关
  | { type: 'slash_commands_list'; payload: { commands: SlashCommandInfo[] } }
  | { type: 'slash_command_result'; payload: { success: boolean; prompt?: string; error?: string } }
  // 🎯 模型切换压缩确认
  | { type: 'compression_confirmation_request'; payload: { requestId: string; sessionId: string; targetModel: string; currentTokens: number; targetTokenLimit: number; compressionThreshold: number; message: string } }
  // 🎯 Token使用情况更新（压缩后）
  | { type: 'token_usage_update'; payload: { sessionId: string; tokenUsage: { totalTokens: number; tokenLimit: number; inputTokens: number; outputTokens: number } } }
  // 🎯 模型切换完成（压缩成功后通知前端更新模型选择器）
  | { type: 'model_switch_complete'; payload: { sessionId: string; modelName: string } }
  // 🎯 用户积分统计响应
  | { type: 'user_stats_response'; payload: { stats?: { totalQuota: number; usedCredits: number; remainingCredits: number; usagePercentage: number }; error?: string } }
  // 🎯 后台任务管理
  | { type: 'background_tasks_update'; payload: BackgroundTasksUpdatePayload }
  | { type: 'background_task_output'; payload: { taskId: string; output: string; isStderr?: boolean } }
  // 🎯 后台任务完成通知（用于触发 AI 继续）
  | { type: 'background_task_completed_notification'; payload: BackgroundTaskCompletedPayload }
  // 🎯 后台任务结果显示（在聊天界面显示任务输出）
  | { type: 'background_task_result'; payload: BackgroundTaskResultPayload };

/**
 * 🔌 MCP 状态消息负载
 */
export interface MCPStatusPayload {
  sessionId: string;
  discoveryState: 'not_started' | 'in_progress' | 'completed';
  servers: MCPServerStatusInfo[];
}

/**
 * 🎯 后台任务信息（Webview 使用的简化版本）
 */
export interface BackgroundTaskInfo {
  id: string;
  command: string;
  directory?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  pid?: number;
  startTime: number;
  endTime?: number;
  output: string;
  stderr: string;
  exitCode?: number;
  error?: string;
}

/**
 * 🎯 后台任务更新负载
 */
export interface BackgroundTasksUpdatePayload {
  tasks: BackgroundTaskInfo[];
  runningCount: number;
}

/**
 * 🎯 后台任务完成通知负载（用于触发 AI 继续）
 */
export interface BackgroundTaskCompletedPayload {
  taskId: string;
  command: string;
  status: 'completed' | 'failed' | 'cancelled';
  exitCode?: number;
  output?: string;
  error?: string;
}

/**
 * 🎯 后台任务结果显示负载（用于在聊天界面显示任务输出）
 */
export interface BackgroundTaskResultPayload {
  sessionId: string;
  taskId: string;
  command: string;
  status: 'completed' | 'failed' | 'cancelled';
  exitCode?: number;
  output: string;
}

/**
 * 🔌 MCP 服务器状态信息
 */
export interface MCPServerStatusInfo {
  name: string;
  status: 'disconnected' | 'connecting' | 'connected';
  enabled?: boolean; // 是否启用（控制工具是否注册给 AI）
  toolCount: number;
  error?: string;
}

export type Message = WebViewToExtensionMessage | ExtensionToWebViewMessage;

// Note: ToolDefinition, ParameterDefinition, and AppState interfaces removed
// These are duplicates of types defined elsewhere and not used in actual implementation
// Tool definitions come from backend dynamically, not static frontend types

// Configuration
export interface ExtensionConfiguration {
  enableAutoAnalysis: boolean;
  confirmDangerousOperations: boolean;
  maxHistoryItems: number;
}
