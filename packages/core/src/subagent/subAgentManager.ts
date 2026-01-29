/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  CustomSubAgentConfig,
  SubAgentInfo,
  AsyncSubAgentTask,
  SubAgentExecutionOptions,
  SubAgentExecutionResult,
  SubAgentProgressInfo,
  SubAgentTrigger,
} from './types.js';
import { BUILT_IN_SUBAGENTS, isBuiltInSubAgentId } from './builtInSubAgents.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { GeminiClient } from '../core/client.js';
import { CustomSubAgent } from './customSubAgent.js';
import { PROJECT_CONFIG_DIR_NAME } from '../config/projectSettings.js';

/**
 * SubAgent 管理器事件
 * SubAgent Manager events
 */
export interface SubAgentManagerEvents {
  /**
   * 任务开始
   */
  'task:start': (task: AsyncSubAgentTask) => void;

  /**
   * 任务进度更新
   */
  'task:progress': (task: AsyncSubAgentTask, progress: SubAgentProgressInfo) => void;

  /**
   * 任务完成
   */
  'task:complete': (task: AsyncSubAgentTask, result: SubAgentExecutionResult) => void;

  /**
   * 任务失败
   */
  'task:failed': (task: AsyncSubAgentTask, error: Error) => void;

  /**
   * 任务取消
   */
  'task:cancelled': (task: AsyncSubAgentTask) => void;

  /**
   * 配置已加载
   */
  'config:loaded': (subAgents: SubAgentInfo[]) => void;

  /**
   * 配置已更新
   */
  'config:updated': (subAgents: SubAgentInfo[]) => void;
}

/**
 * SubAgent 管理器
 * 负责管理内置和自定义 SubAgent，支持异步执行
 * 
 * SubAgent Manager
 * Manages built-in and custom SubAgents, supports async execution
 */
export class SubAgentManager extends EventEmitter {
  private subAgents: Map<string, SubAgentInfo> = new Map();
  private asyncTasks: Map<string, AsyncSubAgentTask> = new Map();
  private config: Config;
  private toolRegistry: ToolRegistry;
  private configFilePath: string;
  private initialized: boolean = false;

  constructor(config: Config, toolRegistry: ToolRegistry) {
    super();
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.configFilePath = path.join(
      config.getProjectRoot(),
      PROJECT_CONFIG_DIR_NAME,
      'subagents.json'
    );
  }

  /**
   * 初始化 SubAgent 管理器
   * Initialize SubAgent Manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 加载内置 SubAgent
    this.loadBuiltInSubAgents();

    // 加载用户自定义 SubAgent
    await this.loadCustomSubAgents();

    this.initialized = true;
    this.emit('config:loaded', this.getAllSubAgents());
  }

  /**
   * 加载内置 SubAgent
   * Load built-in SubAgents
   */
  private loadBuiltInSubAgents(): void {
    for (const [type, config] of Object.entries(BUILT_IN_SUBAGENTS)) {
      if (config.enabled !== false) {
        this.subAgents.set(config.id, {
          config,
          isBuiltIn: true,
          source: 'built-in',
        });
      }
    }
  }

