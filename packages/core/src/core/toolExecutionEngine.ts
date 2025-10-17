/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolConfirmationOutcome,
  Tool,
  ToolCallConfirmationDetails,
  ToolResult,
  ToolExecutionServices,
  ToolRegistry,
  ApprovalMode,
  EditorType,
  Config,
  logToolCall,
  ToolCallEvent,
  ToolConfirmationPayload,
} from '../index.js';
import { PartListUnion } from '@google/genai';
import { convertToFunctionResponse } from './coreToolScheduler.js';
import {
  ToolSchedulerAdapter,
  ToolExecutionContext,
} from './toolSchedulerAdapter.js';

// Re-export ToolExecutionContext for convenience
export { ToolExecutionContext } from './toolSchedulerAdapter.js';
import {
  isModifiableTool,
  ModifyContext,
  modifyWithEditor,
} from '../tools/modifiable-tool.js';

/**
 * 工具调用的 Agent 上下文信息
 * 用于区分和管理主Agent和SubAgent的工具调用
 */
export interface ToolCallAgentContext {
  agentId: string;
  agentType: 'main' | 'sub';
  parentAgentId?: string;    // SubAgent 指向创建它的主Agent
  taskDescription?: string;  // SubAgent 的任务描述
}

/**
 * 工具调用状态类型 - 从 coreToolScheduler 中复制
 */
export type ValidatingToolCall = {
  status: 'validating';
  request: ToolCallRequestInfo;
  tool: Tool;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  agentContext: ToolCallAgentContext;
  subToolCalls?: EngineToolCall[];
};

export type ScheduledToolCall = {
  status: 'scheduled';
  request: ToolCallRequestInfo;
  tool: Tool;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  agentContext: ToolCallAgentContext;
  subToolCalls?: EngineToolCall[];
};

export type ErroredToolCall = {
  status: 'error';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  durationMs?: number;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  agentContext: ToolCallAgentContext;
  subToolCalls?: EngineToolCall[];
};

export type SuccessfulToolCall = {
  status: 'success';
  request: ToolCallRequestInfo;
  tool: Tool;
  response: ToolCallResponseInfo;
  durationMs?: number;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  agentContext: ToolCallAgentContext;
  subToolCalls?: EngineToolCall[];
};

export type ExecutingToolCall = {
  status: 'executing';
  request: ToolCallRequestInfo;
  tool: Tool;
  liveOutput?: string | object;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  agentContext: ToolCallAgentContext;
  subToolCalls?: EngineToolCall[];
};

export type CancelledToolCall = {
  status: 'cancelled';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  tool: Tool;
  durationMs?: number;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  agentContext: ToolCallAgentContext;
  subToolCalls?: EngineToolCall[];
};

export type WaitingToolCall = {
  status: 'awaiting_approval';
  request: ToolCallRequestInfo;
  tool: Tool;
  confirmationDetails: ToolCallConfirmationDetails;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  agentContext: ToolCallAgentContext;
  subToolCalls?: EngineToolCall[];
};

export type Status = EngineToolCall['status'];

export type EngineToolCall =
  | ValidatingToolCall
  | ScheduledToolCall
  | ErroredToolCall
  | SuccessfulToolCall
  | ExecutingToolCall
  | CancelledToolCall
  | WaitingToolCall;

export type CompletedEngineToolCall =
  | SuccessfulToolCall
  | CancelledToolCall
  | ErroredToolCall;

/**
 * 执行中确认请求接口
 * 用于工具在执行过程中请求用户确认
 */
export interface RuntimeConfirmationRequest {
  details: ToolCallConfirmationDetails;
  context: ToolExecutionContext;
  resolve: (outcome: ToolConfirmationOutcome) => void;
  reject: (error: Error) => void;
}

/**
 * 工具执行引擎配置选项
 */
interface ToolExecutionEngineOptions {
  toolRegistry: Promise<ToolRegistry>;
  adapter: ToolSchedulerAdapter;
  config: Config;
  approvalMode?: ApprovalMode;
  getPreferredEditor: () => EditorType | undefined;
}

/**
 * 错误响应创建函数 - 从 coreToolScheduler 复制
 */
