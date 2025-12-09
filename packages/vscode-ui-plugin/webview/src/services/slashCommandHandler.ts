/**
 * 斜杠命令自动补全处理服务
 * 独立抽离的 / 符号处理逻辑，参考 atSymbolHandler 设计
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import { MenuTextMatch, MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin';

/**
 * 斜杠命令信息（来自 Extension）
 */
export interface SlashCommandInfo {
  name: string;
  description: string;
  kind: 'file' | 'built-in';
}

/**
 * 斜杠命令选项（用于菜单显示）
 */
export class SlashCommandOption extends MenuOption {
  name: string;
  description: string;
  kind: 'file' | 'built-in';

  constructor(command: SlashCommandInfo) {
    super(command.name);
    this.name = command.name;
    this.description = command.description;
    this.kind = command.kind;
  }
}

export interface SlashCommandHandlerConfig {
  /** 防抖延迟时间（毫秒） */
  debounceDelay?: number;
  /** 最大结果数量 */
  maxResults?: number;
  /** 缓存有效期（毫秒） */
  cacheExpireTime?: number;
}

interface CacheEntry {
  commands: SlashCommandInfo[];
  timestamp: number;
}

/**
 * 斜杠命令自动补全处理器
 */
export class SlashCommandHandler {
  private commandsCache: CacheEntry | null = null;
  private debounceTimer: number | null = null;
  private pendingRequest: Promise<SlashCommandInfo[]> | null = null;
  private config: Required<SlashCommandHandlerConfig>;

  constructor(config: SlashCommandHandlerConfig = {}) {
    this.config = {
      debounceDelay: 100,
      maxResults: 20,
      cacheExpireTime: 30 * 1000, // 30 秒缓存
      ...config,
    };
  }

  /**
   * 检查 / 符号触发条件
   * 只在行首或空格后的 / 才触发
   */
  checkForTriggerMatch(text: string): MenuTextMatch | null {
    // 匹配行首的 / 或者空格后的 /，后面跟着可选的命令名
    const match = text.match(/(^|\s)\/([^\s]*)$/);
    if (match) {
      const leadOffset = match.index! + match[1].length; // 跳过前面的空格
      return {
        leadOffset,
        matchingString: match[2], // 命令名部分（不含 /）
        replaceableString: '/' + match[2], // 完整的可替换文本
      };
    }
    return null;
  }

  /**
   * 获取命令选项
   */
  async getCommandOptions(queryString: string): Promise<SlashCommandOption[]> {
    const commands = await this.fetchCommands();

    // 过滤和排序
    const query = queryString.toLowerCase();
    const filtered = commands
      .filter(cmd =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query)
      )
      .slice(0, this.config.maxResults);

    return filtered.map(cmd => new SlashCommandOption(cmd));
  }

  /**
   * 防抖搜索命令
   */
  searchCommandsWithDebounce(queryString: string, callback: (results: SlashCommandOption[]) => void): void {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(async () => {
      try {
        const results = await this.getCommandOptions(queryString);
        callback(results);
      } catch (error) {
        console.error('Error searching slash commands:', error);
        callback([]);
      }
    }, this.config.debounceDelay);
  }

  /**
   * 执行自定义命令
   */
  async executeCommand(commandName: string, args: string): Promise<{ success: boolean; prompt?: string; error?: string }> {
    return new Promise((resolve) => {
      if (!window.vscode) {
        resolve({ success: false, error: 'VSCode API not available' });
        return;
      }

      const messageListener = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'slash_command_result') {
          window.removeEventListener('message', messageListener);
          resolve(message.payload);
        }
      };

      window.addEventListener('message', messageListener);

      window.vscode.postMessage({
        type: 'execute_custom_slash_command',
        payload: { commandName, args },
      });

      // 超时处理
      setTimeout(() => {
        window.removeEventListener('message', messageListener);
        resolve({ success: false, error: 'Command execution timeout' });
      }, 10000);
    });
  }

  /**
   * 从 Extension 获取命令列表
   */
  private async fetchCommands(): Promise<SlashCommandInfo[]> {
    // 检查缓存
    const now = Date.now();
    if (this.commandsCache && now - this.commandsCache.timestamp < this.config.cacheExpireTime) {
      return this.commandsCache.commands;
    }

    // 如果已有请求在进行，等待其完成
    if (this.pendingRequest) {
      return this.pendingRequest;
    }

    this.pendingRequest = this.requestCommandsFromExtension();

    try {
      const commands = await this.pendingRequest;
      this.commandsCache = { commands, timestamp: now };
      return commands;
    } finally {
      this.pendingRequest = null;
    }
  }

  /**
   * 向 Extension 请求命令列表
   */
  private requestCommandsFromExtension(): Promise<SlashCommandInfo[]> {
    return new Promise((resolve) => {
      if (!window.vscode) {
        resolve([]);
        return;
      }

      const messageListener = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'slash_commands_list') {
          window.removeEventListener('message', messageListener);
          resolve(message.payload.commands || []);
        }
      };

      window.addEventListener('message', messageListener);

      window.vscode.postMessage({
        type: 'get_slash_commands',
        payload: {},
      });

      // 超时处理
      setTimeout(() => {
        window.removeEventListener('message', messageListener);
        resolve([]);
      }, 5000);
    });
  }

  /**
   * 刷新命令缓存
   */
  async refreshCommands(): Promise<void> {
    this.commandsCache = null;
    await this.fetchCommands();
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.commandsCache = null;
    this.pendingRequest = null;
  }
}

// 全局单例实例
export const slashCommandHandler = new SlashCommandHandler();
