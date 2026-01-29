/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { PartListUnion } from '@google/genai';
import { Content } from '../types/extendedContent.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { GeminiClient } from '../core/client.js';
import { GeminiChat } from '../core/geminiChat.js';
import { ToolCallRequestInfo } from '../core/turn.js';
import { ToolExecutionEngine, ToolExecutionContext } from '../core/toolExecutionEngine.js';
import { SubAgentAdapter } from '../core/subAgentAdapter.js';
import { SessionManager } from '../services/sessionManager.js';
import { CompressionService } from '../services/compressionService.js';
import { SceneManager, SceneType } from '../core/sceneManager.js';
import { CustomSubAgentConfig } from './types.js';
import { SubAgentResult } from '../core/subAgent.js';
import { t } from '../utils/simpleI18n.js';

/**
 * 自定义 SubAgent 执行上下文
 * Custom SubAgent execution context
 */
export interface CustomSubAgentExecutionContext {
  agentId: string;
  taskDescription: string;
  currentTurn: number;
  maxTurns: number;
  isRunning: boolean;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * 自定义 SubAgent
 * 基于用户配置的系统提示词和工具集执行任务
 * 
 * Custom SubAgent
 * Executes tasks based on user-configured system prompts and tool sets
 */
export class CustomSubAgent {
  private context: CustomSubAgentExecutionContext;
  private executionLog: string[] = [];
  private subAgentChat?: GeminiChat;

  // 核心组件
  private executionEngine: ToolExecutionEngine;
  private adapter: SubAgentAdapter;
  private toolExecutionContext: ToolExecutionContext;

  // Promise resolver for tool completion
  private toolCompletionResolver?: (results: any[]) => void;

  // Pending tool results
  private pendingToolResults: PartListUnion[] = [];

  // Session management
  private sessionManager: SessionManager;
  private sessionId: string;

  // Compression service
  private compressionService: CompressionService;

  // AbortSignal listener cleanup
  private abortListener: (() => void) | null = null;