  /**
   * 加载用户自定义 SubAgent
   * Load custom SubAgents from config file
   */
  private async loadCustomSubAgents(): Promise<void> {
    try {
      if (!fs.existsSync(this.configFilePath)) {
        return;
      }

      const content = fs.readFileSync(this.configFilePath, 'utf-8');
      const configs = JSON.parse(content) as { subAgents?: CustomSubAgentConfig[] };

      if (configs.subAgents && Array.isArray(configs.subAgents)) {
        for (const config of configs.subAgents) {
          if (this.validateSubAgentConfig(config)) {
            // 自定义 SubAgent ID 添加 custom: 前缀以避免冲突
            const id = config.id.startsWith('custom:') ? config.id : `custom:${config.id}`;
            const normalizedConfig = { ...config, id };

            if (config.enabled !== false) {
              this.subAgents.set(id, {
                config: normalizedConfig,
                isBuiltIn: false,
                source: this.configFilePath,
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[SubAgentManager] Failed to load custom SubAgents: ${error}`);
    }
  }

  /**
   * 验证 SubAgent 配置
   * Validate SubAgent configuration
   */
  private validateSubAgentConfig(config: CustomSubAgentConfig): boolean {
    if (!config.id || typeof config.id !== 'string') {
      console.warn('[SubAgentManager] Invalid SubAgent config: missing or invalid id');
      return false;
    }
    if (!config.name || typeof config.name !== 'string') {
      console.warn(`[SubAgentManager] Invalid SubAgent config (${config.id}): missing or invalid name`);
      return false;
    }
    if (!config.systemPrompt || typeof config.systemPrompt !== 'string') {
      console.warn(`[SubAgentManager] Invalid SubAgent config (${config.id}): missing or invalid systemPrompt`);
      return false;
    }
    return true;
  }

  /**
   * 获取所有已注册的 SubAgent
   * Get all registered SubAgents
   */
  getAllSubAgents(): SubAgentInfo[] {
    return Array.from(this.subAgents.values());
  }

  /**
   * 获取所有启用的 SubAgent
   * Get all enabled SubAgents
   */
  getEnabledSubAgents(): SubAgentInfo[] {
    return this.getAllSubAgents().filter(info => info.config.enabled !== false);
  }

  /**
   * 根据 ID 获取 SubAgent
   * Get SubAgent by ID
   */
  getSubAgent(id: string): SubAgentInfo | undefined {
    return this.subAgents.get(id);
  }

  /**
   * 根据触发条件匹配最佳 SubAgent
   * Match the best SubAgent based on trigger conditions
   */
  matchSubAgent(prompt: string): SubAgentInfo | undefined {
    let bestMatch: { info: SubAgentInfo; priority: number } | undefined;

    for (const info of this.getEnabledSubAgents()) {
      const triggers = info.config.triggers;
      if (!triggers || triggers.length === 0) {
        continue;
      }

      for (const trigger of triggers) {
        if (this.matchTrigger(prompt, trigger)) {
          const priority = trigger.priority ?? 0;
          if (!bestMatch || priority > bestMatch.priority) {
            bestMatch = { info, priority };
          }
        }
      }
    }

    return bestMatch?.info;
  }

  /**
   * 匹配单个触发条件
   * Match a single trigger condition
   */
  private matchTrigger(prompt: string, trigger: SubAgentTrigger): boolean {
    const lowerPrompt = prompt.toLowerCase();

    switch (trigger.type) {
      case 'keyword':
        return lowerPrompt.includes(trigger.value.toLowerCase());
      case 'pattern':
        try {
          const regex = new RegExp(trigger.value, 'i');
          return regex.test(prompt);
        } catch {
          return false;
        }
      case 'file_extension':
        return lowerPrompt.includes(trigger.value.toLowerCase());
      default:
        return false;
    }
  }

  /**
   * 执行 SubAgent（同步或异步）
   * Execute SubAgent (sync or async)
   */
  async executeSubAgent(
    subAgentId: string,
    options: SubAgentExecutionOptions,
  ): Promise<SubAgentExecutionResult | AsyncSubAgentTask> {
    const info = this.getSubAgent(subAgentId);
    if (!info) {
      throw new Error(`SubAgent not found: ${subAgentId}`);
    }

    if (options.async) {
      return this.executeSubAgentAsync(info, options);
    } else {
      return this.executeSubAgentSync(info, options);
    }
  }

  /**
   * 同步执行 SubAgent
   * Execute SubAgent synchronously
   */
  private async executeSubAgentSync(
    info: SubAgentInfo,
    options: SubAgentExecutionOptions,
  ): Promise<SubAgentExecutionResult> {
    const startTime = Date.now();
    const geminiClient = this.config.getGeminiClient();

    if (!geminiClient) {
      throw new Error('GeminiClient not initialized');
    }

    try {
      // 创建自定义 SubAgent 实例
      const subAgent = new CustomSubAgent(
        this.config,
        this.createFilteredToolRegistry(info.config),
        geminiClient,
        info.config,
        (output: string) => {
          // 解析进度信息
          if (output.startsWith('SUBAGENT_STATUS_CHANGE:')) {
            try {
              const data = JSON.parse(output.replace('SUBAGENT_STATUS_CHANGE:', ''));
              const progress: SubAgentProgressInfo = {
                subAgentId: info.config.id,
                status: data.status,
                currentTurn: data.currentTurn,
                maxTurns: data.maxTurns,
                message: data.summary,
              };
              options.onProgress?.(progress);
            } catch {
              // Ignore parse errors
            }
          }
        },
        options.abortSignal,
      );

      const result = await subAgent.executeTask(
        options.prompt,
        options.maxTurns ?? info.config.defaultMaxTurns ?? 50
      );

      return {
        subAgentId: info.config.id,
        success: result.success,
        summary: result.summary,
        error: result.error,
        executionLog: result.executionLog,
        filesCreated: result.filesCreated,
        commandsRun: result.commandsRun,
        tokenUsage: result.tokenUsage,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        subAgentId: info.config.id,
        success: false,
        summary: 'Execution failed',
        error: error instanceof Error ? error.message : String(error),
        executionLog: [],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 异步执行 SubAgent（不阻塞主 Agent）
   * Execute SubAgent asynchronously (non-blocking)
   */
  private async executeSubAgentAsync(
    info: SubAgentInfo,
    options: SubAgentExecutionOptions,
  ): Promise<AsyncSubAgentTask> {
    const taskId = `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const abortController = new AbortController();

    // 如果传入了 abortSignal，连接到我们的 abortController
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        abortController.abort();
      });
    }

    const task: AsyncSubAgentTask = {
      taskId,
      subAgentId: info.config.id,
      subAgentName: info.config.name,
      description: options.description,
      status: 'pending',
      startTime: Date.now(),
      currentTurn: 0,
      maxTurns: options.maxTurns ?? info.config.defaultMaxTurns ?? 50,
      abortController,
    };

    this.asyncTasks.set(taskId, task);
    this.emit('task:start', task);

    // 异步启动执行，不等待完成
    this.runAsyncTask(task, info, options).catch(error => {
      console.error(`[SubAgentManager] Async task ${taskId} error:`, error);
    });

    return task;
  }

  /**
   * 运行异步任务
   * Run async task
   */
  private async runAsyncTask(
    task: AsyncSubAgentTask,
    info: SubAgentInfo,
    options: SubAgentExecutionOptions,
  ): Promise<void> {
    const geminiClient = this.config.getGeminiClient();

    if (!geminiClient) {
      task.status = 'failed';
      task.endTime = Date.now();
      const error = new Error('GeminiClient not initialized');
      this.emit('task:failed', task, error);
      options.onComplete?.({
        subAgentId: info.config.id,
        success: false,
        summary: 'Execution failed',
        error: error.message,
        executionLog: [],
      });
      return;
    }

    try {
      task.status = 'running';

      // 创建自定义 SubAgent 实例
      const subAgent = new CustomSubAgent(
        this.config,
        this.createFilteredToolRegistry(info.config),
        geminiClient,
        info.config,
        (output: string) => {
          // 解析进度信息
          if (output.startsWith('SUBAGENT_STATUS_CHANGE:')) {
            try {
              const data = JSON.parse(output.replace('SUBAGENT_STATUS_CHANGE:', ''));
              task.currentTurn = data.currentTurn ?? task.currentTurn;
              task.status = data.status === 'completed' ? 'completed' :
                            data.status === 'failed' ? 'failed' :
                            data.status === 'cancelled' ? 'cancelled' : 'running';

              const progress: SubAgentProgressInfo = {
                subAgentId: info.config.id,
                status: data.status,
                currentTurn: data.currentTurn,
                maxTurns: data.maxTurns,
                message: data.summary,
              };
              options.onProgress?.(progress);
              this.emit('task:progress', task, progress);
            } catch {
              // Ignore parse errors
            }
          }
        },
        task.abortController.signal,
      );

      const result = await subAgent.executeTask(
        options.prompt,
        task.maxTurns
      );

      task.status = result.success ? 'completed' : 'failed';
      task.endTime = Date.now();

      const executionResult: SubAgentExecutionResult = {
        subAgentId: info.config.id,
        success: result.success,
        summary: result.summary,
        error: result.error,
        executionLog: result.executionLog,
        filesCreated: result.filesCreated,
        commandsRun: result.commandsRun,
        tokenUsage: result.tokenUsage,
        durationMs: task.endTime - task.startTime,
      };

      task.result = executionResult;
      this.emit('task:complete', task, executionResult);
      options.onComplete?.(executionResult);

    } catch (error) {
      task.status = 'failed';
      task.endTime = Date.now();

      const executionResult: SubAgentExecutionResult = {
        subAgentId: info.config.id,
        success: false,
        summary: 'Execution failed',
        error: error instanceof Error ? error.message : String(error),
        executionLog: [],
        durationMs: task.endTime - task.startTime,
      };

      task.result = executionResult;

      if (task.abortController.signal.aborted) {
        task.status = 'cancelled';
        this.emit('task:cancelled', task);
      } else {
        this.emit('task:failed', task, error instanceof Error ? error : new Error(String(error)));
      }

      options.onComplete?.(executionResult);
    }
  }

  /**
   * 创建过滤后的工具注册表
   * Create filtered tool registry based on SubAgent config
   */
  private createFilteredToolRegistry(config: CustomSubAgentConfig): ToolRegistry {
    const filteredRegistry = new ToolRegistry(this.config);
    const allTools = this.toolRegistry.getAllTools();

    for (const tool of allTools) {
      // 首先检查工具是否允许子 agent 使用
      if (!tool.allowSubAgentUse) {
        continue;
      }

      // 检查排除列表
      if (config.excludedTools?.includes(tool.name)) {
        continue;
      }

      // 检查允许列表（如果指定）
      if (config.allowedTools && !config.allowedTools.includes(tool.name)) {
        continue;
      }

      filteredRegistry.registerTool(tool);
    }

    return filteredRegistry;
  }

  /**
   * 取消异步任务
   * Cancel async task
   */
  cancelTask(taskId: string): boolean {
    const task = this.asyncTasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === 'pending' || task.status === 'running') {
      task.abortController.abort();
      task.status = 'cancelled';
      task.endTime = Date.now();
      this.emit('task:cancelled', task);
      return true;
    }

    return false;
  }

  /**
   * 获取异步任务
   * Get async task
   */
  getTask(taskId: string): AsyncSubAgentTask | undefined {
    return this.asyncTasks.get(taskId);
  }

  /**
   * 获取所有异步任务
   * Get all async tasks
   */
  getAllTasks(): AsyncSubAgentTask[] {
    return Array.from(this.asyncTasks.values());
  }

  /**
   * 获取运行中的任务
   * Get running tasks
   */
  getRunningTasks(): AsyncSubAgentTask[] {
    return this.getAllTasks().filter(task => 
      task.status === 'pending' || task.status === 'running'
    );
  }

  /**
   * 注册自定义 SubAgent
   * Register a custom SubAgent
   */
  registerSubAgent(config: CustomSubAgentConfig): void {
    if (!this.validateSubAgentConfig(config)) {
      throw new Error('Invalid SubAgent configuration');
    }

    const id = config.id.startsWith('custom:') ? config.id : `custom:${config.id}`;
    const normalizedConfig = { ...config, id };

    this.subAgents.set(id, {
      config: normalizedConfig,
      isBuiltIn: false,
      source: 'runtime',
    });

    this.emit('config:updated', this.getAllSubAgents());
  }

  /**
   * 取消注册 SubAgent
   * Unregister a SubAgent
   */
  unregisterSubAgent(id: string): boolean {
    const info = this.subAgents.get(id);
    if (!info || info.isBuiltIn) {
      return false;
    }

    this.subAgents.delete(id);
    this.emit('config:updated', this.getAllSubAgents());
    return true;
  }

  /**
   * 保存自定义 SubAgent 配置
   * Save custom SubAgent configurations to file
   */
  async saveCustomSubAgents(): Promise<void> {
    const customSubAgents = this.getAllSubAgents()
      .filter(info => !info.isBuiltIn && info.source !== 'runtime')
      .map(info => {
        // 移除 custom: 前缀进行保存
        const config = { ...info.config };
        if (config.id.startsWith('custom:')) {
          config.id = config.id.slice(7);
        }
        return config;
      });

    const configDir = path.dirname(this.configFilePath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const content = JSON.stringify({ subAgents: customSubAgents }, null, 2);
    fs.writeFileSync(this.configFilePath, content, 'utf-8');
  }

  /**
   * 重新加载配置
   * Reload configuration
   */
  async reload(): Promise<void> {
    // 清除自定义 SubAgent（保留内置的）
    for (const [id, info] of this.subAgents) {
      if (!info.isBuiltIn) {
        this.subAgents.delete(id);
      }
    }

    // 重新加载自定义 SubAgent
    await this.loadCustomSubAgents();
    this.emit('config:updated', this.getAllSubAgents());
  }

  /**
   * 清理已完成的任务
   * Clean up completed tasks
   */
  cleanupCompletedTasks(olderThanMs: number = 3600000): void {
    const now = Date.now();
    for (const [taskId, task] of this.asyncTasks) {
      if (
        (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
        task.endTime &&
        now - task.endTime > olderThanMs
      ) {
        this.asyncTasks.delete(taskId);
      }
    }
  }
}
