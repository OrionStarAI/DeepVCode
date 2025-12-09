/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { WebViewService } from './services/webviewService';
import { ContextService } from './services/contextService';
import { MultiSessionCommunicationService } from './services/multiSessionCommunicationService';
import { SessionManager } from './services/sessionManager';
import { FileSearchService } from './services/fileSearchService';
import { FileRollbackService } from './services/fileRollbackService';
import { VersionControlManager } from './services/versionControlManager';
import { SimpleRevertService } from './services/simpleRevertService';
import { CursorStyleRevertService } from './services/cursorStyleRevertService';
import { DeepVInlineCompletionProvider } from './services/inlineCompletionProvider';
import { CompletionCache } from './services/completionCache';
import { CompletionScheduler } from './services/completionScheduler';
import { RuleService } from './services/ruleService';
import { ContextBuilder } from './services/contextBuilder';
import { Logger } from './utils/logger';
import { startupOptimizer } from './utils/startupOptimizer';
import { EnvironmentOptimizer } from './utils/environmentOptimizer';
import { ROLLBACK_MESSAGES } from './i18n/messages';
import { ClipboardCacheService } from './services/clipboardCacheService';
import { SessionType, SessionStatus } from './constants/sessionConstants';
import { SessionInfo } from './types/sessionTypes';

let logger: Logger;
let webviewService: WebViewService;
let contextService: ContextService;
let communicationService: MultiSessionCommunicationService;
let sessionManager: SessionManager;
let fileSearchService: FileSearchService;
let fileRollbackService: FileRollbackService;
let versionControlManager: VersionControlManager;
let simpleRevertService: SimpleRevertService;
let cursorStyleRevertService: CursorStyleRevertService;
let inlineCompletionProvider: DeepVInlineCompletionProvider;
let completionCache: CompletionCache;
let completionScheduler: CompletionScheduler;
let ruleService: RuleService;
let inlineCompletionStatusBar: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;
let clipboardCache: ClipboardCacheService;

// 🎯 服务初始化状态标志，避免重复初始化
let servicesInitialized = false;

