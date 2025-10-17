/**
 * @符号文件自动补全处理服务
 * 独立抽离的@符号处理逻辑，复用CLI的设计
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import { MenuTextMatch, MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin';

// Note: Suggestion interface removed - should import from CLI shared types if needed

// 文件选项类型（用于菜单显示）
export class FileOption extends MenuOption {
  fileName: string;
  filePath: string;

  constructor(fileName: string, filePath: string) {
    super(fileName); // 调用MenuOption构造函数
    this.fileName = fileName;
    this.filePath = filePath;
  }
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

  constructor(config: AtSymbolHandlerConfig = {}) {
    this.config = {
      debounceDelay: 200, // 参考CLI的防抖延迟
      maxResults: 20,
      cacheExpireTime: 5 * 60 * 1000, // 5分钟缓存
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
   * 获取文件选项 (支持缓存和防抖)
   */
  async getFileOptions(queryString: string): Promise<FileOption[]> {
    // 检查缓存
    const cacheKey = queryString;
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
              return new FileOption(fileName, s.label);
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
