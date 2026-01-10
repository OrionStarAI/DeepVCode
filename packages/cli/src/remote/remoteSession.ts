/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import WebSocket from 'ws';
import { Config, ToolRegistry, executeToolCall, GeminiClient, ToolCallRequestInfo, SceneType, AuthType, ApprovalMode, GeminiChat, MESSAGE_ROLES, GeminiEventType, ServerGeminiStreamEvent, CoreToolScheduler, ToolCall as EngineToolCall, CompletedToolCall } from 'deepv-code-core';
import { EditorType } from 'deepv-code-core';
import { GenerateContentResponse, FunctionCall, Part } from '@google/genai';
import { Content } from 'deepv-code-core';
import {
  RemoteMessage,
  MessageType,
  MessageFactory,
  CommandMessage,
} from './remoteProtocol.js';
import { parseAndFormatApiError } from '../ui/utils/errorParsing.js';
import { remoteLogger } from './remoteLogger.js';
import { getMCPDiscoveryState, MCPDiscoveryState, getMCPServerStatus, MCPServerStatus } from 'deepv-code-core';
import { t, isChineseLocale } from '../ui/utils/i18n.js';

/**
 * 格式化时间戳为 yyyy-mm-dd HH:mm:ss 格式
 */
function formatTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const MM = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${ss}`;
}

/**
 * UI展示记录接口 - 不同于GeminiChat的对话历史，这是专门为UI展示设计的数据结构
 */
interface UIDisplayRecord {
  id: string;
  timestamp: number;
  type: 'user_input' | 'ai_response' | 'tool_call' | 'status' | 'error';
  content: any;
  status?: 'pending' | 'in_progress' | 'completed' | 'error';
}

/**
 * 远程会话管理类
 * 为每个WebSocket连接维护独立的对话状态和历史记录
 */
export class RemoteSession {
  private geminiClient: GeminiClient | null = null;
  private geminiChat: GeminiChat | null = null; // GeminiChat实例
  private toolRegistry: ToolRegistry | null = null;
  private currentProcessingPromise: Promise<void> | null = null;
  private sessionId: string;
  private isProcessingInterrupted: boolean = false;
  private currentAbortController: AbortController | null = null;

  // UI展示记录存储 - 用于断线重连后恢复UI状态
  private uiDisplayRecords: UIDisplayRecord[] = [];
  private currentAIResponse: UIDisplayRecord | null = null; // 当前正在进行的AI响应

  constructor(
    private ws: WebSocket,
    private config: Config,
    sessionId?: string
  ) {
    this.sessionId = sessionId || `session_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    // 不要在构造函数中获取 geminiClient，等到 initialize() 时再获取
    remoteLogger.info('RemoteSession', `创建新会话: ${this.sessionId}`);
  }

  /**
   * 重新绑定WebSocket连接（用于session恢复）
   */
  rebindWebSocket(ws: WebSocket): void {
    remoteLogger.info('RemoteSession', `重新绑定WebSocket: ${this.sessionId}`);
    this.ws = ws;
  }

  /**
   * 检查session是否已经初始化
   */
  isInitialized(): boolean {
    const initialized = !!(this.geminiChat && this.toolRegistry);

    return initialized;
  }

  /**
   * 初始化会话
   */
  async initialize(): Promise<void> {
    remoteLogger.info('RemoteSession', `开始初始化会话: ${this.sessionId}`);

    try {
      // 初始化配置

      await this.config.initialize();

      // ⭐ 等待MCP discovery完成（云端模式关键修复）
      // 防止MCP工具在WebSocket连接前尝试访问未初始化的资源
      await this.waitForMcpDiscovery();

      // 初始化认证 - 这是关键步骤

      await this.config.refreshAuth(AuthType.USE_PROXY_AUTH);

      // 设置远程模式为YOLO模式 - 自动执行所有工具，不需要确认

      this.config.setApprovalMode(ApprovalMode.YOLO);

      // 获取 GeminiClient（在 config 初始化后）

      this.geminiClient = this.config.getGeminiClient();

      if (!this.geminiClient) {
        throw new Error('无法获取GeminiClient，请检查配置和认证状态');
      }

      // 初始化工具注册表

      this.toolRegistry = await this.config.getToolRegistry();

      // 创建GeminiChat实例，这个实例会保持整个对话历史

      this.geminiChat = await this.geminiClient.getChat();

      remoteLogger.info('RemoteSession', `会话初始化完成: ${this.sessionId}`);
      this.sendMessage(MessageFactory.createStatus('idle', 'DeepV Code 远程会话已就绪'));
    } catch (error) {
      remoteLogger.error('RemoteSession', `会话初始化失败: ${this.sessionId}`, error);
      this.sendError(`会话初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * 等待MCP工具发现完成
   * 这防止了云端模式下的竞态条件，确保MCP服务器在使用前已初始化
   * MCP失败只会警告，不会中断主业务流程
   */
  private async waitForMcpDiscovery(): Promise<void> {
    const startTime = Date.now();
    const timeout = 15000; // 15秒超时，避免无限等待
    const checkInterval = 100; // 每100ms检查一次

    // 获取配置的MCP服务器列表
    const mcpServers = this.config.getMcpServers() || {};
    const serverNames = Object.keys(mcpServers);

    if (serverNames.length === 0) {
      // 没有配置MCP服务器，直接跳过等待
      remoteLogger.info('RemoteSession', '未配置MCP服务器，跳过MCP discovery等待');
      return;
    }

    remoteLogger.info('RemoteSession', `等待MCP discovery完成，服务器列表: ${serverNames.join(', ')}`);

    while (Date.now() - startTime < timeout) {
      const discoveryState = getMCPDiscoveryState();

      // 检查discovery是否已完成
      if (discoveryState === MCPDiscoveryState.COMPLETED) {
        // 检查每个服务器的状态
        const serverStatusList = serverNames.map(name => ({
          name,
          status: getMCPServerStatus(name)
        }));

        const connectedServers = serverStatusList.filter(s => s.status === MCPServerStatus.CONNECTED);
        const failedServers = serverStatusList.filter(s => s.status === MCPServerStatus.DISCONNECTED);

        if (connectedServers.length > 0) {
          remoteLogger.info('RemoteSession', `MCP已连接服务器: ${connectedServers.map(s => s.name).join(', ')}`);
        }

        if (failedServers.length > 0) {
          remoteLogger.warn('RemoteSession', `MCP连接失败的服务器（不影响主流程）: ${failedServers.map(s => s.name).join(', ')}`);
        }

        return;
      }

      // Discovery还在进行中或未开始，继续等待
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // 超时后，记录警告但不抛出异常（允许继续运行）
    remoteLogger.warn('RemoteSession', `MCP discovery超时，继续启动会话`, {
      timeout,
      discoveryState: getMCPDiscoveryState(),
      configuredServers: serverNames
    });
  }

  /**
   * 获取会话ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * 处理命令消息
   */
  async handleCommand(message: CommandMessage): Promise<void> {
    const { command } = message.payload;
    console.log(`[${formatTimestamp()}] ${t('cloud.remote.message.received')}`);
    remoteLogger.info('RemoteSession', `收到指令: ${this.sessionId}`, { command, messageId: message.id });

    // 如果有正在处理的指令，则等待完成
    if (this.currentProcessingPromise) {
      remoteLogger.warn('RemoteSession', `有指令正在执行，拒绝新指令: ${this.sessionId}`);
      this.sendMessage(MessageFactory.createStatus('running', '有指令正在执行中，请等待...'));
      return;
    }

    // 重置中断状态
    this.isProcessingInterrupted = false;

    // 添加用户输入记录

    this.addUIRecord({
      type: 'user_input',
      content: command,
      status: 'completed'
    });

    // 开始处理新指令
    console.log(`[${formatTimestamp()}] ${t('cloud.remote.message.processing')}`);
    remoteLogger.info('RemoteSession', `开始处理指令: ${this.sessionId}`);
    this.currentProcessingPromise = this.processCommand(command);

    try {
      await this.currentProcessingPromise;
      console.log(`[${formatTimestamp()}] ${t('cloud.remote.message.success')}`);
      remoteLogger.info('RemoteSession', `指令处理完成: ${this.sessionId}`);
    } catch (error) {
      console.log(`[${formatTimestamp()}] ${t('cloud.remote.message.failed')}`);
      remoteLogger.error('RemoteSession', `指令处理失败: ${this.sessionId}`, error);
    } finally {
      this.currentProcessingPromise = null;
      this.currentAIResponse = null;
      this.currentAbortController = null;
    }
  }

  /**
   * 处理中断信号 - 统一中断状态管理，确保tool use/result匹配
   */
  handleInterrupt(): void {
    remoteLogger.info('RemoteSession', `收到中断信号: ${this.sessionId}`);

    // 设置中断标志 - 这会在适当的检查点生效，确保已开始的工具能够完成
    this.isProcessingInterrupted = true;

    // 中断当前的AbortController - 但这主要影响Gemini API调用，不影响已开始的工具执行
    if (this.currentAbortController) {

      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    // 更新当前正在进行的AI响应为中断状态
    if (this.currentAIResponse) {
      this.currentAIResponse.status = 'error';
      this.currentAIResponse.content += '\n\n[操作已中断]';

    }

    // 添加中断状态记录
    this.addUIRecord({
      type: 'status',
      content: '指令已中断',
      status: 'completed'
    });

    // 发送中断状态消息
    this.sendMessage(MessageFactory.createStatus('idle', '✅ 指令已中断'));

    remoteLogger.info('RemoteSession', `中断处理完成: ${this.sessionId}`, {
      hasCurrentResponse: !!this.currentAIResponse,
      hasAbortController: !!this.currentAbortController
    });
  }

  /**
   * 处理单个指令 - 使用持久化的GeminiChat实现连续对话
   */
  private async processCommand(input: string): Promise<void> {
    const prompt_id = Math.random().toString(16).slice(2);
    remoteLogger.info('RemoteSession', `processCommand开始: ${this.sessionId}`, { input, prompt_id });

    this.sendMessage(MessageFactory.createStatus('running', '正在处理指令...'));

    // 初始化当前AI响应为null，在每轮开始时创建新的响应记录
    this.currentAIResponse = null;



    try {
      if (!this.geminiChat || !this.toolRegistry) {
        const error = '会话未正确初始化';
        remoteLogger.error('RemoteSession', error, {
          geminiChat: !!this.geminiChat,
          toolRegistry: !!this.toolRegistry
        });
        throw new Error(error);
      }



      const abortController = new AbortController();
      this.currentAbortController = abortController;



      // 多轮对话循环：处理用户输入 → AI响应 → 工具执行 → 结果反馈 → 循环
      let currentInput: any[] = [{ text: input }];
      let turnCount = 0;

      while (true) {
        turnCount++;

        // 检查会话轮次限制
        if (this.config.getMaxSessionTurns() > 0 && turnCount > this.config.getMaxSessionTurns()) {
          this.sendError('达到最大会话轮次，请增加 maxSessionTurns 设置');
          return;
        }

        // 🔧 修复: 为每轮AI响应创建新的记录，避免多轮响应被合并
        this.currentAIResponse = null;


        // 发送当前轮次的消息给AI（可能是初始用户输入或工具执行结果）
        const responseStreamGenerator = this.geminiClient!.sendMessageStream(
          currentInput,
          abortController.signal,
          prompt_id
        );

        // 收集当前轮次的工具调用请求
        const toolCallRequests: any[] = [];
        let hasContent = false;

        // 处理AI响应事件
        for await (const event of responseStreamGenerator) {


          // 检查中断状态
          if (abortController.signal.aborted || this.isProcessingInterrupted) {
            remoteLogger.warn('RemoteSession', `第${turnCount}轮事件处理被中断: ${this.sessionId}`);
            return;
          }

          if (event.type === GeminiEventType.Content) {
            hasContent = true;
            await this.handleContentEvent(event.value, turnCount);
          } else if (event.type === GeminiEventType.ToolCallRequest) {
            toolCallRequests.push(event.value);
          } else {
            await this.handleOtherEvent(event);
          }
        }

        remoteLogger.info('RemoteSession', `第${turnCount}轮处理完成: ${this.sessionId}`, {
          hasContent,
          toolCallsCount: toolCallRequests.length
        });

        // 🔧 修复: 标记当前轮次的AI响应为完成状态
        if (this.currentAIResponse && hasContent) {
          const currentResponse: UIDisplayRecord = this.currentAIResponse; // 明确类型
          currentResponse.status = 'completed';
          remoteLogger.info('RemoteSession', `第${turnCount}轮AI响应完成: ${this.sessionId}`, {
            recordId: currentResponse.id,
            contentLength: currentResponse.content.length
          });
        }

        // 如果没有工具调用，对话结束
        if (toolCallRequests.length === 0) {
          this.sendMessage(MessageFactory.createStatus('idle', '指令执行完成'));
          return;
        }

        // 执行工具调用并收集结果
        const toolResults = await this.executeToolCalls(toolCallRequests, prompt_id, abortController.signal);

        // 如果被中断，退出循环
        if (this.isProcessingInterrupted) {
          remoteLogger.info('RemoteSession', `工具执行被中断，结束对话: ${this.sessionId}`);
          return;
        }

        // 将工具结果作为下一轮的输入
        currentInput = toolResults;
      }
    } catch (error) {
      remoteLogger.error('RemoteSession', `指令处理错误: ${this.sessionId}`, error);

      // 如果是中断操作，静默处理，不发送额外消息
      if (this.isProcessingInterrupted) {
        remoteLogger.info('RemoteSession', `中断期间的错误，静默处理: ${this.sessionId}`);
        return;
      }

      // 更新当前AI响应为错误状态
      if (this.currentAIResponse) {
        const currentResponse: UIDisplayRecord = this.currentAIResponse; // 明确类型
        currentResponse.status = 'error';
        currentResponse.content += '\n\n[执行出错]';
      }

      const parsedError = parseAndFormatApiError(error);
      this.sendError(`指令处理错误: ${parsedError}`);
      // sendError 已经处理中断情况，这里也要检查
      if (!this.isProcessingInterrupted) {
        this.sendMessage(MessageFactory.createStatus('error', '指令执行失败'));
      }
    }
  }

  /**
   * 发送消息到客户端
   */
  sendMessage(message: RemoteMessage): void {


    // 🎯 确保所有消息都包含sessionId，用于云端模式的精确路由
    const messageWithSession: RemoteMessage = {
      ...message,
      sessionId: this.sessionId
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(messageWithSession));

      } catch (error) {
        remoteLogger.error('RemoteSession', `消息发送失败: ${this.sessionId}`, {
          messageId: message.id,
          error
        });
      }
    } else {
      remoteLogger.warn('RemoteSession', `WebSocket未连接，无法发送消息: ${this.sessionId}`, {
        messageId: message.id,
        readyState: this.ws?.readyState ?? 'null'
      });
    }
  }

  /**
   * 发送错误消息 - 中断时不发送冗余消息
   */
  private sendError(error: string): void {
    // 如果是中断状态，不发送错误消息（中断已经有自己的状态消息）
    if (this.isProcessingInterrupted) {
      remoteLogger.info('RemoteSession', `跳过中断期间的错误消息: ${this.sessionId}`);
      return;
    }

    remoteLogger.error('RemoteSession', `发送错误消息: ${this.sessionId}`, { error });
    this.sendMessage(MessageFactory.createError(error));
    // 确保发送idle状态
    this.sendMessage(MessageFactory.createStatus('idle', '操作完成'));
  }

  /**
   * 清理session数据 - 清空对话历史和UI记录，但保持session活跃
   */
  clearSessionData(): void {
    remoteLogger.info('RemoteSession', `清理session数据: ${this.sessionId}`);

    // 清空UI显示记录
    this.uiDisplayRecords = [];
    this.currentAIResponse = null;

    // 清理对话历史
    this.geminiClient?.resetChat();

    // 重置处理中断状态，但不清理currentProcessingPromise（可能仍在处理中）
    this.isProcessingInterrupted = false;
  }

  /**
   * 清理会话资源
   */
  cleanup(): void {
    remoteLogger.info('RemoteSession', `清理会话: ${this.sessionId}`);

    // 清理对话历史（可选）
    if (this.geminiChat) {
      // this.geminiChat.clearHistory(); // 如果需要清理历史记录
    }

    this.currentProcessingPromise = null;
  }

  /**
   * 获取对话历史（用于调试或状态查询）
   */
  getConversationHistory(): Content[] {
    if (!this.geminiChat) {
      return [];
    }

    try {
      return this.geminiChat.getHistory(true); // 获取精选历史记录
    } catch (error) {
      remoteLogger.error('RemoteSession', `获取历史记录失败: ${this.sessionId}`, error);
      return [];
    }
  }

  /**
   * 添加UI展示记录
   */
  private addUIRecord(record: Omit<UIDisplayRecord, 'id' | 'timestamp'>): UIDisplayRecord {
    const fullRecord: UIDisplayRecord = {
      id: `ui_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      timestamp: Date.now(),
      ...record
    };

    this.uiDisplayRecords.push(fullRecord);

    // 保持记录数量在合理范围内（最多保留500条）
    if (this.uiDisplayRecords.length > 500) {
      this.uiDisplayRecords = this.uiDisplayRecords.slice(-500);
    }

    return fullRecord;
  }

  /**
   * 获取UI展示记录 - 区分已完成和正在进行的部分
   */
  getUIDisplayData(): {
    completedRecords: UIDisplayRecord[];
    currentRecord: UIDisplayRecord | null;
    isProcessing: boolean;
  } {
    // 返回所有记录，不仅仅是completed的
    // 这样前端可以恢复完整的对话历史，包括用户输入
    const completedRecords = [...this.uiDisplayRecords];

    return {
      completedRecords,
      currentRecord: this.currentAIResponse,
      isProcessing: this.currentProcessingPromise !== null && !this.isProcessingInterrupted
    };
  }

  /**
   * 获取完整的UI展示记录（用于断线重连时恢复状态）
   */
  getAllUIDisplayRecords(): UIDisplayRecord[] {
    return [...this.uiDisplayRecords];
  }

  /**
   * 处理除content和tool_call_request之外的其他事件
   */
  private async handleOtherEvent(event: ServerGeminiStreamEvent): Promise<void> {
    switch (event.type) {
      case GeminiEventType.ToolCallResponse:
        // 工具调用响应 - 记录到UI

        break;

      case GeminiEventType.ChatCompressed:
        // 对话压缩通知
        remoteLogger.info('RemoteSession', `对话已自动压缩: ${this.sessionId}`, event.value);
        break;

      case GeminiEventType.MaxSessionTurns:
        // 达到最大会话轮次
        this.sendError('达到最大会话轮次，请增加 maxSessionTurns 设置');
        break;

      case GeminiEventType.LoopDetected:
        // 检测到循环
        const loopType = (event as any).value;
        let loopMessage = '';

        switch (loopType) {
          case 'consecutive_identical_tool_calls':
            loopMessage = `${t('loop.consecutive.tool.calls.title')}\n${t('loop.consecutive.tool.calls.description')}\n${t('loop.consecutive.tool.calls.action')}`;
            break;
          case 'chanting_identical_sentences':
            loopMessage = `${t('loop.chanting.identical.sentences.title')}\n${t('loop.chanting.identical.sentences.description')}\n${t('loop.chanting.identical.sentences.action')}`;
            break;
          case 'llm_detected_loop':
            loopMessage = `${t('loop.llm.detected.title')}\n${t('loop.llm.detected.description')}\n${t('loop.llm.detected.action')}`;
            break;
          default:
            loopMessage = isChineseLocale()
              ? '检测到重复循环，对话已停止'
              : 'Repetitive loop detected, conversation stopped';
        }

        remoteLogger.warn('RemoteSession', `检测到对话循环: ${this.sessionId} (type: ${loopType || 'unknown'})`);
        this.sendMessage(MessageFactory.createStatus('idle', loopMessage));
        break;

      case GeminiEventType.Thought:
        // AI思考过程 - 可以选择是否显示

        break;

      case GeminiEventType.UserCancelled:
        // 用户取消
        remoteLogger.info('RemoteSession', `用户取消操作: ${this.sessionId}`);
        break;

      case GeminiEventType.Error:
        // 错误事件
        remoteLogger.error('RemoteSession', `收到错误事件: ${this.sessionId}`, event.value);
        this.sendError(`AI处理错误: ${event.value.error.message || '未知错误'}`);
        break;

      case GeminiEventType.Finished:
        // 对话完成
        remoteLogger.info('RemoteSession', `对话完成: ${this.sessionId}`);
        break;

      case GeminiEventType.TokenUsage:
        // Token使用统计

        break;

      default:
        // 未知事件类型
        remoteLogger.warn('RemoteSession', `未处理的事件类型: ${event.type}`, { sessionId: this.sessionId });
        break;
    }
  }

  /**
   * 执行工具调用并返回结果，供下一轮对话使用
   * 使用CoreToolScheduler进行标准化的工具执行管理
   */
  private async executeToolCalls(
    toolCallRequests: ToolCallRequestInfo[],
    prompt_id: string,
    abortSignal: AbortSignal
  ): Promise<Part[]> {
    remoteLogger.info('RemoteSession', `开始使用CoreToolScheduler执行工具: ${this.sessionId}`, {
      toolCount: toolCallRequests.length,
      tools: toolCallRequests.map((req: ToolCallRequestInfo) => req.name)
    });

    // 收集工具执行结果
    const toolResults: Part[] = [];
    let allToolsCompleted = false;

    // 为本次执行创建专用的CoreToolScheduler实例
    const toolScheduler = new CoreToolScheduler({
      toolRegistry: Promise.resolve(this.toolRegistry!),
      approvalMode: this.config.getApprovalMode(),
      outputUpdateHandler: (callId: string, outputChunk: string) => {
        // 处理工具输出流更新 - 使用工具状态消息
        const tool = this.toolRegistry?.getTool('unknown') || { displayName: 'Unknown Tool' };
        this.sendMessage(MessageFactory.createToolStatus(
          tool.displayName,
          callId,
          'running',
          outputChunk.substring(0, 200) + (outputChunk.length > 200 ? '...' : '') // 截断长输出
        ));
      },
      onAllToolCallsComplete: (completedToolCalls: CompletedToolCall[]) => {
        // 发送工具执行完成消息并收集结果
        for (const toolCall of completedToolCalls) {
          const toolName = 'tool' in toolCall ? toolCall.tool.displayName || toolCall.tool.name : toolCall.request.name;
          const duration = toolCall.durationMs || 0;

          // 获取简化的工具描述
          let toolDescription = '';
          if ('tool' in toolCall) {
            const fullDescription = toolCall.tool.getDescription(toolCall.request.args);
            // 截断过长的描述，移除换行符，确保单行显示
            const maxDescLength = 80;
            toolDescription = fullDescription
              .replace(/\n/g, ' ') // 替换换行符为空格
              .trim();
            if (toolDescription.length > maxDescLength) {
              toolDescription = toolDescription.slice(0, maxDescLength) + '...';
            }
          }

          if (toolCall.status === 'success' && toolCall.response.responseParts) {
            // 发送成功完成消息
            const resultText = typeof toolCall.response.resultDisplay === 'string'
              ? toolCall.response.resultDisplay
              : toolCall.response.resultDisplay
                ? JSON.stringify(toolCall.response.resultDisplay)
                : 'Tool executed successfully';

            this.sendMessage(MessageFactory.createToolCall(
              toolName,
              toolCall.request.callId,
              toolCall.request.args,
              true, // success
              resultText,
              undefined, // no error
              duration,
              toolDescription
            ));

            // 发送工具完成状态
            this.sendMessage(MessageFactory.createToolStatus(
              toolName,
              toolCall.request.callId,
              'completed',
              `执行完成: ${toolName}`
            ));

            // 添加工具调用UI记录
            this.addUIRecord({
              type: 'tool_call',
              content: {
                toolName,
                toolDescription,
                callId: toolCall.request.callId,
                args: toolCall.request.args,
                success: true,
                result: resultText,
                duration
              },
              status: 'completed'
            });

            // 收集结果转换为Part格式
            const responseParts = toolCall.response.responseParts;
            if (Array.isArray(responseParts)) {
              // 转换每个PartUnion为Part
              for (const part of responseParts) {
                if (typeof part === 'string') {
                  toolResults.push({ text: part });
                } else {
                  toolResults.push(part);
                }
              }
            } else {
              // 单个PartUnion转换为Part
              if (typeof responseParts === 'string') {
                toolResults.push({ text: responseParts });
              } else {
                toolResults.push(responseParts);
              }
            }
          } else if (toolCall.status === 'error' || toolCall.status === 'cancelled') {
            // 处理错误或取消的工具
            const errorMessage = toolCall.status === 'cancelled'
              ? 'User Canceled'
              : (toolCall.status === 'error'
                  ? toolCall.response.error?.message || 'Tool execution failed'
                  : 'Tool execution failed');

            // 发送错误完成消息
            this.sendMessage(MessageFactory.createToolCall(
              toolName,
              toolCall.request.callId,
              toolCall.request.args,
              false, // not success
              undefined, // no result
              errorMessage,
              duration,
              toolDescription
            ));

            // 发送工具错误状态
            this.sendMessage(MessageFactory.createToolStatus(
              toolName,
              toolCall.request.callId,
              'error',
              `执行失败: ${errorMessage}`
            ));

            // 添加错误UI记录
            this.addUIRecord({
              type: 'tool_call',
              content: {
                toolName,
                toolDescription,
                callId: toolCall.request.callId,
                args: toolCall.request.args,
                success: false,
                error: errorMessage,
                duration
              },
              status: 'error'
            });

            // 为错误或取消的工具创建错误响应
            toolResults.push({
              functionResponse: {
                id: toolCall.request.callId,
                response: {
                  output: `Error: ${errorMessage}`
                },
              },
            });
          }
        }

        remoteLogger.info('RemoteSession', `所有工具执行完成: ${this.sessionId}`, {
          completedCount: completedToolCalls.length
        });

        allToolsCompleted = true;
      },
      onToolCallsUpdate: (toolCalls: EngineToolCall[]) => {
        // 工具状态更新回调
        // remoteLogger.info('RemoteSession', `工具状态更新: ${this.sessionId}`, {
        //   toolCount: toolCalls.length,
        //   statuses: toolCalls.map(tc => {
        //     const toolName = 'tool' in tc ? tc.tool.name : tc.request.name;
        //     return `${toolName}:${tc.status}`;
        //   })
        // });
      },
      onPreToolExecution: async (toolCallInfo) => {
        // 工具执行前的预处理
        const toolDisplayName = toolCallInfo.tool.displayName || toolCallInfo.tool.name;
        this.sendMessage(MessageFactory.createToolStatus(
          toolDisplayName,
          toolCallInfo.callId,
          'starting',
          `开始执行工具: ${toolDisplayName}`
        ));
      },
      getPreferredEditor: () => 'vscode' as EditorType, // 远程会话默认使用VSCode
      config: this.config,
      hookEventHandler: this.config.getHookSystem().getEventHandler()
    });

    // 使用专用调度器执行工具
    await toolScheduler.schedule(toolCallRequests, abortSignal);

    // 等待所有工具完成
    while (!allToolsCompleted && !this.isProcessingInterrupted && !abortSignal.aborted) {
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms轮询
    }

    remoteLogger.info('RemoteSession', `CoreToolScheduler工具执行完成: ${this.sessionId}`, {
      toolCount: toolCallRequests.length,
      resultCount: toolResults.length,
      interrupted: this.isProcessingInterrupted
    });

    return toolResults;
  }

  /**
   * 处理AI文本响应事件
   */
  private async handleContentEvent(content: string, turnCount?: number): Promise<void> {
    if (!content) return;



    // 🔧 修复: 为每轮AI响应创建独立的记录，避免多轮响应被合并
    if (!this.currentAIResponse) {
      this.currentAIResponse = this.addUIRecord({
        type: 'ai_response',
        content: '',
        status: 'in_progress'
      });

      // 记录当前是第几轮对话，用于调试
      if (turnCount) {
        remoteLogger.info('RemoteSession', `创建新的AI响应记录 - 第${turnCount}轮: ${this.sessionId}`, {
          recordId: this.currentAIResponse.id
        });
      }
    }

    if (this.currentAIResponse) {
      this.currentAIResponse.content += content;
    }

    // 发送实时响应到前端
    this.sendMessage(MessageFactory.createOutput(content, false, 'stdout'));
  }


}