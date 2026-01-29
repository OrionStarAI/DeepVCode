/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { Type } from '@google/genai';
import {
  BaseTool,
  ToolResult,
  Icon,
  ToolCallConfirmationDetails,
  ToolExecutionServices,
  SubAgentDisplay,
} from './tools.js';
import { Config } from '../config/config.js';
import { SubAgentManager } from '../subagent/subAgentManager.js';
import { SubAgentInfo, SubAgentProgressInfo, SubAgentExecutionResult, AsyncSubAgentTask } from '../subagent/types.js';
import { createSubAgentUpdateMessage } from './toolOutputMessage.js';

/**
 * Custom Task 工具参数
 * Parameters for Custom Task tool
 */
export interface CustomTaskToolParams {
  /**
   * SubAgent ID（可选，如果不提供则自动匹配）
   * SubAgent ID (optional, auto-match if not provided)
   */
  subagent_id?: string;

  /**
   * 任务的详细描述
   * Detailed description of the task
   */
  prompt: string;

  /**
   * 任务的简短描述 (3-5个字)，用于UI展示
   * Short description (3-5 words) for UI display
   */
  description: string;

  /**
   * 最大对话轮数限制
   * Maximum conversation turns limit
   */
  max_turns?: number;

  /**
   * 是否异步执行（不阻塞主 Agent）
   * Whether to execute asynchronously (non-blocking)
   */
  async?: boolean;
}

/**
 * Custom Task 工具
 * 启动自定义或内置的 SubAgent 执行复杂任务
 * 
 * Custom Task Tool
 * Launch custom or built-in SubAgent to execute complex tasks
 */
export class CustomTaskTool extends BaseTool<CustomTaskToolParams, ToolResult> {
  static readonly Name: string = 'custom_task';

  private subAgentManager: SubAgentManager;

  constructor(
    private readonly config: Config,
    subAgentManager: SubAgentManager,
  ) {
    super(
      CustomTaskTool.Name,
      'Custom SubAgent Task',
      `Launch a custom or built-in SubAgent to execute specialized tasks. SubAgents are specialized AI agents with custom system prompts and tool configurations.

Available SubAgent types:
- code_analysis: Deep code exploration and architecture analysis
- refactoring: Code refactoring and quality improvement
- testing: Test creation and coverage analysis
- documentation: Documentation generation and improvement
- Custom SubAgents defined in .deepvcode/subagents.json

Set async=true to run the SubAgent in the background without blocking the main conversation.`,
      Icon.Tasks,
      {
        type: Type.OBJECT,
        properties: {
          subagent_id: {
            type: Type.STRING,
            description: 'ID of the SubAgent to use (e.g., "builtin:code_analysis", "builtin:refactoring", "custom:my_agent"). If not provided, the system will auto-select based on task content.',
          },
          prompt: {
            type: Type.STRING,
            description: 'Detailed description of the task for the SubAgent to complete.',
          },
          description: {
            type: Type.STRING,
            description: 'Short description (3-5 words) of the task for UI display.',
          },
          max_turns: {
            type: Type.NUMBER,
            description: 'Maximum number of conversation turns (default: 50, max: 50).',
            minimum: 1,
            maximum: 50,
          },
          async: {
            type: Type.BOOLEAN,
            description: 'Whether to run asynchronously in the background without blocking. Default: false.',
          },
        },
        required: ['prompt', 'description'],
      },
      true,  // isOutputMarkdown
      false, // forceMarkdown
      true,  // canUpdateOutput
      false, // allowSubAgentUse - 防止无限嵌套
    );

    this.subAgentManager = subAgentManager;
  }

  validateToolParams(params: CustomTaskToolParams): string | null {
    if (!params.prompt || params.prompt.trim().length === 0) {
      return 'Task prompt cannot be empty';
    }

    if (!params.description || params.description.trim().length === 0) {
      return 'Task description cannot be empty';
    }

    if (params.max_turns !== undefined && (params.max_turns < 1 || params.max_turns > 50)) {
      return 'max_turns must be between 1 and 50';
    }

    // 验证 subagent_id 是否存在
    if (params.subagent_id) {
      const subAgent = this.subAgentManager.getSubAgent(params.subagent_id);
      if (!subAgent) {
        const availableIds = this.subAgentManager.getEnabledSubAgents()
          .map(info => info.config.id)
          .join(', ');
        return `SubAgent not found: ${params.subagent_id}. Available: ${availableIds}`;
      }
    }

    return null;
  }

