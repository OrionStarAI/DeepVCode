/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentConfig,
  Part,
  PartListUnion,
  Content,
  Tool,
  GenerateContentResponse,
} from '@google/genai';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { detectTerminalEnvironment, formatTerminalInfo } from '../utils/terminalDetection.js';
import { getNodeProcessTreeAsync, formatNodeProcessInfo } from '../utils/nodeProcessDetection.js';
import {
  Turn,
  ServerGeminiStreamEvent,
  GeminiEventType,
  ChatCompressionInfo,
  ModelSwitchResult,
} from './turn.js';
import { Config } from '../config/config.js';
import { UserTierId } from '../code_assist/types.js';
import { AgentContext } from '../telemetry/types.js';
import { getCoreSystemPrompt } from './prompts.js';
import { SceneType, SceneManager } from './sceneManager.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import { getErrorMessage } from '../utils/errors.js';
import { tokenLimit } from './tokenLimits.js';
import {
  ContentGenerator,
  ContentGeneratorConfig,
  createContentGenerator,
} from './contentGenerator.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { MESSAGE_ROLES } from '../config/messageRoles.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';
import { CompressionService } from '../services/compressionService.js';
import { ideContext } from '../ide/ideContext.js';
import { logFlashDecidedToContinue } from '../telemetry/loggers.js';
import { FlashDecidedToContinueEvent, LoopType } from '../telemetry/types.js';
import { logger } from '../utils/enhancedLogger.js';

import { DeepVServerAdapter } from './DeepVServerAdapter.js';

function isThinkingSupported(model: string) {
  // ✅ 服务端内部决定模型 - 客户端总是尝试启用thinking
  // 如果服务端选择的模型不支持，会被忽略，不会出错
  return true; // 让服务端处理thinking支持判断
}

// callGeminiEmbeddingAPI 函数已移除 - 功能未被使用且已从服务端清理

/**
 * Returns the index of the content after the fraction of the total characters in the history.
 *
 * Exported for testing purposes.
 */
// 移除 findIndexAfterFraction，现在使用 CompressionService 中的版本

export class GeminiClient {
  private chat?: GeminiChat;
  private contentGenerator?: ContentGenerator;
  private embeddingModel: string;
  private generateContentConfig: GenerateContentConfig = {
    temperature: 0,
    topP: 1,
  };
  private sessionTurnCount = 0;
  private readonly MAX_TURNS = 100;

  private readonly loopDetector: LoopDetectionService;
  private readonly compressionService: CompressionService;
  private lastPromptId?: string;
  private isCompressing: boolean = false; // 压缩互斥锁，防止重入

  // 上次请求的Token使用量
  private sessionTokenCount: number = 0; //
  private compressionThreshold: number = 0.8; // 动态压缩阈值
  private readonly emergencyStopThreshold: number = 0.9; // 🚨 紧急制动阈值：90%
  private needsCompression: boolean = false; // 是否需要在下次对话前压缩

  constructor(private config: Config) {
    if (config.getProxy()) {
      setGlobalDispatcher(new ProxyAgent(config.getProxy() as string));
    }

    this.embeddingModel = config.getEmbeddingModel();
    this.loopDetector = new LoopDetectionService(config);

    //const compressionTokenThreshold = 0.8;
    this.compressionService = new CompressionService({
      compressionTokenThreshold: this.compressionThreshold,
      compressionPreserveThreshold: 0.3,
      skipEnvironmentMessages: 2, // 跳过环境信息和确认消息
    });

    // 初始化智能压缩阈值（使用与CompressionService相同的逻辑）
    //this.compressionThreshold = compressionTokenThreshold * tokenLimit(this.config.getModel(), this.config);
  }

  async initialize(contentGeneratorConfig: ContentGeneratorConfig) {
    // 🪝 触发 SessionStart 钩子
    try {
      const { SessionStartSource } = await import('../hooks/types.js');
      await this.config.getHookSystem()
        .getEventHandler()
        .fireSessionStartEvent(SessionStartSource.Startup);
    } catch (hookError) {
      logger.warn(`[GeminiClient] SessionStart hook execution failed: ${hookError}`);
    }

    this.contentGenerator = await createContentGenerator(
      contentGeneratorConfig,
      this.config,
      this.config.getSessionId(),
    );
    this.chat = await this.startChat();
  }

