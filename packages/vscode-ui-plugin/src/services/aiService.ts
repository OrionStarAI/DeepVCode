/**
 * AI Service - 最终精简版本，直接使用CoreToolScheduler
 * 职责清晰：AI对话 + 工具结果处理，移除所有中间层
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  ChatMessage,
  ChatResponse,
  ToolCall as VSCodeToolCall,
  ContextInfo,
  ToolCallStatus,
  ToolCallConfirmationDetails
} from '../types/messages';
import { Logger } from '../utils/logger';

// 🎯 导入core包
import {
  GeminiClient,
  Config,
  AuthType,
  ServerGeminiStreamEvent,
  GeminiEventType,
  ToolCallRequestInfo,
  CoreToolScheduler,
  ToolConfirmationOutcome,
  ToolConfirmationPayload,
  OutputUpdateHandler,
  AllToolCallsCompleteHandler,
  ToolCallsUpdateHandler,
  PreToolExecutionHandler,
  parseToolOutputMessage,
  ApprovalMode,
  EditorType,
  ReadLintsTool,
  LintDiagnostic,
  LintFixTool,
  tokenLimit,
  TokenUsageInfo
} from 'deepv-code-core';

import { ContextBuilder } from './contextBuilder';
import { MultiSessionCommunicationService } from './multiSessionCommunicationService';
import { SessionMessage } from '../types/sessionTypes';
import { LoginService } from './loginService';
import { DiagnosticsMonitorService } from './diagnosticsMonitorService';
import { SmartLintNotificationService, SmartNotificationConfig } from './smartLintNotificationService';

// 🎯 接口定义，避免循环依赖
interface ISessionHistoryManager {
  saveSessionHistory(sessionId: string, uiHistory: SessionMessage[], aiClientHistory?: unknown[]): Promise<void>;
  saveCompleteSessionHistory(sessionId: string): Promise<void>;
  updateSessionInfo(sessionId: string, updates: Partial<import('../types/sessionTypes').SessionInfo>): Promise<void>;
}

export class AIService {
  private geminiClient?: GeminiClient;
  private config?: Config;
  private coreToolScheduler?: CoreToolScheduler;
  private loginService: LoginService;
  private isInitialized = false;

  // 🎯 状态管理
  private isCurrentlyResponding: boolean = false;
  private isProcessing: boolean = false;
  private currentProcessingMessageId: string | null = null;
  private canAbortFlow: boolean = false;
  private abortController?: AbortController;

  // 🎯 通信和工具状态
  private communicationService?: MultiSessionCommunicationService;
  private sessionHistoryManager?: ISessionHistoryManager;

  // 🎯 增强的 Lint 功能
  private diagnosticsMonitor?: DiagnosticsMonitorService;
  private smartNotificationService?: SmartLintNotificationService;
  private sessionId!: string;
  private currentToolCalls: Map<string, VSCodeToolCall> = new Map();
  private toolCallUpdateCallbacks: Set<(tools: VSCodeToolCall[]) => void> = new Set();

  // 🎯 内存刷新状态跟踪
  private processedMemoryTools: Set<string> = new Set();
  private memoryRefreshCallback?: () => Promise<void>;

  constructor(private logger: Logger, extensionPath?: string) {
    this.loginService = LoginService.getInstance(logger, extensionPath);
  }

  async initialize(workspaceRoot?: string, memoryOptions?: { userMemory?: string; geminiMdFileCount?: number; sessionModel?: string }) {
    this.logger.info('Initializing AIService');

    try {
      // 🎯 使用传入的工作区路径，如果没有则使用当前工作目录作为回退
      const targetDir = workspaceRoot || process.cwd();
      this.logger.info(`Using workspace root: ${targetDir}`);

      // 🎯 使用传入的用户内存内容，如果没有则为空
      const userMemory = memoryOptions?.userMemory || '';
      const geminiMdFileCount = memoryOptions?.geminiMdFileCount || 0;

      if (userMemory.length > 0) {
        this.logger.info(`📝 Using shared user memory: ${Math.round(userMemory.length / 1024)}KB from ${geminiMdFileCount} file(s)`);
      }

      // 🎯 确定使用的模型：优先使用session模型，其次使用VS Code设置中的默认模型
      let modelToUse: string;
      if (memoryOptions?.sessionModel) {
        // 如果session有模型配置，使用session的模型
        modelToUse = memoryOptions.sessionModel;
        this.logger.info(`📱 Using session model: ${modelToUse}`);
      } else {
        // 否则使用VS Code设置中的默认模型
        const vscodeConfig = vscode.workspace.getConfiguration('deepv');
        modelToUse = vscodeConfig.get<string>('preferredModel', 'auto');
        this.logger.info(`⚙️ Using default model from settings: ${modelToUse}`);
      }

      this.config = new Config({
        sessionId: this.sessionId,
        targetDir: targetDir,
        debugMode: false,
        cwd: targetDir,
        model: modelToUse,
        approvalMode: ApprovalMode.DEFAULT,
        fullContext: false,
        showMemoryUsage: false,
        checkpointing: false,
        usageStatisticsEnabled: false,
        userMemory: userMemory,              // 🎯 传入用户内存内容
        geminiMdFileCount: geminiMdFileCount, // 🎯 传入文件计数
        fileFiltering: {
          respectGitIgnore: true,
          respectGeminiIgnore: true,
          enableRecursiveFileSearch: true
        },
        telemetry: { enabled: false },
        vsCodePluginMode: true               // 🎯 启用VSCode插件模式，禁用SubAgent工具
      });

      await this.config.initialize();

      await this.config.refreshAuth(AuthType.USE_CHEETH_OA);
      this.geminiClient = this.config.getGeminiClient();
      await this.initializeCoreToolScheduler();

      // 🎯 初始化增强的 lint 功能
      await this.initializeEnhancedLintFeatures();

      this.isInitialized = true;
      this.logger.info('✅ AIService initialized successfully');

    } catch (error) {
      this.logger.error('❌ Failed to initialize AIService', error instanceof Error ? error : undefined);
      this.isInitialized = false;
      throw new Error(`Failed to initialize AI service: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 🎯 检查AIService是否已初始化
   */
  get isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * 🎯 直接初始化CoreToolScheduler
   */
  private async initializeCoreToolScheduler() {
    if (!this.config) throw new Error('Config not initialized');

    try {
      const toolRegistryPromise = this.config.getToolRegistry();

      // 🎯 输出更新处理
      const outputUpdateHandler: OutputUpdateHandler = (toolCallId, outputChunk) => {
        const tool = this.currentToolCalls.get(toolCallId);
        if (!tool) return;

        const message = parseToolOutputMessage(outputChunk);

        // 🎯 使用类型安全的方式检查消息属性
        if (message && typeof message === 'object' && 'liveOutput' in message) {
          const liveOutput = message.liveOutput as string;
          tool.liveOutput = liveOutput;
          this.sendToolOutput(toolCallId, liveOutput);
        }

        if (message && typeof message === 'object' && 'progressText' in message) {
          const progressText = message.progressText as string;
          tool.progressText = progressText;
          this.sendToolOutput(toolCallId, progressText);
        }

        if (typeof outputChunk === 'string' &&
            !(message && typeof message === 'object' && ('liveOutput' in message || 'progressText' in message))) {
          this.sendToolOutput(toolCallId, outputChunk);
        }

        this.currentToolCalls.set(toolCallId, { ...tool });
        this.notifyToolsUpdate();
      };

      // 🎯 工具完成处理 - 核心职责
      const allToolCallsCompleteHandler: AllToolCallsCompleteHandler = (completedToolCalls) => {
        const completedVSCodeTools: VSCodeToolCall[] = [];

        completedToolCalls.forEach(coreTool => {
          const tool = this.currentToolCalls.get(coreTool.request.callId);
          if (tool) {
            tool.status = coreTool.status === 'success' ? ToolCallStatus.Success :
                          coreTool.status === 'error' ? ToolCallStatus.Error :
                          ToolCallStatus.Canceled;

            tool.endTime = Date.now();
            tool.executionDuration = tool.endTime - (tool.startTime || tool.endTime);

            if (coreTool.status === 'success') {
              tool.result = {
                success: true,
                data: coreTool.response.resultDisplay,
                executionTime: tool.executionDuration || 0,
                toolName: tool.toolName
              };
              tool.responseParts = coreTool.response.responseParts;
            } else if (coreTool.status === 'error') {
              tool.result = {
                success: false,
                error: typeof coreTool.response.resultDisplay === 'string' ?
                       coreTool.response.resultDisplay : 'Tool execution failed',
                executionTime: tool.executionDuration || 0,
                toolName: tool.toolName
              };
              tool.responseParts = coreTool.response.responseParts;
            }

            this.currentToolCalls.set(coreTool.request.callId, tool);
            completedVSCodeTools.push(tool);
          }
        });

        this.notifyToolsUpdate();
        this.handleToolBatchComplete(completedVSCodeTools);
      };

      // 🎯 工具状态更新处理
      const toolCallsUpdateHandler: ToolCallsUpdateHandler = (updatedCoreToolCalls) => {
        updatedCoreToolCalls.forEach(coreTool => {
          const existingTool = this.currentToolCalls.get(coreTool.request.callId);
          if (existingTool) {
            existingTool.status = this.mapCoreStatusToVSCodeStatus(coreTool.status);

            // 🎯 工具确认逻辑已移至新的确认机制中处理
            //     riskLevel: this.assessRiskLevel(existingTool.toolName, existingTool.parameters),
            //     affectedFiles: this.extractAffectedFiles(existingTool.parameters)
            //   };

            //   this.handleConfirmationRequired(existingTool.id, existingTool.confirmationDetails);
            // }

            this.currentToolCalls.set(coreTool.request.callId, existingTool);
          }
        });

        this.notifyToolsUpdate();
      };

      const preToolExecutionHandler: PreToolExecutionHandler = async (toolCall): Promise<void> => {
        this.logger.info(`🚀 About to execute tool: ${toolCall.tool.name}`);
      };

      // 🎯 直接创建CoreToolScheduler
      this.coreToolScheduler = new CoreToolScheduler({
        toolRegistry: toolRegistryPromise,
        outputUpdateHandler,
        onAllToolCallsComplete: allToolCallsCompleteHandler,
        onToolCallsUpdate: toolCallsUpdateHandler,
        onPreToolExecution: preToolExecutionHandler,
        approvalMode: this.config.getApprovalMode() || ApprovalMode.DEFAULT,
        getPreferredEditor: () => 'vscode' as EditorType,
        config: this.config
      });

      // 🎯 Setup ReadLintsTool callback for VSCode diagnostics integration
      this.setupReadLintsCallback();

      this.logger.info('✅ CoreToolScheduler initialized');

    } catch (error) {
      this.logger.error('❌ Failed to initialize CoreToolScheduler', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 🎯 设置ReadLintsTool的VSCode诊断回调
   */
  private setupReadLintsCallback() {
    const vscodeDiagnosticsCallback = async (paths?: string[]): Promise<LintDiagnostic[]> => {
      try {
        const diagnostics: LintDiagnostic[] = [];

        // 获取当前工作区的所有诊断信息
        const allDiagnostics = vscode.languages.getDiagnostics();

        for (const [uri, uriDiagnostics] of allDiagnostics) {
          // 如果指定了路径，则过滤
          if (paths && paths.length > 0) {
            const filePath = uri.fsPath;
            const shouldInclude = paths.some(requestedPath => {
              // 支持相对路径和绝对路径
              if (path.isAbsolute(requestedPath)) {
                return filePath === requestedPath || filePath.startsWith(requestedPath);
              } else {
                return filePath.endsWith(requestedPath) || filePath.includes(requestedPath);
              }
            });

            if (!shouldInclude) {
              continue;
            }
          }

          // 转换VSCode诊断到我们的格式
          for (const diagnostic of uriDiagnostics) {
            diagnostics.push({
              file: vscode.workspace.asRelativePath(uri),
              line: diagnostic.range.start.line + 1, // VSCode使用0-based，我们使用1-based
              column: diagnostic.range.start.character + 1,
              severity: this.convertVSCodeSeverity(diagnostic.severity),
              message: diagnostic.message,
              source: diagnostic.source || 'unknown',
              code: diagnostic.code?.toString(),
            });
          }
        }

        this.logger.info(`🔍 ReadLints retrieved ${diagnostics.length} diagnostics`);
        return diagnostics;

      } catch (error) {
        this.logger.error('❌ Error retrieving VSCode diagnostics', error instanceof Error ? error : undefined);
        return [];
      }
    };

    // 设置回调到ReadLintsTool
    ReadLintsTool.setCallback(vscodeDiagnosticsCallback);
    this.logger.info('✅ ReadLintsTool VSCode callback initialized');
  }

  /**
   * 🎯 转换VSCode诊断严重性到我们的格式
   */
  private convertVSCodeSeverity(severity: vscode.DiagnosticSeverity): LintDiagnostic['severity'] {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return 'error';
      case vscode.DiagnosticSeverity.Warning:
        return 'warning';
      case vscode.DiagnosticSeverity.Information:
        return 'info';
      case vscode.DiagnosticSeverity.Hint:
        return 'hint';
      default:
        return 'info';
    }
  }

  /**
   * 🎯 初始化增强的 lint 功能
   */
  private async initializeEnhancedLintFeatures(): Promise<void> {
    try {
      this.logger.info('🚀 Initializing enhanced lint features...');

      // 1. 初始化诊断监控服务
      this.diagnosticsMonitor = new DiagnosticsMonitorService(this.logger);
      await this.diagnosticsMonitor.initialize();

      // 2. 初始化智能通知服务
      if (this.communicationService) {
        this.smartNotificationService = new SmartLintNotificationService(
          this.logger,
          this.communicationService,
          this.diagnosticsMonitor,
          {
            enableAutoNotifications: true,
            minErrorThreshold: 1,
            notificationCooldown: 30000, // 30 秒
            onlyNotifyOnDegradation: false, // 改进时也通知
            enableSaveNotifications: true,
            enableFileOpenNotifications: false
          }
        );
        await this.smartNotificationService.initialize();
      }

      // 3. 设置 LintFixTool 回调
      this.setupLintFixCallback();

      this.logger.info('✅ Enhanced lint features initialized successfully');

    } catch (error) {
      this.logger.error('❌ Failed to initialize enhanced lint features', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 🎯 设置 LintFixTool 的 VSCode 回调
   */
  private setupLintFixCallback(): void {
    const vscodeFixCallback = async (params: any): Promise<{
      previews?: any[];
      results?: any[];
      totalFixes: number;
      success: boolean;
    }> => {
      try {
        this.logger.info('🔧 Executing VSCode lint fixes', params);

        const results: any[] = [];
        const previews: any[] = [];
        let totalFixCount = 0;

        // 获取要处理的文件
        const filesToProcess = await this.getFilesToFix(params.files);

        for (const filePath of filesToProcess) {
          const uri = vscode.Uri.file(filePath);

          try {
            // 获取当前文件的诊断信息
            const diagnostics = vscode.languages.getDiagnostics(uri);

            if (diagnostics.length === 0) {
              continue; // 没有问题需要修复
            }

            // 获取可用的代码操作（修复）
            const codeActions = await this.getCodeActionsForFile(uri, diagnostics, params);

            if (params.preview) {
              // 预览模式：收集修复信息
              const preview = await this.generateFixPreview(uri, codeActions);
              if (preview.fixes.length > 0) {
                previews.push(preview);
                totalFixCount += preview.fixes.length;
              }
            } else {
              // 应用模式：实际执行修复
              const result = await this.applyCodeActions(uri, codeActions, params);
              results.push(result);
              totalFixCount += result.appliedFixes;
            }

          } catch (fileError) {
            this.logger.error(`❌ Error processing file ${filePath}`, fileError instanceof Error ? fileError : undefined);

            if (!params.preview) {
              results.push({
                file: vscode.workspace.asRelativePath(uri),
                appliedFixes: 0,
                failedFixes: 1,
                errors: [fileError instanceof Error ? fileError.message : String(fileError)]
              });
            }
          }
        }

        this.logger.info(`✅ Lint fix operation completed. Total fixes: ${totalFixCount}`);

        return {
          previews: params.preview ? previews : undefined,
          results: params.preview ? undefined : results,
          totalFixes: totalFixCount,
          success: true
        };

      } catch (error) {
        this.logger.error('❌ Error in lint fix callback', error instanceof Error ? error : undefined);
        return {
          totalFixes: 0,
          success: false
        };
      }
    };

    // 设置回调
    LintFixTool.setCallback(vscodeFixCallback);
    this.logger.info('✅ LintFixTool VSCode callback initialized');
  }

  /**
   * 🎯 获取要修复的文件列表
   */
  private async getFilesToFix(specifiedFiles?: string[]): Promise<string[]> {
    if (specifiedFiles && specifiedFiles.length > 0) {
      // 解析指定的文件路径
      return specifiedFiles.map(file => {
        if (path.isAbsolute(file)) {
          return file;
        } else {
          // 相对路径，相对于工作区根目录
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          return workspaceRoot ? path.resolve(workspaceRoot, file) : file;
        }
      });
    } else {
      // 获取所有有诊断问题的文件
      const allDiagnostics = vscode.languages.getDiagnostics();
      const filesWithIssues: string[] = [];

      for (const [uri, diagnostics] of allDiagnostics) {
        if (diagnostics.length > 0) {
          filesWithIssues.push(uri.fsPath);
        }
      }

      return filesWithIssues;
    }
  }

  /**
   * 🎯 获取文件的代码操作（修复）
   */
  private async getCodeActionsForFile(
    uri: vscode.Uri,
    diagnostics: readonly vscode.Diagnostic[],
    params: any
  ): Promise<vscode.CodeAction[]> {
    const codeActions: vscode.CodeAction[] = [];

    // 为每个诊断获取可用的代码操作
    for (const diagnostic of diagnostics) {
      try {
        // 过滤错误类型（如果指定了）
        if (params.fixTypes && params.fixTypes.length > 0) {
          const diagnosticId = `${diagnostic.source}:${diagnostic.code}`;
          if (!params.fixTypes.some((fixType: string) => diagnosticId.includes(fixType))) {
            continue;
          }
        }

        // 获取该诊断的代码操作
        const range = diagnostic.range;
        const context = {
          diagnostics: [diagnostic]
        } as unknown as vscode.CodeActionContext;

        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
          'vscode.executeCodeActionProvider',
          uri,
          range,
          context
        );

        if (actions && actions.length > 0) {
          // 只添加自动修复类型的操作
          const autoFixActions = actions.filter(action =>
            action.kind && vscode.CodeActionKind.QuickFix.contains(action.kind) &&
            action.edit && // 必须有编辑操作
            !action.command // 优先选择直接编辑操作，而不是命令
          );

          codeActions.push(...autoFixActions);
        }

      } catch (actionError) {
        this.logger.debug(`Failed to get code actions for diagnostic`, actionError instanceof Error ? actionError : undefined);
      }
    }

    // 限制修复数量
    const maxFixes = params.maxFixes || 50;
    return codeActions.slice(0, maxFixes);
  }

  /**
   * 🎯 生成修复预览
   */
  private async generateFixPreview(uri: vscode.Uri, codeActions: vscode.CodeAction[]): Promise<any> {
    const fixes = codeActions.map(action => {
      const edit = action.edit;
      if (!edit || !edit.has(uri)) {
        return null;
      }

      const textEdits = edit.get(uri);
      if (!textEdits || textEdits.length === 0) {
        return null;
      }

      // 使用第一个编辑操作作为预览
      const firstEdit = textEdits[0];

      return {
        range: {
          start: { line: firstEdit.range.start.line, character: firstEdit.range.start.character },
          end: { line: firstEdit.range.end.line, character: firstEdit.range.end.character }
        },
        newText: firstEdit.newText,
        description: action.title,
        fixKind: action.kind?.value || 'quickfix'
      };
    }).filter(fix => fix !== null);

    return {
      file: vscode.workspace.asRelativePath(uri),
      fixes
    };
  }

  /**
   * 🎯 应用代码操作
   */
  private async applyCodeActions(
    uri: vscode.Uri,
    codeActions: vscode.CodeAction[],
    params: any
  ): Promise<any> {
    const result: any = {
      file: vscode.workspace.asRelativePath(uri),
      appliedFixes: 0,
      failedFixes: 0,
      errors: []
    };

    for (const action of codeActions) {
      try {
        if (action.edit) {
          // 应用工作区编辑
          const success = await vscode.workspace.applyEdit(action.edit);
          if (success) {
            result.appliedFixes++;
          } else {
            result.failedFixes++;
            result.errors.push(`Failed to apply edit: ${action.title}`);
          }
        } else if (action.command) {
          // 执行命令
          await vscode.commands.executeCommand(action.command.command, ...(action.command.arguments || []));
          result.appliedFixes++;
        }

      } catch (error) {
        result.failedFixes++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Error applying ${action.title}: ${errorMsg}`);
        this.logger.error(`❌ Error applying code action: ${action.title}`, error instanceof Error ? error : undefined);
      }
    }

    return result;
  }

  /**
   * 🎯 手动触发项目质量概览
   */
  async triggerProjectQualityOverview(): Promise<void> {
    if (this.smartNotificationService) {
      await this.smartNotificationService.sendProjectQualityOverview();
    } else {
      this.logger.warn('Smart notification service not initialized');
    }
  }

  /**
   * 🎯 更新智能通知配置
   */
  updateLintNotificationConfig(config: Partial<SmartNotificationConfig>): void {
    if (this.smartNotificationService) {
      this.smartNotificationService.updateConfig(config);
    }
  }

  /**
   * 🎯 处理工具批次完成 - AI核心职责
   */
  private async handleToolBatchComplete(completedTools: VSCodeToolCall[]) {
    if (this.isCurrentlyResponding) {
      this.logger.info(`⏳ AI still responding, skipping tool results submission`);
      return;
    }

    // 🎯 检测成功完成的save_memory工具调用
    await this.handleMemoryToolsCompleted(completedTools);

    const toolsToSubmit = completedTools.filter(tool =>
      (tool.status === ToolCallStatus.Success ||
      tool.status === ToolCallStatus.Error ||
       tool.status === ToolCallStatus.Canceled) &&
      !tool.responseSubmittedToGemini
    );

    if (toolsToSubmit.length === 0) {
      if (!this.isCurrentlyResponding) {
        this.setProcessingState(false, null, false);
      }
      return;
    }

    await this.submitToolResultsToLLM(toolsToSubmit);
  }

  /**
   * 🎯 处理内存工具完成，自动刷新内存内容
   */
  private async handleMemoryToolsCompleted(completedTools: VSCodeToolCall[]) {
    // 识别新的、成功的save_memory工具调用
    const newSuccessfulMemorySaves = completedTools.filter(tool =>
      tool.toolName === 'save_memory' &&
      tool.status === ToolCallStatus.Success &&
      !this.processedMemoryTools.has(tool.id)
    );

    if (newSuccessfulMemorySaves.length > 0) {
      try {
        // 执行内存刷新
        if (this.memoryRefreshCallback) {
          this.logger.info(`🔄 Detected ${newSuccessfulMemorySaves.length} successful save_memory operation(s), refreshing memory...`);
          await this.memoryRefreshCallback();
        } else {
          this.logger.warn('⚠️ Memory refresh callback not set, skipping memory refresh');
        }

        // 标记这些工具已处理，避免重复刷新
        newSuccessfulMemorySaves.forEach(tool =>
          this.processedMemoryTools.add(tool.id)
        );
      } catch (error) {
        this.logger.error('❌ Failed to refresh memory after save_memory tool execution', error instanceof Error ? error : undefined);
      }
    }
  }

  /**
   * 🎯 提交工具结果给LLM - AI核心职责
   */
  private async submitToolResultsToLLM(tools: VSCodeToolCall[]) {
    if (!this.geminiClient || tools.length === 0) return;
    if (!this.canAbortFlow || !this.isProcessing) return;

    try {
      const toolResponseParts: any[] = [];

      tools.forEach(tool => {
        if (tool.responseParts) {
          if (Array.isArray(tool.responseParts)) {
            toolResponseParts.push(...tool.responseParts);
          } else {
            toolResponseParts.push(tool.responseParts);
          }
        } else {
          let fallbackOutput: string;

          if (tool.status === ToolCallStatus.Canceled) {
            fallbackOutput = 'User Cancelled';
          } else if (tool.result?.success) {
            fallbackOutput = tool.result.data || `Tool ${tool.toolName} executed successfully`;
          } else {
            fallbackOutput = `Error in ${tool.toolName}: ${tool.result?.error || 'Unknown error'}`;
          }

          toolResponseParts.push({
            functionResponse: {
              id: tool.id,
              name: tool.toolName,
              response: { output: String(fallbackOutput) }
            }
          });
        }
      });

      tools.forEach(tool => {
        tool.responseSubmittedToGemini = true;
      });

      if (this.abortController?.signal.aborted) return;

      // 🎯 完成当前阶段，开始新阶段
      if (this.currentProcessingMessageId && this.communicationService && this.sessionId) {
        await this.communicationService.sendChatComplete(this.sessionId, this.currentProcessingMessageId);
      }

      const nextStageId = `continuation-${Date.now()}`;
      if (this.communicationService && this.sessionId) {
        await this.communicationService.sendChatStart(this.sessionId, nextStageId);
        this.setProcessingState(true, nextStageId, true);
      }

      const abortController = new AbortController();
      this.abortController = abortController;

      const stream = this.geminiClient.sendMessageStream(
        toolResponseParts,
        abortController.signal,
        `tool-results-${Date.now()}`
      );

      this.isCurrentlyResponding = true;
      this.currentToolCalls.clear();

      await this.processGeminiStreamEvents(
        stream,
        { id: nextStageId, content: [], timestamp: Date.now(), type: 'assistant' },
        undefined,
        abortController.signal,
        nextStageId
      );

    } catch (error) {
      this.logger.error('❌ Failed to submit tool results to LLM', error instanceof Error ? error : undefined);
      this.isCurrentlyResponding = false;
      this.setProcessingState(false, null, false);
      throw error;
    }
  }

  /**
   * 🎯 处理编辑消息并重新生成 - 回滚历史并重新处理
   */
  async processEditMessageAndRegenerate(messageId: string, newContent: any, context: ContextInfo): Promise<void> {
    try {
      if (!this.isInitialized) {
        throw new Error('AI service is not initialized');
      }


      // 🎯 1. 回滚AI客户端历史到指定消息位置
      await this.rollbackHistoryToMessage(messageId);

      // 🎯 2. 创建更新后的消息
      const updatedMessage: ChatMessage = {
        id: messageId,
        type: 'user',
        content: newContent,
        timestamp: Date.now()
      };

      // 🎯 3. 重新处理编辑后的消息
      const result = await ContextBuilder.buildContextualContent(newContent, context);
      await this.processStreamingResponseWithParts(messageId, result.parts, `ai-response-${Date.now()}`);

    } catch (error) {
      this.logger.error('❌ Failed to process edit message', error instanceof Error ? error : undefined);

      if (this.communicationService && this.sessionId) {
        const errorMessage = `Edit Error: ${error instanceof Error ? error.message : String(error)}`;
        await this.communicationService.sendChatError(this.sessionId, errorMessage);
      }
    }
  }

  /**
   * 🎯 回滚AI历史到指定消息位置
   */
  private async rollbackHistoryToMessage(messageId: string): Promise<void> {
    if (!this.geminiClient) {
      throw new Error('Gemini client is not initialized');
    }

    console.log('🎯 开始回滚AI历史:', { messageId });

    // 🎯 1. 获取当前历史
    const currentHistory = this.geminiClient.getChat().getHistory();
    console.log('🎯 当前历史长度:', currentHistory.length);

    // 🎯 2. 查找目标消息位置
    let rollbackIndex = -1;
    for (let i = 0; i < currentHistory.length; i++) {
      const content = currentHistory[i];
      if (content.prompt_id === messageId) {
        rollbackIndex = i;
        break;
      }
    }

    if (rollbackIndex === -1) {
      console.warn('🎯 未找到目标消息，无需回滚:', { messageId });
      return;
    }

    console.log('🎯 找到目标消息位置:', {
      rollbackIndex,
      totalMessages: currentHistory.length,
      messagesToRemove: currentHistory.length - rollbackIndex
    });

    // 🎯 3. 截断历史 - 移除目标消息及其之后的所有消息
    const truncatedHistory = currentHistory.slice(0, rollbackIndex);

    console.log('🎯 截断后的历史长度:', truncatedHistory.length);
    console.log('🎯 被移除的消息:', {
      目标消息索引: rollbackIndex,
      目标消息prompt_id: currentHistory[rollbackIndex]?.prompt_id,
      移除的消息数量: currentHistory.length - rollbackIndex
    });

    // 🎯 4. 设置新的历史
    this.geminiClient.getChat().setHistory(truncatedHistory);

    console.log('🎯 AI历史回滚完成:', {
      原始长度: currentHistory.length,
      回滚后长度: truncatedHistory.length,
      删除的消息数: currentHistory.length - truncatedHistory.length
    });
  }

  /**
   * 🎯 处理聊天消息 - AI核心职责
   */
  async processChatMessage(message: ChatMessage, context?: ContextInfo): Promise<void> {
    const responseId = `ai-response-${Date.now()}`;

    try {
      if (!this.isInitialized) {
        throw new Error('AI service is not initialized');
      }

      const result = await ContextBuilder.buildContextualContent(message.content, context);
      await this.processStreamingResponseWithParts(message.id, result.parts, responseId);

    } catch (error) {
      this.logger.error('❌ Failed to process AI chat', error instanceof Error ? error : undefined);

      if (this.communicationService && this.sessionId) {
        const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
        await this.communicationService.sendChatError(this.sessionId, errorMessage);
      }
    }
  }

  /**
   * 🎯 处理流式AI响应 - 支持 PartListUnion
   */
  private async processStreamingResponseWithParts(prompt_id: string, parts: import('@google/genai').PartListUnion, responseId: string): Promise<void> {
    this.setProcessingState(true, responseId, true);

    const abortController = new AbortController();
    this.abortController = abortController;

    try {
      if (this.communicationService && this.sessionId) {
        await this.communicationService.sendChatStart(this.sessionId, responseId);
      }

      const stream = this.geminiClient!.sendMessageStream(
        parts,
        abortController.signal,
        prompt_id
      );

      await this.processGeminiStreamEvents(
        stream,
        { id: responseId, content: [], timestamp: Date.now(), type: 'assistant' },
        undefined,
        abortController.signal,
        responseId
      );

      if (this.communicationService && this.sessionId) {
        await this.communicationService.sendChatComplete(this.sessionId, responseId);
      }
    } catch (error) {
      this.logger.error('❌ Failed to process streaming response with parts', error instanceof Error ? error : undefined);

      if (this.communicationService && this.sessionId) {
        const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
        await this.communicationService.sendChatError(this.sessionId, errorMessage);
      }
    } finally {
      // this.setProcessingState(false, null, false);
      // this.abortController = undefined;
    }
  }

  /**
   * 🎯 处理Gemini流式事件
   */
  private async processGeminiStreamEvents(
    stream: AsyncIterable<ServerGeminiStreamEvent>,
    originalMessage: ChatMessage,
    context: ContextInfo | undefined,
    signal: AbortSignal,
    responseId: string
  ): Promise<void> {
    const toolCallRequests: ToolCallRequestInfo[] = [];
    this.isCurrentlyResponding = true;

    try {
      for await (const event of stream) {
        if (signal.aborted) break;

        switch (event.type) {
          case GeminiEventType.Content:
            if (this.communicationService && this.sessionId) {
              await this.communicationService.sendChatChunk(this.sessionId, {
                content: event.value,
                messageId: responseId,
                isComplete: false
              });
            }
            break;

          case GeminiEventType.ToolCallRequest:
            toolCallRequests.push(event.value);
            break;

          case GeminiEventType.TokenUsage:
            // 🎯 处理Token使用情况，更新Session信息
            await this.handleTokenUsage(event.value);
            break;

          case GeminiEventType.Error:
            if (this.communicationService && this.sessionId) {
              await this.communicationService.sendChatError(this.sessionId, `❌ AI响应时出现错误：${event.value.error?.message || 'Unknown error'}`);
            }
            return;

          case GeminiEventType.Finished:
            this.logger.info('Stream finished');
            break;
        }
      }

      this.isCurrentlyResponding = false;

      if (toolCallRequests.length === 0) {
        this.setProcessingState(false, null, false);

        // 🎯 消息处理完成，保存历史记录
        await this.saveSessionHistoryIfAvailable();
      }

      // 🎯 直接调度工具
      if (toolCallRequests.length > 0 && this.coreToolScheduler) {
        await this.scheduleToolCalls(toolCallRequests, signal);
      }

    } catch (streamError) {
      this.logger.error('Error processing stream events', streamError instanceof Error ? streamError : undefined);
      this.isCurrentlyResponding = false;
      this.setProcessingState(false, null, false);

        if (this.communicationService && this.sessionId) {
        await this.communicationService.sendChatError(this.sessionId, `❌ 处理AI流式响应时出错`);
      }
    }
  }

  /**
   * 🎯 处理Token使用情况，更新Session信息
   */
  private async handleTokenUsage(tokenUsageInfo: TokenUsageInfo): Promise<void> {
    try {
      if (!this.sessionHistoryManager || !this.sessionId || !this.config) {
        return;
      }

      // 获取当前模型的token限制
      const currentTokenLimit = tokenLimit(this.config.getModel(), this.config);

      // 构建token使用情况更新
      const tokenUsageUpdate = {
        tokenUsage: {
          inputTokens: tokenUsageInfo.inputTokens,
          outputTokens: tokenUsageInfo.outputTokens,
          totalTokens: tokenUsageInfo.totalTokens,
          tokenLimit: currentTokenLimit,
          cachedContentTokens: tokenUsageInfo.cachedContentTokens,
          cacheCreationInputTokens: tokenUsageInfo.cacheCreationInputTokens,
          cacheReadInputTokens: tokenUsageInfo.cacheReadInputTokens,
          creditsUsage: tokenUsageInfo.creditsUsage
        }
      };

      // 更新Session信息
      await this.sessionHistoryManager.updateSessionInfo(this.sessionId, tokenUsageUpdate);

      this.logger.info(`🎯 Token usage updated: ${tokenUsageInfo.totalTokens}/${currentTokenLimit} tokens (${Math.round((tokenUsageInfo.totalTokens / currentTokenLimit) * 100)}%)`);

    } catch (error) {
      this.logger.error('❌ Failed to handle token usage', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 🎯 直接调度工具调用
   */
  private async scheduleToolCalls(toolCallRequests: ToolCallRequestInfo[], signal: AbortSignal) {
    if (!this.coreToolScheduler) return;

    try {
      const toolRegistry = await this.config!.getToolRegistry();

      // 🎯 创建VSCode工具调用对象
      for (const request of toolCallRequests) {
        let displayName = request.name; // 默认显示名称为原始名称
        let description = '';

        try {
          const tool = toolRegistry.getTool(request.name);
          if (tool) {
            displayName = tool.displayName;
            try {
              description = tool.getDescription(request.args);
            } catch {
              description = `将执行 ${displayName}`;
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to get tool ${request.name} from registry`, error);
        }

        const toolCall: VSCodeToolCall = {
            id: request.callId,
          toolName: request.name, // 🎯 保存原始工具名称
          displayName: displayName, // 🎯 保存显示名称
          description: description,
            parameters: request.args,
          status: ToolCallStatus.Scheduled,
          startTime: Date.now(),
          responseSubmittedToGemini: false
        };

        this.currentToolCalls.set(request.callId, toolCall);
      }

      this.notifyToolsUpdate();

      // 🎯 直接调用CoreToolScheduler - 🔥 关键修复：添加 await 以确保所有异步工具执行完成
      try {
        await this.coreToolScheduler.schedule(toolCallRequests, signal);
        this.logger.info(`✅ Core scheduler execution completed`);
      } catch (error) {
        this.logger.error('❌ Core scheduler execution failed', error instanceof Error ? error : undefined);
        this.handleToolSchedulingError(toolCallRequests, error);
      }

        } catch (error) {
      this.logger.error('❌ Failed to schedule tools', error instanceof Error ? error : undefined);
      this.handleToolSchedulingError(toolCallRequests, error);
    }
  }

  // 🎯 工具相关处理方法

  private sendToolOutput(toolId: string, outputText: string) {
    if (this.communicationService) {
      this.communicationService.sendToolMessage(this.sessionId, {
        id: `tool-output-${toolId}-${Date.now()}`,
        toolId: toolId,
        toolName: undefined,
        content: outputText,
        timestamp: Date.now(),
        toolMessageType: 'output',
        toolStatus: undefined
      });
    }
  }

  private notifyToolsUpdate() {
    const tools = Array.from(this.currentToolCalls.values());

    if (this.communicationService && this.sessionId) {
      this.communicationService.sendToolCallsUpdate(
        this.sessionId,
        tools,
        this.currentProcessingMessageId || undefined
      );
    }

    this.toolCallUpdateCallbacks.forEach(callback => {
      try {
        callback(tools);
      } catch (error) {
        this.logger.error('Tool update callback error', error instanceof Error ? error : undefined);
      }
    });
  }

  private handleToolSchedulingError(requests: ToolCallRequestInfo[], error: any) {
    requests.forEach(request => {
      const tool = this.currentToolCalls.get(request.callId);
      if (tool) {
        tool.status = ToolCallStatus.Error;
        tool.result = {
          success: false,
          error: `Failed to schedule tool: ${error instanceof Error ? error.message : String(error)}`,
          executionTime: 0,
          toolName: tool.toolName
        };
        this.currentToolCalls.set(request.callId, tool);
      }
    });
    this.notifyToolsUpdate();
  }

  // 🎯 工具确认方法

  async approveToolCall(toolId: string, userInput?: string): Promise<void> {
    if (!this.coreToolScheduler) throw new Error('Core scheduler not available');

    const coreOutcome: ToolConfirmationOutcome = ToolConfirmationOutcome.ProceedOnce;
    const confirmationPayload: ToolConfirmationPayload | undefined = userInput ? { newContent: String(userInput) } : undefined;

    this.coreToolScheduler.handleConfirmationResponse(toolId, coreOutcome, confirmationPayload);
  }

  async rejectToolCall(toolId: string, reason?: string): Promise<void> {
    if (!this.coreToolScheduler) throw new Error('Core scheduler not available');

    const coreOutcome: ToolConfirmationOutcome = ToolConfirmationOutcome.Cancel;
    const confirmationPayload: ToolConfirmationPayload | undefined = reason ? { newContent: String(reason) } : undefined;

    this.coreToolScheduler.handleConfirmationResponse(toolId, coreOutcome, confirmationPayload);
  }

  // 🎯 辅助方法

  private mapCoreStatusToVSCodeStatus(coreStatus: string): ToolCallStatus {
    switch (coreStatus) {
      case 'scheduled': return ToolCallStatus.Scheduled;
      case 'validating': return ToolCallStatus.Validating;
      case 'executing': return ToolCallStatus.Executing;
      case 'awaiting_approval': return ToolCallStatus.WaitingForConfirmation;
      case 'success': return ToolCallStatus.Success;
      case 'error': return ToolCallStatus.Error;
      case 'cancelled': return ToolCallStatus.Canceled;
      default: return ToolCallStatus.Error;
    }
  }

  private setProcessingState(isProcessing: boolean, messageId: string | null = null, canAbort = false): void {
    this.isProcessing = isProcessing;
    this.currentProcessingMessageId = messageId;
    this.canAbortFlow = canAbort;

    if (this.communicationService && this.sessionId) {
      this.communicationService.sendFlowStateUpdate(this.sessionId, isProcessing, messageId || undefined, canAbort);

      // 🎯 当处理完成时，发送可回滚ID列表给UI
      if (!isProcessing) {
        const rollbackableIds = this.getRollbackableMessageIds();
        this.communicationService.sendRollbackableIdsUpdate(this.sessionId, rollbackableIds);
      }
    }
  }

  async abortCurrentFlow(): Promise<void> {
    if (!this.canAbortFlow) return;

    try {
      this.canAbortFlow = false;

      if (this.abortController) {
        this.abortController.abort();
        this.abortController = undefined;
      }

      this.isCurrentlyResponding = false;
      this.setProcessingState(false, null, false);

      if (this.currentProcessingMessageId && this.communicationService && this.sessionId) {
          await this.communicationService.sendChatComplete(this.sessionId, this.currentProcessingMessageId);
      }

    } catch (error) {
      this.logger.error('❌ Failed to abort flow', error instanceof Error ? error : undefined);
      this.setProcessingState(false, null, false);
      throw error;
    }
  }

  // 🎯 公共API方法

  setCommunicationService(communicationService: MultiSessionCommunicationService) {
    this.communicationService = communicationService;
  }

  setSessionHistoryManager(sessionHistoryManager: ISessionHistoryManager) {
    this.sessionHistoryManager = sessionHistoryManager;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  setMemoryRefreshCallback(callback: () => Promise<void>) {
    this.memoryRefreshCallback = callback;
  }

  getCurrentToolCalls(): VSCodeToolCall[] {
    return Array.from(this.currentToolCalls.values());
  }

  onToolCallsUpdate(callback: (tools: VSCodeToolCall[]) => void): () => void {
    this.toolCallUpdateCallbacks.add(callback);

    const currentTools = this.getCurrentToolCalls();
    if (currentTools.length > 0) {
      callback(currentTools);
    }

    return () => {
      this.toolCallUpdateCallbacks.delete(callback);
    };
  }

  getCurrentFlowState(): { isProcessing: boolean; canAbort: boolean; currentMessageId: string | null } {
    return {
      isProcessing: this.isProcessing,
      canAbort: this.canAbortFlow,
      currentMessageId: this.currentProcessingMessageId
    };
  }

  /**
   * 🎯 获取所有可回滚的消息ID列表
   */
  getRollbackableMessageIds(): string[] {
    if (!this.geminiClient) {
      return [];
    }

    const currentHistory = this.geminiClient.getChat().getHistory();
    return currentHistory
      .filter(content => content.prompt_id)
      .map(content => content.prompt_id!)
      .filter((id): id is string => !!id);
  }

  // 🎯 历史记录保存方法 - 触发SessionManager的统一保存
  private async saveSessionHistoryIfAvailable(): Promise<void> {
    this.sessionHistoryManager!.saveCompleteSessionHistory(this.sessionId);
  }

  // 🎯 获取GeminiClient实例（供SessionManager统一保存时使用）
  getGeminiClient(): GeminiClient | undefined {
    return this.geminiClient;
  }

  // 🎯 获取Config实例（供SessionManager进行YOLO模式同步使用）
  getConfig(): Config | undefined {
    return this.config;
  }

  async dispose() {
    this.logger.info('Disposing AIService');

    // 🎯 清理增强的 lint 功能
    if (this.diagnosticsMonitor) {
      this.diagnosticsMonitor.dispose();
      this.diagnosticsMonitor = undefined;
    }

    if (this.smartNotificationService) {
      this.smartNotificationService.dispose();
      this.smartNotificationService = undefined;
    }

    this.geminiClient = undefined;
    this.config = undefined;
    this.coreToolScheduler = undefined;
    this.currentToolCalls.clear();
    this.toolCallUpdateCallbacks.clear();

    // 🎯 清理内存刷新相关状态
    this.processedMemoryTools.clear();
    this.memoryRefreshCallback = undefined;

    this.isInitialized = false;
  }
}