const createErrorResponse = (
  request: ToolCallRequestInfo,
  error: Error,
): ToolCallResponseInfo => ({
  callId: request.callId,
  error,
  responseParts: {
    functionResponse: {
      id: request.callId,
      name: request.name,
      response: { error: error.message },
    },
  },
  resultDisplay: error.message,
});

/**
 * 工具执行引擎 - 纯粹的工具调度逻辑，与UI完全解耦
 * 
 * 这个类包含从CoreToolScheduler中提取的所有核心调度逻辑，
 * 但通过ToolSchedulerAdapter接口与UI交互，实现完全解耦。
 */
export class ToolExecutionEngine {
  // ✅ 唯一的状态源
  private toolCalls: EngineToolCall[] = [];
  
  private toolRegistry: Promise<ToolRegistry>;
  private adapter: ToolSchedulerAdapter;
  private approvalMode: ApprovalMode;
  private config: Config;
  private getPreferredEditor: () => EditorType | undefined;
  
  // 用于 Promise 驱动的完成检测，避免轮询竞态条件
  private completionResolvers: Array<(calls: CompletedEngineToolCall[]) => void> = [];

  constructor(options: ToolExecutionEngineOptions) {
    this.config = options.config;
    this.toolRegistry = options.toolRegistry;
    this.adapter = options.adapter;
    this.approvalMode = options.approvalMode ?? ApprovalMode.DEFAULT;
    this.getPreferredEditor = options.getPreferredEditor;
  }

  /**
   * 🎯 获取当前工具调用状态（只读访问）
   */
  getToolCalls(): readonly EngineToolCall[] {
    return [...this.toolCalls];
  }

  /**
   * 🎯 获取确认优先级
   */
  private getConfirmationPriority(toolCall: EngineToolCall): number {
    if (toolCall.agentContext.agentType === 'sub') return 1;  // SubAgent 最高优先级
    return 2;  // MainAgent
  }
  
  /**
   * 🎯 获取当前应该显示的确认（按优先级排序）
   */
  getActiveConfirmation(): WaitingToolCall | null {
    const confirmingCalls = this.toolCalls.filter(tc => 
      tc.status === 'awaiting_approval'
    ) as WaitingToolCall[];
    
    if (confirmingCalls.length === 0) return null;
    
    return confirmingCalls.sort((a, b) => 
      this.getConfirmationPriority(a) - this.getConfirmationPriority(b)
    )[0];
  }

  /**
   * 🎯 统一确认处理 - 不再区分runtime vs 工具前确认
   * 内置确认逻辑，通过适配器统一处理
   */
  // async requestConfirmation(
  //   type: 'tool_execution' | 'runtime',
  //   details: ToolCallConfirmationDetails,
  //   context: ToolExecutionContext,
  // ): Promise<ToolConfirmationOutcome> {
  //   // 🎯 为runtime confirmation创建临时工具调用状态
  //   const runtimeCallId = 'runtime-' + Date.now();
  //   const modifiedDetails: ToolCallConfirmationDetails = {
  //     ...details,
  //     title: type === 'runtime' 
  //       ? `🔄 执行中确认: ${details.title || details.type}`
  //       : details.title,
  //   };

  //   // 创建Promise等待确认结果
  //   return new Promise<ToolConfirmationOutcome>((resolve, reject) => {
  //     const wrappedDetails: ToolCallConfirmationDetails = {
  //       ...modifiedDetails,
  //       onConfirm: async (outcome: ToolConfirmationOutcome, payload?: any) => {
  //         try {
  //           // 调用原始确认逻辑
  //           await details.onConfirm(outcome, payload);
            
  //           // 从工具调用列表中移除临时运行时确认调用
  //           this.toolCalls = this.toolCalls.filter(call => call.request.callId !== runtimeCallId);
  //           this.adapter.onToolCallsUpdate([...this.toolCalls], context);
            
  //           resolve(outcome);
  //         } catch (error) {
  //           // 清理临时调用
  //           this.toolCalls = this.toolCalls.filter(call => call.request.callId !== runtimeCallId);
  //           this.adapter.onToolCallsUpdate([...this.toolCalls], context);
  //           reject(error instanceof Error ? error : new Error(String(error)));
  //         }
  //       },
  //     };

