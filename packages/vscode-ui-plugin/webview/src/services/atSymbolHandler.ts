/**
 * @符号文件自动补全处理服务
 * 独立抽离的@符号处理逻辑，复用CLI的设计
 *
 * 🎯 增强版：支持最近文件、文件夹、终端选择
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import { MenuTextMatch, MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import React from 'react';
import { FilesIcon, TerminalIcon } from '../components/MenuIcons';
import { getFileIcon } from '../components/FileIcons';

// 🎯 菜单项类型
export type MenuItemType = 'recent_file' | 'file' | 'category' | 'terminal';

// 文件选项类型（用于菜单显示）
export class FileOption extends MenuOption {
  fileName: string;
  filePath: string;
  itemType: MenuItemType;
  icon?: string | React.ReactNode;
  hasSubmenu?: boolean;
  terminalId?: number;

  constructor(
    fileName: string,
    filePath: string,
    itemType: MenuItemType = 'file',
    options?: {
      icon?: string | React.ReactNode;
      hasSubmenu?: boolean;
      terminalId?: number;
    }
  ) {
    super(fileName);
    this.fileName = fileName;
    this.filePath = filePath;
    this.itemType = itemType;
    this.icon = options?.icon;
    this.hasSubmenu = options?.hasSubmenu;
    this.terminalId = options?.terminalId;
  }
}

// 🎯 终端信息
export interface TerminalInfo {
  id: number;
  name: string;
}

export interface AtSymbolHandlerConfig {
  /** 防抖延迟时间（毫秒） */
  debounceDelay?: number;
  /** 最大结果数量 */
  maxResults?: number;
  /** 缓存有效期（毫秒） */
  cacheExpireTime?: number;
}

interface CacheEntry {
  results: FileOption[];
  timestamp: number;
}

/**
 * @符号文件自动补全处理器
 * 直接复用CLI中的触发逻辑和通信机制
 */
export class AtSymbolHandler {
  private cache = new Map<string, CacheEntry>();
  private debounceTimer: number | null = null;
  private currentPromise: Promise<FileOption[]> | null = null;
  private config: Required<AtSymbolHandlerConfig>;

  // 🎯 缓存数据
  private recentFiles: FileOption[] = [];
  private terminals: TerminalInfo[] = [];
  private currentView: 'main' | 'files' | 'terminals' = 'main';

  constructor(config: AtSymbolHandlerConfig = {}) {
    this.config = {
      debounceDelay: 200,
      maxResults: 20,
      cacheExpireTime: 5 * 60 * 1000,
      ...config,
    };
  }

  /**
   * 检查@符号触发条件 (直接复用CLI的触发逻辑)
   */
  checkForTriggerMatch(text: string): MenuTextMatch | null {
    const match = text.match(/@([^@\s]*)$/);
    if (match) {
      return {
        leadOffset: match.index!,
        matchingString: match[1],
        replaceableString: match[0],
      };
    }
    return null;
  }

  /**
   * 🎯 获取主菜单选项（最近文件 + 分类）
   */
  async getMainMenuOptions(): Promise<FileOption[]> {
    const options: FileOption[] = [];

    // 1. 获取最近打开的文件（最多3个）
    await this.fetchRecentFiles();
    if (this.recentFiles.length > 0) {
      options.push(...this.recentFiles);
    }

    // 2. 添加分类选项
    options.push(new FileOption(
      'Files & Folders',
      '__category_files__',
      'category',
      { icon: React.createElement(FilesIcon), hasSubmenu: true }
    ));

    options.push(new FileOption(
      'Terminals',
      '__category_terminals__',
      'category',
      { icon: React.createElement(TerminalIcon), hasSubmenu: true }
    ));

    return options;
  }

  /**
   * 🎯 获取终端列表选项
   */
  async getTerminalOptions(): Promise<FileOption[]> {
    await this.fetchTerminals();

    if (this.terminals.length === 0) {
      return [];
    }

    return this.terminals.map(terminal => new FileOption(
      terminal.name,
      `__terminal_${terminal.id}__`,
      'terminal',
      { icon: React.createElement(TerminalIcon), terminalId: terminal.id }
    ));
  }

  /**
   * 🎯 获取终端输出
   */
  async getTerminalOutput(terminalId: number): Promise<{ name: string; output: string } | null> {
    return new Promise((resolve) => {
      if (window.vscode) {
        const messageListener = (event: MessageEvent) => {
          const message = event.data;
          if (message.type === 'terminal_output_result' && message.payload.terminalId === terminalId) {
            window.removeEventListener('message', messageListener);
            resolve({
              name: message.payload.name,
              output: message.payload.output
            });
          }
        };

        window.addEventListener('message', messageListener);
        window.vscode.postMessage({
          type: 'get_terminal_output',
          payload: { terminalId }
        });

        setTimeout(() => {
          window.removeEventListener('message', messageListener);
          resolve(null);
        }, 5000);
      } else {
        resolve(null);
      }
    });
  }

  /**
   * 🎯 获取最近打开的文件
   */
  private async fetchRecentFiles(): Promise<void> {
    return new Promise((resolve) => {
      if (window.vscode) {
        const messageListener = (event: MessageEvent) => {
          const message = event.data;
          if (message.type === 'recent_files_result') {
            window.removeEventListener('message', messageListener);
            const files = message.payload.files || [];
            this.recentFiles = files.slice(0, 3).map((f: any) => new FileOption(
              f.description || f.label.split('/').pop() || f.label,
              f.label,
              'recent_file',
              { icon: this.getFileIcon(f.label) }
            ));
            resolve();
          }
        };

        window.addEventListener('message', messageListener);
        window.vscode.postMessage({
          type: 'get_recent_files',
          payload: {}
        });

        setTimeout(() => {
          window.removeEventListener('message', messageListener);
          resolve();
        }, 2000);
      } else {
        resolve();
      }
    });
  }