  /**
   * 结束会话并触发 SessionEnd 钩子
   */
  async endSession(reason: string = 'user_exit'): Promise<void> {
    try {
      const { SessionEndReason } = await import('../hooks/types.js');
      // 映射字符串原因为枚举
      let endReason = SessionEndReason.Exit;
      if (reason === 'error') endReason = SessionEndReason.Other;
      if (reason === 'timeout') endReason = SessionEndReason.Other;

      await this.config.getHookSystem()
        .getEventHandler()
        .fireSessionEndEvent(endReason);
    } catch (hookError) {
      logger.warn(`[GeminiClient] SessionEnd hook execution failed: ${hookError}`);
    }
  }

  getContentGenerator(): ContentGenerator {
    if (!this.contentGenerator) {
      throw new Error('Content generator not initialized');
    }
    return this.contentGenerator;
  }

  /**
   * 获取通用内容生成器
   * DeepVServerAdapter 支持所有模型：Claude模型进行参数转换，Gemini模型直接转发
   */
  private async getContentGeneratorForModel(model: string): Promise<ContentGenerator> {
    // 创建通用适配器，支持Claude和Gemini模型
    const { hasAvailableProxyServer, getActiveProxyServerUrl } = await import('../config/proxyConfig.js');

    if (!hasAvailableProxyServer()) {
      throw new Error('DeepX Code server required for all models but is not available');
    }

    const proxyServerUrl = getActiveProxyServerUrl();
    // NOTE: googleCloudLocation and googleCloudProject are legacy parameters, no longer used after switching to proxy-based architecture
    const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || 'default-project';

    return new DeepVServerAdapter(googleCloudLocation, googleCloudProject, proxyServerUrl, this.config);
  }

  /**
   * 创建临时的 GeminiChat 实例用于单次内容生成
   * 提供完整的API日志、Token统计、错误处理等功能
   *
   * @param scene 使用场景，用于选择合适的模型
   * @param model 可选的特定模型，会覆盖场景推荐的模型
   * @param agentContext 代理上下文，用于区分不同的调用来源
   * @returns 临时 GeminiChat 实例
   */
  async createTemporaryChat(
    scene: SceneType,
    model?: string,
    agentContext: AgentContext = { type: 'sub', agentId: SceneManager.getSceneDisplayName(scene) }
  ): Promise<GeminiChat> {
    const sceneModel = SceneManager.getModelForScene(scene);
    const modelToUse = model || sceneModel || this.config.getModel();

    // 选择合适的内容生成器
    const contentGenerator = await this.getContentGeneratorForModel(modelToUse);

    // 创建简化的生成配置
    const userMemory = this.config.getUserMemory();
    const systemInstruction = getCoreSystemPrompt(userMemory);

    const isThinking = isThinkingSupported(modelToUse);
    const generateContentConfig = isThinking
      ? {
          ...this.generateContentConfig,
          thinkingConfig: {
            includeThoughts: false,
          },
        }
      : this.generateContentConfig;

    return new GeminiChat(
      this.config,
      contentGenerator,
      {
        systemInstruction,
        ...generateContentConfig,
        // 无需工具声明，临时chat主要用于简单内容生成
      },
      [], // 空历史，临时使用
      agentContext,
      modelToUse // 传入确定的模型，避免被config覆盖
    );
  }

  getUserTier(): UserTierId | undefined {
    return this.contentGenerator?.userTier;
  }

  async addHistory(content: Content) {
    this.getChat().addHistory(content);
  }

  getChat(): GeminiChat {
    if (!this.chat) {
      throw new Error('Chat not initialized');
    }
    return this.chat;
  }

  /**
   * 检查是否正在进行压缩操作
   * @returns 如果正在压缩返回true，否则返回false
   */
  isCompressionInProgress(): boolean {
    return this.isCompressing;
  }

  /**
   * 处理响应后的token更新和压缩决策
   * @param inputTokens 输入token数量
   * @param outputTokens 输出token数量
   */
  private updateTokenCountAndCheckCompression(inputTokens: number, outputTokens: number): void {
    this.sessionTokenCount = inputTokens + outputTokens;

    let compressionTokenThreshold = this.compressionThreshold * tokenLimit(this.config.getModel(), this.config);
    // 检查是否超过压缩阈值
    if (this.sessionTokenCount >= compressionTokenThreshold) {
      this.needsCompression = true;
      logger.info(`[GeminiClient] Token threshold reached: ${this.sessionTokenCount} >= ${this.compressionThreshold}, scheduling compression for next conversation`);
    }
  }

