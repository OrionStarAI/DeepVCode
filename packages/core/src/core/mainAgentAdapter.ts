/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import {
  ToolCall,
  Tool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  CompletedToolCall,
  EditorType,
  PreToolExecutionHandler,
} from '../index.js';
import {
  ToolSchedulerAdapter,
  ToolExecutionContext,
} from './toolSchedulerAdapter.js';
import {
  OutputUpdateHandler,
  AllToolCallsCompleteHandler,
  ToolCallsUpdateHandler,
} from './coreToolScheduler.js';

/**
 * 主Agent UI适配器 - 将现有的UI回调包装成新的接口
 * 
 * 这个适配器使现有的主Agent UI能够无缝地使用新的ToolExecutionEngine，
 * 不需要修改现有的React组件代码。
 */
export class MainAgentAdapter implements ToolSchedulerAdapter {
  constructor(
    private outputUpdateHandler?: OutputUpdateHandler,
    private allToolCallsCompleteHandler?: AllToolCallsCompleteHandler,
    private toolCallsUpdateHandler?: ToolCallsUpdateHandler,
    private preToolExecutionHandler?: PreToolExecutionHandler,
    private preferredEditorGetter?: () => EditorType | undefined,
  ) {}

  /**
   * 工具状态发生变化时的回调
   * 对于主Agent，我们通过onToolCallsUpdate来通知整个工具调用列表的变化
   */
  onToolStatusChanged(
    callId: string,
    newStatus: string,
    toolCall: ToolCall,
    context: ToolExecutionContext,
  ): void {
    // 主Agent通过onToolCallsUpdate统一处理状态变化
    // 这里不需要单独处理状态变化
  }

  /**
   * 工具输出更新时的回调
   * 直接转发给现有的outputUpdateHandler
   */
  onOutputUpdate(
    callId: string,
    output: string,
    context: ToolExecutionContext,
  ): void {
    this.outputUpdateHandler?.(callId, output);
  }





  /**
   * 获取首选编辑器类型
   * 直接转发给现有的getPreferredEditor函数
   */
  getPreferredEditor(context: ToolExecutionContext): EditorType | undefined {
    return this.preferredEditorGetter?.();
  }

  /**
   * 获取状态更新回调函数
   * MainAgent不需要向父Agent同步状态，返回undefined
   */
  getStatusUpdateCallback(): ((toolCalls: any[], context: any) => void) | undefined {
    return undefined;
  }

  /**
   * 工具执行前的钩子函数
   * 直接转发给现有的onPreToolExecution回调
   */
  async onPreToolExecution(
    callId: string,
    tool: Tool,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<void> {
    if (this.preToolExecutionHandler) {
      await this.preToolExecutionHandler({
        callId,
        tool,
        args,
      });
    }
  }

  /**
   * 所有工具调用完成时的回调
   * 直接转发给现有的onAllToolCallsComplete回调
   */
  onAllToolsComplete(
    completedCalls: CompletedToolCall[],
    context: ToolExecutionContext,
  ): void {
    this.allToolCallsCompleteHandler?.(completedCalls);
  }

  /**
   * 工具调用列表更新时的回调
   * 直接转发给现有的onToolCallsUpdate回调
   */
  onToolCallsUpdate(
    toolCalls: ToolCall[],
    context: ToolExecutionContext,
  ): void {
    this.toolCallsUpdateHandler?.(toolCalls);
  }
}

/**
 * 工厂函数 - 从现有的CoreToolScheduler选项创建MainAgentAdapter
 * 
 * 这个函数使得从现有代码迁移到新架构变得简单，
 * 只需要调用这个函数就能创建兼容的适配器。
 */
export function createMainAgentAdapter(
  outputUpdateHandler?: OutputUpdateHandler,
  onAllToolCallsComplete?: AllToolCallsCompleteHandler,
  onToolCallsUpdate?: ToolCallsUpdateHandler,
  onPreToolExecution?: PreToolExecutionHandler,
  getPreferredEditor?: () => EditorType | undefined,
): MainAgentAdapter {
  return new MainAgentAdapter(
    outputUpdateHandler,
    onAllToolCallsComplete,
    onToolCallsUpdate,
    onPreToolExecution,
    getPreferredEditor,
  );
}
