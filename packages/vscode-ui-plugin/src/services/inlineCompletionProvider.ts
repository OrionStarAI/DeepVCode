/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { CompletionCache, buildCacheKeys, isSoftMatchValid } from './completionCache';
import { Logger } from '../utils/logger';

/**
 * DeepV Code 的内联代码补全提供者（拉模式 - 只读缓存）
 * 
 * 职责：
 * - 被 VSCode 频繁调用
 * - 立即返回缓存结果（< 10ms）
 * - 不做网络请求
 * - 不做防抖
 * 
 * 架构：推-拉分离
 * - 推（后台）：CompletionScheduler 监听文档变化，执行防抖和 API 请求
 * - 拉（前台）：Provider 只读缓存，立即返回
 */
export class DeepVInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private logger: Logger;
  private cache: CompletionCache;

  // 性能统计
  private stats = {
    totalRequests: 0,
    hardKeyHits: 0,
    softKeyHits: 0,
    cacheMisses: 0,
  };

  constructor(cache: CompletionCache, logger: Logger) {
    this.cache = cache;
    this.logger = logger;
  }

  /**
   * 实现 VSCode 的 provideInlineCompletionItems 方法
   * 
   * ⚠️ 重要：只读缓存，不做网络请求
   */
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null | undefined> {
    const startTime = Date.now();
    
    try {
      // 检查是否启用了补全功能
      const config = vscode.workspace.getConfiguration('deepv');
      const enableInlineCompletion = config.get<boolean>('enableInlineCompletion', false);

      if (!enableInlineCompletion) {
        return null;
      }

      this.stats.totalRequests++;

      // 检查是否被取消
      if (token.isCancellationRequested) {
        return null;
      }

      // 构建双层 Key
      const keys = buildCacheKeys(document, position);
      
      // 1. 尝试硬匹配（最精确）
      const exactMatch = this.cache.get(keys.hard);
      if (exactMatch) {
        this.stats.hardKeyHits++;
        this.cache.recordHardHit();
        const duration = Date.now() - startTime;
        this.logger.debug(`✅ Hard key hit in ${duration}ms`, {
          position: `${position.line}:${position.character}`,
        });
        
        return [new vscode.InlineCompletionItem(exactMatch.text)];
      }
      
      // 2. 尝试软匹配（模糊，需要验证）
      const softMatch = this.cache.get(keys.soft);
      if (softMatch && isSoftMatchValid(softMatch, document, position)) {
        this.stats.softKeyHits++;
        this.cache.recordSoftHit();
        const duration = Date.now() - startTime;
        this.logger.debug(`✅ Soft key hit in ${duration}ms`, {
          position: `${position.line}:${position.character}`,
        });
        
        return [new vscode.InlineCompletionItem(softMatch.text)];
      }
      
      // 3. 都没命中
      this.stats.cacheMisses++;
      const duration = Date.now() - startTime;
      this.logger.debug(`❌ Cache miss in ${duration}ms`, {
        position: `${position.line}:${position.character}`,
        cacheSize: this.cache.size(),
      });
      
      return null;
    } catch (error) {
      this.logger.error('Error providing inline completion', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * 获取性能统计
   */
  getStats() {
    const total = this.stats.totalRequests;
    const hits = this.stats.hardKeyHits + this.stats.softKeyHits;
    
    return {
      ...this.stats,
      hitRate: total > 0 ? ((hits / total) * 100).toFixed(2) + '%' : '0%',
      cacheStats: this.cache.getStats(),
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      hardKeyHits: 0,
      softKeyHits: 0,
      cacheMisses: 0,
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.logger.info('InlineCompletionProvider disposed', {
      stats: this.getStats(),
    });
  }
}
