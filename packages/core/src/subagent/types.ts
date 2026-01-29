/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 自定义 SubAgent 配置接口
 * Custom SubAgent configuration interface
 */
export interface CustomSubAgentConfig {
  /**
   * SubAgent 的唯一标识符
   * Unique identifier for the SubAgent
   */
  id: string;

  /**
   * SubAgent 的显示名称
   * Display name for the SubAgent
   */
  name: string;

  /**
   * SubAgent 的描述
   * Description of what this SubAgent does
   */
  description: string;

  /**
   * 系统提示词 - 定义 SubAgent 的角色和行为
   * System prompt - defines the role and behavior of the SubAgent
   */
  systemPrompt: string;

  /**
   * 允许使用的工具列表（可选，默认使用所有允许子agent使用的工具）
   * List of allowed tools (optional, defaults to all tools with allowSubAgentUse=true)
   */
  allowedTools?: string[];

  /**
   * 排除的工具列表
   * List of excluded tools
   */
  excludedTools?: string[];

  /**
   * 默认最大轮数
   * Default maximum turns
   */
  defaultMaxTurns?: number;

  /**
   * 是否启用
   * Whether this SubAgent is enabled
   */
  enabled?: boolean;

  /**
   * 图标（可选）
   * Icon (optional)
   */
  icon?: string;

  /**
   * 触发条件（可选，用于自动选择 SubAgent）
   * Trigger conditions (optional, for automatic SubAgent selection)
   */
  triggers?: SubAgentTrigger[];
}

/**
 * SubAgent 触发条件
 * SubAgent trigger condition
 */
export interface SubAgentTrigger {
  /**
   * 触发类型
   * Trigger type
   */
  type: 'keyword' | 'pattern' | 'file_extension';

  /**
   * 匹配值（关键词、正则表达式或文件扩展名）
   * Match value (keyword, regex pattern, or file extension)
   */
  value: string;

  /**
   * 优先级（数字越大优先级越高）
   * Priority (higher number = higher priority)
   */
  priority?: number;
}

/**
 * SubAgent 执行选项
 * SubAgent execution options
 */
export interface SubAgentExecutionOptions {
  /**
   * 任务描述/提示
   * Task description/prompt
   */
  prompt: string;

  /**
   * 简短描述（用于 UI 显示）
   * Short description (for UI display)
   */
  description: string;

  /**
   * 最大轮数
   * Maximum turns
   */
  maxTurns?: number;

  /**
   * 是否异步执行（不阻塞主 Agent）
   * Whether to execute asynchronously (non-blocking)
   */
  async?: boolean;

  /**
   * 完成回调（异步模式下使用）
   * Completion callback (used in async mode)
   */
  onComplete?: (result: SubAgentExecutionResult) => void;

  /**
   * 进度回调
   * Progress callback
   */
  onProgress?: (progress: SubAgentProgressInfo) => void;

  /**
   * 取消信号
   * Abort signal
   */
  abortSignal?: AbortSignal;
}

/**
 * SubAgent 执行结果
 * SubAgent execution result
 */
export interface SubAgentExecutionResult {
  /**
   * SubAgent ID
   */
  subAgentId: string;

  /**
   * 是否成功
   * Whether execution succeeded
   */
  success: boolean;

  /**
   * 执行摘要
   * Execution summary
   */
  summary: string;

  /**
   * 错误信息（如果有）
   * Error message (if any)
   */
  error?: string;

  /**
   * 执行日志
   * Execution log
   */
  executionLog: string[];

  /**
   * 创建的文件
   * Files created
   */
  filesCreated?: string[];

  /**
   * 执行的命令
   * Commands run
   */
  commandsRun?: string[];

  /**
   * Token 使用统计
   * Token usage statistics
   */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };

  /**
   * 执行时间（毫秒）
   * Execution duration (milliseconds)
   */
  durationMs?: number;
}

/**
 * SubAgent 进度信息
 * SubAgent progress information
 */
export interface SubAgentProgressInfo {
  /**
   * SubAgent ID
   */
  subAgentId: string;

  /**
   * 状态
   * Status
   */
  status: 'starting' | 'running' | 'completing' | 'completed' | 'failed' | 'cancelled';

  /**
   * 当前轮数
   * Current turn
   */
  currentTurn: number;

  /**
   * 最大轮数
   * Maximum turns
   */
  maxTurns: number;

  /**
   * 当前正在执行的工具（如果有）
   * Currently executing tool (if any)
   */
  currentTool?: string;

  /**
   * 消息
   * Message
   */
  message?: string;
}

/**
 * 内置 SubAgent 类型
 * Built-in SubAgent types
 */
export type BuiltInSubAgentType = 'code_analysis' | 'refactoring' | 'testing' | 'documentation';

/**
 * SubAgent 注册信息
 * SubAgent registration info
 */
export interface SubAgentInfo {
  /**
   * SubAgent 配置
   * SubAgent configuration
   */
  config: CustomSubAgentConfig;

  /**
   * 是否为内置 SubAgent
   * Whether this is a built-in SubAgent
   */
  isBuiltIn: boolean;

  /**
   * 来源（配置文件路径或 'built-in'）
   * Source (config file path or 'built-in')
   */
  source: string;
}

/**
 * 异步 SubAgent 任务信息
 * Async SubAgent task information
 */
export interface AsyncSubAgentTask {
  /**
   * 任务 ID
   */
  taskId: string;

  /**
   * SubAgent ID
   */
  subAgentId: string;

  /**
   * SubAgent 名称
   */
  subAgentName: string;

  /**
   * 任务描述
   */
  description: string;

  /**
   * 状态
   */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  /**
   * 开始时间
   */
  startTime: number;

  /**
   * 结束时间
   */
  endTime?: number;

  /**
   * 当前轮数
   */
  currentTurn: number;

  /**
   * 最大轮数
   */
  maxTurns: number;

  /**
   * 执行结果
   */
  result?: SubAgentExecutionResult;

  /**
   * 取消控制器
   */
  abortController: AbortController;
}