  constructor(
    private readonly config: Config,
    private readonly toolRegistry: ToolRegistry,
    private readonly geminiClient: GeminiClient,
    private readonly subAgentConfig: CustomSubAgentConfig,
    private readonly updateOutput?: (output: string) => void,
    private readonly abortSignal?: AbortSignal,
  ) {
    this.context = {
      agentId: `subagent-${subAgentConfig.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      taskDescription: '',
      currentTurn: 0,
      maxTurns: subAgentConfig.defaultMaxTurns ?? 50,
      isRunning: false,
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };

    // Initialize Session management
    this.sessionManager = new SessionManager(this.config.getProjectRoot());
    this.sessionId = this.config.getSessionId();

    // Initialize compression service
    this.compressionService = new CompressionService({
      compressionTokenThreshold: 0.8,
      compressionPreserveThreshold: 0.3,
      skipEnvironmentMessages: 2,
    });

    // Create SubAgent execution context
    this.toolExecutionContext = {
      agentId: this.context.agentId,
      agentType: 'sub',
      taskDescription: this.context.taskDescription,
    };

    // Create SubAgent adapter
    this.adapter = new SubAgentAdapter(
      updateOutput,
      (message) => this.executionLog.push(message),
      this.handleToolsComplete.bind(this),
      this.toolRegistry,
    );

    // Create tool execution engine
    this.executionEngine = new ToolExecutionEngine({
      toolRegistry: Promise.resolve(this.toolRegistry),
      adapter: this.adapter,
      config: this.config,
      hookEventHandler: this.config.getHookSystem().getEventHandler(),
      approvalMode: this.config.getApprovalMode(),
      getPreferredEditor: () => undefined,
    });
  }

  /**
   * Check AbortSignal status
   */
  private checkAbortSignal(): void {
    if (this.abortSignal?.aborted) {
      throw new Error('Task cancelled by AbortSignal');
    }
  }

  /**
   * Execute SubAgent task
   */
  async executeTask(
    taskDescription: string,
    maxTurns: number = 50
  ): Promise<SubAgentResult> {
    this.context = {
      ...this.context,
      taskDescription,
      maxTurns,
      currentTurn: 0,
      isRunning: true,
    };

    this.log(`CustomSubAgent [${this.subAgentConfig.name}] started: ${taskDescription}`);
    this.sendStatusChange('starting', { taskDescription });

    // Setup AbortSignal listener
    if (this.abortSignal) {
      const handleAbort = () => {
        console.debug(`[CustomSubAgent] Received AbortSignal, starting cleanup: ${this.context.agentId}`);
        this.context.isRunning = false;
        this.log('CustomSubAgent received cancellation signal, stopping execution');
        this.sendStatusChange('cancelled', { reason: 'abort_signal' });
      };

      this.abortSignal.addEventListener('abort', handleAbort);
      this.abortListener = () => {
        this.abortSignal?.removeEventListener('abort', handleAbort);
      };

      if (this.abortSignal.aborted) {
        handleAbort();
        throw new Error('Task was cancelled before startup');
      }
    }

    try {
      // Initialize chat instance
      await this.initializeSubAgentChat(taskDescription);

      this.log(`CustomSubAgent chat instance initialized, available tools: ${this.getAvailableToolNames().length}`);

      // Main conversation loop
      while (this.context.currentTurn < this.context.maxTurns && this.context.isRunning) {
        const turnResult = await this.executeConversationTurn();

        if (turnResult) {
          return turnResult;
        }
      }

      // Max turns exceeded
      const warning = t('task.timeout.warning', { turns: this.context.currentTurn });
      const creditsNotice = t('task.timeout.credits.notice');
      const summary = `${warning}\n${creditsNotice}`;
      this.log(summary);
      this.sendStatusChange('failed', {
        reason: 'max_turns_exceeded',
        summary,
        turnsUsed: this.context.currentTurn,
      });
      return this.buildErrorResult(new Error(summary));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(t('task.execution.failed', { error: errorMessage }));
      this.sendStatusChange('failed', {
        reason: 'execution_error',
        error: errorMessage,
        turnsUsed: this.context.currentTurn,
      });
      return this.buildErrorResult(error);
    } finally {
      this.context.isRunning = false;

      if (this.abortListener) {
        this.abortListener();
        this.abortListener = null;
      }

      this.pendingToolResults = [];
      this.log(`CustomSubAgent execution ended (final turn: ${this.context.currentTurn})`);
    }
  }

  /**
   * Build system prompt from config
   */
  private buildSystemPrompt(): string {
    const availableTools = this.getAvailableToolNames();
    
    // Start with the custom system prompt
    let systemPrompt = this.subAgentConfig.systemPrompt;

    // Add available tools information
    systemPrompt += `\n\nAvailable Tools: ${availableTools.join(', ')}`;

    return systemPrompt;
  }

  /**
   * Initialize chat instance
   */
  private async initializeSubAgentChat(taskDescription: string): Promise<void> {
    this.subAgentChat = await this.geminiClient.startChat(
      [],
      { type: 'sub', agentId: this.context.agentId, taskDescription }
    );

    (this.subAgentChat as any).generationConfig.systemInstruction = this.buildSystemPrompt();

    const toolDeclarations = this.toolRegistry.getFunctionDeclarations();
    if (toolDeclarations.length > 0) {
      this.subAgentChat.setTools([{ functionDeclarations: toolDeclarations }]);
    }

    this.log('CustomSubAgent chat instance initialization completed');
  }

  /**
   * Execute single conversation turn
   */
  private async executeConversationTurn(): Promise<SubAgentResult | null> {
    this.checkAbortSignal();

    this.context.currentTurn++;
    this.log(`Conversation turn ${this.context.currentTurn}/${this.context.maxTurns}`);

    const aiResponse = await this.callGemini();

    const responseAnalysis = this.analyzeAIResponse(aiResponse);
    this.logAIResponse(responseAnalysis);

    if (!responseAnalysis.hasToolCalls) {
      return this.handleTaskCompletion(responseAnalysis.responseText);
    }

    await this.processAndStorePendingToolResults(aiResponse, responseAnalysis.toolCount);

    await this.tryCompressHistory();

    return null;
  }

  /**
   * Call Gemini AI
   */
  private async callGemini(): Promise<Content> {
    if (!this.subAgentChat) {
      throw new Error('SubAgent chat not initialized');
    }

    this.checkAbortSignal();

    const isFirstTurn = this.context.currentTurn === 1;
    let messageParts: any[] = [];

    if (isFirstTurn) {
      messageParts = [{ text: `Task: ${this.context.taskDescription}\n\nPlease analyze this task and complete it using the available tools.` }];
    } else {
      if (this.pendingToolResults.length > 0) {
        this.pendingToolResults.forEach(result => {
          if (Array.isArray(result)) {
            messageParts.push(...result);
          } else {
            messageParts.push(result);
          }
        });
        this.pendingToolResults = [];
      }
    }

    const timestamp = new Date().toISOString();
    const currentHistory = this.subAgentChat.getHistory();
    const logData = {
      timestamp,
      turn: this.context.currentTurn,
      request: {
        history: currentHistory,
        messageParts
      }
    };

    await this.sessionManager.saveRequestLog(this.sessionId, logData).catch(error => {
      console.warn('[CustomSubAgent] Failed to save request log:', error);
    });

    this.sendStatusChange('running', {
      currentTurn: this.context.currentTurn,
      maxTurns: this.context.maxTurns,
    });

    const response = await this.subAgentChat.sendMessage({
      message: messageParts,
      config: {
        abortSignal: this.abortSignal
      }
    }, this.context.agentId, SceneType.SUB_AGENT);

    // Update token usage
    if (response.usageMetadata) {
      this.context.tokenUsage.inputTokens += response.usageMetadata.promptTokenCount || 0;
      this.context.tokenUsage.outputTokens += response.usageMetadata.candidatesTokenCount || 0;
      this.context.tokenUsage.totalTokens =
        this.context.tokenUsage.inputTokens + this.context.tokenUsage.outputTokens;
    }

    const aiContent: Content = {
      role: 'model',
      parts: response.candidates?.[0]?.content?.parts || [],
    };

    return aiContent;
  }

  /**
   * Analyze AI response
   */
  private analyzeAIResponse(aiResponse: Content): {
    responseText: string;
    hasToolCalls: boolean;
    toolCount: number;
  } {
    const responseText = this.extractTextFromResponse(aiResponse);
    const hasToolCalls = this.hasToolCalls(aiResponse);
    const toolCount = this.countToolCalls(aiResponse);

    return { responseText, hasToolCalls, toolCount };
  }

  /**
   * Log AI response
   */
  private logAIResponse(analysis: { responseText: string; hasToolCalls: boolean }): void {
    const { responseText, hasToolCalls } = analysis;
    const truncatedText = responseText.length > 100
      ? `${responseText.substring(0, 100)}...`
      : responseText;

    this.log(`AI response: ${truncatedText} (${hasToolCalls ? 'with' : 'without'} tool calls)`);
  }

  /**
   * Handle task completion
   */
  private handleTaskCompletion(responseText: string): SubAgentResult {
    this.log('AI did not call any tools, task completed');

    const summary = responseText.trim() || 'Task completed';
    this.sendStatusChange('completing', { summary });

    return this.buildSuccessResult(summary);
  }

  /**
   * Process tool calls and store results
   */
  private async processAndStorePendingToolResults(aiResponse: Content, toolCount: number): Promise<void> {
    this.checkAbortSignal();

    this.log(`Starting execution of ${toolCount} tool calls`);

    const toolCallRequests: ToolCallRequestInfo[] = [];

    aiResponse.parts?.forEach(part => {
      if (part.functionCall && part.functionCall.name) {
        const toolName = part.functionCall.name;
        const toolArgs = part.functionCall.args || {};
        const toolId = part.functionCall.id || `${part.functionCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const toolCallRequest: ToolCallRequestInfo = {
          callId: toolId,
          name: toolName,
          args: toolArgs,
          isClientInitiated: false,
          prompt_id: this.context.agentId,
        };
        toolCallRequests.push(toolCallRequest);

        this.log(`📋 Tool call request: ${toolName}(${toolId})`);
      }
    });