  //     // 🎯 创建临时工具调用来显示运行时确认
  //     const temporaryToolCall: EngineToolCall = {
  //       status: 'awaiting_approval',
  //       request: {
  //         callId: runtimeCallId,
  //         name: 'runtime_confirmation',
  //         args: { confirmation_type: details.type },
  //         isClientInitiated: false,
  //         prompt_id: context.agentId,
  //       },
  //       tool: {
  //         name: 'runtime_confirmation',
  //         displayName: '执行中确认',
  //         schema: { name: 'runtime_confirmation', parameters: { type: 'object', properties: {} } },
  //         execute: async () => ({ llmContent: 'confirmed' }),
  //       } as any,
  //       confirmationDetails: wrappedDetails,
  //       startTime: Date.now(),
  //       agentContext: {
  //         agentId: context.agentId,
  //         agentType: context.agentType,
  //         parentAgentId: context.agentType === 'sub' ? 'main-agent' : undefined,
  //         taskDescription: context.taskDescription,
  //       },
  //     } as any;

  //     // 添加到工具调用列表并通知外界
  //     this.toolCalls.push(temporaryToolCall);
  //     this.adapter.onToolCallsUpdate([...this.toolCalls], context);
  //   });
  // }

  /**
   * 🎯 创建子Agent状态更新回调
   * 当子Agent的工具状态发生变化时，将子工具调用存储到父工具的 subToolCalls 属性中
   */
  private createStatusUpdateCallback(parentContext: ToolExecutionContext, parentCallId: string) {
    return (subAgentToolCalls: any[], subContext: any) => {
      // 找到父工具调用
      const parentToolIndex = this.toolCalls.findIndex(call => 
        call.request.callId === parentCallId
      );
      
      if (parentToolIndex >= 0) {
        // 🎯 直接把子工具调用存到父工具的 subToolCalls 属性
        this.toolCalls[parentToolIndex] = {
          ...this.toolCalls[parentToolIndex],
          subToolCalls: subAgentToolCalls.map(subCall => ({
            ...subCall,
            agentContext: {
              ...subCall.agentContext,
              parentAgentId: parentCallId,
            }
          }))
        };
        
        // 通知UI更新（传递嵌套结构）
        this.adapter.onToolCallsUpdate([...this.toolCalls], parentContext);
      }
    };
  }

  /**
   * 检查是否有工具正在运行
   */
  private isRunning(): boolean {
    return this.toolCalls.some(
      (call) =>
        call.status === 'executing' || call.status === 'awaiting_approval',
    );
  }

  /**
   * 设置工具调用状态 - 核心状态管理逻辑
   */
  private setStatusInternal(
    targetCallId: string,
    status: 'success',
    response: ToolCallResponseInfo,
    context?: ToolExecutionContext,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'awaiting_approval',
    confirmationDetails: ToolCallConfirmationDetails,
    context?: ToolExecutionContext,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'error',
    response: ToolCallResponseInfo,
    context?: ToolExecutionContext,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'cancelled',
    reason: string,
    context?: ToolExecutionContext,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'executing' | 'scheduled' | 'validating',
    auxiliaryData?: undefined,
    context?: ToolExecutionContext,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    newStatus: Status,
    auxiliaryData?: unknown,
    context?: ToolExecutionContext,
  ): void {
    const originalCall = this.toolCalls.find(
      (call) => call.request.callId === targetCallId,
    );

    if (!originalCall) {
      console.warn(
        `setStatusInternal: Cannot find tool call with ID ${targetCallId}`,
      );
      return;
    }

    // 根据状态类型更新工具调用对象
    let updatedCall: EngineToolCall;

    switch (newStatus) {
      case 'success':
        updatedCall = {
          ...originalCall,
          status: 'success',
          response: auxiliaryData as ToolCallResponseInfo,
          durationMs: originalCall.startTime
            ? Date.now() - originalCall.startTime
            : undefined,
        } as SuccessfulToolCall;
        break;

      case 'error':
        updatedCall = {
          ...originalCall,
          status: 'error',
          response: auxiliaryData as ToolCallResponseInfo,
          durationMs: originalCall.startTime
            ? Date.now() - originalCall.startTime
            : undefined,
        } as ErroredToolCall;
        break;

      case 'awaiting_approval':
        updatedCall = {
          ...originalCall,
          status: 'awaiting_approval',
          confirmationDetails: auxiliaryData as ToolCallConfirmationDetails,
        } as WaitingToolCall;
        break;

      case 'cancelled':
        const reason = auxiliaryData as string;
        updatedCall = {
          ...originalCall,
          status: 'cancelled',
          response: createErrorResponse(
            originalCall.request,
            new Error(reason),
          ),
          durationMs: originalCall.startTime
            ? Date.now() - originalCall.startTime
            : undefined,
        } as CancelledToolCall;
        break;

      default:
        updatedCall = {
          ...originalCall,
          status: newStatus,
        } as EngineToolCall;
        break;
    }

    // 更新工具调用数组
    this.toolCalls = this.toolCalls.map((call) =>
      call.request.callId === targetCallId ? updatedCall : call,
    );

    // 通知适配器状态变化
    const execContext = context || {
      agentId: 'unknown',
      agentType: 'main' as const,
    };
    this.adapter.onToolStatusChanged(
      targetCallId,
      newStatus,
      updatedCall,
      execContext,
    );

    // 通知工具调用更新
    this.adapter.onToolCallsUpdate([...this.toolCalls], execContext);

    // 检查并通知完成
    this.checkAndNotifyCompletion(execContext);
  }

