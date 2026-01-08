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
  ToolResultDisplay,
  ToolRegistry,
  ApprovalMode,
  EditorType,
  Config,
  logToolCall,
  ToolCallEvent,
  PreToolExecutionHandler,
  ToolConfirmationPayload,
} from '../index.js';
import { Part, PartListUnion } from '@google/genai';
import { getResponseTextFromParts } from '../utils/generateContentResponseUtilities.js';
import {
  isModifiableTool,
  ModifyContext,
  modifyWithEditor,
} from '../tools/modifiable-tool.js';
import * as Diff from 'diff';
import {
  ToolExecutionEngine,
  ToolExecutionContext,
  RuntimeConfirmationRequest,
  // 🎯 从基础层导入所有工具调用类型
  ValidatingToolCall,
  ScheduledToolCall,
  ErroredToolCall,
  SuccessfulToolCall,
  ExecutingToolCall,
  CancelledToolCall,
  WaitingToolCall,
  EngineToolCall as ToolCall,
  CompletedEngineToolCall as CompletedToolCall,
  Status,
} from './toolExecutionEngine.js';
import { MainAgentAdapter } from './mainAgentAdapter.js';
// TaskStateManager 已移除，简化状态管理

// 🎯 类型定义已移至 ToolExecutionEngine，从那里导入
// 这里不再重复定义工具调用类型

// 🎯 重新导出基础类型，保持向后兼容
export type {
  ValidatingToolCall,
  ScheduledToolCall,
  ErroredToolCall,
  SuccessfulToolCall,
  ExecutingToolCall,
  CancelledToolCall,
  WaitingToolCall,
  ToolCall,
  CompletedToolCall,
  Status,
};

export type ConfirmHandler = (
  toolCall: WaitingToolCall,
) => Promise<ToolConfirmationOutcome>;

export type OutputUpdateHandler = (
  toolCallId: string,
  outputChunk: string,
) => void;

export type AllToolCallsCompleteHandler = (
  completedToolCalls: CompletedToolCall[],
) => void;

export type ToolCallsUpdateHandler = (toolCalls: ToolCall[]) => void;

/**
 * Formats tool output for a Gemini FunctionResponse.
 */
function createFunctionResponsePart(
  callId: string,
  toolName: string,
  output: string,
): Part {
  return {
    functionResponse: {
      id: callId,
      name: toolName,
      response: { output },
    },
  };
}

export function convertToFunctionResponse(
  toolName: string,
  callId: string,
  llmContent: PartListUnion,
): PartListUnion {
  const contentToProcess =
    Array.isArray(llmContent) && llmContent.length === 1
      ? llmContent[0]
      : llmContent;

  if (typeof contentToProcess === 'string') {
    return createFunctionResponsePart(callId, toolName, contentToProcess);
  }

  if (Array.isArray(contentToProcess)) {
    // 空数组按原有逻辑处理
    if (contentToProcess.length === 0) {
      const functionResponse = createFunctionResponsePart(
        callId,
        toolName,
        'Tool execution succeeded.',
      );
      return [functionResponse, ...contentToProcess];
    }

    // 检查是否为纯字符串数组（如read-many-files工具返回的内容）
    const isAllStrings = contentToProcess.every(item => typeof item === 'string');

    if (isAllStrings) {
      // 将字符串数组合并为单个字符串放入response.output
      const combinedContent = (contentToProcess as string[]).join('');
      return createFunctionResponsePart(callId, toolName, combinedContent);
    } else {
      // 包含Part对象的数组，保持原有逻辑
      const functionResponse = createFunctionResponsePart(
        callId,
        toolName,
        'Tool execution succeeded.',
      );
      return [functionResponse, ...contentToProcess];
    }
  }

  // After this point, contentToProcess is a single Part object.
  if (contentToProcess.functionResponse) {
    if (contentToProcess.functionResponse.response?.content) {
      const stringifiedOutput =
        getResponseTextFromParts(
          contentToProcess.functionResponse.response.content as Part[],
        ) || '';
      return createFunctionResponsePart(callId, toolName, stringifiedOutput);
    }
    contentToProcess.functionResponse.id = callId;
    // It's a functionResponse that we should pass through as is.
    return contentToProcess;
  }

  if (contentToProcess.inlineData || contentToProcess.fileData) {
    const mimeType =
      contentToProcess.inlineData?.mimeType ||
      contentToProcess.fileData?.mimeType ||
      'unknown';
    const functionResponse = createFunctionResponsePart(
      callId,
      toolName,
      `Binary content of type ${mimeType} was processed.`,
    );
    return [functionResponse, contentToProcess];
  }

  if (contentToProcess.text !== undefined) {
    return createFunctionResponsePart(callId, toolName, contentToProcess.text);
  }

  // Default case for other kinds of parts.
  return createFunctionResponsePart(
    callId,
    toolName,
    'Tool execution succeeded.',
  );
}

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



