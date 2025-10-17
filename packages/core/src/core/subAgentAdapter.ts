/**
 * @license
 * Copyright 2025 Google LLC
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
import { ToolRegistry } from '../tools/tool-registry.js';

/**
 * SubAgent UI适配器 - 为子Agent提供专门的UI交互
 * 
 * 这个适配器为SubAgent提供独立的UI交互体验，包括：
 * - 带有SubAgent标识的日志输出
 * - 专门的用户确认流程（如果需要）
 * - 状态跟踪和反馈
 * - 执行结果汇总
 */
export class SubAgentAdapter implements ToolSchedulerAdapter {
  private executionLog: string[] = [];
  private filesCreated: string[] = [];
  private commandsRun: string[] = [];
  private statusUpdateCallback?: (toolCalls: ToolCall[], context: ToolExecutionContext) => void;

  constructor(
    private updateOutput?: (output: string) => void,
    private logCallback?: (message: string) => void,
    private toolCompletionHandler?: (completedCalls: CompletedToolCall[]) => void,
    private toolRegistry?: ToolRegistry,
    private externalPreToolExecutionHandler?: PreToolExecutionHandler,
  ) {}

  /**
   * 设置状态更新回调
   */
  setStatusUpdateCallback(callback?: (toolCalls: ToolCall[], context: ToolExecutionContext) => void) {
    this.statusUpdateCallback = callback;
  }

  /**
   * 获取状态更新回调函数
   */
  getStatusUpdateCallback(): ((toolCalls: ToolCall[], context: ToolExecutionContext) => void) | undefined {
    return this.statusUpdateCallback;
  }

  /**
   * 工具状态发生变化时的回调
   * 只发送结构化数据更新
   */
  onToolStatusChanged(
    callId: string,
    newStatus: string,
    toolCall: ToolCall,
    context: ToolExecutionContext,
  ): void {
    // 🎯 立即通知父Agent单个工具状态变化
    this.statusUpdateCallback?.([toolCall], context);

    // 🎯 只发送结构化的工具调用信息
    const detailedToolInfo = this.createDetailedToolInfo(callId, newStatus, toolCall);
    const structuredUpdate = `TOOL_CALL_UPDATE:${JSON.stringify(detailedToolInfo)}`;
    
    // 记录到内部日志（用于最终报告）
    this.log(`工具 ${toolCall.request.name}: ${newStatus}`);
    
    // 只发送结构化数据
    this.updateOutput?.(structuredUpdate);

    // 记录特定类型的工具执行
    if (newStatus === 'success') {
      if (toolCall.request.name === 'write_file' || toolCall.request.name === 'edit_file') {
        const fileName = toolCall.request.args?.file_path || toolCall.request.args?.path;
        if (fileName && typeof fileName === 'string') {
          this.filesCreated.push(fileName);
        }
      } else if (toolCall.request.name === 'shell') {
        const command = toolCall.request.args?.command;
        if (command && typeof command === 'string') {
          this.commandsRun.push(command);
        }
      }
    }
  }

  /**
   * 创建详细的工具调用信息
   */
  private createDetailedToolInfo(callId: string, status: string, toolCall: ToolCall): {
    callId: string;
    toolName: string;
    description: string;
    status: string;
    result?: string;
    error?: string;
    startTime?: number;
    durationMs?: number;
  } {
    // 映射内部状态到UI状态
    const statusMap: Record<string, string> = {
      'validating': 'Pending',
      'scheduled': 'Pending', 
      'awaiting_approval': 'Confirming',
      'executing': 'Executing',
      'success': 'Success',
      'error': 'Error',
      'cancelled': 'Canceled',
    };

    const uiStatus = statusMap[status] || 'Pending';
    
    // 构建工具描述 - 调用工具的getDescription方法或使用参数格式化
    const argsDesc = this.formatToolArgs(toolCall.request.name, toolCall.request.args);
    const description = argsDesc || '';
    
    const toolInfo: any = {
      callId,
      toolName: toolCall.request.name,
      description,
      status: uiStatus,
      startTime: (toolCall as any).startTime,
    };

    // 添加结果或错误信息
    if (status === 'success' && (toolCall as any).response) {
      const response = (toolCall as any).response;
      toolInfo.result = typeof response.resultDisplay === 'string' 
        ? response.resultDisplay 
        : '执行成功';
      
      if (toolInfo.startTime) {
        toolInfo.durationMs = Date.now() - toolInfo.startTime;
      }
    } else if (status === 'error' && (toolCall as any).response?.error) {
      toolInfo.error = (toolCall as any).response.error.message || '执行失败';
      
      if (toolInfo.startTime) {
        toolInfo.durationMs = Date.now() - toolInfo.startTime;
      }
    }

    return toolInfo;
  }

