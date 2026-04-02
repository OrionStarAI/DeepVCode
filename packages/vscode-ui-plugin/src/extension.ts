/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
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
import { ROLLBACK_MESSAGES, INLINE_COMPLETION_MESSAGES } from './i18n/messages';
import { ClipboardCacheService } from './services/clipboardCacheService';
import { SlashCommandService } from './services/slashCommandService';
import { TerminalOutputService } from './services/terminalOutputService';
import { McpEnabledStateService } from './services/mcpEnabledStateService';
import { AIService } from './services/aiService';
import { getAllMCPServerToolCounts, getAllMCPServerToolNames, MCPServerStatus } from 'deepv-code-core';
import { SessionType, SessionStatus } from './constants/sessionConstants';
import { SessionInfo } from './types/sessionTypes';

let logger: Logger;
let terminalOutputService: TerminalOutputService;
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
let slashCommandService: SlashCommandService;

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

    // 🎯 设置 CLI 版本号，用于 User-Agent
    // 直接从 context 获取扩展信息更可靠
    const extensionVersion = context.extension?.packageJSON?.version || 'unknown';
    process.env.CLI_VERSION = `VSCode-${extensionVersion}`;
    // 同时通过 setCliVersion 设置（如果 ProxyAuthManager 已初始化）
    try {
      const { setCliVersion } = require('deepv-code-core');
      setCliVersion(`VSCode-${extensionVersion}`);
      // logger will be available after initialization
    } catch (e) {
      // core 可能还没加载，稍后会在 ProxyAuthManager 初始化时从环境变量读取
    }

    // 🚀 安装环境优化器
    EnvironmentOptimizer.installGlobalOptimization();

    startupOptimizer.endPhase();
    startupOptimizer.startPhase('Logger Initialization');

    // Set global extension path for ripgrep adapter
    (global as any).__extensionPath = context.extensionPath;
    (global as any).extensionContext = context;

    // Initialize logger first
    const outputChannel = vscode.window.createOutputChannel('DeepV Code AI Assistant');
    logger = new Logger(context, outputChannel);

    // 🎯 设置 logger 引用到优化工具，使其能使用统一的日志格式
    startupOptimizer.setLogger(logger);
    EnvironmentOptimizer.setLogger(logger);

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

    // 🔌 初始化 MCP 启用状态服务
    const mcpEnabledStateService = McpEnabledStateService.getInstance();
    mcpEnabledStateService.initialize(context);
    logger.info('McpEnabledStateService initialized');

    // 🎯 初始化斜杠命令服务
    slashCommandService = new SlashCommandService(logger);
    await slashCommandService.initialize();
    logger.info('SlashCommandService initialized');

    // 监听工作区文件夹变化，重新加载斜杠命令
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        logger.info('Workspace folders changed, reloading slash commands');
        await slashCommandService.reload();
      })
    );

    // 🎯 初始化终端输出服务（早期初始化以捕获更多输出）
    terminalOutputService = TerminalOutputService.getInstance(logger);
    logger.info('TerminalOutputService initialized');

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

    // 📝 监听记忆文件变化
    setupMemoryFileWatcher(context);

    // 🎯 设置打开扩展设置的功能
    setupOpenExtensionSettings(communicationService);

    // 🎯 立即初始化WebView服务，这样用户点击时就能看到loading界面
    try {
      logger.info('🔧 About to initialize WebViewService...');
      console.log('[DeepV] About to initialize WebViewService...');
      await webviewService.initialize();
      logger.info('✅ WebView service initialized - ready for immediate display');
      console.log('[DeepV] WebView service initialized successfully');
    } catch (error) {
      logger.warn('❌ WebView service initialization failed, will retry later', error instanceof Error ? error : undefined);
      console.error('[DeepV] WebView service initialization failed:', error);
    }

    startupOptimizer.endPhase();

    startupOptimizer.startPhase('Background Services Startup');

    // 🎯 启动时发送customProxyServerUrl给webview
    setImmediate(async () => {
      try {
        const vscodeConfig = vscode.workspace.getConfiguration('deepv');
        const customProxyUrl = (vscodeConfig.get<string>('customProxyServerUrl', '') || '').trim();
        logger.info(`🌐 Sending customProxyServerUrl to webview: "${customProxyUrl}"`);
        await communicationService.sendGenericMessage('config_update', {
          customProxyServerUrl: customProxyUrl
        });
      } catch (error) {
        logger.debug('Failed to send customProxyServerUrl on startup', error instanceof Error ? error : undefined);
      }
    });

    // 🎯 异步启动核心服务 - 不阻塞扩展激活
    // 设计理念:
    // 1. WebView 已经初始化完成,用户可以立即看到界面
    // 2. 核心服务(包括 MCP)在后台异步加载
    // 3. 前端会显示 loading 状态,直到服务就绪
    // 4. MCP 工具会在连接成功后动态添加
    setImmediate(async () => {
      try {
        logger.info('🔄 [Background] Starting core services initialization...');
        await startServices();
        logger.info('✅ [Background] Core services initialized successfully');
      } catch (error) {
        logger.warn('⚠️ [Background] Core services initialization failed, will retry when requested',
                   error instanceof Error ? error : undefined);
      }
    });

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
      // @ts-ignore - 清理模块级变量，确保重启时重新创建
      inlineCompletionStatusBar = undefined;
    }
    if (inlineCompletionProvider) {
      inlineCompletionProvider.dispose();
      // @ts-ignore
      inlineCompletionProvider = undefined;
    }
    if (webviewService) {
      await webviewService.dispose();
      // @ts-ignore
      webviewService = undefined;
    }
    if (contextService) {
      await contextService.dispose();
      // @ts-ignore
      contextService = undefined;
    }
    if (communicationService) {
      await communicationService.dispose();
      // @ts-ignore
      communicationService = undefined;
    }
    if (sessionManager) {
      await sessionManager.dispose();
      // @ts-ignore
      sessionManager = undefined;
    }
    if (fileSearchService) {
      // @ts-ignore
      fileSearchService = undefined;
    }
    if (fileRollbackService) {
      // @ts-ignore
      fileRollbackService = undefined;
    }
    if (versionControlManager) {
      // @ts-ignore
      versionControlManager = undefined;
    }
    if (simpleRevertService) {
      // @ts-ignore
      simpleRevertService = undefined;
    }
    if (cursorStyleRevertService) {
      // @ts-ignore
      cursorStyleRevertService = undefined;
    }
    if (completionCache) {
      // @ts-ignore
      completionCache = undefined;
    }
    if (completionScheduler) {
      // @ts-ignore
      completionScheduler = undefined;
    }
    if (ruleService) {
      // @ts-ignore
      ruleService = undefined;
    }
    if (clipboardCache) {
      // @ts-ignore
      clipboardCache = undefined;
    }
    if (slashCommandService) {
      // @ts-ignore
      slashCommandService = undefined;
    }
    if (terminalOutputService) {
      // @ts-ignore
      terminalOutputService = undefined;
    }

    logger?.info('DeepV Code AI Assistant deactivated successfully');

    // 最后清理 logger
    // @ts-ignore
    logger = undefined;
  } catch (error) {
    logger?.error('Error during deactivation', error instanceof Error ? error : undefined);
  }
}

function setupServiceCommunication() {

  // 🎯 监听customProxyServerUrl设置变化
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('deepv.customProxyServerUrl')) {
      setImmediate(async () => {
        try {
          const vscodeConfig = vscode.workspace.getConfiguration('deepv');
          const customProxyUrl = (vscodeConfig.get<string>('customProxyServerUrl', '') || '').trim();
          logger.info(`🔄 customProxyServerUrl changed: "${customProxyUrl}"`);
          await communicationService.sendGenericMessage('config_update', {
            customProxyServerUrl: customProxyUrl
          });
        } catch (error) {
          logger.debug('Failed to sync customProxyServerUrl on config change', error instanceof Error ? error : undefined);
        }
      });
    }
  });

  // 🎯 设置 /refine 命令处理器（文本优化功能，需在登录前立即注册）
  setupRefineCommandHandler();

  // 🎯 设置自定义斜杠命令处理器
  setupSlashCommandHandlers();

  // 🎯 设置基础消息处理器（通过SessionManager分发到对应session）
  setupBasicMessageHandlers();

  // 🎯 设置多Session消息处理器
  setupMultiSessionHandlers();
}

