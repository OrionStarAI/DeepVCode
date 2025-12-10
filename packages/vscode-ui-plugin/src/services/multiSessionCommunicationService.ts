/**
 * Multi-Session Communication Service - Handles message passing with Session support
 * 支持多Session的通信服务
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import * as vscode from 'vscode';
import {
  WebViewToExtensionMessage,
  ExtensionToWebViewMessage,
  ToolExecutionRequest,
  ToolExecutionResult,
  ChatMessage,
  ChatResponse,
  ContextInfo,
  CreateSessionMessagePayload,
  UpdateSessionMessagePayload,
  SessionOperationPayload,
  SessionExportPayload,
  SessionImportPayload
} from '../types/messages';
import { Logger } from '../utils/logger';
import { SessionInfo } from '../types/sessionTypes';

export class MultiSessionCommunicationService {
  private webview?: vscode.Webview;
  private messageHandlers = new Map<string, Function[]>();
  private messageQueue: ExtensionToWebViewMessage[] = [];
  private isWebviewReady = false;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  constructor(private logger: Logger) {}

  async initialize() {
    this.logger.info('Initializing MultiSessionCommunicationService');
  }

  setWebview(webview: vscode.Webview) {
    this.webview = webview;
    this.isWebviewReady = false;
    // 🎯 创建新的 ready Promise
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    this.setupMessageListener();
  }

  /**
   * 🎯 等待 WebView 准备就绪
   */
  async waitForReady(timeout: number = 5000): Promise<boolean> {
    if (this.isWebviewReady) {
      return true;
    }

    if (!this.readyPromise) {
      return false;
    }

    try {
      await Promise.race([
        this.readyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
      ]);
      return true;
    } catch (error) {
      this.logger.warn('Timeout waiting for WebView ready');
      return false;
    }
  }

  // =============================================================================
  // 发送消息到WebView的通用方法
  // =============================================================================

  async sendMessage(message: ExtensionToWebViewMessage) {
    if (!this.webview) {
      this.logger.warn('WebView not available, queueing message', message);
      this.messageQueue.push(message);
      return;
    }

    if (!this.isWebviewReady) {
      this.logger.debug('WebView not ready, queueing message', message);
      this.messageQueue.push(message);
      return;
    }

    try {
      await this.webview.postMessage(message);
      this.logger.debug('Sent message to WebView', message);
    } catch (error) {
      this.logger.error('Failed to send message to WebView', error instanceof Error ? error : undefined);
    }
  }

  // =============================================================================
  // Session管理相关消息发送方法
  // =============================================================================

  async sendSessionListUpdate(sessions: SessionInfo[], currentSessionId: string | null) {
    await this.sendMessage({
      type: 'session_list_update',
      payload: { sessions, currentSessionId }
    });
  }

  async sendSessionCreated(session: SessionInfo) {
    await this.sendMessage({
      type: 'session_created',
      payload: { session }
    });
  }

  async sendSessionUpdated(sessionId: string, session: SessionInfo) {
    await this.sendMessage({
      type: 'session_updated',
      payload: { sessionId, session }
    });
  }

  async sendSessionDeleted(sessionId: string) {
    await this.sendMessage({
      type: 'session_deleted',
      payload: { sessionId }
    });
  }

  async sendSessionSwitched(sessionId: string, session: SessionInfo) {
    await this.sendMessage({
      type: 'session_switched',
      payload: { sessionId, session }
    });
  }

  async sendSessionExportComplete(filePath: string, sessionCount: number) {
    await this.sendMessage({
      type: 'session_export_complete',
      payload: { filePath, sessionCount }
    });
  }

  async sendSessionImportComplete(importedSessions: SessionInfo[]) {
    await this.sendMessage({
      type: 'session_import_complete',
      payload: { importedSessions }
    });
  }

  // 🎯 UI历史恢复消息发送
  async sendRestoreUIHistory(sessionId: string, messages: any[], rollbackableMessageIds: string[] = []): Promise<void> {
    await this.sendMessage({
      type: 'restore_ui_history',
      payload: { sessionId, messages, rollbackableMessageIds }
    });
  }

  // 🎯 发送可回滚消息ID列表更新
  async sendRollbackableIdsUpdate(sessionId: string, rollbackableMessageIds: string[]): Promise<void> {
    await this.sendMessage({
      type: 'update_rollbackable_ids',
      payload: { sessionId, rollbackableMessageIds }
    });
  }

  // 🎯 请求前端发送UI历史记录
  async sendRequestUIHistory(sessionId: string): Promise<void> {
    await this.sendMessage({
      type: 'request_ui_history',
      payload: { sessionId }
    });
  }

  // =============================================================================
  // 原有的消息发送方法（现在支持sessionId）
  // =============================================================================

  async sendToolExecutionResult(sessionId: string, requestId: string, result: ToolExecutionResult) {
    await this.sendMessage({
      type: 'tool_execution_result',
      payload: { sessionId, requestId, result }
    });
  }

  async sendToolExecutionError(sessionId: string, requestId: string, error: string) {
    await this.sendMessage({
      type: 'tool_execution_error',
      payload: { sessionId, requestId, error }
    });
  }

  async sendToolExecutionConfirmationRequest(sessionId: string, request: ToolExecutionRequest) {
    await this.sendMessage({
      type: 'tool_execution_confirmation_request',
      payload: { ...request, sessionId }
    });
  }

  async sendChatResponse(sessionId: string, response: ChatResponse) {
    await this.sendMessage({
      type: 'chat_response',
      payload: { ...response, sessionId }
    });
  }

  /**
   * 发送流式聊天内容块
   */
  async sendChatChunk(sessionId: string, chunk: { content: string; messageId: string; isComplete?: boolean }) {
    await this.sendMessage({
      type: 'chat_chunk',
      payload: { ...chunk, sessionId }
    });
  }

  /**
   * 🎯 发送AI思考过程（reasoning）内容
   */
  async sendChatReasoning(sessionId: string, content: string, messageId: string) {
    await this.sendMessage({
      type: 'chat_reasoning',
      payload: { content, messageId, sessionId }
    });
  }

  /**
   * 发送聊天开始信号
   */
  async sendChatStart(sessionId: string, messageId: string) {
    await this.sendMessage({
      type: 'chat_start',
      payload: { messageId, sessionId }
    });
  }

  /**
   * 发送聊天结束信号
   */
  async sendChatComplete(sessionId: string, messageId: string, tokenUsage?: any) {
    await this.sendMessage({
      type: 'chat_complete',
      payload: { messageId, sessionId, tokenUsage }
    });
  }

  async sendChatError(sessionId: string, error: string) {
    await this.sendMessage({
      type: 'chat_error',
      payload: { error, sessionId }
    });
  }

  async sendContextUpdate(context: ContextInfo, sessionId?: string) {
    await this.sendMessage({
      type: 'context_update',
      payload: { ...context, sessionId }
    });
  }

  async sendExtensionVersionResponse(version: string) {
    await this.sendMessage({
      type: 'extension_version_response',
      payload: { version }
    });
  }

  async sendUpdateCheckResponse(result: any) {
    await this.sendMessage({
      type: 'update_check_response',
      payload: result
    });
  }
  /**
   * 🎯 发送流程状态更新
   */
  async sendFlowStateUpdate(sessionId: string, isProcessing: boolean, currentProcessingMessageId?: string, canAbort = false) {
    await this.sendMessage({
      type: 'flow_state_update',
      payload: { sessionId, isProcessing, currentProcessingMessageId, canAbort }
    });
  }

  /**
   * 🎯 发送流程中断完成通知
   */
  async sendFlowAborted(sessionId: string) {
    await this.sendMessage({
      type: 'flow_aborted',
      payload: { sessionId }
    });
  }

  // =============================================================================
  // 🎯 登录相关消息发送方法
  // =============================================================================

  /**
   * 发送通用消息（用于登录相关消息）
   */
  async sendGenericMessage(type: string, payload: Record<string, any>) {
    await this.sendMessage({
      type: type as any,
      payload
    });
  }

  async sendToolConfirmationRequest(
    sessionId: string,
    toolId: string,
    toolName: string,
    displayName: string | undefined,
    parameters: Record<string, any>,
    confirmationDetails: any
  ) {
    await this.sendMessage({
      type: 'tool_confirmation_request',
      payload: {
        sessionId,
        toolCall: {
          toolId,
          toolName,
          displayName,
          parameters,
          confirmationDetails
        }
      }
    });
  }

  async sendToolCallsUpdate(sessionId: string, toolCalls: any[], associatedMessageId?: string) {
    await this.sendMessage({
      type: 'tool_calls_update',
      payload: { sessionId, toolCalls, associatedMessageId }
    });
  }

  async sendToolResultsContinuation(sessionId: string, response: any) {
    await this.sendMessage({
      type: 'tool_results_continuation',
      payload: { ...response, sessionId }
    });
  }

  async sendToolMessage(sessionId: string, toolMessage: {
    id: string;
    toolId: string;
    toolName?: string;
    content: string;
    timestamp: number;
    toolMessageType: 'status' | 'output';
    toolStatus?: 'executing' | 'success' | 'error' | 'cancelled';
    toolParameters?: Record<string, any>;
  }) {
    await this.sendMessage({
      type: 'tool_message',
      payload: { ...toolMessage, sessionId }
    });
  }

  // =============================================================================
  // 🎯 文件搜索相关消息发送方法
  // =============================================================================

  async sendFileSearchResult(files: any[]) {
    await this.sendMessage({
      type: 'file_search_result',
      payload: { files }
    });
  }

  async sendFilePathsResolved(resolvedFiles: string[]) {
    await this.sendMessage({
      type: 'file_paths_resolved',
      payload: { resolvedFiles }
    });
  }

  // 🎯 终端相关消息发送方法
  async sendTerminalsResult(terminals: Array<{ id: number; name: string }>) {
    await this.sendMessage({
      type: 'terminals_result',
      payload: { terminals }
    });
  }

  async sendTerminalOutputResult(terminalId: number, name: string, output: string) {
    await this.sendMessage({
      type: 'terminal_output_result',
      payload: { terminalId, name, output }
    });
  }

  async sendRecentFilesResult(files: Array<{ label: string; value: string; description?: string }>) {
    await this.sendMessage({
      type: 'recent_files_result',
      payload: { files }
    });
  }

  // =============================================================================
  // 消息监听器注册方法
  // =============================================================================

  // Session管理监听器
  onSessionCreate(handler: (payload: CreateSessionMessagePayload) => void): vscode.Disposable {
    return this.addMessageHandler('session_create', handler);
  }

  onSessionDelete(handler: (payload: SessionOperationPayload) => void): vscode.Disposable {
    return this.addMessageHandler('session_delete', handler);
  }

  onSessionSwitch(handler: (payload: SessionOperationPayload) => void): vscode.Disposable {
    return this.addMessageHandler('session_switch', handler);
  }

  onSessionUpdate(handler: (payload: UpdateSessionMessagePayload) => void): vscode.Disposable {
    return this.addMessageHandler('session_update', handler);
  }

  onSessionDuplicate(handler: (payload: SessionOperationPayload) => void): vscode.Disposable {
    return this.addMessageHandler('session_duplicate', handler);
  }

  onSessionClear(handler: (payload: SessionOperationPayload) => void): vscode.Disposable {
    return this.addMessageHandler('session_clear', handler);
  }

  onSessionExport(handler: (payload: SessionExportPayload) => void): vscode.Disposable {
    return this.addMessageHandler('session_export', handler);
  }

  onSessionImport(handler: (payload: SessionImportPayload) => void): vscode.Disposable {
    return this.addMessageHandler('session_import', handler);
  }

  onExportChat(handler: (payload: { sessionId: string; title: string; content: string; format: string }) => void): vscode.Disposable {
    return this.addMessageHandler('export_chat', handler);
  }

  onSessionListRequest(handler: (payload?: { includeAll?: boolean; offset?: number; limit?: number; searchQuery?: string }) => void): vscode.Disposable {
    return this.addMessageHandler('session_list_request', handler);
  }

  // 🎯 UI消息保存监听器
  onSaveUIMessage(handler: (data: { sessionId: string; message: any }) => void): vscode.Disposable {
    return this.addMessageHandler('save_ui_message', handler);
  }

  onSaveSessionUIHistory(handler: (data: { sessionId: string; messages: any[] }) => void): vscode.Disposable {
    return this.addMessageHandler('save_session_ui_history', handler);
  }

  // 原有的监听器（现在包含sessionId）
  onToolExecutionRequest(handler: (request: ToolExecutionRequest & { sessionId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('tool_execution_request', handler);
  }

  onToolExecutionConfirm(handler: (data: { requestId: string; confirmed: boolean; sessionId?: string }) => void): vscode.Disposable {
    return this.addMessageHandler('tool_execution_confirm', handler);
  }

  onChatMessage(handler: (message: ChatMessage & { sessionId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('chat_message', handler);
  }

  onEditMessageAndRegenerate(handler: (data: { messageId: string; newContent: any; sessionId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('edit_message_and_regenerate', handler);
  }

  onRollbackToMessage(handler: (data: { messageId: string; sessionId: string; originalMessages?: any[] }) => void): vscode.Disposable {
    return this.addMessageHandler('rollback_to_message', handler);
  }

  onGetContext(handler: (data: { sessionId?: string }) => void): vscode.Disposable {
    return this.addMessageHandler('get_context', handler);
  }

  onGetExtensionVersion(handler: (data: {}) => void): vscode.Disposable {
    return this.addMessageHandler('get_extension_version', handler);
  }

  onStartServices(handler: (data: {}) => void): vscode.Disposable {
    return this.addMessageHandler('start_services', handler);
  }

  onCheckForUpdates(handler: (data: {}) => void): vscode.Disposable {
    return this.addMessageHandler('check_for_updates', handler);
  }

  onToolConfirmationResponse(handler: (data: { toolId: string; confirmed: boolean; userInput?: string; sessionId: string; outcome?: string }) => void): vscode.Disposable {
    return this.addMessageHandler('tool_confirmation_response', handler);
  }

  onToolCancelAll(handler: (data: { sessionId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('tool_cancel_all', handler);
  }

  // 🎯 版本控制消息处理
  onRevertToMessage(handler: (data: { sessionId: string; messageId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('revert_to_message', handler);
  }

  onVersionTimelineRequest(handler: (data: { sessionId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('version_timeline_request', handler);
  }

  onVersionRevertPrevious(handler: (data: { sessionId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('version_revert_previous', handler);
  }

  /**
   * 🎯 监听流程中断请求
   */
  onFlowAbort(handler: (data: { sessionId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('flow_abort', handler);
  }

  // 🎯 登录相关监听器
  onLoginCheckStatus(handler: (payload: any) => void): vscode.Disposable {
    return this.addMessageHandler('login_check_status', handler);
  }

  onLoginStart(handler: (payload: any) => void): vscode.Disposable {
    return this.addMessageHandler('login_start', handler);
  }

  // 🎯 文件搜索相关监听器
  onFileSearch(handler: (data: { prefix: string }) => void): vscode.Disposable {
    return this.addMessageHandler('file_search', handler);
  }

  // 🎯 文件路径解析相关监听器
  onResolveFilePaths(handler: (data: { files: string[] }) => void): vscode.Disposable {
    return this.addMessageHandler('resolve_file_paths', handler);
  }

  // 🎯 终端相关监听器
  onGetTerminals(handler: () => void): vscode.Disposable {
    this.logger.info('🔧 Registering handler for get_terminals');
    return this.addMessageHandler('get_terminals', handler);
  }

  onGetTerminalOutput(handler: (data: { terminalId: number }) => void): vscode.Disposable {
    this.logger.info('🔧 Registering handler for get_terminal_output');
    return this.addMessageHandler('get_terminal_output', handler);
  }

  // 🎯 最近打开文件监听器
  onGetRecentFiles(handler: () => void): vscode.Disposable {
    this.logger.info('🔧 Registering handler for get_recent_files');
    return this.addMessageHandler('get_recent_files', handler);
  }

  // 🎯 项目设置更新监听器
  onProjectSettingsUpdate(handler: (data: { yoloMode: boolean }) => void): vscode.Disposable {
    return this.addMessageHandler('project_settings_update', handler);
  }

  // 🎯 项目设置请求监听器
  onProjectSettingsRequest(handler: () => void): vscode.Disposable {
    return this.addMessageHandler('project_settings_request', handler);
  }

  // 🎯 打开外部URL监听器（用于升级提示）
  onOpenExternalUrl(handler: (data: { url: string }) => void): vscode.Disposable {
    return this.addMessageHandler('open_external_url', handler);
  }

  // 🎯 打开扩展市场监听器（用于升级提示）
  onOpenExtensionMarketplace(handler: (data: { extensionId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('open_extension_marketplace', handler);
  }

  // 🎯 自定义规则管理监听器
  onRulesListRequest(handler: () => void): vscode.Disposable {
    return this.addMessageHandler('rules_list_request', handler);
  }

  onRulesSave(handler: (data: { rule: any }) => void): vscode.Disposable {
    return this.addMessageHandler('rules_save', handler);
  }

  onRulesDelete(handler: (data: { ruleId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('rules_delete', handler);
  }

  // 🎯 文件路径跳转监听器
  onOpenFile(handler: (data: { filePath: string; line?: number; symbol?: string }) => void): vscode.Disposable {
    return this.addMessageHandler('open_file', handler);
  }

  onGotoSymbol(handler: (data: { symbol: string }) => void): vscode.Disposable {
    return this.addMessageHandler('goto_symbol', handler);
  }

  onGotoLine(handler: (data: { line: number }) => void): vscode.Disposable {
    return this.addMessageHandler('goto_line', handler);
  }

  // 🎯 发送项目设置响应
  async sendProjectSettingsResponse(settings: { yoloMode: boolean }) {
    await this.sendMessage({
      type: 'project_settings_response',
      payload: settings
    });
  }

  // 🎯 发送服务初始化完成通知
  async sendServiceInitializationDone() {
    await this.sendMessage({
      type: 'service_initialization_done',
      payload: {}
    });
  }

  // 🎯 发送规则列表响应
  async sendRulesListResponse(rules: any[]) {
    await this.sendMessage({
      type: 'rules_list_response',
      payload: { rules }
    });
  }

  // 🎯 发送规则保存响应
  async sendRulesSaveResponse(success: boolean, error?: string) {
    await this.sendMessage({
      type: 'rules_save_response',
      payload: { success, error }
    });
  }

  // 🎯 发送规则删除响应
  async sendRulesDeleteResponse(success: boolean, error?: string) {
    await this.sendMessage({
      type: 'rules_delete_response',
      payload: { success, error }
    });
  }

  // 🎯 在编辑器中打开diff监听器
  onOpenDiffInEditor(handler: (data: { fileDiff: string; fileName: string; originalContent: string; newContent: string }) => void): vscode.Disposable {
    return this.addMessageHandler('openDiffInEditor', handler);
  }

  // 🎯 查看删除文件内容监听器
  onOpenDeletedFileContent(handler: (data: { fileName: string; filePath?: string; deletedContent: string }) => void): vscode.Disposable {
    return this.addMessageHandler('openDeletedFileContent', handler);
  }

  // 🎯 文件变更接受监听器
  onAcceptFileChanges(handler: (data: { lastAcceptedMessageId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('acceptFileChanges', handler);
  }

  // =============================================================================
  // 🎯 模型配置相关功能
  // =============================================================================

  // 🎯 获取可用模型列表监听器
  onGetAvailableModels(handler: (data: { requestId: string }) => void): vscode.Disposable {
    return this.addMessageHandler('get_available_models', handler);
  }

  // 🎯 设置当前模型监听器
  onSetCurrentModel(handler: (data: { requestId: string; modelName: string; sessionId?: string }) => void): vscode.Disposable {
    return this.addMessageHandler('set_current_model', handler);
  }

  // 🎯 获取当前模型监听器
  onGetCurrentModel(handler: (data: { requestId: string; sessionId?: string }) => void): vscode.Disposable {
    return this.addMessageHandler('get_current_model', handler);
  }

  // 🎯 发送模型响应
  async sendModelResponse(requestId: string, response: { success: boolean; models?: any[]; currentModel?: string; error?: string }) {
    await this.sendMessage({
      type: 'model_response',
      payload: { requestId, ...response }
    });
  }

  // =============================================================================
  // 🎯 增强的 Lint 智能通知功能
  // =============================================================================

  /**
   * 🎯 发送智能通知到聊天界面
   */
  async sendSmartNotification(data: any): Promise<void> {
    try {
      // 构建智能通知消息
      const message = {
        type: 'smart_notification' as const,
        payload: {
          notificationData: data,
          sessionId: this.getCurrentSessionId(), // 发送到当前活跃 session
          timestamp: Date.now()
        }
      };

      await this.sendMessage(message);
      this.logger.info(`📨 Sent smart notification: ${data.type}`);

    } catch (error) {
      this.logger.error('❌ Failed to send smart notification', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 🎯 发送批量智能建议
   */
  async sendLintSuggestions(suggestions: Array<{
    file: string;
    suggestionType: 'auto_fix' | 'manual_review' | 'ignore';
    description: string;
    command?: string;
    priority: 'high' | 'medium' | 'low';
  }>): Promise<void> {
    try {
      const message = {
        type: 'lint_suggestions' as const,
        payload: {
          suggestions,
          sessionId: this.getCurrentSessionId(),
          timestamp: Date.now()
        }
      };

      await this.sendMessage(message);
      this.logger.info(`💡 Sent ${suggestions.length} lint suggestions`);

    } catch (error) {
      this.logger.error('❌ Failed to send lint suggestions', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 🎯 发送修复完成通知
   */
  async sendFixCompletionNotification(fixData: {
    totalFixed: number;
    filesAffected: string[];
    remainingIssues: number;
    nextSteps: string[];
  }): Promise<void> {
    try {
      let message = `🎉 **修复完成!** \n\n`;
      message += `✅ 成功修复 ${fixData.totalFixed} 个问题\n`;
      message += `📁 涉及文件: ${fixData.filesAffected.length} 个\n`;

      if (fixData.remainingIssues > 0) {
        message += `⚠️ 剩余问题: ${fixData.remainingIssues} 个\n\n`;
        message += `**建议的后续步骤:**\n`;
        fixData.nextSteps.forEach((step, index) => {
          message += `${index + 1}. ${step}\n`;
        });
      } else {
        message += `\n🌟 **太棒了！所有问题都已修复！**`;
      }

      const notificationData = {
        type: 'smart_lint_notification',
        message,
        timestamp: Date.now(),
        actionSuggestions: fixData.remainingIssues > 0 ? [
          { action: 'check_remaining', label: '📋 检查剩余问题', command: 'read_lints' },
          { action: 'continue_fixing', label: '🔧 继续修复' }
        ] : [
          { action: 'celebrate', label: '🎉 很好!' },
          { action: 'run_tests', label: '🧪 运行测试验证' }
        ],
        metadata: {
          messageType: 'fix_completion',
          severity: 'info',
          fixData
        }
      };

      await this.sendSmartNotification(notificationData);

    } catch (error) {
      this.logger.error('❌ Failed to send fix completion notification', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 🎯 处理智能通知的用户操作响应
   */
  onSmartNotificationAction(callback: (data: {
    sessionId: string;
    action: string;
    notificationId?: string;
    additionalData?: any;
  }) => Promise<void>): vscode.Disposable {
    return this.addMessageHandler('smart_notification_action', callback);
  }

  /**
   * 🎯 处理质量仪表板请求
   */
  onQualityDashboardRequest(callback: (data: {
    sessionId: string;
    timeRange?: string;
    scope?: 'workspace' | 'current_file' | 'specific_files';
    files?: string[];
  }) => Promise<void>): vscode.Disposable {
    return this.addMessageHandler('quality_dashboard_request', callback);
  }

  /**
   * 🎯 处理修复建议请求
   */
  onFixSuggestionRequest(callback: (data: {
    sessionId: string;
    files?: string[];
    errorTypes?: string[];
    priority?: 'high' | 'medium' | 'low';
  }) => Promise<void>): vscode.Disposable {
    return this.addMessageHandler('fix_suggestion_request', callback);
  }

  /**
   * 🎯 获取当前活跃的 session ID
   */
  private getCurrentSessionId(): string | null {
    // 这里需要根据实际的 session 管理逻辑来实现
    // 暂时返回默认值，实际实现时需要从 SessionManager 获取
    return 'default_session';
  }

  /**
   * 🎯 发送工具建议到 AI
   */
  private async sendToolSuggestion(sessionId: string, toolName: string, params: any): Promise<void> {
    try {
      const message = {
        type: 'tool_suggestion' as const,
        payload: {
          sessionId,
          toolName,
          params,
          timestamp: Date.now()
        }
      };

      await this.sendMessage(message);
      this.logger.info(`🔧 Sent tool suggestion: ${toolName}`);

    } catch (error) {
      this.logger.error('❌ Failed to send tool suggestion', error instanceof Error ? error : undefined);
    }
  }

  // =============================================================================
  // 辅助方法
  // =============================================================================

  /**
   * 添加消息处理器（公共方法，支持外部直接调用）
   */
  addMessageHandler(type: string, handler: Function): vscode.Disposable {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);

    return {
      dispose: () => {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      }
    };
  }

  private setupMessageListener() {
    if (!this.webview) return;

    this.webview.onDidReceiveMessage(async (message: WebViewToExtensionMessage) => {
      this.logger.debug('Received message from WebView', message);

      try {
        // Handle ready message specially
        if (message.type === 'ready') {
          this.isWebviewReady = true;
          this.logger.info(`WebView is ready, flushing ${this.messageQueue.length} queued messages`);

          // 🎯 resolve ready Promise
          if (this.readyResolve) {
            this.readyResolve();
            this.readyResolve = null;
          }

          // 🎯 修复：直接发送队列消息，避免递归调用sendMessage
          for (const queuedMessage of this.messageQueue) {
            try {
              if (this.webview) {
                await this.webview.postMessage(queuedMessage);
                this.logger.debug('Flushed queued message to WebView', queuedMessage);
              }
            } catch (error) {
              this.logger.error('Failed to flush queued message', error instanceof Error ? error : undefined);
            }
          }
          this.messageQueue = [];
          return;
        }

        // Handle other messages
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
          for (const handler of handlers) {
            await handler(message.payload);
          }
        } else {
          this.logger.warn('No handler for message type', message.type);
        }
      } catch (error) {
        this.logger.error('Error handling message from WebView', error instanceof Error ? error : undefined);
      }
    });
  }


  // =============================================================================
  // 🎯 NanoBanana 图像生成相关方法
  // =============================================================================

  /**
   * 发送NanoBanana上传响应
   */
  async sendNanoBananaUploadResponse(data: { success: boolean; publicUrl?: string; error?: string }) {
    await this.sendMessage({
      type: 'nanobanana_upload_response',
      payload: data
    });
  }

  /**
   * 发送NanoBanana生成响应
   */
  async sendNanoBananaGenerateResponse(data: { success: boolean; taskId?: string; estimatedTime?: number; error?: string }) {
    await this.sendMessage({
      type: 'nanobanana_generate_response',
      payload: data
    });
  }

  /**
   * 发送NanoBanana状态更新
   */
  async sendNanoBananaStatusUpdate(data: {
    taskId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    resultUrls?: string[];
    originalUrls?: string[];
    errorMessage?: string;
    creditsDeducted?: number;
  }) {
    await this.sendMessage({
      type: 'nanobanana_status_update',
      payload: data
    });
  }

  /**
   * 监听NanoBanana上传请求
   */
  onNanoBananaUpload(handler: (data: { filename: string; contentType: string; fileData: string }) => void) {
    return this.addMessageHandler('nanobanana_upload', handler);
  }

  /**
   * 监听NanoBanana生成请求
   */
  onNanoBananaGenerate(handler: (data: { prompt: string; aspectRatio: string; imageSize: string; referenceImageUrl?: string }) => void) {
    return this.addMessageHandler('nanobanana_generate', handler);
  }

  /**
   * 监听NanoBanana状态查询请求
   */
  onNanoBananaStatus(handler: (data: { taskId: string }) => void) {
    return this.addMessageHandler('nanobanana_status', handler);
  }

  async dispose() {
    this.logger.info('Disposing MultiSessionCommunicationService');
    this.webview = undefined;
    this.messageHandlers.clear();
    this.messageQueue = [];
    this.isWebviewReady = false;
  }
}