  async shouldConfirmExecute(
    params: CustomTaskToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  getDescription(params: CustomTaskToolParams): string {
    return params.description;
  }

  toolLocations(params: CustomTaskToolParams): Array<{ path: string; type: 'file' | 'directory' }> {
    return [{ path: this.config.getWorkingDir(), type: 'directory' }];
  }

  async execute(
    params: CustomTaskToolParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
    services?: ToolExecutionServices,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Parameter Validation Failed: ${validationError}`,
        returnDisplay: `Parameter Validation Failed: ${validationError}`,
      };
    }

    // 确定要使用的 SubAgent
    let subAgentInfo: SubAgentInfo | undefined;

    if (params.subagent_id) {
      subAgentInfo = this.subAgentManager.getSubAgent(params.subagent_id);
    } else {
      // 自动匹配
      subAgentInfo = this.subAgentManager.matchSubAgent(params.prompt);
      if (!subAgentInfo) {
        // 默认使用代码分析专家
        subAgentInfo = this.subAgentManager.getSubAgent('builtin:code_analysis');
      }
    }

    if (!subAgentInfo) {
      return {
        llmContent: 'No suitable SubAgent found for this task',
        returnDisplay: 'No suitable SubAgent found for this task',
      };
    }

    const agentId = `subagent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const maxTurns = params.max_turns ?? subAgentInfo.config.defaultMaxTurns ?? 50;

    // 创建初始显示数据
    let currentDisplayData: SubAgentDisplay = {
      type: 'subagent_display',
      agentId,
      taskDescription: params.prompt,
      description: params.description,
      status: 'starting',
      currentTurn: 0,
      maxTurns,
      toolCalls: [],
      stats: {
        filesCreated: [],
        commandsRun: [],
        totalToolCalls: 0,
        successfulToolCalls: 0,
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
      },
      showDetailedProcess: true,
      startTime: Date.now(),
      subAgentName: subAgentInfo.config.name,
      subAgentIcon: subAgentInfo.config.icon,
    };

    // 更新输出包装器
    const wrappedUpdateOutput = (output: string) => {
      if (output.startsWith('SUBAGENT_STATUS_CHANGE:')) {
        try {
          const data = JSON.parse(output.replace('SUBAGENT_STATUS_CHANGE:', ''));
          currentDisplayData = {
            ...currentDisplayData,
            status: data.status,
            currentTurn: data.currentTurn ?? currentDisplayData.currentTurn,
            summary: data.summary,
            error: data.error,
          };
          updateOutput?.(createSubAgentUpdateMessage(currentDisplayData));
        } catch {
          // Ignore parse errors
        }
        return;
      }

      if (output.startsWith('TOOL_CALL_UPDATE:')) {
        try {
          const data = JSON.parse(output.replace('TOOL_CALL_UPDATE:', ''));
          currentDisplayData = this.updateSubAgentToolCall(currentDisplayData, data);
          updateOutput?.(createSubAgentUpdateMessage(currentDisplayData));
        } catch {
          // Ignore parse errors
        }
        return;
      }

      updateOutput?.(output);
    };

    // 发送初始状态
    wrappedUpdateOutput(createSubAgentUpdateMessage(currentDisplayData));

    try {
      if (params.async) {
        // 异步执行
        const task = await this.subAgentManager.executeSubAgent(
          subAgentInfo.config.id,
          {
            prompt: params.prompt,
            description: params.description,
            maxTurns,
            async: true,
            onProgress: (progress: SubAgentProgressInfo) => {
              currentDisplayData = {
                ...currentDisplayData,
                status: progress.status,
                currentTurn: progress.currentTurn,
              };
              updateOutput?.(createSubAgentUpdateMessage(currentDisplayData));
            },
            onComplete: (result: SubAgentExecutionResult) => {
              currentDisplayData = {
                ...currentDisplayData,
                status: result.success ? 'completed' : 'failed',
                summary: result.summary,
                error: result.error,
                showDetailedProcess: false,
                endTime: Date.now(),
                stats: {
                  ...currentDisplayData.stats,
                  filesCreated: result.filesCreated ?? [],
                  commandsRun: result.commandsRun ?? [],
                  tokenUsage: result.tokenUsage ?? currentDisplayData.stats.tokenUsage,
                },
              };
              updateOutput?.(createSubAgentUpdateMessage(currentDisplayData));
            },
            abortSignal: signal,
          }
        ) as AsyncSubAgentTask;

        // 异步任务已启动，立即返回
        return {
          llmContent: `SubAgent task started in background (Task ID: ${task.taskId}).\n\nSubAgent: ${subAgentInfo.config.name}\nDescription: ${params.description}\n\nThe task is running asynchronously and will not block further interactions. You can continue with other tasks.`,
          returnDisplay: {
            ...currentDisplayData,
            status: 'running',
            asyncTaskId: task.taskId,
          },
        };

      } else {
        // 同步执行
        const result = await this.subAgentManager.executeSubAgent(
          subAgentInfo.config.id,
          {
            prompt: params.prompt,
            description: params.description,
            maxTurns,
            async: false,
            onProgress: (progress: SubAgentProgressInfo) => {
              currentDisplayData = {
                ...currentDisplayData,
                status: progress.status,
                currentTurn: progress.currentTurn,
              };
              wrappedUpdateOutput(createSubAgentUpdateMessage(currentDisplayData));
            },
            abortSignal: signal,
          }
        ) as SubAgentExecutionResult;

        // 更新最终状态
        currentDisplayData = {
          ...currentDisplayData,
          status: result.success ? 'completed' : 'failed',
          summary: result.summary,
          error: result.error,
          showDetailedProcess: false,
          endTime: Date.now(),
          stats: {
            ...currentDisplayData.stats,
            filesCreated: result.filesCreated ?? [],
            commandsRun: result.commandsRun ?? [],
            tokenUsage: result.tokenUsage ?? currentDisplayData.stats.tokenUsage,
          },
        };

        wrappedUpdateOutput(createSubAgentUpdateMessage(currentDisplayData));

        return {
          llmContent: result.success
            ? `Task Completed: ${result.summary}`
            : `Task Failed: ${result.summary}`,
          returnDisplay: currentDisplayData,
        };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      currentDisplayData = {
        ...currentDisplayData,
        status: 'failed',
        error: errorMessage,
        showDetailedProcess: false,
        endTime: Date.now(),
      };
      wrappedUpdateOutput(createSubAgentUpdateMessage(currentDisplayData));

      return {
        llmContent: `Task Failed: ${errorMessage}`,
        returnDisplay: currentDisplayData,
      };
    }
  }

  /**
   * 更新工具调用状态
   */
  private updateSubAgentToolCall(
    displayData: SubAgentDisplay,
    updates: any
  ): SubAgentDisplay {
    const { callId, ...otherUpdates } = updates;

    const existingIndex = displayData.toolCalls.findIndex(tc => tc.callId === callId);
    let newToolCalls = [...displayData.toolCalls];

    if (existingIndex >= 0) {
      newToolCalls[existingIndex] = {
        ...newToolCalls[existingIndex],
        ...updates,
      };
    } else {
      newToolCalls.push({
        callId,
        toolName: updates.toolName || 'unknown',
        description: updates.description || '',
        status: updates.status || 'Pending',
        startTime: updates.startTime || Date.now(),
        ...otherUpdates,
      });
    }

    return {
      ...displayData,
      toolCalls: newToolCalls,
      stats: {
        ...displayData.stats,
        totalToolCalls: newToolCalls.length,
        successfulToolCalls: newToolCalls.filter(tc => tc.status === 'Success').length,
      },
    };
  }
}