  /**
   * 检查并通知所有工具完成
   */
  private checkAndNotifyCompletion(context: ToolExecutionContext): void {
    const allCallsAreTerminal = this.toolCalls.every(
      (call) =>
        call.status === 'success' ||
        call.status === 'error' ||
        call.status === 'cancelled',
    );

    if (this.toolCalls.length > 0 && allCallsAreTerminal) {
      const completedCalls = [...this.toolCalls] as CompletedEngineToolCall[];
      
      // 通知等待的 Promise resolvers
      const resolversToCall = [...this.completionResolvers];
      this.completionResolvers = [];
      
      // 记录工具调用日志
      for (const call of completedCalls) {
        logToolCall(this.config, new ToolCallEvent(call));
      }

      // 通知适配器所有工具完成
      this.adapter.onAllToolsComplete(completedCalls, context);
      
      // 通知所有等待的resolvers
      resolversToCall.forEach((resolve) => {
        resolve(completedCalls);
      });
      
      // 清空工具调用数组
      this.toolCalls = [];
      this.adapter.onToolCallsUpdate([...this.toolCalls], context);
    }
  }

  /**
   * 调度工具执行 - 核心调度方法
   */
  async executeTools(
    requests: ToolCallRequestInfo[],
    context: ToolExecutionContext,
    signal: AbortSignal,
  ): Promise<CompletedEngineToolCall[]> {
    if (this.isRunning()) {
      throw new Error(
        'Cannot schedule new tool calls while other tool calls are actively running (executing or awaiting approval).',
      );
    }

    const toolRegistry = await this.toolRegistry;

    // 创建新的工具调用对象
    const newToolCalls: EngineToolCall[] = requests.map(
      (reqInfo): EngineToolCall => {
        const toolInstance = toolRegistry.getTool(reqInfo.name);
        const agentContext: ToolCallAgentContext = {
          agentId: context.agentId,
          agentType: context.agentType,
          parentAgentId: context.agentType === 'sub' ? 'main-agent' : undefined,
          taskDescription: context.taskDescription,
        };
        
        if (!toolInstance) {
          return {
            status: 'error',
            request: reqInfo,
            response: createErrorResponse(
              reqInfo,
              new Error(`Tool "${reqInfo.name}" not found in registry.`),
            ),
            durationMs: 0,
            agentContext,
          };
        }
        return {
          status: 'validating',
          request: reqInfo,
          tool: toolInstance,
          startTime: Date.now(),
          agentContext,
        };
      },
    );

    this.toolCalls = this.toolCalls.concat(newToolCalls);
    this.adapter.onToolCallsUpdate([...this.toolCalls], context);

    // 验证和调度每个工具调用
    for (const toolCall of newToolCalls) {
      if (toolCall.status !== 'validating') {
        continue;
      }

      const { request: reqInfo, tool: toolInstance } = toolCall;
      try {
        if (this.config.getApprovalMode() === ApprovalMode.YOLO) {
          this.setStatusInternal(reqInfo.callId, 'scheduled', undefined, context);
        } else {
          const confirmationDetails = await toolInstance.shouldConfirmExecute(
            reqInfo.args,
            signal,
          );

          if (!confirmationDetails) {
            this.setStatusInternal(reqInfo.callId, 'scheduled', undefined, context);
          } else {
            // 🎯 保存原始onConfirm以避免递归
            const originalOnConfirm = confirmationDetails.onConfirm;

            // 🎯 统一确认流程：包装onConfirm，保存原始函数引用
            const wrappedConfirmationDetails: ToolCallConfirmationDetails = {
              ...confirmationDetails,
              // 🔑 将原始onConfirm保存为私有属性，避免递归
              originalOnConfirm,
              onConfirm: (
                outcome: ToolConfirmationOutcome,
                payload?: ToolConfirmationPayload,
              ) =>
                this.handleConfirmationResponse(
                  reqInfo.callId,
                  outcome,
                  payload,
                  signal,
                ),
            } as ToolCallConfirmationDetails & { originalOnConfirm: typeof originalOnConfirm };

            // 🎯 统一设置awaiting_approval状态，通过onToolCallsUpdate通知外界
            // Adapter层会在onToolCallsUpdate中检测到awaiting_approval状态并处理确认逻辑
            this.setStatusInternal(
              reqInfo.callId,
              'awaiting_approval',
              wrappedConfirmationDetails,
              context,
            );
          }
        }
      } catch (error) {
        this.setStatusInternal(
          reqInfo.callId,
          'error',
          createErrorResponse(
            reqInfo,
            error instanceof Error ? error : new Error(String(error)),
          ),
          context,
        );
      }
    }

    // 如果没有工具调用，直接返回空数组
    if (newToolCalls.length === 0) {
      return [];
    }

    // 🎯 修复竞态条件：先创建 Promise 并添加 resolver，再启动工具执行
    const completionPromise = new Promise<CompletedEngineToolCall[]>((resolve) => {
      this.completionResolvers.push(resolve);
    });

    // 尝试执行已调度的工具
    await this.attemptExecutionOfScheduledCalls(signal, context);

    // 等待工具完成通知
    return completionPromise;
  }