  /**
   * 格式化工具参数为可读字符串
   */
  private formatToolArgs(toolName: string, args: Record<string, unknown>): string {
    // 如果有工具注册表，尝试使用工具的getDescription方法
    if (this.toolRegistry) {
      try {
        const tool = this.toolRegistry.getTool(toolName);
        if (tool && tool.getDescription) {
          const description = tool.getDescription(args as any);
          // 从description中提取有用的参数信息，去掉工具名称前缀
          if (description && description.length > 0) {
            // 如果描述包含括号内的参数信息，提取它
            const match = description.match(/\((.*)\)$/);
            if (match) {
              return match[1];
            }
            // 否则返回整个描述，但过滤掉可能重复的工具名称
            return description.replace(new RegExp(`^${toolName}\\s*`, 'i'), '').trim();
          }
        }
      } catch (error) {
        // 如果工具的getDescription方法失败，回退到默认方法
        console.warn(`Failed to get description for tool ${toolName}:`, error);
      }
    }

    // 回退方案：使用重要参数的硬编码列表
    const importantArgs = ['file_path', 'path', 'absolute_path', 'command', 'content', 'query', 'pattern', 'prompt', 'description'];
    const relevantArgs: string[] = [];
    
    for (const key of importantArgs) {
      if (args[key] && typeof args[key] === 'string') {
        const value = args[key] as string;
        if (value.length > 50) {
          relevantArgs.push(`${value.substring(0, 50)}...`);
        } else {
          relevantArgs.push(value);
        }
      }
    }
    
    return relevantArgs.join(', ');
  }

  /**
   * 工具输出更新时的回调
   * 发送结构化的实时输出更新
   */
  onOutputUpdate(
    callId: string,
    output: string,
    context: ToolExecutionContext,
  ): void {
    // 记录到内部日志
    this.log(`[${callId}] ${output}`);
    
    // 发送结构化的实时输出更新
    const outputUpdate = {
      callId,
      output,
      timestamp: Date.now(),
    };
    
    const structuredUpdate = `TOOL_OUTPUT_UPDATE:${JSON.stringify(outputUpdate)}`;
    this.updateOutput?.(structuredUpdate);
  }

  /**
   * 获取首选编辑器类型 - SubAgent不需要编辑器
   */
  getPreferredEditor(context: ToolExecutionContext): EditorType | undefined {
    return undefined;
  }

