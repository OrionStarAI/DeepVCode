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
} from '../index.js';

/**
 * 执行上下文 - 标识工具调用的来源和环境
 */
export interface ToolExecutionContext {
  /** Agent ID - 唯一标识符 */
  agentId: string;
  /** Agent 类型 - 主Agent或子Agent */
  agentType: 'main' | 'sub';
  /** 任务描述 - 可选，用于子Agent */
  taskDescription?: string;
  /** 显示名称 - 用于UI显示 */
  displayName?: string;
}

/**
 * 工具调度器UI适配器接口
 * 
 * 这个接口将所有UI相关的操作抽象出来，使得工具执行引擎可以与具体的UI实现解耦。
 * 不同的Agent类型（主Agent、子Agent）可以实现不同的适配器来提供个性化的UI交互。
 */
export interface ToolSchedulerAdapter {
  /**
   * 工具状态发生变化时的回调
   * @param callId 工具调用ID
   * @param newStatus 新的状态
   * @param toolCall 完整的工具调用对象
   * @param context 执行上下文
   */
  onToolStatusChanged(
    callId: string,
    newStatus: string,
    toolCall: ToolCall,
    context: ToolExecutionContext,
  ): void;

  /**
   * 工具输出更新时的回调
   * @param callId 工具调用ID
   * @param output 输出内容
   * @param context 执行上下文
   */
  onOutputUpdate(
    callId: string,
    output: string,
    context: ToolExecutionContext,
  ): void;



  /**
   * 获取首选编辑器类型
   * @param context 执行上下文
   * @returns EditorType | undefined 编辑器类型
   */
  getPreferredEditor(context: ToolExecutionContext): EditorType | undefined;

  /**
   * 获取状态更新回调函数
   * 用于SubAgent向父Agent同步工具调用状态
   * @returns 状态更新回调函数或undefined
   */
  getStatusUpdateCallback?(): ((toolCalls: ToolCall[], context: ToolExecutionContext) => void) | undefined;

  /**
   * 工具执行前的钩子函数
   * @param callId 工具调用ID
   * @param tool 工具实例
   * @param args 工具参数
   * @param context 执行上下文
   */
  onPreToolExecution(
    callId: string,
    tool: Tool,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<void> | void;

  /**
   * 所有工具调用完成时的回调
   * @param completedCalls 已完成的工具调用
   * @param context 执行上下文
   */
  onAllToolsComplete(
    completedCalls: CompletedToolCall[],
    context: ToolExecutionContext,
  ): void;

  /**
   * 工具调用列表更新时的回调
   * @param toolCalls 当前的工具调用列表
   * @param context 执行上下文
   */
  onToolCallsUpdate(
    toolCalls: ToolCall[],
    context: ToolExecutionContext,
  ): void;
}

/**
 * 空的适配器实现 - 用于不需要UI交互的场景
 */
export class NoOpToolSchedulerAdapter implements ToolSchedulerAdapter {
  onToolStatusChanged(
    callId: string,
    newStatus: string,
    toolCall: ToolCall,
    context: ToolExecutionContext,
  ): void {
    // 空实现
  }

  onOutputUpdate(
    callId: string,
    output: string,
    context: ToolExecutionContext,
  ): void {
    // 空实现
  }



  getPreferredEditor(context: ToolExecutionContext): EditorType | undefined {
    return undefined;
  }

  getStatusUpdateCallback(): ((toolCalls: ToolCall[], context: ToolExecutionContext) => void) | undefined {
    return undefined;
  }

  onPreToolExecution(
    callId: string,
    tool: Tool,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): void {
    // 空实现
  }

  onAllToolsComplete(
    completedCalls: CompletedToolCall[],
    context: ToolExecutionContext,
  ): void {
    // 空实现
  }

  onToolCallsUpdate(
    toolCalls: ToolCall[],
    context: ToolExecutionContext,
  ): void {
    // 空实现
  }
}