  /**
   * 🎯 外部确认响应处理接口（供CoreToolScheduler等调用）
   */
  async handleConfirmationResponse(
    callId: string,
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
    signal?: AbortSignal,
  ): Promise<void> {
    const toolCall = this.toolCalls.find(
      (c) => c.request.callId === callId && c.status === 'awaiting_approval',
    );

    if (!toolCall || toolCall.status !== 'awaiting_approval') return;

    const waitingCall = toolCall as WaitingToolCall;
    
    // 🎯 调用原始确认逻辑，避免递归
    const confirmationDetails = waitingCall.confirmationDetails as any;
    if (confirmationDetails.originalOnConfirm) {
      // 主Agent：调用保存的原始onConfirm
      await confirmationDetails.originalOnConfirm(outcome, payload);
    } else {
      // SubAgent：调用当前的onConfirm（这是包装后的）
      await waitingCall.confirmationDetails.onConfirm(outcome, payload);
    }
    
    // 🎯 更新工具调用状态
    this.toolCalls = this.toolCalls.map((call) => {
      if (call.request.callId !== callId) return call;
      return { ...call, outcome };
    });

    // 确定执行上下文
    const execContext: ToolExecutionContext = {
      agentId: 'main',
      agentType: 'main' as const,
    };

    if (outcome === ToolConfirmationOutcome.Cancel || signal?.aborted) {
      this.setStatusInternal(callId, 'cancelled', 'User cancelled', execContext);
    } else if (outcome === ToolConfirmationOutcome.ProceedAlwaysProject) {
      // 处理"本项目始终允许"选项：启用YOLO模式并保存到项目配置
      this.config.setApprovalModeWithProjectSync(ApprovalMode.YOLO, true);
      this.setStatusInternal(callId, 'scheduled', undefined, execContext);
      await this.attemptExecutionOfScheduledCalls(signal || new AbortController().signal, execContext);
    } else if (outcome === ToolConfirmationOutcome.ModifyWithEditor) {
      if (isModifiableTool(waitingCall.tool)) {
        const modifyContext = waitingCall.tool.getModifyContext(signal || new AbortController().signal);
        const editorType = this.getPreferredEditor();
        if (!editorType) {
          return;
        }

        this.setStatusInternal(
          callId,
          'awaiting_approval',
          {
            ...waitingCall.confirmationDetails,
            isModifying: true,
          } as ToolCallConfirmationDetails,
          execContext,
        );

        const { updatedParams } = await modifyWithEditor<
          typeof waitingCall.request.args
        >(
          waitingCall.request.args,
          modifyContext as ModifyContext<typeof waitingCall.request.args>,
          editorType,
          signal || new AbortController().signal,
        );

        // 更新参数并调度执行
        this.toolCalls = this.toolCalls.map((call) => {
          if (call.request.callId !== callId) return call;
          return {
            ...call,
            request: {
              ...call.request,
              args: updatedParams,
            },
          };
        });

        this.setStatusInternal(callId, 'scheduled', undefined, execContext);
        await this.attemptExecutionOfScheduledCalls(signal || new AbortController().signal, execContext);
      }
    } else {
      this.setStatusInternal(callId, 'scheduled', undefined, execContext);
      await this.attemptExecutionOfScheduledCalls(signal || new AbortController().signal, execContext);
    }
  }