  /**
   * 🎯 获取终端列表
   */
  private async fetchTerminals(): Promise<void> {
    return new Promise((resolve) => {
      if (window.vscode) {
        console.log('[AtSymbolHandler] Fetching terminals...');

        const messageListener = (event: MessageEvent) => {
          const message = event.data;
          console.log('[AtSymbolHandler] Received message:', message.type);
          if (message.type === 'terminals_result') {
            window.removeEventListener('message', messageListener);
            this.terminals = message.payload.terminals || [];
            console.log('[AtSymbolHandler] Terminals received:', this.terminals);
            resolve();
          }
        };

        window.addEventListener('message', messageListener);
        window.vscode.postMessage({
          type: 'get_terminals',
          payload: {}
        });

        setTimeout(() => {
          console.log('[AtSymbolHandler] Terminals fetch timeout, current terminals:', this.terminals);
          window.removeEventListener('message', messageListener);
          resolve();
        }, 3000);
      } else {
        console.log('[AtSymbolHandler] No vscode API available');
        resolve();
      }
    });
  }

  /**
   * 🎯 根据文件扩展名获取图标
   */
  private getFileIcon(filePath: string): React.ReactNode {
    return getFileIcon(filePath);
  }

  /**
   * 获取文件选项 (支持缓存和防抖)
   */
  async getFileOptions(queryString: string): Promise<FileOption[]> {
    // 如果没有查询字符串，返回主菜单
    if (!queryString || queryString.trim() === '') {
      return this.getMainMenuOptions();
    }

    return this.searchFiles(queryString);
  }

  /**
   * 🎯 搜索文件（不返回主菜单，直接搜索）
   */
  async searchFiles(queryString: string): Promise<FileOption[]> {
    // 检查缓存
    const cacheKey = `search:${queryString}`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.config.cacheExpireTime) {
      return cached.results;
    }

    // 如果已有相同的请求在进行，等待其完成
    if (this.currentPromise) {
      return this.currentPromise;
    }

    // 创建新的搜索Promise
    this.currentPromise = this.performFileSearch(queryString);

    try {
      const results = await this.currentPromise;

      // 更新缓存
      this.cache.set(cacheKey, {
        results,
        timestamp: now,
      });

      return results;
    } finally {
      this.currentPromise = null;
    }
  }

  /**
   * 防抖搜索文件
   */
  searchFilesWithDebounce(queryString: string, callback: (results: FileOption[]) => void) {
    // 清除之前的定时器
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }

    // 设置新的定时器
    this.debounceTimer = window.setTimeout(async () => {
      try {
        const results = await this.getFileOptions(queryString);
        callback(results);
      } catch (error) {
        console.error('Error searching files:', error);
        callback([]);
      }
    }, this.config.debounceDelay);
  }

  /**
   * 执行文件搜索 (通过VSCode通信)
   */
  private async performFileSearch(queryString: string): Promise<FileOption[]> {
    return new Promise((resolve) => {
      // 发送文件搜索请求到VSCode
      if (window.vscode) {
        // 设置一次性消息监听器
        const messageListener = (event: MessageEvent) => {
          const message = event.data;
          if (message.type === 'file_search_result') {
            window.removeEventListener('message', messageListener);
            const suggestions: Array<{label: string; value: string; description?: string}> = message.payload.files || [];

            // 转换为FileOption格式
            const fileOptions = suggestions.map(s => {
              const fileName = s.label.split('/').pop() || s.label;
              return new FileOption(
                fileName,
                s.label,
                'file',
                { icon: this.getFileIcon(s.label) }
              );
            });

            resolve(fileOptions.slice(0, this.config.maxResults));
          }
        };

        window.addEventListener('message', messageListener);

        // 发送搜索请求
        window.vscode.postMessage({
          type: 'file_search',
          payload: { prefix: queryString }
        });

        // 超时处理
        setTimeout(() => {
          window.removeEventListener('message', messageListener);
          resolve([]);
        }, 5000); // 5秒超时
      } else {
        // 开发模式或非VSCode环境，返回空数组
        resolve([]);
      }
    });
  }

  /**
   * 🎯 设置当前视图
   */
  setCurrentView(view: 'main' | 'files' | 'terminals') {
    this.currentView = view;
  }

  /**
   * 🎯 获取当前视图
   */
  getCurrentView(): 'main' | 'files' | 'terminals' {
    return this.currentView;
  }

  /**
   * 🎯 重置视图到主菜单
   */
  resetView() {
    this.currentView = 'main';
  }

  /**
   * 清理资源
   */
  dispose() {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.cache.clear();
    this.currentPromise = null;
  }

  /**
   * 清理过期缓存
   */
  cleanExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.cacheExpireTime) {
        this.cache.delete(key);
      }
    }
  }
}

// 全局单例实例
export const atSymbolHandler = new AtSymbolHandler();

// 定期清理过期缓存
setInterval(() => {
  atSymbolHandler.cleanExpiredCache();
}, 5 * 60 * 1000); // 5分钟清理一次