interface CoreToolSchedulerOptions {
  toolRegistry: Promise<ToolRegistry>;
  outputUpdateHandler?: OutputUpdateHandler;
  onAllToolCallsComplete?: AllToolCallsCompleteHandler;
  onToolCallsUpdate?: ToolCallsUpdateHandler;
  onPreToolExecution?: PreToolExecutionHandler;
  approvalMode?: ApprovalMode;
  getPreferredEditor: () => EditorType | undefined;
  config: Config;
  hookEventHandler?: any; // HookEventHandler type - optional
}

/**
 * 🎯 精简后的CoreToolScheduler - 仅作为ToolExecutionEngine的UI适配层
 */
export class CoreToolScheduler {
  // 🚫 移除重复状态：private toolCalls: ToolCall[] = [];
  // ✅ 只保留必要的引用
  private executionEngine: ToolExecutionEngine;
  private adapter: MainAgentAdapter;
  private executionContext: ToolExecutionContext;

  constructor(options: CoreToolSchedulerOptions) {
    // 🎯 创建主Agent执行上下文
    this.executionContext = {
      agentId: 'main-agent',
      agentType: 'main',
    };

    // 🎯 创建适配器
    this.adapter = new MainAgentAdapter(
      options.outputUpdateHandler,
      options.onAllToolCallsComplete,
      options.onToolCallsUpdate,
      options.onPreToolExecution,
      options.getPreferredEditor,
    );

    // 🎯 创建完整的执行引擎
    this.executionEngine = new ToolExecutionEngine({
      toolRegistry: options.toolRegistry,
      adapter: this.adapter,
      config: options.config,
      hookEventHandler: options.hookEventHandler,
      approvalMode: options.approvalMode ?? ApprovalMode.DEFAULT,
      getPreferredEditor: options.getPreferredEditor,
    });
  }

  // 🚫 移除所有状态管理方法 - 现在由ToolExecutionEngine处理

  /**
   * 🎯 简化的调度方法 - 直接转发给执行引擎
   */
  async schedule(
    request: ToolCallRequestInfo | ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<void> {
    const requests = Array.isArray(request) ? request : [request];

    // ✅ 直接转发给执行引擎，不维护本地状态
    await this.executionEngine.executeTools(requests, this.executionContext, signal);
  }

  /**
   * 🎯 转发确认响应给执行引擎
   */
  async handleConfirmationResponse(
    callId: string,
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
    signal?: AbortSignal,
  ): Promise<void> {
    // ✅ 直接转发给执行引擎
    await this.executionEngine.handleConfirmationResponse(callId, outcome, payload, signal);
  }

  /**
   * 🎯 获取当前工具调用状态（只读访问）
   */
  getToolCalls(): readonly ToolCall[] {
    return this.executionEngine.getToolCalls();
  }

  /**
   * 🎯 强制重置引擎状态
   * 转发给执行引擎处理
   */
  reset(): void {
    this.executionEngine.reset();
  }

  // 🎯 重构完成！CoreToolScheduler现在是轻量级的UI适配层
}