  // 切换模型的话，需要再次检测压缩阈值
  private checkCompression(): void {
    if (!this.needsCompression) {
      let compressionTokenThreshold = this.compressionThreshold * tokenLimit(this.config.getModel(), this.config);
      if (this.sessionTokenCount >= compressionTokenThreshold) {
        this.needsCompression = true;
        logger.info(`[GeminiClient] Token threshold reached: ${this.sessionTokenCount} >= ${this.compressionThreshold}, scheduling compression for next conversation`);
      }
    }
  }

  /**
   * 重置压缩标记（在压缩完成后调用）
   */
  private resetCompressionFlag(): void {
    this.needsCompression = false;
    // 压缩后重置token计数器，因为历史已经被压缩
    this.sessionTokenCount = 0;
  }

  /**
   * 等待压缩完成
   * @param abortSignal 用于取消等待的信号
   * @param maxWaitMs 最大等待时间（毫秒）
   */
  private async waitForCompressionComplete(abortSignal?: AbortSignal): Promise<void> {
    if (!this.isCompressing) {
      return; // 没有在压缩，直接返回
    }
    const pollInterval = 100; // 100ms 轮询间隔

    while (this.isCompressing) {
      // 检查是否被取消
      if (abortSignal?.aborted) {
        break;
      }
      // 等待一小段时间后再检查
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  isInitialized(): boolean {
    return this.chat !== undefined && this.contentGenerator !== undefined;
  }

  getHistory(): Content[] {
    return this.getChat().getHistory();
  }

  setHistory(history: Content[]) {
    this.getChat().setHistory(history);
  }

  async setTools(): Promise<void> {
    const toolRegistry = await this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    this.getChat().setTools(tools);
  }

  async resetChat(): Promise<void> {
    this.resetCompressionFlag();
    this.chat = await this.startChat();
  }

  private async getEnvironment(): Promise<Part[]> {
    const cwd = this.config.getWorkingDir();
    const today = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // 异步检测环境，不阻塞初始化
    let environmentInfo = '';
    let nodeProcessInfo = '';
    try {
      // 使用 setTimeout 让环境检测异步进行，避免阻塞UI
      const terminalInfo = await new Promise<any>((resolve) => {
        setTimeout(() => {
          try {
            const result = detectTerminalEnvironment();
            resolve(result);
          } catch (error) {
            console.warn('[Environment Detection] 检测失败，使用基础信息:', error);
            resolve({
              platform: process.platform,
              shell: 'Unknown',
              terminal: 'Unknown'
            });
          }
        }, 0);
      });
      environmentInfo = formatTerminalInfo(terminalInfo);

      // 检测VSCode环境，决定是否跳过进程检测
      const isVSCodeEnvironment = this.config.getVsCodePluginMode();

      // 检测Node.js进程树信息 - 使用新的异步检测方法（带超时保护）
      // 在VSCode插件环境中，跳过复杂的进程检测以避免CLI自杀风险
      const nodeProcesses = await Promise.race([
        getNodeProcessTreeAsync(isVSCodeEnvironment), // 传递VSCode环境参数
        new Promise<any[]>((_, reject) =>
          setTimeout(() => reject(new Error('Process detection timeout')), 5000)
        )
      ]).catch((error) => {
        console.warn('[Process Detection] 异步检测超时或失败，使用同步回退:', error);
        return [{
          pid: process.pid,
          ppid: process.ppid || 0,
          name: 'node',
          commandLine: process.argv.join(' ')
        }];
      });

      nodeProcessInfo = await Promise.race([
        formatNodeProcessInfo(nodeProcesses),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Format timeout')), 2000)
        )
      ]).catch((error) => {
        console.warn('[Process Info Format] 格式化超时，使用基础信息:', error);
        return `Current process PID: ${process.pid} (Node.js CLI - do not kill)`;
      });
    } catch (error) {
      console.warn('[Environment Detection] 环境信息获取失败:', error);
      environmentInfo = `My operating system: ${process.platform}`;
      nodeProcessInfo = `Current process PID: ${process.pid} (Node.js CLI - do not kill)`;
    }

    // 优化：使用更简洁的项目结构信息，避免初始上下文过大
    const folderStructure = await getFolderStructure(cwd, {
      fileService: this.config.getFileService(),
      fileIncludePattern: /\.(ts|js|tsx|jsx|json|md|py|go|rs|java|cpp|c|h|yml|yaml|toml)$/i, // 只显示重要文件类型
    });

    const context = `
🚀 **CRITICAL SYSTEM CONTEXT - DeepV Code AI Assistant** 🚀
This is the DeepV Code CLI with enhanced environment awareness.
**Date:** ${today}
**Platform:** ${environmentInfo}
**🎯 CRITICAL: Always use ${process.platform}-appropriate commands!**
**Working Directory:** ${cwd}
${nodeProcessInfo}

**📁 PROJECT STRUCTURE:**
${folderStructure}

**🛠️ AVAILABLE TOOLS:**
Use Glob and ReadFile tools to explore specific files during our conversation.

**🔒 SAFETY REMINDERS:**
- Respect the process hierarchy shown above
- Always explain potentially destructive commands before execution
- Consider cross-platform compatibility in all suggestions
          `.trim();

    const initialParts: Part[] = [{ text: context }];
    const toolRegistry = await this.config.getToolRegistry();

    // 🚀 智能FullContext功能：使用优化后的ReadManyFilesTool
    if (this.config.getFullContext()) {
      try {
        const readManyFilesTool = toolRegistry.getTool('read_many_files');
        if (readManyFilesTool) {
          console.log('🔍 Loading full context with intelligent content management...');

          // 使用智能ReadManyFilesTool读取项目文件
          const result = await readManyFilesTool.execute({
            paths: ['**/*'], // 读取所有文件
            useDefaultExcludes: true, // 使用默认排除规则
            exclude: [
              // 额外排除一些可能很大的文件类型
              '**/*.log',
              '**/*.tmp',
              '**/*.lock',
              '**/package-lock.json',
              '**/yarn.lock',
              '**/pnpm-lock.yaml',
            ]
          }, AbortSignal.timeout(30000));

          if (result.llmContent && Array.isArray(result.llmContent) && result.llmContent.length > 0) {
            // 计算内容大小来验证我们的限制机制是否生效
            const contentSize = JSON.stringify(result.llmContent).length;
            console.log(`📊 Full context loaded: ${Math.round(contentSize / 1024)}KB (with intelligent limits applied)`);

            initialParts.push({
              text: `\n--- 🚀 Full Project Context (Intelligently Managed) ---\n${result.llmContent}`,
            });
          } else {
            console.warn('⚠️ Full context requested, but read_many_files returned no content.');
            initialParts.push({
              text: '\n--- ℹ️ Full context requested but no files found ---',
            });
          }
        } else {
          console.warn('⚠️ Full context requested, but read_many_files tool not available.');
          initialParts.push({
            text: '\n--- ⚠️ Full context unavailable: read_many_files tool not found ---',
          });
        }
      } catch (error) {
        console.error('❌ Error loading full context:', error);
        initialParts.push({
          text: '\n--- ❌ Error loading full context: Content limits may have been exceeded ---',
        });
      }
    }

    return initialParts;
  }

  async startChat(extraHistory?: Content[], agentContext?: AgentContext): Promise<GeminiChat> {
    const envParts = await this.getEnvironment();
    const toolRegistry = await this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    const history: Content[] = [
      {
        role: MESSAGE_ROLES.USER,
        parts: envParts,
      },
      {
        role: MESSAGE_ROLES.MODEL,
        parts: [{ text: 'Got it. Thanks for the context!' }],
      },
      ...(extraHistory ?? []),
    ];
    try {
      const userMemory = this.config.getUserMemory();

      // 检查是否为VSCode环境
      const isVSCode = this.config.getVsCodePluginMode();

      // 使用新的getCoreSystemPrompt，根据环境调整内容
      const systemInstruction = getCoreSystemPrompt(userMemory, isVSCode);

      const generateContentConfigWithThinking = isThinkingSupported(
        this.config.getModel(),
      )
        ? {
            ...this.generateContentConfig,
            thinkingConfig: {
              includeThoughts: false,
            },
          }
        : this.generateContentConfig;
      return new GeminiChat(
        this.config,
        this.getContentGenerator(),
        {
          systemInstruction,
          ...generateContentConfigWithThinking,
          tools,
        },
        history,
        agentContext || { type: 'main' }, // 默认为主会话
        this.config.getModel() // 主会话使用配置的默认模型
      );
    } catch (error) {
      await reportError(
        error,
        'Error initializing Gemini chat session.',
        history,
        'startChat',
      );
      throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
    }
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    turns: number = this.MAX_TURNS,
    originalModel?: string,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    // 🪝 触发 BeforeAgent 钩子
    try {
      const beforeAgentResult = await this.config.getHookSystem()
        .getEventHandler()
        .fireBeforeAgentEvent(JSON.stringify(request));

      // 检查钩子是否阻止执行
      if (beforeAgentResult?.finalOutput?.shouldStopExecution?.()) {
        yield {
          type: GeminiEventType.Error,
          value: {
            error: {
              message: `Agent execution blocked by BeforeAgent hook`
            }
          }
        } as any;
        return new Turn(this.getChat(), prompt_id, this.config.getModel(), this.config);
      }
    } catch (hookError) {
      logger.warn(`[GeminiClient] BeforeAgent hook execution failed: ${hookError}`);
    }

    if (this.lastPromptId !== prompt_id) {
      this.loopDetector.reset(prompt_id);
      this.lastPromptId = prompt_id;
    }
    this.sessionTurnCount++;
    if (
      this.config.getMaxSessionTurns() > 0 &&
      this.sessionTurnCount > this.config.getMaxSessionTurns()
    ) {
      yield { type: GeminiEventType.MaxSessionTurns };
      return new Turn(this.getChat(), prompt_id, this.config.getModel(), this.config);
    }
    // Ensure turns never exceeds MAX_TURNS to prevent infinite loops
    const boundedTurns = Math.min(turns, this.MAX_TURNS);
    if (!boundedTurns) {
      return new Turn(this.getChat(), prompt_id, this.config.getModel());
    }

    // Track the original model from the first call to detect model switching
    const initialModel = originalModel || this.config.getModel();

    // 🔧 检查并补全未完成的 function call
    //this.handleIncompleteFunctionCall(request);

    // 如果正在压缩，等待压缩完成以确保数据一致性
    if (this.isCompressing) {
      console.log('[sendMessageStream] Waiting for ongoing compression to complete...');
      await this.waitForCompressionComplete(signal);
      console.log('[sendMessageStream] Compression wait completed, proceeding');
    }


    this.checkCompression();
    // 基于响应的智能压缩：检查是否需要在本次对话前进行压缩
    // 只有当 needsCompression 标记为 true 时才尝试压缩，否则不触发压缩流程和 PreCompress 钩子
    if (this.needsCompression) {
      console.log('[sendMessageStream] Token threshold exceeded, performing compression before new conversation');
      const compressed = await this.tryCompressChat(prompt_id, signal, true); // 强制压缩
      if (compressed) {
        yield { type: GeminiEventType.ChatCompressed, value: compressed };
        this.resetCompressionFlag(); // 压缩完成后重置标记
      } else {
        console.warn('[sendMessageStream] Failed to perform scheduled compression');
      }
    }

    // 检查request是否包含function response，如果包含则跳过IDE上下文信息
    const requestParts = Array.isArray(request) ? request : [request];
    const hasFunctionResponse = requestParts.some(part => {
      if (typeof part === 'string') return false;
      return !!part.functionResponse;
    });

    if (this.config.getIdeMode() && !hasFunctionResponse) {
      const openFiles = ideContext.getOpenFilesContext();
      if (openFiles) {
        const contextParts: string[] = [];
        if (openFiles.activeFile) {
          contextParts.push(
            `This is the file that the user was most recently looking at:\n- Path: ${openFiles.activeFile}`,
          );
          if (openFiles.cursor) {
            contextParts.push(
              `This is the cursor position in the file:\n- Cursor Position: Line ${openFiles.cursor.line}, Character ${openFiles.cursor.character}`,
            );
          }
          if (openFiles.selectedText) {
            contextParts.push(
              `This is the selected text in the active file:\n- ${openFiles.selectedText}`,
            );
          }
        }

        if (openFiles.recentOpenFiles && openFiles.recentOpenFiles.length > 0) {
          const recentFiles = openFiles.recentOpenFiles
            .map((file) => `- ${file.filePath}`)
            .join('\n');
          contextParts.push(
            `Here are files the user has recently opened, with the most recent at the top:\n${recentFiles}`,
          );
        }

        if (contextParts.length > 0) {
          request = [
            { text: contextParts.join('\n') },
            ...(Array.isArray(request) ? request : [request]),
          ];
        }
      }
    }

    const turn = new Turn(this.getChat(), prompt_id, this.config.getModel());

    const loopDetected = await this.loopDetector.turnStarted(signal);
    if (loopDetected) {
      const loopType = this.loopDetector.getDetectedLoopType();
      yield { type: GeminiEventType.LoopDetected, value: loopType ? loopType.toString() : undefined };
      // Add feedback to chat history so AI understands why it was stopped
      this.addLoopDetectionFeedbackToHistory(loopType);
      return turn;
    }

    const resultStream = turn.run(request, signal);
    for await (const event of resultStream) {
      if (this.loopDetector.addAndCheck(event)) {
        const loopType = this.loopDetector.getDetectedLoopType();
        yield { type: GeminiEventType.LoopDetected, value: loopType ? loopType.toString() : undefined };
        // Add feedback to chat history so AI understands why it was stopped
        this.addLoopDetectionFeedbackToHistory(loopType);
        return turn;
      }

      // 处理TokenUsage事件，累积token计数并判断是否需要下次压缩
      if (event.type === GeminiEventType.TokenUsage) {
        const tokenInfo = event.value;
        this.updateTokenCountAndCheckCompression(
          tokenInfo.inputTokens,
          tokenInfo.outputTokens
        );

        // 继续传递事件给上层处理
        yield event;
      } else {
        yield event;
      }
    }
    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      // Check if model was switched during the call (likely due to quota error)
      const currentModel = this.config.getModel();
      if (currentModel !== initialModel) {
        // Model was switched (likely due to quota error fallback)
        // Don't continue with recursive call to prevent unwanted Flash execution
        return turn;
      }

      const nextSpeakerCheck = await checkNextSpeaker(
        this.getChat(),
        this,
        signal,
      );
      if (nextSpeakerCheck?.next_speaker === 'model') {
        logFlashDecidedToContinue(
          this.config,
          new FlashDecidedToContinueEvent(prompt_id),
        );
        const nextRequest = [{ text: 'Please continue.' }];
        // This recursive call's events will be yielded out, and the final
        // turn object will be from the recursive call.
        return yield* this.sendMessageStream(
          nextRequest,
          signal,
          prompt_id,
          boundedTurns - 1,
          initialModel,
        );
      }
    }

    // 🪝 触发 AfterAgent 钩子 - 在每个 turn 完成后执行（按照原版逻辑）
    try {
      const responses = turn.getDebugResponses();
      const lastResponse = responses.length > 0 ? responses[responses.length - 1] : {};

      await this.config.getHookSystem()
        .getEventHandler()
        .fireAfterAgentEvent(
          JSON.stringify(request),
          JSON.stringify(lastResponse),
          false
        );
    } catch (hookError) {
      logger.warn(`[GeminiClient] AfterAgent hook execution failed: ${hookError}`);
    }

    return turn;
  }

