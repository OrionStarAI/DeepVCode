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
import { Logger } from './utils/logger';
import { startupOptimizer } from './utils/startupOptimizer';
import { EnvironmentOptimizer } from './utils/environmentOptimizer';

let logger: Logger;
let webviewService: WebViewService;
let contextService: ContextService;
let communicationService: MultiSessionCommunicationService;
let sessionManager: SessionManager;
let fileSearchService: FileSearchService;
let fileRollbackService: FileRollbackService;
let extensionContext: vscode.ExtensionContext;

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

    // Setup communication between services
    setupServiceCommunication();

    // 🎯 立即初始化WebView服务，这样用户点击时就能看到loading界面
    try {
      await webviewService.initialize();
      logger.info('WebView service initialized - ready for immediate display');
    } catch (error) {
      logger.warn('WebView service initialization failed, will retry later', error instanceof Error ? error : undefined);
    }

    startupOptimizer.endPhase();

    startupOptimizer.startPhase('Background Services Startup');

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
  // Context changes
  contextService.onContextChange(() => {
    // TODO: 需要通知所有session的context更新
    logger.info('Context changed, need to notify all sessions');
  });

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

  // 处理Session列表请求
  communicationService.onSessionListRequest(async () => {
    try {
      logger.info('Received session_list_request');
      const sessions = sessionManager.getAllSessionsInfo();
      const currentSessionId = sessionManager.getCurrentSession()?.info.id || null;

      communicationService.sendMessage({
        type: 'session_list_update',
        payload: { sessions, currentSessionId }
      });
    } catch (error) {
      logger.error('Failed to get session list', error instanceof Error ? error : undefined);
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
}

function registerCommands(context: vscode.ExtensionContext) {
  logger.info('Registering commands...');
  console.log('DeepV Code: Registering commands');

  const commands = [
    vscode.commands.registerCommand('deepv.openAIAssistant', async () => {
      logger.info('deepv.openAIAssistant command executed');
      console.log('DeepV Code: openAIAssistant command executed');

      // 🎯 确保WebView立即显示，即使服务还没完全初始化
      try {
        if (webviewService) {
          webviewService.show();
        } else {
          // 如果webviewService还没初始化，立即创建一个临时的
          const tempWebviewService = new WebViewService(context, communicationService, logger);
          await tempWebviewService.initialize();
          tempWebviewService.show();
          // 当正式的webviewService初始化完成后会接管
        }
      } catch (error) {
        logger.error('Failed to show webview', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage('Failed to open DeepV Code Assistant');
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
    })
  ];

  context.subscriptions.push(...commands);
  logger.info(`Registered ${commands.length} commands successfully`);
  console.log(`DeepV Code: Registered ${commands.length} commands`);
}

async function startServices() {
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
    } catch (error) {
      logger.warn('SessionManager initialization failed, continuing with basic mode', error instanceof Error ? error : undefined);
    }

  } catch (error) {
    logger.error('Failed to initialize core services', error instanceof Error ? error : undefined);
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