  /**
   * 尝试执行已调度的工具调用
   */
  private async attemptExecutionOfScheduledCalls(
    signal: AbortSignal,
    context: ToolExecutionContext,
  ): Promise<void> {
    const callsToExecute = this.toolCalls.filter(
      (call) => call.status === 'scheduled',
    ) as ScheduledToolCall[];

    if (callsToExecute.length === 0) {
      return;
    }

    // 执行预处理钩子
    for (const toolCall of callsToExecute) {
      await this.adapter.onPreToolExecution(
        toolCall.request.callId,
        toolCall.tool,
        toolCall.request.args,
        context,
      );
    }

    // 并行执行所有工具
    callsToExecute.forEach(async (toolCall) => {
      const { request: reqInfo, tool: toolInstance } = toolCall;

      try {
        this.setStatusInternal(reqInfo.callId, 'executing', undefined, context);

        // 创建工具执行服务对象
        const services: ToolExecutionServices = {
          getExecutionContext: () => ({
            agentId: context.agentId,
            agentType: context.agentType,
            taskDescription: context.taskDescription,
          }),
          statusUpdateCallback: this.createStatusUpdateCallback(context, reqInfo.callId),
          
          onPreToolExecution: async (toolCall: {
            callId: string;
            tool: Tool;
            args: Record<string, unknown>;
          }) => {
            await this.adapter.onPreToolExecution(toolCall.callId, toolCall.tool, toolCall.args, context);
          },
        };

        const toolResult: ToolResult = await toolInstance.execute(
          reqInfo.args,
          signal,
          (output: string) => {
            // 通过适配器更新输出
            this.adapter.onOutputUpdate(reqInfo.callId, output, context);

            // 更新实时输出
            this.toolCalls = this.toolCalls.map((call) => {
              if (call.request.callId === reqInfo.callId) {
                let liveOutput: string | object = output;
                
                // 🔧 如果是 task 工具且在 SubAgent 环境下，尝试解析结构化数据
                if (call.request.name === 'task') {
                  try {
                    // 尝试解析为结构化数据
                    const parsed = JSON.parse(output);
                    liveOutput = parsed;
                  } catch {
                    // 解析失败，保持为字符串
                    liveOutput = output;
                  }
                }
                
                return { ...call, liveOutput } as ExecutingToolCall;
              }
              return call;
            });
          },
          services,
        );

        if (signal.aborted) {
          this.setStatusInternal(
            reqInfo.callId,
            'cancelled',
            'User cancelled tool execution.',
          );
          return;
        }

        // 转换为响应格式
        const llmContent = toolResult.llmContent || '';
        const responseParts = convertToFunctionResponse(
          reqInfo.name,
          reqInfo.callId,
          llmContent,
        );
        const response: ToolCallResponseInfo = {
          callId: reqInfo.callId,
          responseParts,
          resultDisplay: toolResult.returnDisplay,
          error: undefined,
        };

        this.setStatusInternal(reqInfo.callId, 'success', response, context);
      } catch (error) {
        const response = createErrorResponse(
          reqInfo,
          error instanceof Error ? error : new Error(String(error)),
        );
        this.setStatusInternal(reqInfo.callId, 'error', response, context);
      }
    });
  }
}