    if (toolCallRequests.length === 0) {
      return;
    }

    try {
      const toolCompletionPromise = new Promise<any[]>((resolve) => {
        this.toolCompletionResolver = resolve;
      });

      this.executionEngine.executeTools(
        toolCallRequests,
        this.toolExecutionContext,
        this.abortSignal!,
      ).catch(error => {
        this.log(`Tool execution engine error: ${error instanceof Error ? error.message : String(error)}`);
      });

      const completedCalls = await toolCompletionPromise;
      this.log(`Received ${completedCalls.length} tool call results via callback`);

      completedCalls.forEach((call: any) => {
        this.pendingToolResults.push(call.response?.responseParts);
      });

      this.checkAbortSignal();

      this.log(`${completedCalls.length} tool calls completed, results stored in pending queue`);
    } catch (error) {
      this.log(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Check if response has tool calls
   */
  private hasToolCalls(response: Content): boolean {
    return response.parts?.some(part => !!part.functionCall) || false;
  }

  /**
   * Count tool calls in response
   */
  private countToolCalls(response: Content): number {
    if (!response.parts) return 0;
    return response.parts.filter(part => !!part.functionCall).length;
  }

  /**
   * Handle tools completion callback
   */
  private handleToolsComplete(completedCalls: any[]): void {
    if (this.toolCompletionResolver) {
      this.toolCompletionResolver(completedCalls);
      this.toolCompletionResolver = undefined;
    }
  }

  /**
   * Get execution stats
   */
  private getExecutionStats(): {
    filesCreated: string[];
    commandsRun: string[];
    executionLog: string[];
  } {
    return {
      filesCreated: this.adapter.getFilesCreated(),
      commandsRun: this.adapter.getCommandsRun(),
      executionLog: this.executionLog,
    };
  }

  /**
   * Extract text from AI response
   */
  private extractTextFromResponse(response: Content): string {
    return (response.parts || [])
      .map(part => part.text || '')
      .filter(text => text.trim().length > 0)
      .join('\n');
  }

  /**
   * Get available tool names
   */
  private getAvailableToolNames(): string[] {
    return this.toolRegistry.getAllTools().map(tool => tool.name);
  }

  /**
   * Build success result
   */
  private buildSuccessResult(summary: string): SubAgentResult {
    const stats = this.getExecutionStats();
    return {
      success: true,
      summary,
      executionLog: stats.executionLog,
      filesCreated: stats.filesCreated,
      commandsRun: stats.commandsRun,
      tokenUsage: this.context.tokenUsage,
    };
  }

  /**
   * Build error result
   */
  private buildErrorResult(error: unknown): SubAgentResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.log(`❌ Execution error: ${errorMessage}`);

    const stats = this.getExecutionStats();
    return {
      success: false,
      summary: `Task execution failed: ${errorMessage}`,
      error: errorMessage,
      executionLog: stats.executionLog,
      filesCreated: stats.filesCreated,
      commandsRun: stats.commandsRun,
      tokenUsage: this.context.tokenUsage,
    };
  }

  /**
   * Send status change notification
   */
  private sendStatusChange(status: string, details?: any): void {
    const statusEvent = {
      type: 'status_change',
      agentId: this.context.agentId,
      subAgentName: this.subAgentConfig.name,
      status,
      currentTurn: this.context.currentTurn,
      maxTurns: this.context.maxTurns,
      taskDescription: this.context.taskDescription,
      timestamp: Date.now(),
      ...details,
    };

    const structuredUpdate = `SUBAGENT_STATUS_CHANGE:${JSON.stringify(statusEvent)}`;
    this.updateOutput?.(structuredUpdate);
  }

  /**
   * Log with timestamp
   */
  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const formattedMessage = `[${timestamp}] ${message}`;
    this.executionLog.push(formattedMessage);
    console.log(`[CustomSubAgent:${this.subAgentConfig.name}] ${formattedMessage}`);
  }

  /**
   * Try to compress history
   */
  private async tryCompressHistory(): Promise<void> {
    if (!this.subAgentChat) {
      return;
    }

    try {
      const currentHistory = this.subAgentChat.getHistory(true);
      const compressionModel = SceneManager.getModelForScene(SceneType.COMPRESSION);
      const historyModel = this.config.getModel();

      const compressionResult = await this.compressionService.tryCompress(
        this.config,
        currentHistory,
        historyModel!,
        compressionModel!,
        this.geminiClient,
        this.context.agentId,
        this.abortSignal!
      );

      if (compressionResult && compressionResult.success && compressionResult.newHistory) {
        this.subAgentChat.setHistory(compressionResult.newHistory);
        this.log(`📦 Conversation history compressed: ${compressionResult.compressionInfo?.originalTokenCount} -> ${compressionResult.compressionInfo?.newTokenCount} tokens`);
      }
    } catch (error) {
      this.log(`⚠️ Conversation history compression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get adapter instance
   */
  getAdapter(): SubAgentAdapter {
    return this.adapter;
  }

  /**
   * Cancel execution
   */
  cancel(): void {
    this.context.isRunning = false;
    console.debug(`[CustomSubAgent] cancel() called: ${this.context.agentId}`);
  }
}
