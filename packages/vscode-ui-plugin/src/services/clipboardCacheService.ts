/**
 * Clipboard Cache Service
 * 缓存复制的代码信息（文件路径、行号等）
 * 
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import { Logger } from '../utils/logger';

export interface ClipboardCodeInfo {
  fileName: string;
  filePath: string;
  code: string;
  startLine: number;
  endLine: number;
  timestamp: number;
}

/**
 * 剪贴板缓存服务
 * 
 * 当用户复制代码时，缓存文件信息
 * 当 webview 请求时，返回匹配的文件信息
 */
export class ClipboardCacheService {
  private cachedInfo: ClipboardCodeInfo | null = null;
  private readonly CACHE_TIMEOUT = 10000; // 10秒过期

  constructor(private logger: Logger) {}

  /**
   * 缓存复制的代码信息
   */
  cache(info: Omit<ClipboardCodeInfo, 'timestamp'>): void {
    this.cachedInfo = {
      ...info,
      timestamp: Date.now()
    };
    
    // 🎯 不记录文件路径和代码内容到日志（隐私保护）
    this.logger.debug('Clipboard info cached:', {
      fileName: info.fileName,
      lines: `${info.startLine}-${info.endLine}`,
      codeLength: info.code.length
    });
  }

  /**
   * 获取缓存的代码信息
   * 
   * @param pastedCode - 粘贴的代码内容
   * @returns 如果代码匹配且未过期，返回文件信息；否则返回 null
   */
  get(pastedCode: string): ClipboardCodeInfo | null {
    if (!this.cachedInfo) {
      this.logger.debug('No clipboard cache available');
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - this.cachedInfo.timestamp > this.CACHE_TIMEOUT) {
      this.logger.debug('Clipboard cache expired');
      this.cachedInfo = null;
      return null;
    }

    // 检查代码是否匹配
    if (this.cachedInfo.code.trim() !== pastedCode.trim()) {
      this.logger.debug('Clipboard cache code mismatch', {
        cachedLength: this.cachedInfo.code.length,
        pastedLength: pastedCode.length
      });
      return null;
    }

    this.logger.debug('Clipboard cache hit!');
    return this.cachedInfo;
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.cachedInfo = null;
  }
}