  /**
   * 工具执行前的钩子函数
   * 发送结构化的工具准备执行事件，并调用外部回调（如git快照）
   */
  async onPreToolExecution(
    callId: string,
    tool: Tool,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<void> {
    // 🎯 首先调用外部回调（如git快照等预处理）
    if (this.externalPreToolExecutionHandler) {
      try {
        await this.externalPreToolExecutionHandler({
          callId,
          tool,
          args,
        });
      } catch (error) {
        console.warn('[SubAgent] Failed to execute external pre-tool handler:', error);
        // 不中断工具执行，只是记录警告
      }
    }

    // 记录到内部日志
    this.log(`准备执行工具: ${tool.displayName || tool.name}`);

    // 发送结构化的工具准备事件
    const preparationEvent = {
      type: 'tool_preparation',
      callId,
      toolName: tool.name,
      toolDisplayName: tool.displayName || tool.name,
      args: this.sanitizeArgs(args),
      agentId: context.agentId,
      taskDescription: context.taskDescription,
      timestamp: Date.now(),
    };

    const structuredUpdate = `SUBAGENT_EVENT:${JSON.stringify(preparationEvent)}`;
    this.updateOutput?.(structuredUpdate);
  }

  /**
   * 清理参数以便安全序列化
   */
  private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        // 截断过长的字符串
        if (typeof value === 'string' && value.length > 200) {
          sanitized[key] = value.substring(0, 200) + '...';
        } else {
          sanitized[key] = value;
        }
      } else if (value === null || value === undefined) {
        sanitized[key] = value;
      } else {
        sanitized[key] = '[复杂对象]';
      }
    }
    
    return sanitized;
  }

  /**
   * 所有工具调用完成时的回调
   * 发送结构化的工具批次完成事件
   */
  onAllToolsComplete(
    completedCalls: CompletedToolCall[],
    context: ToolExecutionContext,
  ): void {
    const successCount = completedCalls.filter(call => call.status === 'success').length;
    const errorCount = completedCalls.filter(call => call.status === 'error').length;
    const cancelledCount = completedCalls.filter(call => call.status === 'cancelled').length;

    // 记录到内部日志
    this.log(`工具批次执行完成: ${successCount} 成功, ${errorCount} 失败, ${cancelledCount} 取消`);

    // 发送结构化的批次完成事件
    const batchCompleteEvent = {
      type: 'tools_batch_complete',
      agentId: context.agentId,
      statistics: {
        total: completedCalls.length,
        success: successCount,
        error: errorCount,
        cancelled: cancelledCount,
      },
      filesCreated: [...this.filesCreated],
      commandsRun: [...this.commandsRun],
      completedCalls: completedCalls.map(call => ({
        callId: call.request.callId,
        toolName: call.request.name,
        status: call.status,
        durationMs: (call as any).durationMs,
      })),
      timestamp: Date.now(),
    };

    const structuredUpdate = `SUBAGENT_EVENT:${JSON.stringify(batchCompleteEvent)}`;
    this.updateOutput?.(structuredUpdate);

    // 调用工具完成回调处理器
    if (this.toolCompletionHandler) {
      this.toolCompletionHandler(completedCalls);
    }
  }

  /**
   * 工具调用列表更新时的回调
   * 发送结构化的工具状态概览更新
   */
  onToolCallsUpdate(
    toolCalls: ToolCall[],
    context: ToolExecutionContext,
  ): void {
    // 🎯 向父Agent同步工具调用状态
    this.statusUpdateCallback?.(toolCalls, context);

    // 统计各状态的工具数量
    const statusCounts = {
      validating: 0,
      scheduled: 0,
      awaiting_approval: 0,
      executing: 0,
      success: 0,
      error: 0,
      cancelled: 0,
    };

    toolCalls.forEach(call => {
      if (call.status in statusCounts) {
        statusCounts[call.status as keyof typeof statusCounts]++;
      }
    });

    // 记录活跃工具数量
    const activeCount = statusCounts.executing + statusCounts.awaiting_approval;
    if (activeCount > 0) {
      this.log(`${activeCount} 个工具调用正在处理中`);
    }

    // 发送结构化的状态概览事件（保留原有的事件通知）
    const statusOverviewEvent = {
      type: 'tools_status_overview',
      agentId: context.agentId,
      totalTools: toolCalls.length,
      statusCounts,
      activeTools: activeCount,
      timestamp: Date.now(),
    };

    const structuredUpdate = `SUBAGENT_EVENT:${JSON.stringify(statusOverviewEvent)}`;
    this.updateOutput?.(structuredUpdate);
  }

  /**
   * 记录日志的私有方法
   */
  private log(message: string): void {
    this.executionLog.push(message);
    this.logCallback?.(message);
  }

  /**
   * 获取执行日志
   */
  getExecutionLog(): string[] {
    return [...this.executionLog];
  }

  /**
   * 获取创建的文件列表
   */
  getFilesCreated(): string[] {
    return [...this.filesCreated];
  }

  /**
   * 获取执行的命令列表
   */
  getCommandsRun(): string[] {
    return [...this.commandsRun];
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.executionLog = [];
    this.filesCreated = [];
    this.commandsRun = [];
  }
}

/**
 * 工厂函数 - 创建SubAgentAdapter
 */
export function createSubAgentAdapter(
  updateOutput?: (output: string) => void,
  logCallback?: (message: string) => void,
  toolCompletionHandler?: (completedCalls: CompletedToolCall[]) => void,
): SubAgentAdapter {
  return new SubAgentAdapter(
    updateOutput,
    logCallback,
    toolCompletionHandler,
  );
}
