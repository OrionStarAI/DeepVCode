/**
 * MCP Enabled State Service
 * 管理 MCP Server 的启用/禁用状态
 *
 * 设计理念：
 * - 实时触发 MCP Server 的物理启动和断开（通过 AIService 协调）
 * - 控制是否将该 MCP 的 tools 注册给 AI
 * - 默认所有 MCP 都是启用的，只有禁用时才写入存储
 * - 使用 VSCode 的 globalState 持久化存储
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import * as vscode from 'vscode';

// 存储 key
const DISABLED_MCP_SERVERS_KEY = 'deepv.disabledMcpServers';

// 状态变化监听器类型
type McpEnabledStateChangeListener = (serverName: string, enabled: boolean) => void;

// 简单日志工具（避免依赖需要 context 的 Logger）
const LOG_PREFIX = '[McpEnabledState]';

/**
 * MCP 启用状态管理服务
 * 单例模式，管理所有 MCP Server 的启用/禁用状态
 */
export class McpEnabledStateService {
  private static instance: McpEnabledStateService | null = null;
  private context: vscode.ExtensionContext | null = null;
  private listeners: Set<McpEnabledStateChangeListener> = new Set();

  // 内存缓存，避免频繁读取 globalState
  private disabledServersCache: Set<string> | null = null;

  private constructor() {
    // 单例模式，构造函数私有
  }

  // 简单日志方法
  private log(level: 'info' | 'warn' | 'error' | 'debug', msg: string, err?: Error): void {
    const fullMsg = `${LOG_PREFIX} ${msg}`;
    switch (level) {
      case 'info': console.log(fullMsg); break;
      case 'warn': console.warn(fullMsg); break;
      case 'error': console.error(fullMsg, err); break;
      case 'debug': console.debug(fullMsg); break;
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance(): McpEnabledStateService {
    if (!McpEnabledStateService.instance) {
      McpEnabledStateService.instance = new McpEnabledStateService();
    }
    return McpEnabledStateService.instance;
  }

  /**
   * 初始化服务（需要 ExtensionContext）
   */
  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadDisabledServers();
    this.log('info', 'McpEnabledStateService initialized');
  }

  /**
   * 从 globalState 加载禁用的服务器列表
   */
  private loadDisabledServers(): void {
    if (!this.context) {
      this.log('warn', 'Context not initialized, using empty cache');
      this.disabledServersCache = new Set();
      return;
    }

    const disabledServers = this.context.globalState.get<string[]>(DISABLED_MCP_SERVERS_KEY, []);
    this.disabledServersCache = new Set(disabledServers);

    if (disabledServers.length > 0) {
      this.log('info', `Loaded ${disabledServers.length} disabled MCP server(s): ${disabledServers.join(', ')}`);
    }
  }

  /**
   * 保存禁用的服务器列表到 globalState
   */
  private async saveDisabledServers(): Promise<void> {
    if (!this.context) {
      this.log('warn', 'Context not initialized, cannot save');
      return;
    }

    const disabledServers = Array.from(this.disabledServersCache || []);
    await this.context.globalState.update(DISABLED_MCP_SERVERS_KEY, disabledServers);
    this.log('debug', `Saved ${disabledServers.length} disabled MCP server(s)`);
  }

  /**
   * 检查某个 MCP Server 是否启用
   * @param serverName MCP 服务器名称
   * @returns true 表示启用，false 表示禁用
   */
  isEnabled(serverName: string): boolean {
    if (!this.disabledServersCache) {
      this.loadDisabledServers();
    }
    const isDisabled = this.disabledServersCache!.has(serverName);
    // 不在禁用列表中 = 启用
    return !isDisabled;
  }

  /**
   * 获取所有 MCP Server 的启用状态
   * @param serverNames 所有 MCP 服务器名称列表
   * @returns Map<serverName, enabled>
   */
  getAllEnabledStates(serverNames: string[]): Map<string, boolean> {
    const states = new Map<string, boolean>();
    for (const name of serverNames) {
      states.set(name, this.isEnabled(name));
    }
    return states;
  }

  /**
   * 设置某个 MCP Server 的启用状态
   * @param serverName MCP 服务器名称
   * @param enabled 是否启用
   */
  async setEnabled(serverName: string, enabled: boolean): Promise<void> {
    if (!this.disabledServersCache) {
      this.loadDisabledServers();
    }

    const wasEnabled = this.isEnabled(serverName);

    if (enabled) {
      // 启用：从禁用列表中移除
      this.disabledServersCache!.delete(serverName);
    } else {
      // 禁用：加入禁用列表
      this.disabledServersCache!.add(serverName);
    }

    // 保存到持久化存储
    await this.saveDisabledServers();

    // 如果状态有变化，通知监听器
    if (wasEnabled !== enabled) {
      this.log('info', `MCP Server '${serverName}' ${enabled ? 'enabled' : 'disabled'}`);
      this.notifyListeners(serverName, enabled);
    }
  }

  /**
   * 切换某个 MCP Server 的启用状态
   * @param serverName MCP 服务器名称
   * @returns 切换后的状态
   */
  async toggleEnabled(serverName: string): Promise<boolean> {
    const currentState = this.isEnabled(serverName);
    const newState = !currentState;
    await this.setEnabled(serverName, newState);
    return newState;
  }

  /**
   * 添加状态变化监听器
   * @param listener 监听器函数
   * @returns 取消监听的函数
   */
  addListener(listener: McpEnabledStateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 通知所有监听器状态变化
   */
  private notifyListeners(serverName: string, enabled: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(serverName, enabled);
      } catch (error) {
        this.log('error', 'Error in MCP enabled state listener', error instanceof Error ? error : undefined);
      }
    }
  }

  /**
   * 过滤工具列表，只保留启用的 MCP Server 的工具
   * @param tools 工具列表
   * @param getServerName 从工具获取所属 MCP Server 名称的函数
   * @returns 过滤后的工具列表
   */
  filterToolsByEnabledState<T>(tools: T[], getServerName: (tool: T) => string | undefined): T[] {
    return tools.filter(tool => {
      const serverName = getServerName(tool);
      // 非 MCP 工具（没有 serverName）总是保留
      if (!serverName) return true;
      // MCP 工具检查启用状态
      return this.isEnabled(serverName);
    });
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.listeners.clear();
    this.disabledServersCache = null;
    this.context = null;
    McpEnabledStateService.instance = null;
    this.log('info', 'McpEnabledStateService disposed');
  }
}