  // generateEmbedding 方法已移除 - 功能未被使用且已从服务端清理

  async tryCompressChat(
    prompt_id: string,
    abortSignal: AbortSignal,
    force: boolean = false,
  ): Promise<ChatCompressionInfo | null> {
    // 检查压缩锁，防止重入
    if (this.isCompressing) {
      console.warn('[tryCompressChat] Compression already in progress, skipping');
      return null;
    }

    // 设置压缩锁
    this.isCompressing = true;

    try {
      // 🪝 触发 PreCompress 钩子
      try {
        const { PreCompressTrigger } = await import('../hooks/types.js');
        await this.config.getHookSystem()
          .getEventHandler()
          .firePreCompressEvent(
            force ? PreCompressTrigger.Manual : PreCompressTrigger.Auto
          );
      } catch (hookError) {
        logger.warn(`[GeminiClient] PreCompress hook execution failed: ${hookError}`);
      }

      const curatedHistory = this.getChat().getHistory(true);
      let compressionModel = SceneManager.getModelForScene(SceneType.COMPRESSION);

      // 🚀 Dynamic Model Upgrade: If current token count exceeds Flash's limit (~1M),
      // upgrade to x-ai/grok-4.1-fast to ensure compression succeeds.
      // Using 900,000 as a safe threshold to allow buffer for output and overhead.
      if (this.sessionTokenCount > 900000) {
        console.log(`[tryCompressChat] Token count (${this.sessionTokenCount}) exceeds Flash limit. Upgrading compression model to x-ai/grok-4.1-fast.`);
        compressionModel = 'x-ai/grok-4.1-fast';
      }

      const historyModel = this.config.getModel(); // history实际使用的模型，用于测算长度

      // 使用压缩服务
      const compressionResult = await this.compressionService.tryCompress(
        this.config,
        curatedHistory,
        historyModel!,
        compressionModel!,
        this, // 传递 GeminiClient 实例而不是 ContentGenerator
        prompt_id,
        abortSignal,
        force
      );

      if (!compressionResult || !compressionResult.success) {
        if (compressionResult?.error) {
          console.warn(`[GeminiClient] Compression failed: ${compressionResult.error}`);
        }
        return null;
      }

      // 应用压缩结果：直接设置新的历史记录
      if (compressionResult.newHistory) {
        this.getChat().setHistory(compressionResult.newHistory);
        console.log('[tryCompressChat] Compression applied successfully');
      }

      return compressionResult.compressionInfo || null;
    } finally {
      // 确保异常情况下也能释放锁
      this.isCompressing = false;
    }
  }