function setupBasicMessageHandlers() {
  logger.info('🔧 setupBasicMessageHandlers() called');

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
      logger.info(`[YOLO] Received project settings update: YOLO mode ${data.yoloMode ? 'enabled' : 'disabled'}, Preferred Model: ${data.preferredModel}`);

      // 🎯 先保存YOLO设置到项目配置文件（在同步到Core之前，防止被覆盖）
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      logger.debug(`[YOLO] Workspace root: ${workspaceRoot}`);

      if (workspaceRoot) {
        const settingsDir = path.join(workspaceRoot, '.deepvcode');
        const settingsPath = path.join(settingsDir, 'settings.json');
        logger.debug(`[YOLO] Settings path: ${settingsPath}`);

        try {
          // 确保目录存在
          if (!fs.existsSync(settingsDir)) {
            logger.debug(`[YOLO] Creating directory: ${settingsDir}`);
            fs.mkdirSync(settingsDir, { recursive: true });
          }

          // 读取现有配置或创建新的
          let settings: any = {};
          if (fs.existsSync(settingsPath)) {
            try {
              const fileContent = fs.readFileSync(settingsPath, 'utf-8');
              settings = JSON.parse(fileContent);
              logger.debug(`[YOLO] Existing settings: ${JSON.stringify(settings)}`);
            } catch (e) {
              logger.warn('[YOLO] Failed to parse existing settings, will overwrite');
              settings = {};
            }
          }

          // 更新YOLO设置
          settings.yolo = data.yoloMode;
          logger.debug(`[YOLO] Updated settings to: ${JSON.stringify(settings)}`);

          // 写入文件
          const jsonContent = JSON.stringify(settings, null, 2);
          fs.writeFileSync(settingsPath, jsonContent, 'utf-8');
          logger.info(`[YOLO] ✅ Saved to project config: ${data.yoloMode}`);
          logger.debug(`[YOLO] File content written: ${jsonContent}`);

          // 验证文件是否真的被写入
          if (fs.existsSync(settingsPath)) {
            const verifyContent = fs.readFileSync(settingsPath, 'utf-8');
            logger.info(`[YOLO] ✅ File verification success, content: ${verifyContent}`);
          } else {
            logger.error('[YOLO] ❌ File was not created after write operation');
          }
        } catch (e) {
          logger.error('[YOLO] Failed to save settings', e instanceof Error ? e : undefined);
          logger.error(`[YOLO] Error details: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        logger.warn('[YOLO] No workspace root found, cannot save settings');
      }

      // 🎯 然后同步YOLO模式设置到Core配置
      await sessionManager.setProjectYoloMode(data.yoloMode);

      // 🎯 更新默认模型配置
      if (data.preferredModel) {
        const config = vscode.workspace.getConfiguration('deepv');
        await config.update('preferredModel', data.preferredModel, vscode.ConfigurationTarget.Global);
        logger.info(`[YOLO] ✅ Preferred model updated to: ${data.preferredModel}`);
      }

      if (data.healthyUse !== undefined) {
        const config = vscode.workspace.getConfiguration('deepv');
        await config.update('healthyUse', data.healthyUse, vscode.ConfigurationTarget.Global);
        logger.info(`[HEALTH] ✅ Healthy use updated to: ${data.healthyUse}`);
      }

      logger.info(`[YOLO] ✅ Project settings synchronized`);
    } catch (error) {
      logger.error('[YOLO] Failed to update project settings', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理项目设置请求
  communicationService.onProjectSettingsRequest(async () => {
    try {
      logger.info('[YOLO] Received project settings request');

      // 获取 YOLO 模式
      let yoloMode = false;

      // 🎯 优先从项目配置文件读取，确保准确性
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const settingsPath = path.join(workspaceRoot, '.deepvcode', 'settings.json');
        if (fs.existsSync(settingsPath)) {
          try {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            if (settings.yolo !== undefined) {
              yoloMode = !!settings.yolo;
              logger.info(`[YOLO] ✅ Loaded from project config: ${yoloMode}`);
            }
          } catch (e) {
            logger.warn('[YOLO] Failed to parse project settings');
          }
        }
      }

      // 如果没读到，回退到从活跃 session 获取
      if (yoloMode === false) {
        const sessionIds = Array.from(sessionManager.getSessionIds());
        if (sessionIds.length > 0) {
          const aiService = sessionManager.getAIService(sessionIds[0]);
          if (aiService) {
            const config = aiService.getConfig();
            // 🎯 检查是否为 yolo 模式
            yoloMode = config?.getApprovalMode() === 'yolo';
            logger.debug(`[YOLO] Fallback to session config: ${yoloMode}`);
          }
        }
      }

      // 🎯 获取默认模型配置
      const config = vscode.workspace.getConfiguration('deepv');
      const preferredModel = config.get<string>('preferredModel', 'auto');
      const healthyUse = config.get<boolean>('healthyUse', true);

      await communicationService.sendProjectSettingsResponse({ yoloMode, preferredModel, healthyUse });
      logger.info(`[YOLO] ✅ Response sent: YOLO=${yoloMode}, Model=${preferredModel}, HealthyUse=${healthyUse}`);
    } catch (error) {
      logger.error('[YOLO] Failed to get project settings', error instanceof Error ? error : undefined);
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

  // 🎯 处理webview请求配置
  communicationService.addMessageHandler('request_config', async (data: any) => {
    try {
      const vscodeConfig = vscode.workspace.getConfiguration('deepv');
      const customProxyUrl = (vscodeConfig.get<string>('customProxyServerUrl', '') || '').trim();
      logger.debug(`📤 Responding to request_config: "${customProxyUrl}"`);
      await communicationService.sendGenericMessage('config_update', {
        customProxyServerUrl: customProxyUrl
      });
    } catch (error) {
      logger.debug('Failed to handle request_config', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 处理服务启动请求
  communicationService.onStartServices(async (data) => {
    try {
      logger.info('Received start services request');

      // 🎯 读取customProxyServerUrl并发送给webview
      const vscodeConfig = vscode.workspace.getConfiguration('deepv');
      const customProxyUrl = vscodeConfig.get<string>('customProxyServerUrl', '');
      if (customProxyUrl && customProxyUrl.trim()) {
        logger.info(`Sending customProxyServerUrl to webview: ${customProxyUrl}`);
        await communicationService.sendGenericMessage('config_update', {
          customProxyServerUrl: customProxyUrl.trim()
        });
      }

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

      const result = await new Promise((resolve, reject) => {
        const parsedUrl = new URL(apiUrl);
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname + parsedUrl.search,
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

  // 🎯 处理文件夹浏览请求
  communicationService.onFolderBrowse(async (data) => {
    try {
      logger.info(`Received folder browse request for path: ${data.folderPath}`);
      const items = await fileSearchService.browseFolder(data.folderPath);
      await communicationService.sendFolderBrowseResult(items);
    } catch (error) {
      logger.error('Failed to browse folder', error instanceof Error ? error : undefined);
      await communicationService.sendFolderBrowseResult([]);
    }
  });

  // 🎯 处理符号搜索请求
  communicationService.onSymbolSearch(async (data) => {
    try {
      logger.info(`Received symbol search request for query: ${data.query}`);
      // 使用 VS Code API 搜索符号
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        data.query
      );

      // 转换符号为前端需要的格式
      // 🎯 优化：只保留重要的符号类型（类、方法、函数、接口、模块），过滤掉变量、常量等细粒度符号
      // 这样可以大幅减少数据传输量，提升响应速度，同时聚焦于用户最可能引用的代码块
      const importantKinds = new Set([
        vscode.SymbolKind.File,
        vscode.SymbolKind.Module,
        vscode.SymbolKind.Namespace,
        vscode.SymbolKind.Package,
        vscode.SymbolKind.Class,
        vscode.SymbolKind.Method,
        vscode.SymbolKind.Interface,
        vscode.SymbolKind.Function,
        vscode.SymbolKind.Constructor,
        vscode.SymbolKind.Struct
      ]);

      // 🎯 优化：并行获取 DocumentSymbol 以获得完整范围
      // Workspace Symbol Search 返回的 range 通常只是定义行。
      // 为了获得完整的函数/类体，我们需要对结果中的文件调用 DocumentSymbolProvider。
      // 为了性能，我们只对前 20 个结果这样做。

      const enrichedSymbols = await Promise.all((symbols || [])
        .filter(s => importantKinds.has(s.kind))
        .slice(0, 20) // 限制增强数量
        .map(async (s) => {
          let fullRange = s.location.range;

          try {
            // 尝试获取 DocumentSymbol 以获得完整范围
            const docSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
              'vscode.executeDocumentSymbolProvider',
              s.location.uri
            );

            if (docSymbols) {
              // 递归查找匹配的符号
              const findSymbol = (nodes: vscode.DocumentSymbol[]): vscode.DocumentSymbol | undefined => {
                for (const node of nodes) {
                  // 检查名称和类型是否匹配
                  // 并且 DocumentSymbol 的 selectionRange (定义位置) 应该包含 SymbolInformation 的 range
                  // 或者它们有交集
                  if (node.name === s.name && node.kind === s.kind) {
                    if (node.selectionRange.intersection(s.location.range)) {
                      return node;
                    }
                  }

                  if (node.children) {
                    const found = findSymbol(node.children);
                    if (found) return found;
                  }
                }
                return undefined;
              };

              const matchedSymbol = findSymbol(docSymbols);
              if (matchedSymbol) {
                fullRange = matchedSymbol.range; // 使用完整范围
              }
            }
          } catch (e) {
            // 忽略错误，回退到原始 range
          }

          return {
            name: s.name,
            kind: s.kind,
            containerName: s.containerName,
            location: {
              uri: s.location.uri.toString(),
              fsPath: s.location.uri.fsPath,
              range: fullRange
            }
          };
        }));

      await communicationService.sendSymbolSearchResult(enrichedSymbols);
    } catch (error) {
      logger.error('Failed to process symbol search request', error instanceof Error ? error : undefined);
      await communicationService.sendSymbolSearchResult([]);
    }
  });

  // 🎯 处理终端列表请求
  communicationService.onGetTerminals(async () => {
    try {
      logger.info('Received get terminals request');
      const allTerminals = vscode.window.terminals;
      logger.info(`Found ${allTerminals.length} terminals`);

      const terminals = allTerminals.map((terminal, index) => {
        const terminalInfo = {
          id: index,
          name: terminal.name || `Terminal ${index + 1}`
        };
        logger.info(`Terminal ${index}: ${terminalInfo.name}`);
        return terminalInfo;
      });

      logger.info(`Sending ${terminals.length} terminals to webview`);
      await communicationService.sendTerminalsResult(terminals);
    } catch (error) {
      logger.error('Failed to get terminals', error instanceof Error ? error : undefined);
      await communicationService.sendTerminalsResult([]);
    }
  });

  // 🎯 处理终端输出请求
  communicationService.onGetTerminalOutput(async (data) => {
    try {
      logger.info(`Received get terminal output request for terminal ${data.terminalId}`);

      // 🎯 使用 TerminalOutputService 异步获取终端输出（通过剪贴板）
      const result = await terminalOutputService.getTerminalOutputAsync(data.terminalId, 200);

      if (result) {
        logger.info(`✅ Got terminal output for ${result.name}, length: ${result.output.length}`);
        await communicationService.sendTerminalOutputResult(
          data.terminalId,
          result.name,
          result.output
        );
      } else {
        // 终端不存在
        await communicationService.sendTerminalOutputResult(
          data.terminalId,
          'Unknown',
          '[Error: Terminal not found]'
        );
      }
    } catch (error) {
      logger.error('Failed to get terminal output', error instanceof Error ? error : undefined);
      await communicationService.sendTerminalOutputResult(
        data.terminalId,
        'Error',
        '[Error: Failed to get terminal output]'
      );
    }
  });

  // 🎯 处理最近打开文件请求
  communicationService.onGetRecentFiles(async () => {
    try {
      logger.info('Received get recent files request');
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      // Get recently opened text documents (up to 3)
      const recentFiles = vscode.workspace.textDocuments
        .filter(doc => doc.uri.scheme === 'file' && !doc.isUntitled)
        .slice(0, 3)
        .map(doc => {
          const fileName = path.basename(doc.fileName);
          const relativePath = workspaceRoot
            ? path.relative(workspaceRoot, doc.fileName)
            : doc.fileName;
          return {
            label: relativePath,
            value: relativePath,
            description: fileName
          };
        });

      await communicationService.sendRecentFilesResult(recentFiles);
    } catch (error) {
      logger.error('Failed to get recent files', error instanceof Error ? error : undefined);
      await communicationService.sendRecentFilesResult([]);
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
      await openDiffInEditor(data.fileDiff, data.fileName, data.originalContent, data.newContent, data.filePath);
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

  // 🎯 处理撤销单个文件变更请求
  communicationService.addMessageHandler('undo_file_change', async (payload: any) => {
    try {
      const { fileName, filePath, originalContent, isNewFile, isDeletedFile, sessionId } = payload;
      let targetPath = filePath || fileName;

      // 🎯 关键修复：确保路径是绝对路径，相对于工作区解析
      if (!path.isAbsolute(targetPath)) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          targetPath = path.resolve(workspaceFolders[0].uri.fsPath, targetPath);
        }
      }

      const uri = vscode.Uri.file(targetPath);
      logger.info(`🎯 [Undo] Received undo request for: ${targetPath} (isNew: ${isNewFile}, isDeleted: ${isDeletedFile})`);

      const edit = new vscode.WorkspaceEdit();

      if (isNewFile) {
        // 如果是新建文件，撤销就是删除
        edit.deleteFile(uri, { ignoreIfNotExists: true });
        logger.info(`🗑️ [Undo] Deleting newly created file: ${targetPath}`);
      } else if (isDeletedFile) {
        // 如果是已删除文件，撤销就是恢复内容
        edit.createFile(uri, { overwrite: true });
        edit.insert(uri, new vscode.Position(0, 0), originalContent);
        logger.info(`📝 [Undo] Restoring deleted file: ${targetPath}`);
      } else {
        // 如果是修改文件，撤销就是恢复原始内容
        const document = await vscode.workspace.openTextDocument(uri);
        const fullRange = new vscode.Range(
          new vscode.Position(0, 0),
          document.lineAt(document.lineCount - 1).range.end
        );
        edit.replace(uri, fullRange, originalContent);
        logger.info(`♻️ [Undo] Restoring modified file content: ${targetPath}`);
      }

      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        // 🎯 关键修复：撤销后自动保存文件，确保磁盘内容同步
        if (!isNewFile) {
          try {
            const document = await vscode.workspace.openTextDocument(uri);
            await document.save();
            logger.info(`💾 [Undo] File saved to disk: ${targetPath}`);
          } catch (saveError) {
            logger.warn(`⚠️ [Undo] Failed to auto-save file: ${targetPath}`, saveError);
          }
        }

        vscode.window.showInformationMessage(`已成功撤销对文件 "${fileName}" 的修改`);
        logger.info(`✅ [Undo] File revert successful: ${targetPath}`);

        // 🎯 关键修复：撤销成功后，尝试关闭可能已经打开的对应文件的 diff 窗口
        try {
          await closeDiffEditorForFile(targetPath, fileName);
        } catch (closeError) {
          logger.debug(`[Undo] Non-critical error closing editor:`, closeError);
        }
      } else {
        throw new Error('Failed to apply workspace edit');
      }

    } catch (error) {
      logger.error('❌ [Undo] Failed to undo file change', error instanceof Error ? error : undefined);
      vscode.window.showErrorMessage(`撤销失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // 处理工具执行确认
  communicationService.onToolExecutionConfirm(async (data) => {

  });

  // 🎯 处理 MCP 状态请求
  communicationService.addMessageHandler('get_mcp_status', async (payload: any) => {
    try {
      logger.info(`🔌 [MCP] Received explicit MCP status request for session: ${payload.sessionId}`);

      const aiService = sessionManager.getAIService(payload.sessionId);
      if (!aiService) {
        logger.warn(`🔌 [MCP] No AIService found for session: ${payload.sessionId}`);
        return;
      }

      // 🎯 核心修复：从配置文件中获取所有已定义的 MCP 服务器，而不仅仅是活跃的
      const { MCPSettingsService } = await import('./services/mcpSettingsService.js');
      const workspaceRoot = aiService.getConfig()?.getProjectRoot();
      const allConfiguredServers = workspaceRoot ? MCPSettingsService.loadMCPServers(workspaceRoot) : {};
      const allServerNames = Object.keys(allConfiguredServers);

      const statuses = aiService.getMCPServerStatuses();
      const discoveryState = aiService.getMCPDiscoveryState();

      // 🔌 使用全局缓存获取工具数量和名称
      const globalToolCounts = getAllMCPServerToolCounts();
      const globalToolNames = getAllMCPServerToolNames();
      const mcpEnabledService = McpEnabledStateService.getInstance();

      // 🎯 构造包含所有配置服务器的列表
      const servers = allServerNames.map(name => {
        const status = statuses?.get(name) || MCPServerStatus.DISCONNECTED;
        return {
          name,
          status,
          toolCount: globalToolCounts.get(name) ?? 0,
          toolNames: globalToolNames.get(name) ?? [],
          enabled: mcpEnabledService.isEnabled(name)
        };
      });

      logger.info(`[MCP] Sending complete MCP list (${servers.length} servers): ${servers.map(s => `${s.name}(${s.status}, enabled:${s.enabled})`).join(', ')}`);

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

  // 🔌 处理设置 MCP 启用状态
  communicationService.addMessageHandler('set_mcp_enabled', async (payload: { serverName: string; enabled: boolean }) => {
    try {
      logger.info(`[MCP] Setting server '${payload.serverName}' enabled: ${payload.enabled}`);

      const mcpEnabledService = McpEnabledStateService.getInstance();
      await mcpEnabledService.setEnabled(payload.serverName, payload.enabled);

      // 🎯 通知所有 AIService 更新工具列表
      const allSessions = sessionManager.getAllSessionsInfo();
      for (const session of allSessions) {
        const aiService = sessionManager.getAIService(session.id);
        if (aiService) {
          try {
            await aiService.refreshToolsWithMcpFilter();
          } catch (err) {
            logger.warn(`🔌 [MCP] Failed to update tools for session ${session.id}`, err instanceof Error ? err : undefined);
          }
        }
      }

      // 发送更新后的启用状态给前端
      await communicationService.sendMessage({
        type: 'mcp_enabled_states',
        payload: {
          states: { [payload.serverName]: payload.enabled }
        }
      });

    } catch (error) {
      logger.error('🔌 [MCP] Failed to set MCP enabled state', error instanceof Error ? error : undefined);
    }
  });

  // 🔌 处理获取 MCP 启用状态
  communicationService.addMessageHandler('get_mcp_enabled_states', async (payload: { serverNames: string[] }) => {
    try {
      logger.debug(`🔌 [MCP] Getting enabled states for: ${payload.serverNames.join(', ')}`);

      const mcpEnabledService = McpEnabledStateService.getInstance();
      const states: Record<string, boolean> = {};
      for (const name of payload.serverNames) {
        states[name] = mcpEnabledService.isEnabled(name);
      }

      await communicationService.sendMessage({
        type: 'mcp_enabled_states',
        payload: { states }
      });

    } catch (error) {
      logger.error('🔌 [MCP] Failed to get MCP enabled states', error instanceof Error ? error : undefined);
    }
  });

  // 🎯 Handle user stats requests
  communicationService.addMessageHandler('request_user_stats', async () => {
    try {
      logger.info('📊 Received user stats request from webview');

      const { ProxyAuthManager } = require('deepv-code-core');
      const authManager = ProxyAuthManager.getInstance();

      const token = await authManager.getAccessToken();
      const proxyServerUrl = authManager.getProxyServerUrl();

      if (!token) {
        throw new Error('No authentication token available');
      }

      // 通过后端代理请求用户积分数据
      const response = await fetch(`${proxyServerUrl}/web-api/user/stats`, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DeepVCode-VSCode'
        },
        timeout: 30000
      } as any);

      if (!response.ok) {
        throw new Error(`Failed to fetch user stats: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as any;

      // 解析 API 响应数据
      if (!result.success || !result.data) {
        throw new Error('Invalid API response');
      }

      // 发送成功响应
      await communicationService.sendMessage({
        type: 'user_stats_response',
        payload: {
          stats: result.data
        }
      });

      logger.info('✅ Sent user stats response to webview');
    } catch (error) {
      logger.error('❌ Failed to fetch user stats', error instanceof Error ? error : undefined);

      // 发送错误响应
      await communicationService.sendMessage({
        type: 'user_stats_response',
        payload: {
          error: error instanceof Error ? error.message : 'Failed to fetch user stats'
        }
      });
    }
  });

  // 🎯 处理登录相关消息
  setupLoginHandlers();

  // 🎯 处理后台任务相关消息
  setupBackgroundTaskHandlers();
}

// 🎯 后台任务完成通知队列（当 AI 忙时暂存）
const pendingBackgroundNotifications: Array<{
  sessionId: string;
  notification: string;
}> = [];

/**
 * 🎯 处理后台任务完成 - 注入历史并触发 AI 继续（参考 CLI 实现）
 */
async function handleBackgroundTaskComplete(
  task: any,
  status: 'completed' | 'failed' | 'cancelled'
) {
  logger.info(`🎯 [Background] handleBackgroundTaskComplete called with status: ${status}, taskId: ${task?.id}`);

  try {
    // 获取当前活动的 session
    const currentSession = sessionManager.getCurrentSession();
    if (!currentSession) {
      logger.warn('🎯 [Background] No active session for background task notification');
      return;
    }

    const sessionId = currentSession.info.id;
    logger.info(`🎯 [Background] Current session: ${sessionId}`);

    // 构建通知消息（和 CLI 格式一致）
    let notificationText = '';
    const shortId = task.id?.substring(0, 7) || 'unknown';
    const outputPreview = task.output?.substring(0, 1000) || '(no output)';

    if (status === 'completed') {
      notificationText = `[DeepV Code - SYSTEM NOTIFICATION] Background task completed (Task ID: ${shortId}). Exit code: ${task.exitCode ?? 'unknown'}. Output:\n${outputPreview}`;
    } else if (status === 'failed') {
      notificationText = `[DeepV Code - SYSTEM NOTIFICATION] Background task failed (Task ID: ${shortId}). Command: ${task.command}. Error: ${task.error || 'Unknown error'}. Output:\n${outputPreview}`;
    } else if (status === 'cancelled') {
      notificationText = `[DeepV Code - SYSTEM NOTIFICATION] Background task killed by user (Task ID: ${shortId}). Command: ${task.command}. Output before kill:\n${outputPreview}`;
    }

    logger.info(`🎯 [Background] Notification text prepared, length: ${notificationText.length}`);

    // 🎯 发送任务结果到 webview 显示（类似 CLI 的 Background Task Output）
    await communicationService.sendBackgroundTaskResult(sessionId, {
      taskId: task.id,
      command: task.command,
      status,
      exitCode: task.exitCode,
      output: outputPreview,
    });

    // 获取 AI 服务并检查状态
    const aiService = sessionManager.getAIService(sessionId);
    if (!aiService) {
      logger.warn(`🎯 [Background] AIService not available for session: ${sessionId}`);
      return;
    }

    logger.info(`🎯 [Background] AIService found for session: ${sessionId}`);

    const flowState = aiService.getCurrentFlowState();
    logger.info(`🎯 [Background] Flow state: isProcessing=${flowState.isProcessing}, canAbort=${flowState.canAbort}`);

    if (flowState.isProcessing) {
      // AI 正忙，加入队列等待
      logger.info(`🎯 [Background] AI is busy, queuing notification for task: ${shortId}`);
      pendingBackgroundNotifications.push({ sessionId, notification: notificationText });
    } else {
      // AI 空闲，注入历史并触发继续
      logger.info(`🎯 [Background] AI is idle, injecting notification and triggering continuation for task: ${shortId}`);
      await aiService.addSystemMessageToHistory(notificationText);

      // 发送静默消息触发 AI 继续（通过模拟用户消息）
      const triggerMessage = {
        id: `bg-trigger-${Date.now()}`,
        sessionId,
        content: [{ type: 'text' as const, value: '[DeepV Code - SYSTEM NOTIFICATION] Background tasks have completed. Please review the results above and continue.' }],
        timestamp: Date.now(),
        type: 'user' as const,
      };

      // 获取当前上下文
      const currentContext = contextService.getCurrentContext();

      logger.info(`🎯 [Background] About to call processChatMessage...`);
      // 使用 AI 服务处理消息
      await aiService.processChatMessage(triggerMessage, currentContext);
      logger.info(`🎯 [Background] processChatMessage completed`);
    }
  } catch (error) {
    logger.error('🎯 [Background] Failed to handle background task complete', error instanceof Error ? error : undefined);
  }
}

/**
 * 🎯 当 AI 完成处理时，检查并处理待处理的后台任务通知
 */
async function processPendingBackgroundNotifications(sessionId: string) {
  if (pendingBackgroundNotifications.length === 0) return;

  const aiService = sessionManager.getAIService(sessionId);
  if (!aiService) return;

  const flowState = aiService.getCurrentFlowState();
  if (flowState.isProcessing) return; // AI 仍在忙

  // 筛选当前 session 的通知
  const sessionNotifications = pendingBackgroundNotifications.filter(n => n.sessionId === sessionId);
  if (sessionNotifications.length === 0) return;

  logger.info(`[Background] Processing ${sessionNotifications.length} pending notifications for session: ${sessionId}`);

  // 注入所有待处理的通知到历史
  for (const { notification } of sessionNotifications) {
    await aiService.addSystemMessageToHistory(notification);
  }

  // 从队列中移除已处理的通知
  const remaining = pendingBackgroundNotifications.filter(n => n.sessionId !== sessionId);
  pendingBackgroundNotifications.length = 0;
  pendingBackgroundNotifications.push(...remaining);

  // 发送静默消息触发 AI 继续
  const triggerMessage = {
    id: `bg-trigger-${Date.now()}`,
    sessionId,
    content: [{ type: 'text' as const, value: '[DeepV Code - SYSTEM NOTIFICATION] Background tasks have completed while you were busy. Please review the results above if necessary, and continue.' }],
    timestamp: Date.now(),
    type: 'user' as const,
  };

  const currentContext = contextService.getCurrentContext();
  await aiService.processChatMessage(triggerMessage, currentContext);
}

/**
 * 设置后台任务管理相关的消息处理器
 */
function setupBackgroundTaskHandlers() {
  // 延迟导入以避免循环依赖
  import('deepv-code-core').then(({ getBackgroundTaskManager }) => {
    const taskManager = getBackgroundTaskManager();

    // 发送当前任务列表到 Webview
    const sendTasksUpdate = async () => {
      const tasks = taskManager.getAllTasks();
      await communicationService.sendBackgroundTasksUpdate(tasks);
    };

    // 监听任务事件并转发到 Webview
    taskManager.on('task-started', async () => {
      await sendTasksUpdate();
    });

    taskManager.on('task-completed', async (event: { type: string; task: any }) => {
      await sendTasksUpdate();
      // 🎯 处理任务完成 - 注入历史并触发 AI 继续
      await handleBackgroundTaskComplete(event.task, 'completed');
    });

    taskManager.on('task-failed', async (event: { type: string; task: any }) => {
      await sendTasksUpdate();
      // 🎯 处理任务失败
      await handleBackgroundTaskComplete(event.task, 'failed');
    });

    taskManager.on('task-cancelled', async (event: { type: string; task: any }) => {
      await sendTasksUpdate();
      // 🎯 处理任务取消
      await handleBackgroundTaskComplete(event.task, 'cancelled');
    });

    // 🎯 处理用户主动 Kill 任务（core 层发出的是 task-killed 事件）
    taskManager.on('task-killed', async (event: { type: string; task: any }) => {
      await sendTasksUpdate();
      // 🎯 处理任务被用户终止
      await handleBackgroundTaskComplete(event.task, 'cancelled');
    });

    // 监听输出更新
    taskManager.on('task-output', async (event: { taskId: string; output: string }) => {
      await communicationService.sendBackgroundTaskOutput(event.taskId, event.output, false);
    });

    taskManager.on('task-stderr', async (event: { taskId: string; stderr: string }) => {
      await communicationService.sendBackgroundTaskOutput(event.taskId, event.stderr, true);
    });

    // 处理来自 Webview 的后台任务请求
    communicationService.onBackgroundTaskRequest(async (data) => {
      try {
        if (data.action === 'list') {
          await sendTasksUpdate();
        } else if (data.action === 'kill' && data.taskId) {
          taskManager.killTask(data.taskId);
          await sendTasksUpdate();
        }
      } catch (error) {
        logger.error('Failed to handle background task request', error instanceof Error ? error : undefined);
      }
    });

    // 🎯 处理"移到后台"请求 - 触发后台模式信号（和 CLI 的 Ctrl+B 一样）
    communicationService.onBackgroundTaskMoveToBackground(async (data) => {
      try {
        const { sessionId, toolCallId } = data;
        logger.info(`🎯 Moving tool call to background: ${toolCallId} in session ${sessionId}`);

        // 使用 core 层的 BackgroundModeSignal，和 CLI 的 Ctrl+B 一样的机制
        const { getBackgroundModeSignal } = await import('deepv-code-core');
        const signal = getBackgroundModeSignal();
        signal.requestBackgroundMode();

        logger.info(`✅ Background mode signal sent for tool call ${toolCallId}`);

        // ShellTool 会检测到这个信号并自动转为后台执行
        // 稍后会触发 task-started 事件，sendTasksUpdate 会被调用
      } catch (error) {
        logger.error('Failed to move tool call to background', error instanceof Error ? error : undefined);
      }
    });

    // 初始发送一次任务列表
    sendTasksUpdate();

    // 🎯 注册 AI 处理完成回调，用于处理待处理的后台任务通知
    AIService.onProcessingComplete((sessionId) => {
      processPendingBackgroundNotifications(sessionId).catch(err => {
        logger.error('Failed to process pending background notifications', err instanceof Error ? err : undefined);
      });
    });

    logger.info('✅ Background task handlers initialized');
  }).catch(error => {
    logger.error('Failed to setup background task handlers', error instanceof Error ? error : undefined);
  });
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

  // 🎯 处理通知显示请求
  communicationService.addMessageHandler('show_notification', async (payload: { message: string, type: 'info' | 'warning' | 'error' }) => {
    try {
      switch (payload.type) {
        case 'warning':
          vscode.window.showWarningMessage(payload.message);
          break;
        case 'error':
          vscode.window.showErrorMessage(payload.message);
          break;
        case 'info':
        default:
          vscode.window.showInformationMessage(payload.message);
          break;
      }
    } catch (error) {
      logger.error('Failed to show notification', error instanceof Error ? error : undefined);
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
            'Extension page opened in your browser. You can also search for "DeepV Code" in Extensions (Ctrl+Shift+X).',
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

  // 📝 处理打开文件请求
  // 📝 处理手动刷新内存请求
  communicationService.addMessageHandler('refresh_memory', async () => {
    try {
      logger.info('📝 Manual memory refresh requested');
      await sessionManager.refreshUserMemory();
      logger.info('📝 Memory refreshed successfully');
      vscode.window.showInformationMessage('Memory files refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh memory', error instanceof Error ? error : undefined);
      vscode.window.showErrorMessage(`Failed to refresh memory: ${error instanceof Error ? error.message : String(error)}`);
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

      const { ProxyAuthManager, tokenLimit } = require('deepv-code-core');
      const proxyAuthManager = ProxyAuthManager.getInstance();

      const ModelService = require('./services/modelService').ModelService;
      const modelService = new ModelService(logger, proxyAuthManager);

      // 🎯 只有在没有 sessionId 时才更新全局默认模型（用于新 session）
      // 有 sessionId 时，只更新当前 session 的模型，不影响其他 session
      if (!payload.sessionId) {
        await modelService.setCurrentModel(payload.modelName);
      }

      // 🎯 处理 session 级别的模型切换
      if (payload.sessionId) {
        const currentAIService = sessionManager.getAIService(payload.sessionId);
        if (currentAIService) {
          const config = currentAIService.getConfig();
          const geminiClient = config?.getGeminiClient();

          if (geminiClient && config) {
            // 🎯 获取当前 token 使用量和目标模型的限制
            const currentTokenUsage = currentAIService.getCurrentTokenUsage();
            const currentTokens = currentTokenUsage?.totalTokens || 0;

            // 从云端模型配置获取目标模型的 maxToken
            const targetModelInfo = config.getCloudModelInfo(payload.modelName);
            const targetTokenLimit = targetModelInfo?.maxToken || tokenLimit(payload.modelName, config);
            const compressionThreshold = targetTokenLimit * 0.9;

            logger.info(`📊 [Model Switch Check] currentTokens=${currentTokens}, targetLimit=${targetTokenLimit}, threshold(80%)=${compressionThreshold}`);

            // 🎯 检查是否需要压缩确认
            if (currentTokens > compressionThreshold) {
              logger.info(`📊 [Model Switch] Context exceeds 80% of target model limit, requesting user confirmation...`);

              // 向前端发送压缩确认请求
              await communicationService.sendCompressionConfirmationRequest({
                requestId: payload.requestId,
                sessionId: payload.sessionId,
                targetModel: payload.modelName,
                currentTokens,
                targetTokenLimit,
                compressionThreshold,
                message: `Current context (${currentTokens.toLocaleString()} tokens) exceeds 80% of ${payload.modelName}'s limit (${targetTokenLimit.toLocaleString()} tokens). Compression is required before switching.`
              });

              // 不在这里发送成功响应，等待用户确认后再处理
              return;
            }

            // 🎯 不需要压缩确认，直接切换
            logger.info(`Switching model to ${payload.modelName} (no compression needed)...`);

            await vscode.window.withProgress({
              location: vscode.ProgressLocation.Notification,
              title: `Switching model to ${payload.modelName}...`,
              cancellable: false
            }, async (progress) => {
              progress.report({ message: "Switching model..." });

              const switchResult = await geminiClient.switchModel(payload.modelName, new AbortController().signal);

              if (!switchResult.success) {
                throw new Error(`Failed to switch to model ${payload.modelName}. ${switchResult.error || 'Context compression may have failed.'}`);
              }

              if (switchResult.compressionInfo) {
                progress.report({ message: `Context compressed: ${switchResult.compressionInfo.originalTokenCount} → ${switchResult.compressionInfo.newTokenCount} tokens` });
              } else if (switchResult.compressionSkipReason) {
                progress.report({ message: switchResult.compressionSkipReason });
              }
            });
          } else if (config && config.setModel) {
            config.setModel(payload.modelName);
          }
        }

        // 🎯 更新 session 的模型配置记录
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

  // 🎯 处理压缩确认响应
  communicationService.onCompressionConfirmationResponse(async (payload) => {
    try {
      logger.info('Received compression_confirmation_response', payload);

      if (!payload.confirmed) {
        // 用户取消了压缩，发送取消响应
        await communicationService.sendModelResponse(payload.requestId, {
          success: false,
          error: 'Model switch cancelled by user'
        });
        return;
      }

      // 用户确认压缩，执行模型切换（包含压缩）
      const currentAIService = sessionManager.getAIService(payload.sessionId);
      if (!currentAIService) {
        throw new Error('Session not found');
      }

      const config = currentAIService.getConfig();
      const geminiClient = config?.getGeminiClient();

      if (!geminiClient) {
        throw new Error('GeminiClient not available');
      }

      // 🎯 获取已知的 token 数量，传给 switchModel 避免重新计算
      const currentTokenUsage = currentAIService.getCurrentTokenUsage();
      const knownTokenCount = currentTokenUsage?.totalTokens;

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Compressing context and switching to ${payload.targetModel}...`,
        cancellable: false
      }, async (progress) => {
        progress.report({ message: "Compressing context..." });

        const switchResult = await geminiClient.switchModel(payload.targetModel, new AbortController().signal, knownTokenCount);

        if (!switchResult.success) {
          throw new Error(`Failed to switch to model ${payload.targetModel}. ${switchResult.error || 'Context compression failed.'}`);
        }

        if (switchResult.compressionInfo) {
          progress.report({ message: `Compressed: ${switchResult.compressionInfo.originalTokenCount} → ${switchResult.compressionInfo.newTokenCount} tokens` });
          logger.info(`📊 [Model Switch] Compression completed: ${switchResult.compressionInfo.originalTokenCount} → ${switchResult.compressionInfo.newTokenCount} tokens`);

          // 🎯 更新前端的 tokenUsage 显示
          const { tokenLimit } = require('deepv-code-core');
          const newTokenLimit = tokenLimit(payload.targetModel, config);
          await communicationService.sendTokenUsageUpdate(payload.sessionId, {
            totalTokens: switchResult.compressionInfo.newTokenCount,
            tokenLimit: newTokenLimit,
            inputTokens: switchResult.compressionInfo.newTokenCount,
            outputTokens: 0
          });
        }
      });

      // 更新 session 的模型配置记录
      await sessionManager.updateSessionModelConfig(payload.sessionId, {
        modelName: payload.targetModel
      });

      await communicationService.sendModelResponse(payload.requestId, {
        success: true,
        currentModel: payload.targetModel  // 🎯 通知前端新的模型名
      });

      // 🎯 发送模型切换成功的通知给前端
      logger.info(`📊 [Model Switch] Sending model_switch_complete to webview: sessionId=${payload.sessionId}, modelName=${payload.targetModel}`);
      await communicationService.sendModelSwitchComplete(payload.sessionId, payload.targetModel);

      logger.info(`Model switched to: ${payload.targetModel} for session: ${payload.sessionId} (with compression)`);

    } catch (error) {
      logger.error('Failed to handle compression confirmation', error instanceof Error ? error : undefined);
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

/**
 * 🎯 设置自定义斜杠命令处理器
 * 处理从 .toml 文件加载的自定义命令
 */
function setupSlashCommandHandlers() {
  // 获取斜杠命令列表
  communicationService.addMessageHandler('get_slash_commands', async () => {
    try {
      const commands = slashCommandService.getCommands();
      // 发送命令列表（不包含 prompt，只发送显示信息）
      const commandInfos = commands.map(cmd => ({
        name: cmd.name,
        description: cmd.description,
        kind: cmd.kind,
      }));
      communicationService.sendMessage({
        type: 'slash_commands_list',
        payload: { commands: commandInfos },
      });
    } catch (error) {
      logger.error('Failed to get slash commands', error instanceof Error ? error : undefined);
      communicationService.sendMessage({
        type: 'slash_commands_list',
        payload: { commands: [] },
      });
    }
  });

  // 执行自定义斜杠命令
  communicationService.addMessageHandler('execute_custom_slash_command', async (payload: any) => {
    try {
      const { commandName, args } = payload;
      logger.info(`📝 Executing custom slash command: /${commandName}`, { args });

      const command = slashCommandService.getCommand(commandName);
      if (!command) {
        communicationService.sendMessage({
          type: 'slash_command_result',
          payload: { success: false, error: `Unknown command: /${commandName}` },
        });
        return;
      }

      // 处理命令的 prompt
      const processedPrompt = slashCommandService.processCommandPrompt(command, args);

      communicationService.sendMessage({
        type: 'slash_command_result',
        payload: { success: true, prompt: processedPrompt },
      });
    } catch (error) {
      logger.error('Failed to execute custom slash command', error instanceof Error ? error : undefined);
      communicationService.sendMessage({
        type: 'slash_command_result',
        payload: { success: false, error: error instanceof Error ? error.message : 'Command execution failed' },
      });
    }
  });

  logger.info('🎯 Slash command handlers registered');
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
            // 🎯 恢复工具相关的元数据字段
            isProcessingTools: metadata?.isProcessingTools,
            toolsCompleted: metadata?.toolsCompleted,
            isStreaming: metadata?.isStreaming,
            toolName: metadata?.toolName,
            toolId: metadata?.toolId,
            toolStatus: metadata?.toolStatus,
            toolParameters: metadata?.toolParameters,
            toolMessageType: metadata?.toolMessageType,
            // 🎯 恢复 Token 使用情况和模型名称
            tokenUsage: metadata?.tokenUsage,
            modelName: metadata?.modelName
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

  // 🎯 处理Session拖拽排序请求
  communicationService.addMessageHandler('session_reorder', async (payload: { sessionIds: string[] }) => {
    try {
      logger.info('Received session_reorder request', { sessionIds: payload.sessionIds.map(id => id.substring(0, 8)) });

      // 调用持久化服务保存新顺序
      await sessionManager.saveSessionsOrder(payload.sessionIds);

      logger.info('✅ Session order saved successfully');

      // 🎯 注意：不发送 session_list_update！
      // 前端已经通过 reorderSessions 更新了 UI，
      // 如果发送 session_list_update，会覆盖前端的拖拽顺序
      // （因为 getAllSessionsInfo() 按 lastActivity 排序，不是用户自定义顺序）
    } catch (error) {
      logger.error('Failed to reorder sessions', error instanceof Error ? error : undefined);
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

  // 🎯 处理导出聊天记录请求
  logger.info('🔧 Registering handler for export_chat');
  communicationService.onExportChat(async (payload) => {
    try {
      logger.info(`Exporting chat: ${payload.title}`);

      // 弹出保存对话框
      const defaultFileName = `${payload.title.replace(/[<>:"/\\|?*]/g, '_')}.md`;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultFileName),
        filters: {
          'Markdown': ['md'],
          'All Files': ['*']
        },
        saveLabel: 'Export'
      });

      if (uri) {
        // 写入文件
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(payload.content));

        logger.info(`Chat exported to: ${uri.fsPath}`);
        vscode.window.showInformationMessage(`Chat exported to ${uri.fsPath}`);
      }
    } catch (error) {
      logger.error('Failed to export chat', error instanceof Error ? error : undefined);
      vscode.window.showErrorMessage(`Failed to export chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
          // 🎯 扩展字段
          isStreaming: payload.message.isStreaming,
          isProcessingTools: payload.message.isProcessingTools,
          toolsCompleted: payload.message.toolsCompleted,
          tokenUsage: (payload.message as any).tokenUsage,
          modelName: (payload.message as any).modelName
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
          // 🎯 扩展字段
          isStreaming: msg.isStreaming,
          isProcessingTools: msg.isProcessingTools,
          toolsCompleted: msg.toolsCompleted,
          // 🎯 保存 Token 使用情况和模型名称
          tokenUsage: msg.tokenUsage,
          modelName: msg.modelName
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

  // 🎯 处理系统消息注入请求
  communicationService.addMessageHandler('inject_system_message', async (payload: { sessionId: string, content: string }) => {
    try {
      logger.info(`Received inject_system_message request for session: ${payload.sessionId}`);
      const aiService = await sessionManager.getInitializedAIService(payload.sessionId);
      if (aiService) {
        await aiService.addSystemMessageToHistory(payload.content);
        logger.info(`✅ Successfully injected system message to session ${payload.sessionId}`);
      } else {
        logger.warn(`⚠️ AIService not found for session ${payload.sessionId}, cannot inject message`);
      }
    } catch (error) {
      logger.error('Failed to inject system message', error instanceof Error ? error : undefined);
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
      const parts = payload.fileData.split(',');
      const base64Data = parts.length >= 2 ? parts[1] : payload.fileData;
      if (!base64Data) {
        throw new Error('Invalid base64 data URI: missing data after comma');
      }
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

  // =============================================================================
  // 🎯 PPT 生成处理
  // =============================================================================

  // 服务端配置
  const PPT_SERVER_URL = process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai';
  const PPT_WEB_URL = process.env.DEEPX_WEB_URL || 'https://dvcode.deepvlab.ai';

  // 🎯 处理PPT生成请求
  // 注意：后端没有 status 轮询接口，任务提交后直接打开浏览器让用户在网页查看进度
  communicationService.onPPTGenerate(async (payload) => {
    try {
      logger.info('Received ppt_generate request', { topic: payload.topic, pageCount: payload.pageCount });

      // 获取 access token
      const { ProxyAuthManager } = require('deepv-code-core');
      const authManager = ProxyAuthManager.getInstance();
      const accessToken = await authManager.getAccessToken();

      if (!accessToken) {
        await communicationService.sendPPTGenerateResponse({
          success: false,
          error: 'Authentication required. Please login first.'
        });
        return;
      }

      // 步骤1: 提交大纲创建任务
      // 将风格和色系提示词嵌入到 outline 最前面
      const enrichedOutline = payload.style
        ? `${payload.style}\n\n${payload.outline}`
        : payload.outline;

      const outlineResponse = await fetch(`${PPT_SERVER_URL}/web-api/ppt/outline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          topic: payload.topic,
          page_count: payload.pageCount,
          outline: enrichedOutline
        })
      });

      if (!outlineResponse.ok) {
        const errorText = await outlineResponse.text();
        throw new Error(`Outline submission failed: ${outlineResponse.status} - ${errorText}`);
      }

      const outlineResult = await outlineResponse.json() as { id?: string | number; task_id?: string | number };
      const taskId = outlineResult.id?.toString() || outlineResult.task_id?.toString();

      if (!taskId) {
        throw new Error('No task ID returned from server');
      }

      // 步骤2: 启动PPT生成任务
      const generateResponse = await fetch(`${PPT_SERVER_URL}/web-api/ppt/generate/${taskId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!generateResponse.ok) {
        const errorText = await generateResponse.text();
        throw new Error(`Generation start failed: ${generateResponse.status} - ${errorText}`);
      }

      logger.info('PPT generation task created', { taskId });

      // 步骤3: 获取临时登录码并构建编辑页面URL
      let editUrl = `${PPT_WEB_URL}/ppt/edit/${taskId}`;

      try {
        const tempCodeResponse = await fetch(`${PPT_SERVER_URL}/auth/temp-code/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            expiresIn: 600 // 10分钟有效期
          })
        });

        if (tempCodeResponse.ok) {
          const tempCodeResult = await tempCodeResponse.json() as { success?: boolean; code?: string };
          if (tempCodeResult.success && tempCodeResult.code) {
            const redirectPath = encodeURIComponent(`/ppt/edit/${taskId}`);
            editUrl = `${PPT_WEB_URL}/token-login?code=${tempCodeResult.code}&redirect=${redirectPath}`;
          }
        }
      } catch (tempCodeError) {
        logger.warn('Failed to get temp code for PPT edit URL', tempCodeError instanceof Error ? tempCodeError : undefined);
      }

      // 直接返回成功，附带编辑页面URL
      // 后端没有 status 轮询接口，用户在网页上查看生成进度
      await communicationService.sendPPTGenerateResponse({
        success: true,
        taskId: taskId,
        editUrl: editUrl
      });

    } catch (error) {
      logger.error('Failed to start PPT generation', error instanceof Error ? error : undefined);
      await communicationService.sendPPTGenerateResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Generation failed'
      });
    }
  });

  // 🎯 处理PPT大纲AI优化请求
  communicationService.onPPTOptimizeOutline(async (payload) => {
    try {
      logger.info('Received ppt_optimize_outline request', { topic: payload.topic, pageCount: payload.pageCount });

      // 获取 access token
      const { ProxyAuthManager } = require('deepv-code-core');
      const authManager = ProxyAuthManager.getInstance();
      const accessToken = await authManager.getAccessToken();

      if (!accessToken) {
        await communicationService.sendPPTOptimizeOutlineResponse({
          success: false,
          error: 'Authentication required. Please login first.'
        });
        return;
      }

      // 构建优化提示词
      const optimizePrompt = `你是一位专业的PPT内容策划师。请根据以下信息优化PPT大纲：

【PPT信息】
- 主题：${payload.topic}
- 页数：${payload.pageCount}页
- 设计风格：${payload.style || '默认'}
- 配色方案：${payload.colorScheme || '默认'}

【当前大纲】
${payload.outline}

【优化要求】
1. 为每一页提供完整的内容结构：
   - 主标题（简洁有力）
   - 副标题（补充说明）
   - 要点内容（3-5个关键点）
   - 布局建议（视觉区、标题区、装饰元素位置）

2. 确保内容：
   - 符合所选风格的语言调性
   - 逻辑递进、层次分明
   - 每页重点突出

请直接输出优化后的大纲内容，不要添加额外说明。使用中文输出。`;

      // 调用 DeepV 服务端 AI API
      const response = await fetch(`${PPT_SERVER_URL}/v1/chat/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Scene-Type': 'json_generation'
        },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: optimizePrompt }] }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI optimization failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const optimizedOutline = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!optimizedOutline) {
        throw new Error('No optimized content returned from AI');
      }

      logger.info('PPT outline optimization completed');

      await communicationService.sendPPTOptimizeOutlineResponse({
        success: true,
        optimizedOutline: optimizedOutline
      });

    } catch (error) {
      logger.error('Failed to optimize PPT outline', error instanceof Error ? error : undefined);
      await communicationService.sendPPTOptimizeOutlineResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Optimization failed'
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

      // 🎯 使用状态栏消息代替弹窗提示，更轻量级，3秒后自动消失
      const statusMessage = newState
        ? getI18nText(
            INLINE_COMPLETION_MESSAGES.COMPLETION_ENABLED,
            INLINE_COMPLETION_MESSAGES.COMPLETION_ENABLED_ZH
          )
        : getI18nText(
            INLINE_COMPLETION_MESSAGES.COMPLETION_DISABLED,
            INLINE_COMPLETION_MESSAGES.COMPLETION_DISABLED_ZH
          );
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
 * 获取当前语言（中文或英文）
 */
function getCurrentLanguage(): 'zh' | 'en' {
  const locale = vscode.env.language;
  return locale.startsWith('zh') ? 'zh' : 'en';
}

/**
 * 获取国际化文本
 */
function getI18nText(enText: string, zhText: string): string {
  return getCurrentLanguage() === 'zh' ? zhText : enText;
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
  const statusText = getI18nText(
    INLINE_COMPLETION_MESSAGES.STATUS_BAR_TEXT,
    INLINE_COMPLETION_MESSAGES.STATUS_BAR_TEXT_ZH
  );

  if (isEnabled) {
    // 开启状态：使用lightbulb图标表示AI能力已激活
    inlineCompletionStatusBar.text = `$(lightbulb) ${statusText}`;
    inlineCompletionStatusBar.tooltip = getI18nText(
      INLINE_COMPLETION_MESSAGES.STATUS_BAR_ENABLED_TOOLTIP,
      INLINE_COMPLETION_MESSAGES.STATUS_BAR_ENABLED_TOOLTIP_ZH
    );
    // 使用主题色保持统一外观
    inlineCompletionStatusBar.backgroundColor = undefined;
    inlineCompletionStatusBar.color = new vscode.ThemeColor('statusBarItem.foreground');
  } else {
    // 关闭状态：使用circle-slash图标表示已禁用
    inlineCompletionStatusBar.text = `$(circle-slash) ${statusText}`;
    inlineCompletionStatusBar.tooltip = getI18nText(
      INLINE_COMPLETION_MESSAGES.STATUS_BAR_DISABLED_TOOLTIP,
      INLINE_COMPLETION_MESSAGES.STATUS_BAR_DISABLED_TOOLTIP_ZH
    );
    // 使用主题色保持统一外观
    inlineCompletionStatusBar.backgroundColor = undefined;
    inlineCompletionStatusBar.color = new vscode.ThemeColor('statusBarItem.foreground');
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

    // 🎯 第一阶段：快速初始化关键服务（不阻塞前端）
    // 只初始化通信和上下文服务，这些是即时可用的
    await communicationService.initialize();
    logger.info('MultiSessionCommunicationService initialized');

    await contextService.initialize();
    logger.info('ContextService initialized');

    // 🎯 标记核心服务已初始化（允许前端进入可对话状态）
    servicesInitialized = true;
    logger.info('✅ Core services initialized - UI ready');

    // 🎯 第二阶段：异步初始化 SessionManager（包含 MCP）
    // 使用 setImmediate 确保不阻塞，完全在后台运行
    setImmediate(async () => {
      try {
        logger.info('🔄 [Background] Starting SessionManager initialization...');
        await sessionManager.initialize();
        logger.info('✅ [Background] SessionManager initialized successfully');

        // SessionManager初始化完成后，发送会话列表给前端
        const sessions = sessionManager.getAllSessionsInfo();
        const currentSessionId = sessionManager.getCurrentSession()?.info.id || null;
        logger.info(`📋 [Background] Sending ${sessions.length} sessions to frontend`);
        await communicationService.sendSessionListUpdate(sessions, currentSessionId);

        // 🎯 发送 sessions_ready 信号，通知前端所有历史 session 已恢复完成
        communicationService.sendMessage({
          type: 'sessions_ready',
          payload: { sessionCount: sessions.length }
        });
        logger.info(`✅ [Background] Sent sessions_ready signal (${sessions.length} sessions)`);

        // 初始化行内补全服务（依赖 SessionManager）
        await initializeInlineCompletion();

        // 监听 session 事件
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

        logger.info('✅ [Background] All session services ready');

      } catch (error) {
        logger.error('❌ [Background] SessionManager initialization failed', error instanceof Error ? error : undefined);
        // 失败不影响主流程，用户仍可使用基础功能
      }
    });

  } catch (error) {
    logger.error('Failed to initialize core services', error instanceof Error ? error : undefined);
    servicesInitialized = false;
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
  newContent: string,
  filePath?: string
): Promise<void> {
  try {
    // 创建临时目录
    const tempDir = path.join(require('os').tmpdir(), 'deepv-diffs');
    try {
      if (!fs.existsSync(tempDir)) {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));
      }
    } catch (error) {
      // 目录可能已经存在，忽略错误
    }

    // 🎯 确保路径是绝对路径
    let targetPath = filePath || fileName;
    if (!path.isAbsolute(targetPath)) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        targetPath = path.resolve(workspaceFolders[0].uri.fsPath, targetPath);
      }
    }

    // 🎯 生成稳定的文件名标识，避免重复打开同一个文件的多个标签页
    const fileId = targetPath;
    const fileHash = crypto.createHash('md5').update(fileId).digest('hex').substring(0, 8);
    const baseFileName = fileName.replace(/[<>:"/\\|?*]/g, '_'); // 清理文件名中的特殊字符

    // 不再使用时间戳，使用稳定的 hash 标识
    const originalFileName = `${baseFileName}-${fileHash}-original`;
    const newFileName = `${baseFileName}-${fileHash}-modified`;

    // 获取文件扩展名以保持语法高亮
    const fileExtension = path.extname(fileName);
    const originalFilePath = path.join(tempDir, originalFileName + fileExtension);
    const newFilePath = path.join(tempDir, newFileName + fileExtension);

    // 创建临时文件
    const originalUri = vscode.Uri.file(originalFilePath);
    const newUri = vscode.Uri.file(newFilePath);

    // 写入文件内容 (如果文件已存在，会直接覆盖，从而实现“刷新”效果)
    await vscode.workspace.fs.writeFile(originalUri, Buffer.from(originalContent || '', 'utf8'));
    await vscode.workspace.fs.writeFile(newUri, Buffer.from(newContent || '', 'utf8'));

    // 使用VSCode的diff编辑器打开两个文件对比
    // VSCode 会识别 URI，如果该 URI 的 diff 已经打开，会直接切换到该标签页并应用新内容
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

    logger.info(`Diff comparison opened/refreshed: ${originalFilePath} vs ${newFilePath}`);
    vscode.window.showInformationMessage(`已在编辑器中打开/刷新文件对比: ${fileName}`);

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
      if (!fs.existsSync(tempDir)) {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));
      }
    } catch (error) {
      // 目录可能已经存在，忽略错误
    }

    // 🎯 确保路径是绝对路径
    let targetPath = filePath || fileName;
    if (!path.isAbsolute(targetPath)) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        targetPath = path.resolve(workspaceFolders[0].uri.fsPath, targetPath);
      }
    }

    // 🎯 生成稳定的文件名标识
    const fileId = targetPath;
    const fileHash = crypto.createHash('md5').update(fileId).digest('hex').substring(0, 8);
    const baseFileName = fileName.replace(/[<>:"/\\|?*]/g, '_'); // 清理文件名中的特殊字符
    const deletedFileName = `${baseFileName}-${fileHash}-deleted`;

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

    logger.info(`Deleted file content opened/refreshed: ${deletedFilePath} (original: ${displayPath})`);

  } catch (error) {
    logger.error('Failed to open deleted file content', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * 🎯 尝试关闭指定文件的 Diff 编辑器或已删除文件视图
 */
async function closeDiffEditorForFile(targetPath: string, fileName: string): Promise<void> {
  try {
    const fileHash = crypto.createHash('md5').update(targetPath).digest('hex').substring(0, 8);
    const baseFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');

    // 构造可能存在的临时文件名关键字
    const originalMarker = `${baseFileName}-${fileHash}-original`;
    const modifiedMarker = `${baseFileName}-${fileHash}-modified`;
    const deletedMarker = `${baseFileName}-${fileHash}-deleted`;

    // 遍历所有打开的标签页组
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input as any;

        // 1. 检查 Diff 编辑器 (vscode.TabInputTextDiff)
        if (input && input.original && input.modified) {
          const originalUri = input.original.toString();
          const modifiedUri = input.modified.toString();

          if (originalUri.includes(originalMarker) || modifiedUri.includes(modifiedMarker)) {
            logger.info(`🎯 [CloseEditor] Found matching diff tab for ${fileName}, closing...`);
            await vscode.window.tabGroups.close(tab);
          }
        }

        // 2. 检查普通编辑器 (vscode.TabInputText) - 针对已删除文件视图
        else if (input && input.uri) {
          const uri = input.uri.toString();
          if (uri.includes(deletedMarker)) {
            logger.info(`🎯 [CloseEditor] Found matching deleted file tab for ${fileName}, closing...`);
            await vscode.window.tabGroups.close(tab);
          }
        }
      }
    }
  } catch (error) {
    logger.debug(`[CloseEditor] Failed to close tab for ${fileName}`, error);
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

/**
 * 📝 设置记忆文件监听 - 自动检测记忆文件变化并刷新
 */
function setupMemoryFileWatcher(context: vscode.ExtensionContext) {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    logger.info('📝 No workspace open, skipping memory file watcher setup');
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

  // 监听记忆文件变化（DEEPV.md, GEMINI.md, AGENTS.md, CLAUDE.md 等）
  const memoryFilePatterns = ['**/{DEEPV,GEMINI,AGENTS,CLAUDE}.md'];
  const fileWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceRoot, '{DEEPV,GEMINI,AGENTS,CLAUDE}.md')
  );

  let refreshTimeout: NodeJS.Timeout | null = null;

  const refreshMemory = async () => {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }

    // 防抖：延迟 500ms 后刷新，避免频繁刷新（如持续编辑文件）
    refreshTimeout = setTimeout(async () => {
      try {
        logger.info('📝 Memory file changed, refreshing memory for active sessions');
        await sessionManager.refreshUserMemory();
        logger.info('📝 Memory refreshed successfully');
      } catch (error) {
        logger.error('Failed to refresh memory after file change', error instanceof Error ? error : undefined);
      }
      refreshTimeout = null;
    }, 500);
  };

  // 监听文件创建、修改、删除
  fileWatcher.onDidChange(refreshMemory);
  fileWatcher.onDidCreate(refreshMemory);
  fileWatcher.onDidDelete(refreshMemory);

  // 注册清理函数
  context.subscriptions.push(fileWatcher);

  logger.info('📝 Memory file watcher initialized');
}

// 🎯 打开扩展设置
function setupOpenExtensionSettings(communicationService: MultiSessionCommunicationService) {
  communicationService.onOpenExtensionSettings(async () => {
    try {
      logger.info('Opening VS Code extension settings for DeepV Code');
      // 使用 workbench.action.openSettings 命令打开设置面板，并通过 @ext: 过滤器显示扩展配置
      await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:DeepX.deepv-code-vscode-ui-plugin');
    } catch (error) {
      logger.error('Failed to open extension settings', error instanceof Error ? error : undefined);
      vscode.window.showErrorMessage('Failed to open extension settings');
    }
  });
}