export async function activate(context: vscode.ExtensionContext) {
  console.log('=== DeepV Code AI Assistant: Starting activation ===');

  // 保存 context 到全局变量供其他函数使用
  extensionContext = context;

  try {
    startupOptimizer.startPhase('Environment Optimization');

    // 设置环境变量,方便core知道自己的运行模式
    process.env.VSCODE_APP_ROOT = vscode.env.appRoot;
    process.env.VSCODE_PLUGIN = '1';

    // 🚀 安装环境优化器
    EnvironmentOptimizer.installGlobalOptimization();
    const envInfo = EnvironmentOptimizer.getFormattedInfo();
    console.log(`🌍 [Extension] Environment: ${envInfo}`);

    startupOptimizer.endPhase();
    startupOptimizer.startPhase('Logger Initialization');

    // Set global extension path for ripgrep adapter
    (global as any).__extensionPath = context.extensionPath;
    (global as any).extensionContext = context;

    // Initialize logger first
    const outputChannel = vscode.window.createOutputChannel('DeepV Code AI Assistant');
    logger = new Logger(context, outputChannel);
    logger.info('DeepV Code AI Assistant is activating...');
    logger.info(`📁 Log file location: ${logger.getLogFilePath()}`);
    logger.info(`📁 Extension path: ${context.extensionPath}`);

    vscode.window.showInformationMessage('DeepV Code AI Assistant is activating...');
    startupOptimizer.endPhase();

    startupOptimizer.startPhase('Communication & WebView Services');

    // 🎯 优先初始化通信服务和WebView，确保UI能立即响应
    communicationService = new MultiSessionCommunicationService(logger);
    webviewService = new WebViewService(context, communicationService, logger);

    startupOptimizer.endPhase();

    startupOptimizer.startPhase('WebView Initialization');


    startupOptimizer.endPhase();
    startupOptimizer.startPhase('Command Registration');

    // Register commands (now WebView is ready)
    registerCommands(context);
    logger.info('Commands registered successfully');

    startupOptimizer.endPhase();

    startupOptimizer.startPhase('Other Services Initialization');

    // Then initialize other services
    contextService = new ContextService(logger);
    sessionManager = new SessionManager(logger, communicationService, context);
    fileSearchService = new FileSearchService(logger);
    fileRollbackService = FileRollbackService.getInstance(logger);
    clipboardCache = new ClipboardCacheService(logger);

    // 🎯 初始化规则服务
    ruleService = new RuleService(logger);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    await ruleService.initialize(workspaceRoot);
    logger.info('RuleService initialized');

    // 🎯 设置规则变化回调，通知前端刷新规则列表
    ruleService.onRulesChanged(async () => {
      logger.info('Rules changed, notifying webview...');
      try {
        const rules = ruleService.getAllRules();
        await communicationService.sendRulesListResponse(rules);
      } catch (error) {
        logger.error('Failed to send rules update to webview', error instanceof Error ? error : undefined);
      }
    });

    // 🎯 将规则服务设置到 ContextBuilder
    ContextBuilder.setRuleService(ruleService);
    versionControlManager = new VersionControlManager(logger, context);

    // 🎯 初始化简单回退服务
    simpleRevertService = new SimpleRevertService(logger);

    // 🎯 初始化Cursor风格回退服务
    cursorStyleRevertService = new CursorStyleRevertService(logger);

    // 🎯 设置版本控制管理器到SessionManager
    sessionManager.setVersionControlManager(versionControlManager);

    // 🎯 初始化行内补全系统（推-拉分离架构）
    completionCache = new CompletionCache();
    inlineCompletionProvider = new DeepVInlineCompletionProvider(completionCache, logger);

    // 🎯 注册行内补全提供者（支持所有编程语言）
    const completionProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' }, // 匹配所有文件
      inlineCompletionProvider
    );
    context.subscriptions.push(completionProviderDisposable);
    logger.info('InlineCompletionProvider registered (cache-only, pull mode)');

    // 🎯 创建状态栏项，用于控制代码补全开关
    inlineCompletionStatusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100 // 优先级，越大越靠右
    );
    updateInlineCompletionStatusBar();
    inlineCompletionStatusBar.command = 'deepv.toggleInlineCompletionFromStatusBar';
    inlineCompletionStatusBar.show();
    context.subscriptions.push(inlineCompletionStatusBar);
    logger.info('Inline completion status bar created');

    // Setup communication between services
    setupServiceCommunication();

    // 🎯 监听文本选择变化 + 剪贴板监听（用于缓存复制的代码信息）
    setupClipboardMonitoring(context);

    // 🎯 立即初始化WebView服务，这样用户点击时就能看到loading界面
    try {
      await webviewService.initialize();
      logger.info('WebView service initialized - ready for immediate display');
    } catch (error) {
      logger.warn('WebView service initialization failed, will retry later', error instanceof Error ? error : undefined);
    }

    startupOptimizer.endPhase();

    startupOptimizer.startPhase('Background Services Startup');

    // 🎯 自动初始化核心服务（SessionManager + InlineCompletion）
    // 这样即使前端没有发送 start_services 请求（例如切换项目后），服务也能正常工作
    try {
      logger.info('Auto-initializing core services during activation...');
      await startServices();
      logger.info('Core services auto-initialized successfully');
    } catch (error) {
      logger.warn('Core services auto-initialization failed, will retry when requested', error instanceof Error ? error : undefined);
    }

    logger.info('DeepV Code AI Assistant activated successfully');
    console.log('=== DeepV Code AI Assistant: Activation completed ===');
    vscode.window.showInformationMessage('DeepV Code AI Assistant activated successfully!');

    // Verify commands are registered
    vscode.commands.getCommands().then(commands => {
      const deepvCommands = commands.filter(cmd => cmd.startsWith('deepv.'));
      logger.info(`Found ${deepvCommands.length} registered DeepV commands`);
      console.log('Registered DeepV commands:', deepvCommands);
    });

  } catch (error) {
    console.error('=== DeepV Code AI Assistant: Activation failed ===', error);
    if (logger) {
      logger.error('Failed to activate extension', error instanceof Error ? error : undefined);
    }
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to activate DeepV Code AI Assistant: ${message}`);
    throw error; // Re-throw to ensure VS Code knows activation failed
  }
}

export async function deactivate(): Promise<void> {
  logger?.info('DeepV Code AI Assistant is deactivating...');

  try {
    // 🎯 重置服务初始化标志，允许重新激活时重新初始化
    servicesInitialized = false;

    if (inlineCompletionStatusBar) {
      inlineCompletionStatusBar.dispose();
    }
    if (inlineCompletionProvider) {
      inlineCompletionProvider.dispose();
    }
    if (webviewService) {
      await webviewService.dispose();
    }
    if (contextService) {
      await contextService.dispose();
    }
    if (communicationService) {
      await communicationService.dispose();
    }
    if (sessionManager) {
      await sessionManager.dispose();
    }
    logger?.info('DeepV Code AI Assistant deactivated successfully');
  } catch (error) {
    logger?.error('Error during deactivation', error instanceof Error ? error : undefined);
  }
}

function setupServiceCommunication() {

  // 🎯 设置 /refine 命令处理器（文本优化功能，需在登录前立即注册）
  setupRefineCommandHandler();

  // 🎯 设置基础消息处理器（通过SessionManager分发到对应session）
  setupBasicMessageHandlers();

  // 🎯 设置多Session消息处理器
  setupMultiSessionHandlers();
}

function setupBasicMessageHandlers() {
  // 处理聊天消息
  communicationService.onChatMessage(async (message) => {
    try {
      logger.info(`Received chat message for session: ${message.sessionId}`);

      // 🎯 在处理消息前创建备份（Cursor风格）
      try {
        await cursorStyleRevertService.backupBeforeAI(message.id);
        logger.debug(`💾 Created backup for message: ${message.id}`);

        // 所有用户消息都可以回退
        const revertableIds = cursorStyleRevertService.getAllRevertableMessageIds();
        await communicationService.sendRollbackableIdsUpdate(message.sessionId, revertableIds);
      } catch (error) {
        logger.warn('Failed to create backup', error instanceof Error ? error : undefined);
      }

      // 🎯 使用延迟初始化的AIService，只在真正需要AI功能时才初始化
      const aiService = await sessionManager.getInitializedAIService(message.sessionId);

      // 获取当前上下文
      const currentContext = contextService.getCurrentContext();

      // 使用AI服务处理消息（流式处理，内部会发送响应到前端）
      await aiService.processChatMessage(message, currentContext);
      logger.info('Chat message processed successfully');

    } catch (error) {
      logger.error('Failed to process chat message', error instanceof Error ? error : undefined);
      communicationService.sendChatError(message.sessionId, error instanceof Error ? error.message : String(error));
    }
  });

  // 🎯 编辑消息并重新生成处理
  communicationService.onEditMessageAndRegenerate(async (payload: any) => {
    logger.info('Processing edit message and regenerate', {
      sessionId: payload.sessionId,
      messageId: payload.messageId
    });

    try {
      // 🎯 使用延迟初始化的AIService
      const aiService = await sessionManager.getInitializedAIService(payload.sessionId);

      // 🎯 第1步：执行文件回滚到目标消息状态
      logger.info('🔄 开始文件回滚操作');

      // 获取工作区根目录
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      // 🎯 使用前端传递的原始完整消息历史（用于文件回滚分析）
      // 如果没有传递，则使用truncatedMessages作为备选
      const messagesForRollback = payload.originalMessages || payload.truncatedMessages || [];

      logger.info('📋 文件回滚消息历史信息:', {
        原始消息数量: payload.originalMessages?.length || 0,
        截断消息数量: payload.truncatedMessages?.length || 0,
        用于分析的消息数量: messagesForRollback.length,
        目标消息ID: payload.messageId
      });

      try {
        const rollbackResult = await fileRollbackService.rollbackFilesToMessage(
          messagesForRollback,
          payload.messageId,
          workspaceRoot
        );

        logger.info('📊 文件回滚结果:', {
          成功: rollbackResult.success,
          回滚文件数: rollbackResult.rolledBackFiles.length,
          失败文件数: rollbackResult.failedFiles.length,
          总文件数: rollbackResult.totalFiles,
          成功文件: rollbackResult.rolledBackFiles,
          失败文件: rollbackResult.failedFiles.map(f => `${f.fileName}: ${f.error}`)
        });

        // 如果有文件回滚失败，记录警告但不阻止AI处理
        if (rollbackResult.failedFiles.length > 0) {
          logger.warn('⚠️ 部分文件回滚失败，但将继续处理消息编辑', {
            失败文件: rollbackResult.failedFiles
          });
        }

        // 🎯 发送文件回滚结果到前端（可选）
        if (rollbackResult.totalFiles > 0) {
          communicationService.sendMessage({
            type: 'file_rollback_complete',
            payload: {
              sessionId: payload.sessionId,
              result: rollbackResult,
              targetMessageId: payload.messageId
            }
          });
        }

      } catch (fileRollbackError) {
        // 文件回滚失败不应阻止消息处理，只记录错误
        logger.error('❌ 文件回滚失败，但将继续处理消息编辑:', fileRollbackError instanceof Error ? fileRollbackError : undefined);

        // 通知前端文件回滚失败
        communicationService.sendMessage({
          type: 'file_rollback_failed',
          payload: {
            sessionId: payload.sessionId,
            error: fileRollbackError instanceof Error ? fileRollbackError.message : String(fileRollbackError),
            targetMessageId: payload.messageId
          }
        });
      }

      // 🎯 第2步：获取当前上下文并处理AI消息编辑
      logger.info('🎯 开始AI消息编辑和重新生成');
      const currentContext = contextService.getCurrentContext();

      // 处理编辑消息并重新生成
      await aiService.processEditMessageAndRegenerate(
        payload.messageId,
        payload.newContent,
        currentContext
      );

      logger.info('✅ 消息编辑和重新生成处理完成');

    } catch (error) {
      logger.error('❌ 处理编辑消息失败:', error instanceof Error ? error : undefined);
      communicationService.sendChatError(payload.sessionId, error instanceof Error ? error.message : String(error));
    }
  });

  /**
   * 🎯 回退到指定消息处理器
   *
   * 功能说明：
   * - 回退操作是破坏性的，会删除目标消息之后的所有消息和文件修改
   * - 前端会先截断UI中的消息历史，提供即时反馈
   * - 后端负责分析并回滚文件系统到目标消息时的状态
   *
   * 处理流程：
   * 1. 获取AI服务实例
   * 2. 分析目标消息之后的所有文件修改
   * 3. 逐个回滚这些文件到原始状态
   * 4. 通知前端回滚结果
   *
   * @param payload.sessionId - 会话ID
   * @param payload.messageId - 目标消息ID（回退到此消息）
   * @param payload.originalMessages - 完整的原始消息历史（用于分析文件修改）
   */
    communicationService.onRollbackToMessage(async (payload: any) => {
      logger.info(`📥 ${ROLLBACK_MESSAGES.ROLLBACK_INITIATED}`, {
        sessionId: payload.sessionId,
        messageId: payload.messageId,
        originalMessagesCount: payload.originalMessages?.length || 0
      });

    try {
      // ✅ 步骤1: 获取AI服务实例（延迟初始化）
      const aiService = await sessionManager.getInitializedAIService(payload.sessionId);

        // ✅ 步骤2: 执行文件回滚到目标消息状态
        logger.info(`🔄 ${ROLLBACK_MESSAGES.FILE_ROLLBACK_STARTED}`);

      // 获取工作区根目录（文件回滚需要绝对路径）
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceRoot) {
          logger.warn(`⚠️ ${ROLLBACK_MESSAGES.WORKSPACE_NOT_FOUND}`);
        }

      // 🎯 使用前端传递的原始完整消息历史
      // 为什么需要完整历史？
      // - fileRollbackService 需要分析目标消息之后所有的文件修改
      // - 每条消息可能包含多个文件操作（创建、修改、删除）
      // - 需要追踪每个文件的 originalContent 来进行回滚
      const messagesForRollback = payload.originalMessages || [];

      logger.info('📋 准备分析消息历史进行文件回滚:', {
        总消息数: messagesForRollback.length,
        目标消息ID: payload.messageId,
        工作区根目录: workspaceRoot || '未设置'
      });

      try {
        // 🔍 调用文件回滚服务
        // 此服务会：
        // 1. 从目标消息的下一条开始分析所有消息
        // 2. 提取所有文件修改操作（通过 associatedToolCalls）
        // 3. 对于每个修改的文件，恢复到 firstOriginalContent
        // 4. 对于新建的文件，删除它们
        // 5. 对于删除的文件，恢复它们
        const rollbackResult = await fileRollbackService.rollbackFilesToMessage(
          messagesForRollback,
          payload.messageId,
          workspaceRoot
        );

        logger.info('📊 文件回滚执行结果:', {
          是否全部成功: rollbackResult.success,
          成功回滚文件数: rollbackResult.rolledBackFiles.length,
          失败文件数: rollbackResult.failedFiles.length,
          总文件数: rollbackResult.totalFiles,
          成功的文件列表: rollbackResult.rolledBackFiles,
          失败的文件详情: rollbackResult.failedFiles.map(f => ({
            文件名: f.fileName,
            错误: f.error
          }))
        });

        // ✅ 步骤3: 通知前端文件回滚完成
        if (rollbackResult.totalFiles > 0) {
          communicationService.sendMessage({
            type: 'file_rollback_complete',
            payload: {
              sessionId: payload.sessionId,
              result: rollbackResult,
              targetMessageId: payload.messageId
            }
          });

          // 如果有文件回滚失败，额外发送警告
          if (rollbackResult.failedFiles.length > 0) {
            logger.warn('⚠️ 部分文件回滚失败', {
              失败数量: rollbackResult.failedFiles.length,
              失败文件: rollbackResult.failedFiles.map(f => f.fileName)
            });
          }
          } else {
            logger.info(`ℹ️ ${ROLLBACK_MESSAGES.NO_FILES_TO_ROLLBACK}`);
          }

      } catch (fileRollbackError) {
        // 文件回滚失败不应该阻止整个回退流程
        // 记录错误并通知前端，但继续执行
        logger.error('❌ 文件回滚过程出错:', fileRollbackError instanceof Error ? fileRollbackError : undefined);

        // 通知前端文件回滚失败
        communicationService.sendMessage({
          type: 'file_rollback_failed',
          payload: {
            sessionId: payload.sessionId,
            error: fileRollbackError instanceof Error ? fileRollbackError.message : String(fileRollbackError),
            targetMessageId: payload.messageId
          }
        });
      }

      // ✅ 步骤4: AI历史回滚说明
      // 注意：AI的对话历史回滚由前端控制
      // - 前端已经截断了消息列表
      // - AI服务会在下次对话时自动使用更新后的消息历史
      // - 因此这里不需要显式调用AI服务的历史回滚方法
      logger.info('ℹ️ AI历史回滚由前端消息截断控制，后端无需额外处理');

        logger.info(`✅ ${ROLLBACK_MESSAGES.ROLLBACK_COMPLETED}`, {
          sessionId: payload.sessionId,
          targetMessageId: payload.messageId
        });

      } catch (error) {
        // 回退操作的顶层错误处理
        logger.error(`❌ ${ROLLBACK_MESSAGES.ROLLBACK_FAILED}:`, error instanceof Error ? error : undefined);

        // 发送错误消息到前端
        communicationService.sendChatError(
          payload.sessionId,
          `${ROLLBACK_MESSAGES.ROLLBACK_FAILED}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
  });

  // 处理工具执行请求
  communicationService.onToolExecutionRequest(async (request) => {

  });

  // 处理工具确认响应
  communicationService.onToolConfirmationResponse(async (data) => {
    try {
      logger.info(`Received tool confirmation response for session: ${data.sessionId}`);

      // 🎯 使用延迟初始化的AIService
      const aiService = await sessionManager.getInitializedAIService(data.sessionId);

      // 🎯 检查是否为项目级别允许
      if (data.confirmed && data.outcome === 'proceed_always_project') {
        logger.info('🚀 User selected "Always allow all tools in this project" - enabling YOLO mode');
        // 设置项目级别YOLO模式并同步到所有session
        await sessionManager.setProjectYoloMode(true);
      }

      if (data.confirmed) {
        await aiService.approveToolCall(data.toolId, data.userInput);
      } else {
        await aiService.rejectToolCall(data.toolId, 'User rejected tool execution');
      }

    } catch (error) {
      logger.error('Failed to process tool confirmation response', error instanceof Error ? error : undefined);
    }
  });

  // 处理取消所有工具
  communicationService.onToolCancelAll(async () => {
  });


  // 🎯 处理回退到指定消息
  communicationService.onRevertToMessage(async (payload) => {
    try {
      const { sessionId, messageId } = payload;
      logger.info(`🔄 Reverting to message: ${messageId} in session: ${sessionId}`);

      // 🎯 首先尝试使用版本控制管理器进行版本回退
      let result = await versionControlManager.revertToTurn(sessionId, messageId);

      if (result.success) {
        vscode.window.showInformationMessage(
          `✅ 已回退到指定消息 (${result.revertedFiles.length} 个文件)`
        );
        logger.info('✅ Revert completed successfully', result);
      } else {
        // 如果版本控制回退失败，尝试降级方案：使用Cursor风格回退服务（文件备份）
        logger.warn(`⚠️ Version control revert failed, attempting fallback... Error: ${result.error}`);
        const fallbackResult = await cursorStyleRevertService.revertToMessage(messageId);

        if (fallbackResult.success) {
          vscode.window.showInformationMessage(`✅ ${fallbackResult.message}`);
          logger.info('✅ Revert completed using fallback', fallbackResult);
        } else {
          // 提供更有帮助的错误信息
          const helpMessage = result.error?.includes('not found')
            ? '\n\n💡 提示：这可能是因为没有记录该消息的版本节点。请检查日志中是否有 "Recording changes for turn" 的信息。运行 "deepv.debugVersionNodes" 命令可以查看当前版本状态。'
            : '';

          vscode.window.showErrorMessage(
            `回退失败: ${fallbackResult.message || result.error}${helpMessage}`
          );
          logger.error('❌ Both revert methods failed', new Error(`Version: ${result.error}, Fallback: ${fallbackResult.message}`));
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`⚠️ 回退失败: ${errorMsg}。请运行 "deepv.debugVersionNodes" 命令诊断问题。`);
      logger.error('❌ Error reverting to message', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理版本时间线请求
  communicationService.onVersionTimelineRequest(async (payload) => {
    try {
      const { sessionId } = payload;
      logger.info(`📋 Showing version timeline for session: ${sessionId}`);

      const timeline = versionControlManager.getTimeline(sessionId);

      if (timeline.length === 0) {
        vscode.window.showInformationMessage('当前会话没有版本历史');
        return;
      }

      // 创建QuickPick选择器
      const items = timeline.map(item => ({
        label: item.isCurrent ? `$(check) ${item.title}` : item.title,
        description: item.description,
        detail: `${new Date(item.timestamp).toLocaleString()} • +${item.stats.linesAdded} -${item.stats.linesRemoved}`,
        nodeId: item.nodeId
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要回退到的版本',
        title: '📋 版本历史时间线',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (selected) {
        const action = await vscode.window.showWarningMessage(
          `确定要回退到版本 "${selected.label}" 吗？`,
          { modal: true },
          '回退',
          '取消'
        );

        if (action === '回退') {
          const result = await versionControlManager.revertTo(sessionId, selected.nodeId);

          if (result.success) {
            vscode.window.showInformationMessage(
              `✅ 已回退到选定版本 (${result.revertedFiles.length} 个文件)`
            );
          } else {
            vscode.window.showErrorMessage(`回退失败: ${result.error || '未知错误'}`);
          }
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`显示版本历史失败: ${errorMsg}`);
      logger.error('❌ Error showing version timeline', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理回退到上一版本请求
  communicationService.onVersionRevertPrevious(async (payload) => {
    try {
      const { sessionId } = payload;
      logger.info(`⏮️ Reverting to previous version for session: ${sessionId}`);

      const action = await vscode.window.showWarningMessage(
        '确定要回退到上一个版本吗？这将撤销最近一次AI应用的更改。',
        { modal: true },
        '回退',
        '取消'
      );

      if (action !== '回退') {
        return;
      }

      const result = await versionControlManager.revertPrevious(sessionId);

      if (result.success) {
        vscode.window.showInformationMessage(
          `✅ 已回退到上一版本 (${result.revertedFiles.length} 个文件)`
        );
        logger.info('✅ Revert to previous completed successfully', result);
      } else {
        vscode.window.showErrorMessage(`回退失败: ${result.error || '未知错误'}`);
        logger.error('❌ Revert to previous failed', new Error(result.error));
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`回退失败: ${errorMsg}`);
      logger.error('❌ Error reverting to previous', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理流程中断请求
  communicationService.onFlowAbort(async (data) => {
    try {
      logger.info(`Received flow abort request for session: ${data.sessionId}`);
      const aiService = sessionManager.getAIService(data.sessionId);
      if (aiService) {
        await aiService.abortCurrentFlow();
        // 发送中断完成通知
        await communicationService.sendFlowAborted(data.sessionId);
        logger.info(`Flow aborted successfully for session: ${data.sessionId}`);
      } else {
        logger.error(`No AI service found for session: ${data.sessionId}`);
      }
    } catch (error) {
      logger.error('Failed to abort flow', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理项目设置更新请求
  communicationService.onProjectSettingsUpdate(async (data) => {
    try {
      logger.info(`Received project settings update: YOLO mode ${data.yoloMode ? 'enabled' : 'disabled'}`);
      // 同步YOLO模式设置到Core配置
      await sessionManager.setProjectYoloMode(data.yoloMode);
      logger.info(`✅ Project YOLO mode synchronized: ${data.yoloMode}`);
    } catch (error) {
      logger.error('Failed to update project settings', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理项目设置请求
  communicationService.onProjectSettingsRequest(async () => {
    try {
      logger.info('Received project settings request');
      // 从任意AI服务获取当前YOLO模式状态
      const sessionIds = Array.from(sessionManager.getSessionIds());
      if (sessionIds.length > 0) {
        const aiService = sessionManager.getAIService(sessionIds[0]);
        if (aiService) {
          const config = aiService.getConfig();
          const yoloMode = config?.getApprovalMode() === 'yolo';
          await communicationService.sendProjectSettingsResponse({ yoloMode });
          logger.info(`✅ Project settings response sent: YOLO mode ${yoloMode}`);
        }
      }
    } catch (error) {
      logger.error('Failed to get project settings', error instanceof Error ? error : undefined);
    }
  });

  // 处理获取上下文请求
  communicationService.onGetContext(async (data) => {
    try {
      logger.info(`Received get context request for session: ${data.sessionId || 'global'}`);
      const currentContext = contextService.getCurrentContext();
      communicationService.sendContextUpdate(currentContext, data.sessionId);
    } catch (error) {
      logger.error('Failed to process get context request', error instanceof Error ? error : undefined);
    }
  });

  // 处理获取扩展版本号请求
  communicationService.onGetExtensionVersion(async (data) => {
    try {
      logger.info('Received get extension version request');
      const extension = vscode.extensions.getExtension('deepv.deepv-code-vscode-ui-plugin');
      const extensionVersion = extension?.packageJSON?.version || 'unknown';
      logger.info(`Extension version: ${extensionVersion}`);
      await communicationService.sendExtensionVersionResponse(extensionVersion);
    } catch (error) {
      logger.error('Failed to process get extension version request', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理服务启动请求
  communicationService.onStartServices(async (data) => {
    try {
      logger.info('Received start services request');

      // 调用startServices函数
      await startServices();

      // 服务启动完成，发送完成通知
      await communicationService.sendServiceInitializationDone();
      logger.info('Services started successfully, sent completion notification');

    } catch (error) {
      logger.error('Failed to start services', error instanceof Error ? error : undefined);
      // 即使失败也发送完成通知，避免前端永远等待
      await communicationService.sendServiceInitializationDone();
    }
  });

  // 处理更新检测请求
  communicationService.onCheckForUpdates(async (data) => {
    try {
      logger.info('Received check for updates request');

      // 获取当前扩展版本
      const extension = vscode.extensions.getExtension('DeepX.deepv-code-vscode-ui-plugin');
      const currentVersion = extension?.packageJSON?.version || 'unknown';

      logger.info(`Checking for updates, current version: ${currentVersion}`);

      // 调用更新检测API
      const apiUrl = `https://api-code.deepvlab.ai/api/update-check?client_type=vscode&version=${encodeURIComponent(currentVersion)}`;
      logger.info(`Update check API URL: ${apiUrl}`);

      const https = require('https');
      const url = require('url');

      const result = await new Promise((resolve, reject) => {
        const parsedUrl = url.parse(apiUrl);
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.path,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': `DeepV-Code-VSCode/${currentVersion}`
          },
          timeout: 10000
        };

        const req = https.request(options, (res: any) => {
          let data = '';

          res.on('data', (chunk: any) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                const updateInfo = JSON.parse(data);
                logger.info('Update check API response:', updateInfo);
                resolve(updateInfo);
              } else {
                logger.error(`Update check API error: ${res.statusCode}`);
                resolve({ error: `HTTP ${res.statusCode}` });
              }
            } catch (parseError) {
              logger.error('Failed to parse update check response', parseError instanceof Error ? parseError : undefined);
              resolve({ error: 'Failed to parse response' });
            }
          });
        });

        req.on('error', (error: any) => {
          logger.error('Update check request failed', error instanceof Error ? error : undefined);
          resolve({ error: error.message || 'Network error' });
        });

        req.on('timeout', () => {
          logger.error('Update check request timeout');
          req.destroy();
          resolve({ error: 'Request timeout' });
        });

        req.end();
      });

      await communicationService.sendUpdateCheckResponse(result);
    } catch (error) {
      logger.error('Failed to process check for updates request', error instanceof Error ? error : undefined);
      await communicationService.sendUpdateCheckResponse({ error: 'Internal error' });
    }
  });

  // 🎯 处理文件搜索请求
  communicationService.onFileSearch(async (data) => {
    try {
      logger.info(`Received file search request for prefix: ${data.prefix}`);
      const suggestions = await fileSearchService.searchFiles(data.prefix);
      await communicationService.sendFileSearchResult(suggestions);
    } catch (error) {
      logger.error('Failed to process file search request', error instanceof Error ? error : undefined);
      await communicationService.sendFileSearchResult([]);
    }
  });

  // 🎯 处理文件路径解析请求
  communicationService.onResolveFilePaths(async (data) => {
    try {
      logger.info(`Received file path resolution request for ${data.files.length} files`);
      const resolvedFiles: string[] = [];

      for (const filePath of data.files) {
        try {
          // 🎯 尝试解析为绝对路径
          let resolvedPath = filePath;

          // 如果不是绝对路径，相对于工作区解析
          if (!path.isAbsolute(filePath)) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
              resolvedPath = path.resolve(workspaceFolders[0].uri.fsPath, filePath);
            }
          }

          // 检查文件是否存在
          const uri = vscode.Uri.file(resolvedPath);
          try {
            await vscode.workspace.fs.stat(uri);
            resolvedFiles.push(resolvedPath);
            logger.debug(`✅ Resolved: ${filePath} -> ${resolvedPath}`);
          } catch {
            // 文件不存在，尝试其他可能的路径
            logger.warn(`❌ File not found: ${resolvedPath}`);
            // 作为后备，仍然添加解析后的路径
            resolvedFiles.push(resolvedPath);
          }
        } catch (error) {
          logger.warn(`Failed to resolve path for ${filePath}`, error instanceof Error ? error : undefined);
          // 解析失败时，使用原始路径
          resolvedFiles.push(filePath);
        }
      }

      await communicationService.sendFilePathsResolved(resolvedFiles);
      logger.info(`✅ Resolved ${resolvedFiles.length} file paths`);
    } catch (error) {
      logger.error('Failed to process file path resolution request', error instanceof Error ? error : undefined);
      await communicationService.sendFilePathsResolved(data.files); // 发送原始路径作为后备
    }
  });

  // 🎯 处理在编辑器中打开diff请求
  communicationService.onOpenDiffInEditor(async (data) => {
    try {
      logger.info(`Received open diff in editor request for file: ${data.fileName}`);
      await openDiffInEditor(data.fileDiff, data.fileName, data.originalContent, data.newContent);
      logger.info(`✅ Diff opened in editor successfully`);
    } catch (error) {
      logger.error('Failed to open diff in editor', error instanceof Error ? error : undefined);
      vscode.window.showErrorMessage(`无法在编辑器中打开diff: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  communicationService.onOpenDeletedFileContent(async (data) => {
    try {
      logger.info(`Received open deleted file content request for file: ${data.fileName}`);
      await openDeletedFileContent(data.fileName, data.filePath, data.deletedContent);
      logger.info(`✅ Deleted file content opened successfully`);
    } catch (error) {
      logger.error('Failed to open deleted file content', error instanceof Error ? error : undefined);
      vscode.window.showErrorMessage(`无法查看删除文件内容: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // 处理文件变更接受
  communicationService.onAcceptFileChanges(async (data) => {
    try {
      logger.info(`Received accept file changes request: ${data.lastAcceptedMessageId}`);
      // 这里可以将 lastAcceptedMessageId 保存到会话数据中
      // 具体的保存逻辑依赖于 sessionManager 的实现
      // 简单起见，先记录日志
      logger.info(`✅ File changes accepted up to message: ${data.lastAcceptedMessageId}`);
    } catch (error) {
      logger.error('Failed to accept file changes', error instanceof Error ? error : undefined);
    }
  });

  // 处理工具执行确认
  communicationService.onToolExecutionConfirm(async (data) => {

  });

  // 🎯 处理 MCP 状态请求
  communicationService.addMessageHandler('get_mcp_status', async (payload: any) => {
    try {
      logger.info(`🔌 [MCP] Received MCP status request for session: ${payload.sessionId}`);

      const aiService = sessionManager.getAIService(payload.sessionId);
      if (!aiService) {
        logger.warn(`🔌 [MCP] No AIService found for session: ${payload.sessionId}`);
        return;
      }

      const statuses = aiService.getMCPServerStatuses();
      const discoveryState = aiService.getMCPDiscoveryState();

      // 转换状态数据为前端格式
      const servers = Array.from(statuses?.entries() || []).map(([name, status]) => ({
        name,
        status,
        toolCount: 0 // 工具数量将通过异步更新获得
      }));

      logger.info(`🔌 [MCP] Sending MCP status: ${servers.length} servers, discovery: ${discoveryState}`);

      await communicationService.sendMessage({
        type: 'mcp_status_update',
        payload: {
          sessionId: payload.sessionId,
          discoveryState: discoveryState || 'not_started',
          servers
        }
      });

    } catch (error) {
      logger.error('🔌 [MCP] Failed to get MCP status', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理登录相关消息
  setupLoginHandlers();
}

function setupLoginHandlers() {
  // 处理登录状态检查
  communicationService.onLoginCheckStatus(async (payload: any) => {
    try {
      logger.info('Received login status check request');

      let loginStatus;

      // 如果没有session，创建一个临时的LoginService来检查状态
      const { LoginService } = await import('./services/loginService');
      const loginService = LoginService.getInstance(logger, extensionContext.extensionPath);
      loginStatus = await loginService.checkLoginStatus();

      // 发送登录状态响应
      await communicationService.sendGenericMessage('login_status_response', {
        isLoggedIn: loginStatus.isLoggedIn,
        userInfo: loginStatus.userInfo,
        error: loginStatus.error
      });

      logger.info(`Login status check result: ${loginStatus.isLoggedIn ? 'logged in' : 'not logged in'}`);

    } catch (error) {
      logger.error('Failed to check login status', error instanceof Error ? error : undefined);
      await communicationService.sendGenericMessage('login_status_response', {
        isLoggedIn: false,
        error: error instanceof Error ? error.message : 'Login status check failed'
      });
    }
  });

  // 处理开始登录请求
  communicationService.onLoginStart(async (payload: any) => {
    try {
      logger.info('Received login start request');

      // 创建LoginService实例
      const { LoginService } = await import('./services/loginService');
      const loginService = LoginService.getInstance(logger, extensionContext.extensionPath);

      // 启动登录流程
      const loginResult = await loginService.startLogin();

      // 发送登录结果
      await communicationService.sendGenericMessage('login_response', {
        success: loginResult.success,
        accessToken: loginResult.accessToken,
        error: loginResult.error
      });

      if (loginResult.success) {
        logger.info('Login completed successfully');

        // 登录成功后，重新初始化所有session的AI服务
        await sessionManager.reinitializeAllSessions();
      } else {
        logger.error(`Login failed: ${loginResult.error}`);
      }

    } catch (error) {
      logger.error('Failed to start login process', error instanceof Error ? error : undefined);
      await communicationService.sendGenericMessage('login_response', {
        success: false,
        error: error instanceof Error ? error.message : 'Login process failed'
      });
    }
  });

  // 🎯 处理打开外部URL请求（用于升级提示）
  communicationService.onOpenExternalUrl(async (payload) => {
    try {
      logger.info(`Opening external URL: ${payload.url}`);
      await vscode.env.openExternal(vscode.Uri.parse(payload.url));
    } catch (error) {
      logger.error('Failed to open external URL', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理打开扩展市场请求（用于升级提示）
  communicationService.onOpenExtensionMarketplace(async (payload) => {
    try {
      logger.info(`Opening extension marketplace for: ${payload.extensionId}`);

      // 🎯 检测是否在 Cursor IDE 环境中
      const isCursor = vscode.env.appName.toLowerCase().includes('cursor');
      logger.info(`Environment: ${isCursor ? 'Cursor' : 'VS Code'}, appName: ${vscode.env.appName}`);

      if (isCursor) {
        // 🎯 Cursor IDE 特殊处理
        logger.info('Detected Cursor IDE, using OpenVSX strategy');
        const [publisher, extensionName] = payload.extensionId.split('.');

        // 策略 1: 先尝试内置命令（Cursor 可能支持，但可能会失败）
        try {
          await vscode.commands.executeCommand('extension.open', payload.extensionId);
          logger.info('Successfully opened extension page via command in Cursor');
        } catch (cmdError) {
          logger.warn('Cursor command approach failed, opening OpenVSX in browser', cmdError instanceof Error ? cmdError : undefined);

          // 策略 2: 打开 OpenVSX 网页作为降级方案
          const openvsxUrl = `https://open-vsx.org/extension/${publisher}/${extensionName}`;
          await vscode.env.openExternal(vscode.Uri.parse(openvsxUrl));
          logger.info('Opened OpenVSX page in external browser');

          // 友好提示
          const action = await vscode.window.showInformationMessage(
            'Extension page opened in your browser. You can also search for "DeepV AI Assistant" in Extensions (Ctrl+Shift+X).',
            'Open Extensions Panel'
          );

          if (action === 'Open Extensions Panel') {
            await vscode.commands.executeCommand('workbench.view.extensions');
          }
        }
      } else {
        // 🎯 VS Code 标准处理
        await vscode.commands.executeCommand('extension.open', payload.extensionId);
        logger.info('Successfully opened extension marketplace page in VS Code');
      }
    } catch (error) {
      logger.error('All strategies failed to open extension marketplace', error instanceof Error ? error : undefined);

      // 🎯 最终降级方案：提供手动指引
      const action = await vscode.window.showWarningMessage(
        'Unable to open marketplace automatically. Would you like to open the Extensions panel to search manually?',
        'Open Extensions',
        'Dismiss'
      );

      if (action === 'Open Extensions') {
        await vscode.commands.executeCommand('workbench.view.extensions');
      }
    }
  });

  // 🎯 处理打开 MCP 设置请求
  communicationService.addMessageHandler('open_mcp_settings', async () => {
    try {
      logger.info('Opening MCP settings');
      await vscode.commands.executeCommand('deepv.openMCPSettings');
    } catch (error) {
      logger.error('Failed to open MCP settings', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理获取可用模型列表请求
  communicationService.onGetAvailableModels(async (payload) => {
    try {
      logger.info('Received get_available_models request', payload);

      // 使用现有的ModelService从CLI包
      const { ProxyAuthManager } = require('deepv-code-core');
      const proxyAuthManager = ProxyAuthManager.getInstance();

      // 创建ModelService实例
      const ModelService = require('./services/modelService').ModelService;
      const modelService = new ModelService(logger, proxyAuthManager);

      // 获取可用模型
      const result = await modelService.getAvailableModels();

      await communicationService.sendModelResponse(payload.requestId, {
        success: true,
        models: result.models
      });

    } catch (error) {
      logger.error('Failed to get available models', error instanceof Error ? error : undefined);
      await communicationService.sendModelResponse(payload.requestId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 🎯 处理获取当前模型请求
  communicationService.onGetCurrentModel(async (payload) => {
    try {
      logger.info('Received get_current_model request', payload);

      let currentModel: string;

      // 如果提供了sessionId，优先使用session的模型配置
      if (payload.sessionId) {
        const session = sessionManager.getSession(payload.sessionId);
        if (session && session.modelConfig?.modelName) {
          currentModel = session.modelConfig.modelName;
        } else {
          // session存在但没有模型配置，使用全局默认值
          const { ProxyAuthManager } = require('deepv-code-core');
          const proxyAuthManager = ProxyAuthManager.getInstance();

          const ModelService = require('./services/modelService').ModelService;
          const modelService = new ModelService(logger, proxyAuthManager);
          currentModel = modelService.getCurrentModel();
        }
      } else {
        // 没有sessionId，返回全局默认值
        const { ProxyAuthManager } = require('deepv-code-core');
        const proxyAuthManager = ProxyAuthManager.getInstance();

        const ModelService = require('./services/modelService').ModelService;
        const modelService = new ModelService(logger, proxyAuthManager);
        currentModel = modelService.getCurrentModel();
      }

      await communicationService.sendModelResponse(payload.requestId, {
        success: true,
        currentModel
      });

    } catch (error) {
      logger.error('Failed to get current model', error instanceof Error ? error : undefined);
      await communicationService.sendModelResponse(payload.requestId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 🎯 处理设置当前模型请求
  communicationService.onSetCurrentModel(async (payload) => {
    try {
      logger.info('Received set_current_model request', payload);

      const { ProxyAuthManager } = require('deepv-code-core');
      const proxyAuthManager = ProxyAuthManager.getInstance();

      const ModelService = require('./services/modelService').ModelService;
      const modelService = new ModelService(logger, proxyAuthManager);

      // 1. 保存为默认模型配置（新session使用）
      await modelService.setCurrentModel(payload.modelName);

      // 2. 只更新当前session的模型配置
      if (payload.sessionId) {
        const currentAIService = sessionManager.getAIService(payload.sessionId);
        if (currentAIService) {
          const config = currentAIService.getConfig();
          if (config && config.setModel) {
            config.setModel(payload.modelName);

            // 更新GeminiChat实例的specifiedModel
            const geminiClient = config.getGeminiClient();
            if (geminiClient) {
              const chat = geminiClient.getChat();
              if (chat && chat.setSpecifiedModel) {
                chat.setSpecifiedModel(payload.modelName);
              }
            }
          }
        }

        // 3. 更新session的模型配置记录
        await sessionManager.updateSessionModelConfig(payload.sessionId, {
          modelName: payload.modelName
        });
      }

      await communicationService.sendModelResponse(payload.requestId, {
        success: true
      });

      logger.info(`Model set to: ${payload.modelName} for session: ${payload.sessionId || 'default'}`);

    } catch (error) {
      logger.error('Failed to set current model', error instanceof Error ? error : undefined);
      await communicationService.sendModelResponse(payload.requestId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

/**
 * 🎯 设置 /refine 命令处理器
 * 文本优化功能：使用 AI 服务对文本进行优化
 */
function setupRefineCommandHandler() {
  communicationService.addMessageHandler('execute_slash_command', async (payload: any) => {
    try {
      const { command, args } = payload;
      logger.info(`📝 Executing slash command: /${command} with args:`, args);

      if (command === 'refine') {
        // 🎯 处理 /refine 命令，使用 AI 服务优化文本
        await handleRefineCommand(args);
      } else {
        logger.warn(`⚠️ Unknown slash command: ${command}`);
        communicationService.sendGenericMessage('refine_error', {
          error: `Unknown command: /${command}`,
        });
      }
    } catch (error) {
      logger.error('❌ Failed to execute slash command', error instanceof Error ? error : undefined);
      communicationService.sendGenericMessage('refine_error', {
        error: error instanceof Error ? error.message : 'Failed to execute command',
      });
    }
  });

  logger.info('🎯 Refine command handler registered');
}

/**
 * 处理 /refine 命令的实际逻辑
 * 构造优化提示词并通过 AI 服务发送请求
 */
async function handleRefineCommand(originalText: string) {
  try {
    if (!originalText || !originalText.trim()) {
      communicationService.sendGenericMessage('refine_error', {
        error: 'Input text cannot be empty',
      });
      return;
    }

    logger.info('🎯 Starting text refinement...', { textLength: originalText.length });

    // 🎯 获取已初始化的 AI 服务（自动处理初始化）
    const aiService = await sessionManager.getCurrentInitializedAIService();
    const geminiClient = aiService.getGeminiClient();

    if (!geminiClient) {
      logger.error('Gemini client not available');
      communicationService.sendGenericMessage('refine_error', {
        error: 'AI client not available.',
      });
      return;
    }

    // 🎯 构造优化提示词 - 一次性请求，不带任何上下文
    const refinePrompt = `⚠️ NO TOOLS ALLOWED ⚠️

Here is an instruction that I'd like to give you, but it needs to be improved. Rewrite and enhance this instruction to make it clearer, more specific, less ambiguous, and correct any mistakes. Do not use any tools: reply immediately with your answer, even if you're not sure. Consider the context of our conversation history when enhancing the prompt. If there is code in triple backticks (\`\`\`) consider whether it is a code sample and should remain unchanged.Reply with the following format:
### BEGIN RESPONSE ###
Here is an enhanced version of the original instruction that is more specific and clear:
<dvcode-refine-prompt>enhanced prompt goes here</dvcode-refine-prompt>
### END RESPONSE ###

Here is my original instruction:

 ${originalText}`;

    // 收集完整的响应
    let refinedText = '';
    const abortController = new AbortController();

    try {
      const stream = geminiClient.sendMessageStream(
        [{ text: refinePrompt }],
        abortController.signal,
        `refine - ${Date.now()}`
      );

      // 设置超时保护
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          abortController.abort();
          reject(new Error('Refinement timeout'));
        }, 30000);
      });

      const streamPromise = (async () => {
        try {
          for await (const event of stream) {
            if (event.type === 'content') {
              refinedText += event.value;
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('aborted')) {
            throw new Error('Refinement timeout');
          }
          throw error;
        }
      })();

      await Promise.race([streamPromise, timeoutPromise]);

      logger.info('✅ Text refinement completed');

      // 🎯 清理AI响应，提取 <dvcode-refine-prompt> 标签内的内容
      let cleanedText = refinedText.trim();

      // 尝试提取 <dvcode-refine-prompt>...</dvcode-refine-prompt> 标签内的内容
      const tagMatch = cleanedText.match(/<dvcode-refine-prompt>([\s\S]*?)<\/dvcode-refine-prompt>/);
      if (tagMatch && tagMatch[1]) {
        cleanedText = tagMatch[1].trim();
      } else {
        // 如果没有标签，则删除常见的前缀和后缀
        cleanedText = cleanedText.replace(/^### BEGIN RESPONSE ###\n+/i, '');
        cleanedText = cleanedText.replace(/\n+### END RESPONSE ###$/i, '');
        cleanedText = cleanedText.replace(/^Here is an enhanced version[\s\S]*?:\n+/i, '');
        cleanedText = cleanedText.trim();
      }

      communicationService.sendGenericMessage('refine_result', {
        original: originalText,
        refined: cleanedText,
      });

    } catch (error) {
      throw new Error(`AI service error: ${error instanceof Error ? error.message : String(error)}`);
    }

  } catch (error) {
    logger.error('❌ Text refinement failed', error instanceof Error ? error : undefined);
    communicationService.sendGenericMessage('refine_error', {
      error: error instanceof Error ? error.message : 'Failed to refine text',
    });
  }
}



function setupMultiSessionHandlers() {
  // 处理Session创建请求
  communicationService.onSessionCreate(async (payload) => {
    try {
      logger.info('Creating new session', { type: payload.type, name: payload.name });

      const sessionId = await sessionManager.createSession(payload);
      logger.info(`Session created: ${sessionId}`);

      // 发送创建成功响应
      const session = sessionManager.getSession(sessionId);
      if (session) {
        await communicationService.sendSessionCreated(session.info);
      }

      // 发送更新后的Session列表
      const sessions = sessionManager.getAllSessionsInfo();
      const currentSessionId = sessionManager.getCurrentSession()?.info.id || null;
      await communicationService.sendSessionListUpdate(sessions, currentSessionId);
    } catch (error) {
      logger.error('Failed to create session', error instanceof Error ? error : undefined);
    }
  });

  // 处理Session删除请求
  communicationService.onSessionDelete(async (payload) => {
    try {
      logger.info('Received session_delete request', payload);
      await sessionManager.deleteSession(payload.sessionId);

      communicationService.sendMessage({
        type: 'session_deleted',
        payload: { sessionId: payload.sessionId }
      });

      // 发送更新后的Session列表
      const sessions = sessionManager.getAllSessionsInfo();
      const currentSessionId = sessionManager.getCurrentSession()?.info.id || null;
      communicationService.sendMessage({
        type: 'session_list_update',
        payload: { sessions, currentSessionId }
      });
    } catch (error) {
      logger.error('Failed to delete session', error instanceof Error ? error : undefined);
    }
  });

  // 处理Session切换请求
  communicationService.onSessionSwitch(async (payload) => {
    try {
      logger.info('Received session_switch request', payload);
      await sessionManager.switchToSession({ sessionId: payload.sessionId });

      const session = sessionManager.getSession(payload.sessionId);
      if (session) {
        communicationService.sendMessage({
          type: 'session_switched',
          payload: { sessionId: payload.sessionId, session: session.info }
        });
      }

      // 🎯 恢复UI历史消息
      const sessionHistory = sessionManager.getSessionHistory(payload.sessionId);
      if (sessionHistory.uiHistory.length > 0) {
        logger.info(`Restoring ${sessionHistory.uiHistory.length} UI messages for session ${payload.sessionId}`);

        // 转换后端格式为前端格式
        const frontendMessages = sessionHistory.uiHistory.map(msg => {
          // 🎯 使用类型断言来处理扩展的metadata字段
          const metadata = msg.metadata as any;

          return {
            id: msg.id,
            type: msg.type,
            content: msg.content,
            timestamp: msg.timestamp,
            // 🎯 修复字段映射：前端期望的是associatedToolCalls，不是toolCalls
            associatedToolCalls: msg.toolCalls,
            // 🎯 恢复工具相关的元数据字段（使用类型断言）
            isProcessingTools: metadata?.isProcessingTools,
            toolsCompleted: metadata?.toolsCompleted,
            isStreaming: metadata?.isStreaming,
            toolName: metadata?.toolName,
            toolId: metadata?.toolId,
            toolStatus: metadata?.toolStatus,
            toolParameters: metadata?.toolParameters,
            toolMessageType: metadata?.toolMessageType
          };
        });

        // 🎯 获取当前session的可回滚消息ID列表
        const aiService = sessionManager.getAIService(payload.sessionId);
        const rollbackableIds = aiService ? aiService.getRollbackableMessageIds() : [];

        await communicationService.sendRestoreUIHistory(payload.sessionId, frontendMessages, rollbackableIds);
      }

    } catch (error) {
      logger.error('Failed to switch session', error instanceof Error ? error : undefined);
    }
  });

  // 处理Session更新请求
  communicationService.onSessionUpdate(async (payload) => {
    try {
      logger.info('Received session_update request', payload);
      await sessionManager.updateSession(payload);

      const session = sessionManager.getSession(payload.sessionId);
      if (session) {
        communicationService.sendMessage({
          type: 'session_updated',
          payload: { sessionId: payload.sessionId, session: session.info }
        });
      }

      // 发送更新后的Session列表
      const sessions = sessionManager.getAllSessionsInfo();
      const currentSessionId = sessionManager.getCurrentSession()?.info.id || null;
      communicationService.sendMessage({
        type: 'session_list_update',
        payload: { sessions, currentSessionId }
      });
    } catch (error) {
      logger.error('Failed to update session', error instanceof Error ? error : undefined);
    }
  });

  // 处理Session列表请求（兼容历史分页请求）
  communicationService.onSessionListRequest(async (payload: any) => {
    try {
      logger.info(`📥 Received session_list_request:`, payload);

      // 验证 sessionManager 是否已初始化
      if (!sessionManager) {
        logger.error('Session manager not initialized');
        communicationService.sendMessage({
          type: 'session_list_update',
          payload: { sessions: [], currentSessionId: null }
        });
        return;
      }

      if (payload && typeof payload.offset === 'number' && typeof payload.limit === 'number') {
        logger.info(`📋 History pagination: offset=${payload.offset}, limit=${payload.limit}`);

        try {
          // 获取持久化服务
          const persistenceService = sessionManager.getPersistenceService?.();
          if (!persistenceService) {
            throw new Error('Persistence service not available');
          }

          // 请求分页数据
          const result = await persistenceService.getSessionHistory({
            offset: payload.offset,
            limit: payload.limit,
            searchQuery: payload.searchQuery
          });

          // 转换元数据为 SessionInfo 格式
          const sessions = result.sessions.map(metadata => ({
            id: metadata.sessionId,
            name: (metadata.title && metadata.title.trim()) || 'New Chat',
            createdAt: new Date(metadata.createdAt).getTime(),
            lastActivity: new Date(metadata.lastActiveAt).getTime(),
            status: SessionStatus.IDLE,
            type: SessionType.CHAT,
            messageCount: metadata.messageCount || 0,
            tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, tokenLimit: 0 }
          }));

          // 发送分页响应
          communicationService.sendMessage({
            type: 'session_history_response',
            payload: {
              sessions,
              total: result.total,
              hasMore: result.hasMore,
              offset: payload.offset
            }
          });

          logger.info(`✅ [PAGINATION] Sent ${sessions.length} sessions, total=${result.total}, hasMore=${result.hasMore}`);
          console.log(`✅ [PAGINATION] Sent ${sessions.length} sessions, total=${result.total}, hasMore=${result.hasMore}`);
          return;

        } catch (error) {
          logger.error('Failed to get session history pagination', error instanceof Error ? error : undefined);
          console.error('❌ [PAGINATION] Error:', error);
          // 发送错误响应（空列表）
          communicationService.sendMessage({
            type: 'session_history_response',
            payload: { sessions: [], total: 0, hasMore: false, offset: 0 }
          });
          return;
        }
      }

      // 原有逻辑：获取session列表（活跃或全部）
      const includeAll = payload?.includeAll || false;
      logger.info(`📥 Session list request: includeAll=${includeAll}`);

      let sessions: SessionInfo[] = [];

      if (includeAll) {
        // 🎯 获取全部历史（从磁盘索引读取，轻量级metadata）
        try {
          const persistenceService = sessionManager.getPersistenceService?.();
          if (!persistenceService) {
            throw new Error('Persistence service not available');
          }

          const allMetadata = await persistenceService.getAllSessionMetadata();
          sessions = allMetadata.map(metadata => ({
            id: metadata.sessionId,
            name: (metadata.title && metadata.title.trim()) || 'New Chat',
            createdAt: new Date(metadata.createdAt).getTime(),
            lastActivity: new Date(metadata.lastActiveAt).getTime(),
            status: SessionStatus.IDLE,
            type: SessionType.CHAT,
            messageCount: metadata.messageCount || 0,
            tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, tokenLimit: 0 }
          }));
          logger.info(`📜 Returning all ${sessions.length} sessions from history`);
        } catch (error) {
          logger.error('Failed to get all session metadata', error instanceof Error ? error : undefined);
          sessions = [];
        }
      } else {
        // 🎯 获取内存中的活跃sessions（最多10个）
        sessions = sessionManager.getAllSessionsInfo();
        logger.info(`📋 Returning ${sessions.length} active sessions from memory`);
      }

      const currentSessionId = sessionManager.getCurrentSession()?.info.id || null;

      communicationService.sendMessage({
        type: 'session_list_update',
        payload: { sessions, currentSessionId }
      });

    } catch (error) {
      logger.error('Failed to handle session list request', error instanceof Error ? error : undefined);
      console.error('❌ Error handling session list request:', error);
      // 发送空响应避免 WebView 永久挂起
      communicationService.sendMessage({
        type: 'session_list_update',
        payload: { sessions: [], currentSessionId: null }
      });
    }
  });

  // 其他暂时不实现的功能，占位符
  communicationService.onSessionDuplicate(async () => {
    logger.warn('Session duplicate not implemented yet');
  });

  communicationService.onSessionClear(async () => {
    logger.warn('Session clear not implemented yet');
  });

  communicationService.onSessionExport(async () => {
    logger.warn('Session export not implemented yet');
  });

  communicationService.onSessionImport(async () => {
    logger.warn('Session import not implemented yet');
  });

  // 🎯 处理UI消息保存请求
  communicationService.onSaveUIMessage(async (payload) => {
    try {
      logger.debug('Received UI message save request', { sessionId: payload.sessionId, messageId: payload.message.id });

      // 转换前端消息格式为后端格式
      const sessionMessage = {
        id: payload.message.id,
        sessionId: payload.sessionId,
        type: payload.message.type,
        content: payload.message.content,
        timestamp: payload.message.timestamp,
        // 🎯 修复字段映射：前端是associatedToolCalls，后端是toolCalls
        toolCalls: payload.message.associatedToolCalls || [],
        metadata: {
          // 🎯 将前端的工具相关字段映射到metadata
          toolName: payload.message.toolName,
          toolId: payload.message.toolId,
          toolStatus: payload.message.toolStatus,
          toolParameters: payload.message.toolParameters,
          toolMessageType: payload.message.toolMessageType,
          // 🎯 扩展字段（使用类型断言）
          isStreaming: payload.message.isStreaming,
          isProcessingTools: payload.message.isProcessingTools,
          toolsCompleted: payload.message.toolsCompleted
        } as any
      };

      await sessionManager.addMessageToSession(payload.sessionId, sessionMessage);
      logger.debug('UI message saved to session', { sessionId: payload.sessionId, messageId: payload.message.id });

    } catch (error) {
      logger.error('Failed to save UI message', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理UI消息批量保存请求
  communicationService.onSaveSessionUIHistory(async (payload) => {
    try {
      logger.info('Received session UI history save request', { sessionId: payload.sessionId, messageCount: payload.messages.length });

      // 转换前端消息格式为后端格式
      const sessionMessages = payload.messages.map(msg => ({
        id: msg.id,
        sessionId: payload.sessionId,
        type: msg.type,
        content: msg.content,
        timestamp: msg.timestamp,
        // 🎯 修复字段映射：前端是associatedToolCalls，后端是toolCalls
        toolCalls: msg.associatedToolCalls || [],
        metadata: {
          // 🎯 将前端的工具相关字段映射到metadata
          toolName: msg.toolName,
          toolId: msg.toolId,
          toolStatus: msg.toolStatus,
          toolParameters: msg.toolParameters,
          toolMessageType: msg.toolMessageType,
          // 🎯 扩展字段（使用类型断言）
          isStreaming: msg.isStreaming,
          isProcessingTools: msg.isProcessingTools,
          toolsCompleted: msg.toolsCompleted
        } as any
      }));

      // 🎯 调用SessionManager的新方法处理UI历史记录
      await sessionManager.handleUIHistoryResponse(payload.sessionId, sessionMessages);
      logger.info('Session UI history processed', { sessionId: payload.sessionId, messageCount: sessionMessages.length });

    } catch (error) {
      logger.error('Failed to process session UI history', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理规则列表请求
  communicationService.onRulesListRequest(async () => {
    try {
      logger.info('Received rules_list_request');
      const rules = ruleService.getAllRules();
      await communicationService.sendRulesListResponse(rules);
    } catch (error) {
      logger.error('Failed to get rules list', error instanceof Error ? error : undefined);
      await communicationService.sendRulesListResponse([]);
    }
  });

  // 🎯 处理规则保存请求
  communicationService.onRulesSave(async (payload) => {
    try {
      logger.info('Received rules_save request', { ruleId: payload.rule.id });
      await ruleService.saveRule(payload.rule);
      await communicationService.sendRulesSaveResponse(true);
      logger.info('Rule saved successfully', { ruleId: payload.rule.id });
    } catch (error) {
      logger.error('Failed to save rule', error instanceof Error ? error : undefined);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await communicationService.sendRulesSaveResponse(false, errorMessage);
    }
  });

  // 🎯 处理规则删除请求
  communicationService.onRulesDelete(async (payload) => {
    try {
      logger.info('Received rules_delete request', { ruleId: payload.ruleId });
      await ruleService.deleteRule(payload.ruleId);
      await communicationService.sendRulesDeleteResponse(true);
      logger.info('Rule deleted successfully', { ruleId: payload.ruleId });
    } catch (error) {
      logger.error('Failed to delete rule', error instanceof Error ? error : undefined);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await communicationService.sendRulesDeleteResponse(false, errorMessage);
    }
  });

  // =============================================================================
  // 🎯 NanoBanana 图像生成处理
  // =============================================================================

  // 🎯 处理NanoBanana图片上传请求
  communicationService.onNanoBananaUpload(async (payload) => {
    try {
      logger.info('Received nanobanana_upload request', { filename: payload.filename });

      // 🎯 获取ImageGeneratorAdapter实例（需要从core包导入）
      const { ImageGeneratorAdapter } = await import('deepv-code-core');
      const imageGenerator = ImageGeneratorAdapter.getInstance();

      // 1. 获取上传URL
      const uploadResult = await imageGenerator.getUploadUrl(payload.filename, payload.contentType);

      // 2. 解析base64数据
      const base64Data = payload.fileData.split(',')[1];
      const fileBuffer = Buffer.from(base64Data, 'base64');

      // 3. 上传图片到GCS
      await imageGenerator.uploadImage(uploadResult.upload_url, fileBuffer, payload.contentType);

      // 4. 发送成功响应
      await communicationService.sendNanoBananaUploadResponse({
        success: true,
        publicUrl: uploadResult.public_url
      });

      logger.info('NanoBanana image uploaded successfully', { publicUrl: uploadResult.public_url });
    } catch (error) {
      logger.error('Failed to upload NanoBanana image', error instanceof Error ? error : undefined);
      await communicationService.sendNanoBananaUploadResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      });
    }
  });

  // 🎯 处理NanoBanana生成请求
  communicationService.onNanoBananaGenerate(async (payload) => {
    try {
      logger.info('Received nanobanana_generate request', {
        prompt: payload.prompt.substring(0, 50) + '...',
        aspectRatio: payload.aspectRatio,
        imageSize: payload.imageSize
      });

      // 🎯 获取ImageGeneratorAdapter实例
      const { ImageGeneratorAdapter } = await import('deepv-code-core');
      const imageGenerator = ImageGeneratorAdapter.getInstance();

      // 提交生成任务
      const task = await imageGenerator.submitImageGenerationTask(
        payload.prompt,
        payload.aspectRatio,
        payload.referenceImageUrl,
        payload.imageSize
      );

      // 发送成功响应
      await communicationService.sendNanoBananaGenerateResponse({
        success: true,
        taskId: task.task_id,
        estimatedTime: task.task_info?.estimated_time || 60
      });

      logger.info('NanoBanana generation task created', { taskId: task.task_id });
    } catch (error) {
      logger.error('Failed to start NanoBanana generation', error instanceof Error ? error : undefined);
      await communicationService.sendNanoBananaGenerateResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Generation failed'
      });
    }
  });

  // 🎯 处理NanoBanana状态查询请求
  communicationService.onNanoBananaStatus(async (payload) => {
    try {
      // 🎯 获取ImageGeneratorAdapter实例
      const { ImageGeneratorAdapter } = await import('deepv-code-core');
      const imageGenerator = ImageGeneratorAdapter.getInstance();

      // 获取任务状态
      const task = await imageGenerator.getImageTaskStatus(payload.taskId);

      // 🎯 如果任务完成，下载图片并转换为base64 data URL
      // Webview有跨域限制，无法直接显示外部图片
      // 同时保留原始URL供用户在浏览器中打开/保存
      let finalResultUrls: string[] | undefined = task.result_urls || undefined;
      let originalUrls: string[] | undefined = undefined;

      if (task.status === 'completed' && task.result_urls && task.result_urls.length > 0) {
        logger.info('Downloading images and converting to data URLs', { taskId: payload.taskId, urlCount: task.result_urls.length });

        // 保存原始URL（用于浏览器打开）
        originalUrls = [...task.result_urls];

        // 并行下载所有图片并转换为data URL（用于Webview显示）
        const dataUrls = await Promise.all(
          task.result_urls.map(async (url) => {
            try {
              // 下载图片（跟随重定向）
              const response = await fetch(url, {
                method: 'GET',
                redirect: 'follow'
              });

              if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status}`);
              }

              // 获取content-type
              const contentType = response.headers.get('content-type') || 'image/png';

              // 读取图片数据为ArrayBuffer
              const arrayBuffer = await response.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              // 转换为base64 data URL
              const base64 = buffer.toString('base64');
              const dataUrl = `data:${contentType};base64,${base64}`;

              logger.debug('Converted image to data URL', {
                originalUrl: url.substring(0, 50) + '...',
                size: buffer.length,
                contentType
              });

              return dataUrl;
            } catch (error) {
              logger.warn('Failed to download image', { url, error });
              return url; // 如果下载失败，返回原始URL作为fallback
            }
          })
        );
        finalResultUrls = dataUrls;
      }

      // 发送状态更新（包含base64用于显示，原始URL用于打开）
      // 使用 credits_actual（实际扣除）如果存在，否则回退到 credits_deducted（预估）
      const actualCredits = (task as any).credits_actual !== undefined
        ? (task as any).credits_actual
        : task.credits_deducted;
      await communicationService.sendNanoBananaStatusUpdate({
        taskId: payload.taskId,
        status: task.status,
        progress: task.progress,
        resultUrls: finalResultUrls,
        originalUrls: originalUrls,
        errorMessage: task.error_message || undefined,
        creditsDeducted: actualCredits
      });
    } catch (error) {
      logger.error('Failed to get NanoBanana task status', error instanceof Error ? error : undefined);
      await communicationService.sendNanoBananaStatusUpdate({
        taskId: payload.taskId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Failed to get status'
      });
    }
  });

  // 🎯 处理文件打开请求
  communicationService.onOpenFile(async (payload) => {
    try {
      logger.info('Received open_file request', { filePath: payload.filePath, line: payload.line });

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        logger.warn('No workspace folder found');
        vscode.window.showWarningMessage('未找到工作区，无法打开文件');
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      let targetPath = payload.filePath;
      const fs = require('fs');

      // 智能路径解析：跨平台兼容（Windows/macOS/Linux）
      const pathsToTry: string[] = [];

      // 标准化路径分隔符（统一转换为当前系统的分隔符）
      const normalizedPath = targetPath.replace(/[\/\\]/g, path.sep);

      // 检测是否是纯文件名（没有任何目录分隔符）
      const isPureFileName = !normalizedPath.includes(path.sep);

      // 1. 如果是完整的绝对路径（包含用户目录或 Windows 盘符），直接使用
      const isRealAbsolutePath =
        (process.platform === 'win32' && /^[a-zA-Z]:/.test(normalizedPath)) || // Windows: C:\...
        (process.platform !== 'win32' && normalizedPath.startsWith(path.sep) && fs.existsSync(normalizedPath)); // Unix: /Users/...

      if (isRealAbsolutePath) {
        pathsToTry.push(normalizedPath);
      }

      // 2. 去掉开头的路径分隔符作为相对路径（处理 /src/... 这种格式）
      const trimmedPath = normalizedPath.replace(/^[\/\\]+/, '');
      if (trimmedPath !== normalizedPath && !isPureFileName) {
        pathsToTry.push(path.join(workspaceRoot, trimmedPath));
      }

      // 3. 直接作为相对路径拼接（仅当不是纯文件名时）
      if (!isPureFileName) {
        pathsToTry.push(path.join(workspaceRoot, normalizedPath));
      }

      // 4. 原路径（作为最后的尝试）
      if (!isPureFileName) {
        pathsToTry.push(normalizedPath);
      }

      // 尝试所有可能的路径
      let resolvedPath: string | null = null;
      for (const tryPath of pathsToTry) {
        if (fs.existsSync(tryPath)) {
          resolvedPath = tryPath;
          break;
        }
      }

      // 5. 如果标准方式找不到，或者是纯文件名，使用 VSCode 的全局搜索（像搜索框一样）
      if (!resolvedPath || isPureFileName) {
        if (isPureFileName) {
          logger.info('Pure file name detected, using global file search...', { filePath: targetPath });
        } else {
          logger.info('Standard path resolution failed, attempting global file search...', { filePath: targetPath });
        }

        // 提取文件名（最后一个 / 后面的部分）
        const fileName = normalizedPath.split(path.sep).pop() || normalizedPath;

        // 使用 VSCode 的 findFiles API 在所有工作区中搜索
        const foundFiles = await vscode.workspace.findFiles(`**/${fileName}`, null, 10);

        if (foundFiles.length > 0) {
          let selectedFile = foundFiles[0];

          if (foundFiles.length === 1) {
            // 只有一个文件，直接使用
            selectedFile = foundFiles[0];
            logger.info('Single file found, auto-selecting', { resolvedPath: selectedFile.fsPath });
          } else if (foundFiles.length > 1) {
            // 多个文件找到，首先尝试根据路径匹配
            const pathParts = normalizedPath.split(path.sep).filter(p => p.length > 0);

            let pathMatchedFile: vscode.Uri | undefined;

            // 只有在有多个路径部分且不是纯文件名时才尝试路径匹配
            if (pathParts.length > 1 && !isPureFileName) {
              pathMatchedFile = foundFiles.find(f => {
                const filePath = f.fsPath;
                return pathParts.every(part => filePath.includes(part));
              });
            }

            if (pathMatchedFile) {
              selectedFile = pathMatchedFile;
              logger.info('File found via path matching', { resolvedPath: selectedFile.fsPath });
            } else {
              // 如果没有路径匹配，显示快速选择菜单让用户选择
              logger.info('Multiple files found, showing selection menu', { count: foundFiles.length, isPureFileName });

              const selectedItem = await vscode.window.showQuickPick(
                foundFiles.map((file, index) => ({
                  label: path.basename(file.fsPath),
                  description: file.fsPath,
                  detail: `路径: ${file.fsPath}`,
                  file: file,
                  index: index
                })),
                {
                  title: `找到 ${foundFiles.length} 个文件，请选择要打开的:`,
                  placeHolder: `选择 ${fileName}`
                }
              );

              if (!selectedItem) {
                logger.info('User cancelled file selection');
                return; // 用户取消了选择
              }

              selectedFile = selectedItem.file;
              logger.info('File selected by user', { resolvedPath: selectedFile.fsPath });
            }
          }

          resolvedPath = selectedFile.fsPath;
          logger.info('File found via global search', { resolvedPath });
        }
      }

      if (!resolvedPath) {
        logger.warn('File not found', { filePath: payload.filePath, triedPaths: pathsToTry });
        vscode.window.showWarningMessage(`文件未找到: ${payload.filePath}`);
        return;
      }

      targetPath = resolvedPath;

      const uri = vscode.Uri.file(targetPath);
      const document = await vscode.workspace.openTextDocument(uri);

      // 在新标签页中打开，不替换现有编辑器
      const editor = await vscode.window.showTextDocument(document, {
        preview: false, // 不使用预览模式，确保打开新标签
        preserveFocus: false // 切换焦点到新打开的文件
      });

      // 如果指定了行号，跳转到对应行
      if (payload.line !== undefined && payload.line > 0) {
        const line = payload.line - 1; // VSCode 行号从0开始
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }

      // 如果指定了方法名（symbol），尝试跳转到方法定义
      if (payload.symbol) {
        try {
          const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
          );

          if (symbols && symbols.length > 0) {
            // 递归查找符号
            const findSymbol = (symbolList: vscode.DocumentSymbol[], targetName: string): vscode.DocumentSymbol | undefined => {
              for (const symbol of symbolList) {
                if (symbol.name === targetName) {
                  return symbol;
                }
                if (symbol.children && symbol.children.length > 0) {
                  const found = findSymbol(symbol.children, targetName);
                  if (found) return found;
                }
              }
              return undefined;
            };

            const targetSymbol = findSymbol(symbols, payload.symbol);

            if (targetSymbol) {
              const position = targetSymbol.selectionRange.start;
              editor.selection = new vscode.Selection(position, position);
              editor.revealRange(
                targetSymbol.range,
                vscode.TextEditorRevealType.InCenter
              );
            }
          }
        } catch (error) {
          logger.warn('Symbol jump failed', error instanceof Error ? error : undefined);
        }
      }

      logger.info('File opened successfully', { targetPath, line: payload.line });
    } catch (error) {
      logger.error('Failed to open file', error instanceof Error ? error : undefined);
      vscode.window.showErrorMessage(`无法打开文件: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  });

  // 处理行号跳转请求（跳转到当前文件的指定行）
  communicationService.onGotoLine(async (payload) => {
    try {

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('没有打开的编辑器，请先打开一个文件');
        return;
      }

      const line = payload.line - 1; // VSCode 行号从0开始
      const position = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
    } catch (error) {
      vscode.window.showErrorMessage(`无法跳转到行 ${payload.line}`);
    }
  });

  // 处理符号跳转请求
  communicationService.onGotoSymbol(async (payload) => {
    try {
      logger.info('Received goto_symbol request', { symbol: payload.symbol });

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        logger.warn('No active editor');
        vscode.window.showWarningMessage('未找到活动的编辑器');
        return;
      }

      const document = editor.document;

      // 使用 VSCode 的符号搜索功能
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (!symbols || symbols.length === 0) {
        logger.warn('No symbols found in document');
        vscode.window.showWarningMessage('未找到符号信息');
        return;
      }

      // 递归查找符号
      const findSymbol = (symbolList: vscode.DocumentSymbol[], targetName: string): vscode.DocumentSymbol | undefined => {
        for (const symbol of symbolList) {
          if (symbol.name === targetName) {
            return symbol;
          }
          if (symbol.children && symbol.children.length > 0) {
            const found = findSymbol(symbol.children, targetName);
            if (found) return found;
          }
        }
        return undefined;
      };

      const targetSymbol = findSymbol(symbols, payload.symbol);

      if (!targetSymbol) {
        logger.warn('Symbol not found', { symbol: payload.symbol });
        vscode.window.showWarningMessage(`未找到符号: ${payload.symbol}`);
        return;
      }

      // 跳转到符号位置
      const position = targetSymbol.selectionRange.start;
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        targetSymbol.range,
        vscode.TextEditorRevealType.InCenter
      );

      logger.info('Symbol located successfully', { symbol: payload.symbol, line: position.line + 1 });
    } catch (error) {
      logger.error('Failed to goto symbol', error instanceof Error ? error : undefined);
      vscode.window.showErrorMessage(`无法跳转到符号: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  });
}

function registerCommands(context: vscode.ExtensionContext) {
  logger.info('Registering commands...');
  console.log('DeepV Code: Registering commands');

  const commands = [
    vscode.commands.registerCommand('deepv.openAIAssistant', async () => {
      logger.info('deepv.openAIAssistant command executed');
      console.log('DeepV Code: openAIAssistant command executed');

      // 🎯 显示侧边栏视图
      try {
        await webviewService?.show();
      } catch (error) {
        logger.error('Failed to show webview', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage('Failed to open DeepV Code Assistant');
      }
    }),

    // 🎯 右键菜单命令：添加代码到当前对话（只插入，不自动发送）
    vscode.commands.registerCommand('deepv.addToCurrentChat', async () => {
      logger.info('deepv.addToCurrentChat command executed');

      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
          vscode.window.showWarningMessage('请先选择要添加的代码');
          return;
        }

        const selectedText = editor.document.getText(editor.selection);
        const fileName = path.basename(editor.document.uri.fsPath);
        const filePath = editor.document.uri.fsPath;
        const startLine = editor.selection.start.line + 1;
        const endLine = editor.selection.end.line + 1;

        // 🎯 先聚焦侧边栏视图
        await vscode.commands.executeCommand('deepv.aiAssistant.focus');

        // 🎯 等待 webview 准备就绪
        await communicationService.waitForReady(3000);

        // 🎯 发送插入代码消息（只插入到输入框，不自动发送）
        communicationService.sendMessage({
          type: 'insert_code_to_input',
          payload: {
            fileName,
            filePath,
            code: selectedText,
            startLine,
            endLine
          }
        });
      } catch (error) {
        logger.error('Failed to execute addToCurrentChat', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage('无法添加代码到对话');
      }
    }),

    // 🎯 旧的命令（保留兼容性）- 解释代码
    vscode.commands.registerCommand('deepv.explainCode', async () => {
      logger.info('deepv.explainCode command executed');

      try {
        const selectedText = getSelectedText();
        if (!selectedText) {
          vscode.window.showWarningMessage('请先选择要解释的代码');
          return;
        }

        // 🎯 先聚焦侧边栏视图（如果已打开就聚焦，如果没打开就打开）
        await vscode.commands.executeCommand('deepv.aiAssistant.focus');

        // 🎯 等待 webview 准备就绪（最多等待 3 秒）
        await communicationService.waitForReady(3000);

        // 发送预填充消息到webview
        const editor = vscode.window.activeTextEditor;
        const fileName = editor?.document.fileName || 'selected code';
        const message = `请解释以下代码: \n\n\`\`\`\n${selectedText}\n\`\`\`\n\n来自文件: ${fileName}`;

        // 🎯 发送消息（webview 已 ready 或进入队列）
        communicationService.sendMessage({
          type: 'prefill_message',
          payload: { message }
        });
      } catch (error) {
        logger.error('Failed to execute explainCode', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage('无法执行代码解释功能');
      }
    }),

    // 🎯 右键菜单命令：优化代码
    vscode.commands.registerCommand('deepv.optimizeCode', async () => {
      logger.info('deepv.optimizeCode command executed');

      try {
        const selectedText = getSelectedText();
        if (!selectedText) {
          vscode.window.showWarningMessage('请先选择要优化的代码');
          return;
        }

        // 🎯 先聚焦侧边栏视图（如果已打开就聚焦，如果没打开就打开）
        await vscode.commands.executeCommand('deepv.aiAssistant.focus');

        // 🎯 等待 webview 准备就绪（最多等待 3 秒）
        await communicationService.waitForReady(3000);

        // 发送预填充消息到webview
        const editor = vscode.window.activeTextEditor;
        const fileName = editor?.document.fileName || 'selected code';
        const message = `请优化以下代码，提高性能和可读性:\n\n\`\`\`\n${selectedText}\n\`\`\`\n\n来自文件: ${fileName}`;

        // 🎯 发送消息（webview 已 ready 或进入队列）
        communicationService.sendMessage({
          type: 'prefill_message',
          payload: { message }
        });
      } catch (error) {
        logger.error('Failed to execute optimizeCode', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage('无法执行代码优化功能');
      }
    }),

    // 🎯 右键菜单命令：生成测试
    vscode.commands.registerCommand('deepv.generateTests', async () => {
      logger.info('deepv.generateTests command executed');

      try {
        const selectedText = getSelectedText();
        if (!selectedText) {
          vscode.window.showWarningMessage('请先选择要生成测试的代码');
          return;
        }

        // 🎯 先聚焦侧边栏视图（如果已打开就聚焦，如果没打开就打开）
        await vscode.commands.executeCommand('deepv.aiAssistant.focus');

        // 🎯 等待 webview 准备就绪（最多等待 3 秒）
        await communicationService.waitForReady(3000);

        // 发送预填充消息到webview
        const editor = vscode.window.activeTextEditor;
        const fileName = editor?.document.fileName || 'selected code';
        const message = `请为以下代码生成单元测试:\n\n\`\`\`\n${selectedText}\n\`\`\`\n\n来自文件: ${fileName}`;

        // 🎯 发送消息（webview 已 ready 或进入队列）
        communicationService.sendMessage({
          type: 'prefill_message',
          payload: { message }
        });
      } catch (error) {
        logger.error('Failed to execute generateTests', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage('无法执行生成测试功能');
      }
    }),
    // 🎯 打开自定义规则管理
    vscode.commands.registerCommand('deepv.openRulesManagement', async () => {
      logger.info('deepv.openRulesManagement command executed');
      try {
        // 通过 webview 消息通知前端打开规则管理对话框
        await communicationService.sendMessage({
          type: 'open_rules_management',
          payload: {}
        });
      } catch (error) {
        logger.error('Failed to open rules management', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage('Failed to open Rules Management');
      }
    }),

    // 🔌 MCP 相关命令
    vscode.commands.registerCommand('deepv.showMCPStatus', async () => {
      logger.info('deepv.showMCPStatus command executed');
      try {
        const { MCPSettingsService } = await import('./services/mcpSettingsService');
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const mcpServers = MCPSettingsService.loadMCPServers(workspaceRoot);

        if (Object.keys(mcpServers).length === 0) {
          vscode.window.showInformationMessage('未配置 MCP 服务器。请编辑 ~/.deepv/settings.json 添加配置。');
          return;
        }

        // 从当前激活的 session 获取 MCP 状态
        const currentSession = sessionManager?.getCurrentSession();
        if (!currentSession) {
          vscode.window.showInformationMessage('请先打开 AI 助手');
          return;
        }

        const aiService = sessionManager.getAIService(currentSession.info.id);
        const statuses = aiService?.getMCPServerStatuses();
        const discoveryState = aiService?.getMCPDiscoveryState();

        const items = Object.keys(mcpServers).map(serverName => {
          const status = statuses?.get(serverName) || 'disconnected';
          const icon = status === 'connected' ? '✅' : status === 'connecting' ? '🔄' : '❌';
          return `${icon} ${serverName}: ${status}`;
        });

        const selected = await vscode.window.showQuickPick(
          ['📊 MCP 状态总览', '📝 打开配置文件', ...items],
          { placeHolder: `MCP 发现状态: ${discoveryState || 'not_started'}` }
        );

        if (selected === '📝 打开配置文件') {
          await vscode.commands.executeCommand('deepv.openMCPSettings');
        }
      } catch (error) {
        logger.error('Failed to show MCP status', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage('无法显示 MCP 状态');
      }
    }),

    vscode.commands.registerCommand('deepv.openMCPSettings', async () => {
      logger.info('deepv.openMCPSettings command executed');
      try {
        const { MCPSettingsService } = await import('./services/mcpSettingsService');
        const paths = MCPSettingsService.getSettingsPaths(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        );

        const options = [
          { label: '📝 用户级配置', description: paths.user, path: paths.user },
          { label: '📁 工作区配置', description: paths.workspace || '(无工作区)', path: paths.workspace },
        ];

        const selected = await vscode.window.showQuickPick(options.filter(o => o.path), {
          placeHolder: '选择要打开的配置文件'
        });

        if (selected?.path) {
          const fs = await import('fs');
          const settingsDir = await import('path').then(p => p.dirname(selected.path!));

          // 确保配置目录存在
          if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
          }

          // 如果文件不存在，创建示例配置
          if (!fs.existsSync(selected.path)) {
            const exampleConfig = {
              "mcpServers": {
                "filesystem": {
                  "command": "npx",
                  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"]
                }
              }
            };
            fs.writeFileSync(selected.path, JSON.stringify(exampleConfig, null, 2), 'utf-8');
          }

          const uri = vscode.Uri.file(selected.path);
          await vscode.window.showTextDocument(uri);
          vscode.window.showInformationMessage('提示：修改配置后需要重启 VS Code 才能生效');
        }
      } catch (error) {
        logger.error('Failed to open MCP settings', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage('无法打开 MCP 配置文件');
      }
    }),
    // 🎯 添加日志查看命令
    vscode.commands.registerCommand('deepv.openLogFile', async () => {
      try {
        const logPath = logger.getLogFilePath();
        const logUri = vscode.Uri.file(logPath);

        // 打开日志文件
        await vscode.window.showTextDocument(logUri);

        vscode.window.showInformationMessage(`已打开日志文件: ${logPath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`无法打开日志文件: ${errorMessage}`);
      }
    }),

    // 🎯 显示日志文件路径
    vscode.commands.registerCommand('deepv.showLogPath', async () => {
      const logPath = logger.getLogFilePath();
      const action = await vscode.window.showInformationMessage(
        `日志文件位置:\n${logPath}`,
        '复制路径',
        '打开文件',
        '打开文件夹'
      );

      if (action === '复制路径') {
        await vscode.env.clipboard.writeText(logPath);
        vscode.window.showInformationMessage('日志文件路径已复制到剪贴板');
      } else if (action === '打开文件') {
        const logUri = vscode.Uri.file(logPath);
        await vscode.window.showTextDocument(logUri);
      } else if (action === '打开文件夹') {
        const path = await import('path');
        const folderPath = path.dirname(logPath);
        const folderUri = vscode.Uri.file(folderPath);
        await vscode.commands.executeCommand('vscode.openFolder', folderUri, { forceNewWindow: false });
      }
    }),

    // 🎯 测试行内补全功能
    vscode.commands.registerCommand('deepv.testInlineCompletion', async () => {
      const config = vscode.workspace.getConfiguration('deepv');
      const isEnabled = config.get<boolean>('enableInlineCompletion', false);

      if (!isEnabled) {
        const action = await vscode.window.showWarningMessage(
          '行内补全功能已禁用。是否启用？',
          '启用',
          '取消'
        );

        if (action === '启用') {
          await config.update('enableInlineCompletion', true, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage('✅ 行内补全已启用！请在代码文件中输入以测试。');
        }
        return;
      }

      // 检查补全服务状态
      if (!inlineCompletionProvider) {
        vscode.window.showErrorMessage('❌ 行内补全提供者未初始化');
        return;
      }

      const providerStats = inlineCompletionProvider.getStats();
      const schedulerStats = completionScheduler ? completionScheduler.getStats() : null;

      // 🆕 固定使用 Codestral FIM 专用模型
      const message = `📊 行内补全统计（推-拉分离架构）：

⚙️  模型: Codestral 2 FIM（专用代码补全模型）

📥 Provider (拉模式 - 只读缓存):
  • 总调用次数: ${providerStats.totalRequests}
  • 硬 Key 命中: ${providerStats.hardKeyHits}
  • 软 Key 命中: ${providerStats.softKeyHits}
  • 缓存未命中: ${providerStats.cacheMisses}
  • 命中率: ${providerStats.hitRate}

📤 Scheduler (推模式 - 后台请求):
  • API 请求数: ${schedulerStats?.totalRequests || 0}
  • 跳过请求数: ${schedulerStats?.totalSkipped || 0}
  • 缓存大小: ${providerStats.cacheStats?.sets || 0}

💡 提示：使用 Codestral 2 FIM 专用模型，针对代码补全优化，接受率提升 30%。
💡 命中率高说明缓存策略有效，减少了 API 调用。`;

      vscode.window.showInformationMessage(message, { modal: true });
    }),

    // 🎯 切换行内补全开关
    vscode.commands.registerCommand('deepv.toggleInlineCompletion', async () => {
      const config = vscode.workspace.getConfiguration('deepv');
      const isEnabled = config.get<boolean>('enableInlineCompletion', false);
      const newState = !isEnabled;

      await config.update('enableInlineCompletion', newState, vscode.ConfigurationTarget.Global);

      const status = newState ? '✅ 已启用' : '❌ 已禁用';
      vscode.window.showInformationMessage(`行内补全功能${status}`);

      logger.info(`Inline completion toggled: ${newState}`);

      // 更新状态栏显示
      updateInlineCompletionStatusBar();
    }),

    // 🎯 从状态栏切换行内补全开关
    vscode.commands.registerCommand('deepv.toggleInlineCompletionFromStatusBar', async () => {
      const config = vscode.workspace.getConfiguration('deepv');
      const isEnabled = config.get<boolean>('enableInlineCompletion', false);
      const newState = !isEnabled;

      await config.update('enableInlineCompletion', newState, vscode.ConfigurationTarget.Global);

      logger.info(`Inline completion toggled from status bar: ${newState}`);

      // 更新状态栏显示（tooltip会显示新状态，无需额外提示）
      updateInlineCompletionStatusBar();

      // 🎯 使用状态栏消息代替弹窗提示，更轻量级，5秒后自动消失
      const statusMessage = newState ? 'DeepV 代码补全已启用' : 'DeepV 代码补全已禁用';
      vscode.window.setStatusBarMessage(statusMessage, 3000);
    }),

    // 🎯 版本控制命令 - 回退到上一版本
    vscode.commands.registerCommand('deepv.revertToPrevious', async () => {
      try {
        const currentSession = sessionManager.getCurrentSession();
        if (!currentSession) {
          vscode.window.showWarningMessage('没有活跃的会话');
          return;
        }

        const action = await vscode.window.showWarningMessage(
          '确定要回退到上一个版本吗？这将撤销最近一次AI应用的更改。',
          { modal: true },
          '回退',
          '取消'
        );

        if (action !== '回退') {
          return;
        }

        const result = await versionControlManager.revertPrevious(currentSession.info.id);

        if (result.success) {
          vscode.window.showInformationMessage(
            `✅ 已回退到上一版本 (${result.revertedFiles.length} 个文件)`
          );
          logger.info('Reverted to previous version successfully', result);
        } else {
          vscode.window.showErrorMessage(`回退失败: ${result.error || '未知错误'}`);
          logger.error('Failed to revert to previous version', new Error(result.error));
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`回退失败: ${errorMsg}`);
        logger.error('Error executing revert command', error instanceof Error ? error : undefined);
      }
    }),

    // 🎯 版本控制命令 - 显示版本时间线
    vscode.commands.registerCommand('deepv.showVersionTimeline', async () => {
      try {
        const currentSession = sessionManager.getCurrentSession();
        if (!currentSession) {
          vscode.window.showWarningMessage('没有活跃的会话');
          return;
        }

        const timeline = versionControlManager.getTimeline(currentSession.info.id);

        if (timeline.length === 0) {
          vscode.window.showInformationMessage('当前会话没有版本历史');
          return;
        }

        // 创建QuickPick选择器
        const items = timeline.map(item => ({
          label: item.isCurrent ? `$(check) ${item.title}` : item.title,
          description: item.description,
          detail: `${new Date(item.timestamp).toLocaleString()} • +${item.stats.linesAdded} -${item.stats.linesRemoved}`,
          nodeId: item.nodeId
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: '选择要回退到的版本',
          title: '📋 版本历史时间线',
          matchOnDescription: true,
          matchOnDetail: true
        });

        if (selected) {
          const action = await vscode.window.showWarningMessage(
            `确定要回退到版本 "${selected.label}" 吗？`,
            { modal: true },
            '回退',
            '取消'
          );

          if (action === '回退') {
            const result = await versionControlManager.revertTo(
              currentSession.info.id,
              selected.nodeId
            );

            if (result.success) {
              vscode.window.showInformationMessage(
                `✅ 已回退到选定版本 (${result.revertedFiles.length} 个文件)`
              );
            } else {
              vscode.window.showErrorMessage(`回退失败: ${result.error || '未知错误'}`);
            }
          }
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`显示版本历史失败: ${errorMsg}`);
        logger.error('Error showing version timeline', error instanceof Error ? error : undefined);
      }
    }),

    // 🎯 调试命令 - 检查版本节点状态
    vscode.commands.registerCommand('deepv.debugVersionNodes', async () => {
      try {
        const currentSession = sessionManager.getCurrentSession();
        if (!currentSession) {
          vscode.window.showWarningMessage('没有活跃的会话');
          return;
        }

        const sessionId = currentSession.info.id;
        const rollbackableIds = versionControlManager.getRollbackableMessageIds(sessionId);
        const timeline = versionControlManager.getTimeline(sessionId);

        const debugInfo = {
          sessionId,
          rollbackableMessageCount: rollbackableIds.length,
          rollbackableMessageIds: rollbackableIds,
          timelineCount: timeline.length,
          timelineItems: timeline.map(item => ({
            nodeId: item.nodeId,
            title: item.title,
            type: item.type,
            fileCount: item.fileCount,
            isCurrent: item.isCurrent
          }))
        };

        logger.info('🔍 Version Control Debug Info:', debugInfo);

        // 显示调试信息给用户
        const debugText = `📋 版本控制诊断信息\n\n` +
          `Session: ${sessionId}\n\n` +
          `可回滚消息: ${rollbackableIds.length} 个\n` +
          `${rollbackableIds.map(id => `  • ${id}`).join('\n')}\n\n` +
          `版本时间线: ${timeline.length} 个节点\n` +
          `${timeline.map(item => `  • ${item.isCurrent ? '✓' : ' '} ${item.title} (${item.fileCount} files)`).join('\n')}`;

        // 显示在新的Webview中
        const panel = vscode.window.createWebviewPanel(
          'debugVersionNodes',
          '版本控制诊断',
          vscode.ViewColumn.Beside,
          { enableScripts: true }
        );

        panel.webview.html = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: monospace; padding: 20px; color: #ccc; background: #1e1e1e; }
              h2 { color: #4ec9b0; }
              pre { background: #2d2d30; padding: 10px; border-radius: 4px; overflow-x: auto; }
              .success { color: #6a9955; }
              .error { color: #f48771; }
            </style>
          </head>
          <body>
            <h2>📋 版本控制诊断信息</h2>
            <p>Session: <span class="success">${sessionId}</span></p>
            <p>可回滚消息: <span class="success">${rollbackableIds.length}</span> 个</p>
            <pre>${JSON.stringify(debugInfo, null, 2)}</pre>
          </body>
          </html>
        `;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`诊断失败: ${errorMsg}`);
        logger.error('Debug command failed', error instanceof Error ? error : undefined);
      }
    })
  ];

  context.subscriptions.push(...commands);
  logger.info(`Registered ${commands.length} commands successfully`);
  console.log(`DeepV Code: Registered ${commands.length} commands`);
}

/**
 * 更新状态栏显示
 */
function updateInlineCompletionStatusBar() {
  if (!inlineCompletionStatusBar) {
    return;
  }

  const config = vscode.workspace.getConfiguration('deepv');
  const isEnabled = config.get<boolean>('enableInlineCompletion', false);

  if (isEnabled) {
    // 开启状态：使用DeepV品牌标识 - "D" + check图标代表DeepV
    inlineCompletionStatusBar.text = 'D$(check)';
    inlineCompletionStatusBar.tooltip = 'DeepV 代码补全：已启用（点击关闭）';
    inlineCompletionStatusBar.backgroundColor = undefined;
    inlineCompletionStatusBar.color = undefined;
  } else {
    // 关闭状态：使用D + X表示禁用
    inlineCompletionStatusBar.text = 'D$(x)';
    inlineCompletionStatusBar.tooltip = 'DeepV 代码补全：已禁用（点击启用）';
    inlineCompletionStatusBar.backgroundColor = undefined;
    inlineCompletionStatusBar.color = new vscode.ThemeColor('statusBarItem.warningForeground');
  }
}

/**
 * 初始化行内补全服务
 */
async function initializeInlineCompletion() {
  try {
    logger.info('Initializing inline completion service...');

    // 🎯 从 SessionManager 获取默认 session 的 config 和 contentGenerator
    const currentSession = sessionManager.getCurrentSession();
    logger.info(`Current session check: ${currentSession ? currentSession.info.id : 'null'}`);
    if (!currentSession) {
      logger.warn('No current session available for inline completion');
      return;
    }

    // 🎯 使用 getInitializedAIService 确保 AIService 已完成初始化
    // 这会触发延迟初始化（如果还没初始化的话）
    let aiService;
    try {
      logger.info('Ensuring AIService is initialized...');
      aiService = await sessionManager.getInitializedAIService(currentSession.info.id);
      logger.info('✅ AIService initialization confirmed');
    } catch (initError) {
      logger.warn('Failed to initialize AIService for inline completion', initError instanceof Error ? initError : undefined);
      return;
    }

    // 🆕 使用 Codestral FIM 专用模型 - 无需 Config 和 ContentGenerator
    // FIM 服务直接调用专用 API，模型固定为 codestral-2
    const { InlineCompletionService } = await import('deepv-code-core');
    const completionService = new InlineCompletionService();
    logger.info(`🎯 Inline completion using Codestral FIM model: ${completionService.getCurrentModel()}`);

    // 🎯 创建并初始化 CompletionScheduler（后台调度器）
    completionScheduler = new CompletionScheduler(
      completionCache,
      completionService,
      logger
    );
    completionScheduler.init(extensionContext);
    logger.info('✅ CompletionScheduler initialized (background push mode, 300ms debounce)');

    // 🎯 监听配置变化（仅保留补全开关监听，移除模型选择监听）
    extensionContext.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        // 🎯 监听代码补全开关变化，更新状态栏
        if (e.affectsConfiguration('deepv.enableInlineCompletion')) {
          updateInlineCompletionStatusBar();
          const isEnabled = vscode.workspace.getConfiguration('deepv').get<boolean>('enableInlineCompletion', false);
          logger.info(`Inline completion status bar updated: ${isEnabled ? 'enabled' : 'disabled'}`);
        }
      })
    );

    logger.info('✅ Inline completion service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize inline completion service', error instanceof Error ? error : undefined);
  }
}

async function startServices() {
  // 🎯 避免重复初始化
  if (servicesInitialized) {
    logger.info('Services already initialized, skipping...');
    return;
  }

  try {
    logger.info('Starting remaining services initialization...');

    // 🎯 初始化多Session通信服务
    await communicationService.initialize();
    logger.info('MultiSessionCommunicationService initialized');

    // 🎯 初始化上下文服务
    await contextService.initialize();

    // 🎯 初始化SessionManager (包含所有session的toolService和aiService)
    try {
      await sessionManager.initialize();
      logger.info('SessionManager initialized successfully (manages all session-specific services)');

      // 🎯 SessionManager初始化完成后，立即发送会话列表给前端
      const sessions = sessionManager.getAllSessionsInfo();
      const currentSessionId = sessionManager.getCurrentSession()?.info.id || null;
      logger.info(`Sending ${sessions.length} sessions to frontend, current: ${currentSessionId}`);
      await communicationService.sendSessionListUpdate(sessions, currentSessionId);

      // 🎯 初始化行内补全服务（依赖 SessionManager）
      await initializeInlineCompletion();

      // 🎯 监听 session 切换和删除事件，重新初始化行内补全服务
      sessionManager.on('switched', async () => {
        logger.info('Session switched, reinitializing inline completion...');
        await initializeInlineCompletion();
      });

      sessionManager.on('deleted', async () => {
        logger.info('Session deleted, reinitializing inline completion...');
        await initializeInlineCompletion();
      });

      sessionManager.on('created', async () => {
        logger.info('Session created, reinitializing inline completion...');
        await initializeInlineCompletion();
      });

      // 🎯 监听 session 更新事件，转发到前端
      sessionManager.on('updated', async (sessionId: string, data: any) => {
        const session = sessionManager.getSession(sessionId);
        if (session) {
          communicationService.sendMessage({
            type: 'session_updated',
            payload: { sessionId, session: session.info }
          });
          logger.info(`Session updated event forwarded to frontend: ${sessionId}`);
        }
      });

    } catch (error) {
      logger.warn('SessionManager initialization failed, continuing with basic mode', error instanceof Error ? error : undefined);
    }

    // 🎯 标记服务已初始化
    servicesInitialized = true;
    logger.info('✅ All core services initialized successfully');

  } catch (error) {
    logger.error('Failed to initialize core services', error instanceof Error ? error : undefined);
    servicesInitialized = false; // 初始化失败，重置标志
    throw error;
  }
}

function getSelectedText(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty) {
    return editor.document.getText(editor.selection);
  }
  return undefined;
}

/**
 * 在VSCode编辑器中打开diff视图 - 显示完整文件内容对比
 */
async function openDiffInEditor(
  fileDiff: string,
  fileName: string,
  originalContent: string,
  newContent: string
): Promise<void> {
  try {
    // 创建临时目录
    const tempDir = path.join(require('os').tmpdir(), 'deepv-diffs');
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));
    } catch (error) {
      // 目录可能已经存在，忽略错误
    }

    // 生成唯一的文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFileName = fileName.replace(/[<>:"/\\|?*]/g, '_'); // 清理文件名中的特殊字符
    const originalFileName = `${baseFileName}-original-${timestamp}`;
    const newFileName = `${baseFileName}-modified-${timestamp}`;

    // 获取文件扩展名以保持语法高亮
    const fileExtension = path.extname(fileName);
    const originalFilePath = path.join(tempDir, originalFileName + fileExtension);
    const newFilePath = path.join(tempDir, newFileName + fileExtension);

    // 创建临时文件
    const originalUri = vscode.Uri.file(originalFilePath);
    const newUri = vscode.Uri.file(newFilePath);

    // 写入文件内容
    await vscode.workspace.fs.writeFile(originalUri, Buffer.from(originalContent || '', 'utf8'));
    await vscode.workspace.fs.writeFile(newUri, Buffer.from(newContent || '', 'utf8'));

    // 使用VSCode的diff编辑器打开两个文件对比
    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      newUri,
      `${fileName}: Original ↔ Modified`,
      {
        preview: false,
        viewColumn: vscode.ViewColumn.One
      }
    );

    logger.info(`Diff comparison opened: ${originalFilePath} vs ${newFilePath}`);
    vscode.window.showInformationMessage(`已在编辑器中打开完整文件对比: ${fileName}`);

    // 可选：设置自动清理临时文件（5分钟后）
    setTimeout(async () => {
      try {
        await vscode.workspace.fs.delete(originalUri);
        await vscode.workspace.fs.delete(newUri);
        logger.debug(`Cleaned up temporary diff files for ${fileName}`);
      } catch (error) {
        logger.debug(`Failed to clean up temporary diff files for ${fileName}`, error instanceof Error ? error : undefined);
      }
    }, 5 * 60 * 1000); // 5分钟

  } catch (error) {
    logger.error('Failed to open diff comparison', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * 在VSCode编辑器中查看删除文件的内容
 */
async function openDeletedFileContent(
  fileName: string,
  filePath?: string,
  deletedContent?: string
): Promise<void> {
  try {
    if (!deletedContent) {
      vscode.window.showWarningMessage(`删除的文件 "${fileName}" 没有可查看的内容`);
      return;
    }

    // 创建临时目录
    const tempDir = path.join(require('os').tmpdir(), 'deepv-diffs');
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));
    } catch (error) {
      // 目录可能已经存在，忽略错误
    }

    // 生成唯一的文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFileName = fileName.replace(/[<>:"/\\|?*]/g, '_'); // 清理文件名中的特殊字符
    const deletedFileName = `${baseFileName}-deleted-${timestamp}`;

    // 获取文件扩展名以保持语法高亮
    const fileExtension = path.extname(fileName);
    const deletedFilePath = path.join(tempDir, deletedFileName + fileExtension);

    // 创建临时文件
    const deletedUri = vscode.Uri.file(deletedFilePath);

    // 写入删除的文件内容
    await vscode.workspace.fs.writeFile(deletedUri, Buffer.from(deletedContent, 'utf8'));

    // 在VSCode中打开文件（只读模式）
    const document = await vscode.workspace.openTextDocument(deletedUri);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One
    });

    // 设置文档为只读状态的提示信息
    const displayPath = filePath || fileName;
    vscode.window.showInformationMessage(
      `正在查看已删除文件的内容: ${displayPath}`,
      '关闭'
    );

    logger.info(`Deleted file content opened: ${deletedFilePath} (original: ${displayPath})`);

    // 可选：设置自动清理临时文件（10分钟后）
    setTimeout(async () => {
      try {
        await vscode.workspace.fs.delete(deletedUri);
        logger.debug(`Cleaned up temporary deleted file for ${fileName}`);
      } catch (error) {
        logger.debug(`Failed to clean up temporary deleted file for ${fileName}`, error instanceof Error ? error : undefined);
      }
    }, 10 * 60 * 1000); // 10分钟

  } catch (error) {
    logger.error('Failed to open deleted file content', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * 设置剪贴板监听
 *
 * 监听文本编辑器的选择变化和剪贴板变化，
 * 当用户复制代码时，缓存文件信息以供粘贴时使用
 */
function setupClipboardMonitoring(context: vscode.ExtensionContext) {
  let lastClipboardContent: string = '';
  let lastSelection: { editor: vscode.TextEditor; selection: vscode.Selection } | null = null;

  // 🎯 监听文本选择变化
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (!event.selections || event.selections.length === 0) {
        return;
      }

      const selection = event.selections[0];
      if (selection.isEmpty) {
        return;
      }

      // 记录最后的选择
      lastSelection = {
        editor: event.textEditor,
        selection
      };

      // 🎯 启动短期剪贴板检查（仅 3 秒）
      startClipboardCheck();
    })
  );

  // 🎯 优化：仅在文本选择变化后的短时间内检查剪贴板（避免持续轮询）
  let clipboardCheckInterval: NodeJS.Timeout | null = null;
  let clipboardCheckCount = 0;
  const MAX_CLIPBOARD_CHECKS = 6; // 最多检查 6 次（3 秒）

  const startClipboardCheck = () => {
    // 清除旧的定时器
    if (clipboardCheckInterval) {
      clearInterval(clipboardCheckInterval);
    }

    clipboardCheckCount = 0;

    // 🎯 只在选择后的 3 秒内检查剪贴板
    clipboardCheckInterval = setInterval(async () => {
      clipboardCheckCount++;

      // 🎯 3 秒后停止检查
      if (clipboardCheckCount >= MAX_CLIPBOARD_CHECKS) {
        if (clipboardCheckInterval) {
          clearInterval(clipboardCheckInterval);
          clipboardCheckInterval = null;
        }
        return;
      }

      try {
        const currentClipboard = await vscode.env.clipboard.readText();

        // 如果剪贴板内容没有变化，跳过
        if (currentClipboard === lastClipboardContent || !currentClipboard.trim()) {
          return;
        }

        lastClipboardContent = currentClipboard;

        // 如果有最近的选择
        if (lastSelection) {
          const { editor, selection } = lastSelection;
          const selectedText = editor.document.getText(selection);

          // 如果剪贴板内容和选择的文本匹配
          if (selectedText.trim() === currentClipboard.trim()) {
            // 🎯 缓存文件信息
            clipboardCache.cache({
              fileName: path.basename(editor.document.uri.fsPath),
              filePath: editor.document.uri.fsPath,
              code: selectedText,
              startLine: selection.start.line + 1,
              endLine: selection.end.line + 1
            });

            // 🎯 成功缓存后立即停止检查
            if (clipboardCheckInterval) {
              clearInterval(clipboardCheckInterval);
              clipboardCheckInterval = null;
            }
          }
        }
      } catch (error) {
        // 忽略剪贴板读取错误（可能是权限问题）
      }
    }, 500);
  };

  // 清理定时器
  context.subscriptions.push({
    dispose: () => {
      if (clipboardCheckInterval) {
        clearInterval(clipboardCheckInterval);
        clipboardCheckInterval = null;
      }
    }
  });

  // 🎯 添加消息处理器：响应 webview 的剪贴板缓存请求
  communicationService.addMessageHandler('request_clipboard_cache', (payload: any) => {
    const pastedCode = payload?.code;

    if (typeof pastedCode === 'string') {
      const cachedInfo = clipboardCache.get(pastedCode);
      if (cachedInfo) {
        // 有缓存信息
        communicationService.sendMessage({
          type: 'clipboard_cache_response',
          payload: {
            found: true,
            fileName: cachedInfo.fileName,
            filePath: cachedInfo.filePath,
            code: cachedInfo.code,
            startLine: cachedInfo.startLine,
            endLine: cachedInfo.endLine
          }
        });
      } else {
        // 无缓存信息
        communicationService.sendMessage({
          type: 'clipboard_cache_response',
          payload: { found: false }
        });
      }
    }
  });

  logger.info('📋 Clipboard monitoring enabled');
}