  /**
   * 切换模型并确保上下文安全
   *
   * 此方法在切换模型前检查当前历史是否适应新模型的上下文限制。
   * 如果超出限制，会尝试进行激进压缩。
   *
   * @param newModel 目标模型名称
   * @param abortSignal 中止信号
   * @param knownTokenCount 可选的已知token数量（由调用方提供，避免重新计算）
   * @returns 切换结果，包含成功状态和压缩信息
   */
  async switchModel(newModel: string, abortSignal: AbortSignal, knownTokenCount?: number): Promise<ModelSwitchResult> {
    if (this.isCompressing) {
      console.warn('[switchModel] Compression in progress, cannot switch model now.');
      return {
        success: false,
        modelName: newModel,
        error: 'Compression in progress, cannot switch model now.'
      };
    }

    const currentModel = this.config.getModel();
    if (currentModel === newModel) {
      return { success: true, modelName: newModel };
    }

    console.log(`[switchModel] Attempting to switch from ${currentModel} to ${newModel}...`);

    // 设置压缩锁
    this.isCompressing = true;

    try {
      const curatedHistory = this.getChat().getHistory(true);
      let compressionModel = SceneManager.getModelForScene(SceneType.COMPRESSION);

      // 🚀 Dynamic Model Upgrade: If current token count exceeds Flash's limit (~1M),
      // upgrade to x-ai/grok-4.1-fast to ensure compression succeeds.
      // Using 900,000 as a safe threshold to allow buffer for output and overhead.
      // We use sessionTokenCount as a proxy, or we could recount if needed.
      if (this.sessionTokenCount > 900000) {
        console.log(`[switchModel] Token count (${this.sessionTokenCount}) exceeds Flash limit. Upgrading compression model to x-ai/grok-4.1-fast.`);
        compressionModel = 'x-ai/grok-4.1-fast';
      }

      // 尝试压缩以适应新模型
      const compressionResult = await this.compressionService.compressToFit(
        this.config,
        curatedHistory,
        currentModel,
        newModel,
        compressionModel!,
        this,
        `switch-model-${Date.now()}`,
        abortSignal,
        knownTokenCount
      );

      const modelSwitchResult: ModelSwitchResult = {
        success: true,
        modelName: newModel
      };

      console.log(`[switchModel] compressionResult:`, {
        success: compressionResult?.success,
        hasSkipReason: !!compressionResult?.skipReason,
        hasCompressionInfo: !!compressionResult?.compressionInfo,
        hasNewHistory: !!compressionResult?.newHistory,
        hasError: !!compressionResult?.error
      });

      if (compressionResult.skipReason) {
        // 不需要压缩，显示原因
        console.log(`[switchModel] ${compressionResult.skipReason}`);
        modelSwitchResult.compressionSkipReason = compressionResult.skipReason;
      } else if (compressionResult.success && compressionResult.newHistory) {
        // 压缩成功
        this.getChat().setHistory(compressionResult.newHistory);
        if (compressionResult.compressionInfo) {
          console.log(
            `[switchModel] History compressed to fit new model: ` +
            `${compressionResult.compressionInfo.originalTokenCount} → ` +
            `${compressionResult.compressionInfo.newTokenCount} tokens`
          );
          modelSwitchResult.compressionInfo = compressionResult.compressionInfo;
        } else {
          console.log('[switchModel] History compressed to fit new model.');
        }
      } else {
        console.warn(`[switchModel] Compression failed: ${compressionResult.error}`);
        modelSwitchResult.success = false;
        modelSwitchResult.error = compressionResult.error;
        // 压缩失败，阻止切换
        this.isCompressing = false;
        return modelSwitchResult;
      }

      // 更新配置和Chat
      this.config.setModel(newModel);
      this.getChat().setSpecifiedModel(newModel);

      // 重置压缩标记，因为上下文可能已经改变
      this.resetCompressionFlag();

      console.log(`[switchModel] Successfully switched to ${newModel}`);
      return modelSwitchResult;

    } catch (error) {
      console.error('[switchModel] Error during model switch:', error);
      return {
        success: false,
        modelName: newModel,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.isCompressing = false;
    }
  }

  /**
   * 循环检测触发时，向历史中添加给 AI 的反馈信息
   * 这样 AI 能理解为什么被中止，以及应该如何改进
   */
  private addLoopDetectionFeedbackToHistory(loopType: LoopType | null): void {
    let feedbackMessage = '';

    switch (loopType) {
      case LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS:
        feedbackMessage = `🔴 LOOP DETECTED: You were repeatedly calling the same tool, which wastes context and API quota.

⚠️ Why this happened:
• You may be stuck in the same approach
• The current direction is not productive
• Missing or unclear task context

✅ What to do next:
1. Review the task: Was the original request clear enough?
2. Take a different approach: Try exploring from a different angle
3. Ask for clarification: Request more specific guidance or context
4. Example: Instead of reading many files, focus on specific files mentioned in the error or task

💡 Tips:
• Break complex tasks into smaller, focused subtasks
• Be explicit about what you're trying to achieve
• When stuck, ask for hints or a different approach`;
        break;

      case LoopType.CHANTING_IDENTICAL_SENTENCES:
        feedbackMessage = `🔴 LOOP DETECTED: You were repeatedly generating the same text, which indicates being stuck.

⚠️ Why this happened:
• The model may be stuck on a specific pattern or thought
• Unable to progress beyond a certain point
• May need external guidance to break the pattern

✅ What to do next:
1. Acknowledge the issue: Understand what went wrong
2. Take a fresh approach: Try a completely different angle
3. Ask for help: Request guidance on how to proceed differently
4. Example: If stuck explaining something, ask to try a different explanation method`;
        break;

      case LoopType.LLM_DETECTED_LOOP:
        feedbackMessage = `🔴 LOOP DETECTED: The AI analysis detected that you're not making meaningful progress.

⚠️ Why this happened:
• The current approach is not advancing the task
• May be exploring unproductive paths
• Need to refocus on the core objective

✅ What to do next:
1. Clarify the goal: Restate what needs to be accomplished
2. Provide constraints: Give clear boundaries or requirements
3. Break it down: Divide into smaller, achievable steps
4. Change direction: Try a fundamentally different approach`;
        break;

      default:
        feedbackMessage = `🔴 LOOP DETECTED: The conversation entered a repetitive loop without making progress.

✅ What to do next:
• Provide more specific guidance or constraints
• Clarify what you're trying to achieve
• Try a different approach to the problem
• Start fresh with /session new if needed`;
    }

    // 添加到历史记录中，标记为用户消息
    this.getChat().addHistory({
      role: MESSAGE_ROLES.USER,
      parts: [{ text: feedbackMessage }],
    });
  }

  /**
   * 当达到 90% Token 限制时，向历史记录添加反馈
   */
  private addContextLimitFeedbackToHistory(): void {
    const feedbackMessage = `🛑 EMERGENCY STOP: Context limit reached (90%).

⚠️ Execution has been paused to prevent context overflow.
The system will now compress the conversation history to free up space.

✅ What happens next:
1. The context will be compressed automatically.
2. You can continue your task with the compressed history.
3. Please summarize your current progress and next steps after compression.`;

    this.getChat().addHistory({
      role: MESSAGE_ROLES.USER,
      parts: [{ text: feedbackMessage }],
    });
  }

}
