/**
 * Type definitions for the WebView React app
 */

// Re-export types from the extension backend
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

// 🎯 新的消息内容格式
export type MessageContentPart =
  | { type: 'text'; value: string }
  | { type: 'file_reference'; value: { fileName: string; filePath: string } }
  | { type: 'image_reference'; value: { id: string; fileName: string; data: string; mimeType: string; originalSize: number; compressedSize: number; width?: number; height?: number } }
  | { type: 'code_reference'; value: { fileName: string; filePath: string; code: string; startLine?: number; endLine?: number } }
  | { type: 'text_file_content'; value: { fileName: string; content: string; language?: string; size: number } }

export type MessageContent = MessageContentPart[];

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool';
  content: MessageContent;  // 🎯 直接使用新格式
  timestamp: number;

  // 🎯 流式聊天支持
  isStreaming?: boolean;       // 是否正在流式接收

  // 🎯 AI思考过程（reasoning）支持
  reasoning?: string;          // AI思考过程内容（流式累积）
  isReasoning?: boolean;       // 是否正在显示思考过程

  // 🎯 AI助手消息专用字段（承载工具调用状态）
  associatedToolCalls?: ToolCall[];  // 🎯 AI消息关联的工具调用列表
  isProcessingTools?: boolean;       // 🎯 是否正在处理工具调用
  toolsCompleted?: boolean;          // 🎯 所有工具调用是否完成

  // 🎯 工具输出消息专用字段
  toolName?: string;           // 工具名称
  toolId?: string;             // 工具ID
  toolStatus?: 'executing' | 'success' | 'error' | 'cancelled';
  toolParameters?: Record<string, any>;
  toolMessageType?: 'status' | 'output';  // 区分状态消息和输出消息

  // 🎯 Token使用情况
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    tokenLimit: number;
    cachedContentTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    creditsUsage?: number;
    cacheHitRate?: number;
  };
}

// 🎯 增强的工具调用状态枚举
export enum ToolCallStatus {
  Scheduled = 'scheduled',
  Validating = 'validating',
  Executing = 'executing',
  WaitingForConfirmation = 'awaiting_approval',
  Success = 'success',
  Error = 'error',
  Canceled = 'cancelled'
}

// 🎯 工具调用确认详情
export interface ToolCallConfirmationDetails {
  message: string;
  requiresConfirmation: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
  affectedFiles?: string[];
  estimatedTime?: string;
  reversible?: boolean;
}

// 🎯 增强的工具调用接口
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
}

// Note: QuickAction, ToolDefinition, ParameterDefinition, and AppState interfaces
// have been removed as they are not used in the actual implementation.
// The app uses MultiSessionAppState from useMultiSessionState hook instead.

export interface MessageFromExtension {
  type: 'tool_execution_result' |
       'tool_execution_error' |
       'tool_execution_confirmation_request' |
       'tool_calls_update' |           // 🎯 新增：工具调用状态更新
       'tool_confirmation_request' |   // 🎯 新增：确认请求
       'tool_results_continuation' |   // 🎯 新增：工具结果提交后的AI续写
       'chat_response' |
       'chat_error' |
       'context_update' |
       'file_search_result' |          // 🎯 新增：文件搜索结果
       'extension_version_response' |  // 🎯 新增：扩展版本响应
       'update_check_response' |       // 🎯 新增：更新检测响应
       'quick_action';
  payload: Record<string, unknown>;
}

export interface MessageToExtension {
  type: 'tool_execution_request' |
       'tool_execution_confirm' |
       'tool_confirmation_response' | // 🎯 新增：确认响应
       'tool_cancel_all' |            // 🎯 新增：取消所有工具
       'chat_message' |
       'get_context' |
       'file_search' |                // 🎯 新增：文件搜索
       'get_terminals' |              // 🎯 新增：获取终端列表
       'get_terminal_output' |        // 🎯 新增：获取终端输出
       'get_recent_files' |           // 🎯 新增：获取最近打开的文件
       'get_extension_version' |      // 🎯 新增：获取扩展版本号
       'check_for_updates' |          // 🎯 新增：检查更新
       'openDiffInEditor' |           // 🎯 新增：在编辑器中打开diff
       'openDeletedFileContent' |     // 🎯 新增：查看删除文件内容
       'acceptFileChanges' |          // 🎯 新增：接受文件变更
       'open_external_url' |          // 🎯 新增：打开外部URL（用于升级提示）
       'open_extension_marketplace' | // 🎯 新增：打开扩展市场（用于升级提示）
       'get_available_models' |       // 🎯 新增：获取可用模型列表
       'set_current_model' |          // 🎯 新增：设置当前模型
       'get_current_model' |          // 🎯 新增：获取当前模型
       'execute_slash_command' |      // 🎯 新增：执行 slash 命令（如 /refine）
       'get_slash_commands' |         // 🎯 新增：获取自定义斜杠命令列表
       'execute_custom_slash_command' | // 🎯 新增：执行自定义斜杠命令
       'open_file' |                  // 🎯 新增：打开文件并跳转到指定行/方法
       'goto_symbol' |                // 🎯 新增：跳转到符号（方法名）
       'goto_line' |                  // 🎯 新增：跳转到当前文件的指定行
       'ready';
  payload: Record<string, unknown>;
}

// 导入多Session消息类型
import { MultiSessionMessageToExtension } from '../services/multiSessionMessageService';

// VS Code webview API types
export interface VSCodeAPI {
  postMessage(message: MessageToExtension | MultiSessionMessageToExtension): void;
  setState(state: Record<string, unknown>): void;
  getState(): Record<string, unknown> | null;
}

declare global {
  interface Window {
    vscode: VSCodeAPI;
    isVSCodeSidebar?: boolean;
  }
}