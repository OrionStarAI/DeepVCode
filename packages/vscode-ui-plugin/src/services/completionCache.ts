/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';

/**
 * 缓存的补全结果
 */
export interface CachedCompletion {
  text: string;
  timestamp: number;
  position: vscode.Position;
  context: string;  // 上下文摘要（用于验证）
}

/**
 * 双层 Key
 */
export interface CacheKeys {
  hard: string;  // 精确匹配
  soft: string;  // 模糊匹配
}

/**
 * 补全缓存（LRU + 双层 Key）
 */
export class CompletionCache {
  private cache = new Map<string, CachedCompletion>();
  private readonly MAX_SIZE = 256;
  private readonly TTL = 60000; // 60 秒
  
  // 统计信息
  private stats = {
    hardKeyHits: 0,
    softKeyHits: 0,
    misses: 0,
    sets: 0,
  };
  
  /**
   * 获取缓存（尝试硬 Key 和软 Key）
   */
  get(key: string): CachedCompletion | null {
    const cached = this.cache.get(key);
    if (!cached) {
      this.stats.misses++;
      return null;
    }
    
    // 检查是否过期
    if (this.isExpired(cached)) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    return cached;
  }
  
  /**
   * 设置缓存（同时设置硬 Key 和软 Key）
   */
  set(keys: CacheKeys, value: CachedCompletion): void {
    // LRU: 如果超过容量，删除最旧的
    if (this.cache.size >= this.MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    // 同时设置硬 Key 和软 Key
    this.cache.set(keys.hard, value);
    this.cache.set(keys.soft, value);
    this.stats.sets++;
  }
  
  /**
   * 检查是否有缓存
   */
  has(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    if (this.isExpired(cached)) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
  
  /**
   * 检查是否过期
   */
  private isExpired(cached: CachedCompletion): boolean {
    return Date.now() - cached.timestamp > this.TTL;
  }
  
  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }
  
  /**
   * 记录硬 Key 命中
   */
  recordHardHit(): void {
    this.stats.hardKeyHits++;
  }
  
  /**
   * 记录软 Key 命中
   */
  recordSoftHit(): void {
    this.stats.softKeyHits++;
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    const total = this.stats.hardKeyHits + this.stats.softKeyHits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 
        ? ((this.stats.hardKeyHits + this.stats.softKeyHits) / total * 100).toFixed(2) + '%'
        : '0%',
    };
  }
}

/**
 * 构建双层 Key
 */
export function buildCacheKeys(
  document: vscode.TextDocument,
  position: vscode.Position
): CacheKeys {
  // 硬 Key：精确匹配（version 变化就失效）
  const hard = `${document.uri.toString()}:${document.version}:${position.line}:${position.character}`;
  
  // 软 Key：基于内容的模糊匹配
  const line = document.lineAt(position.line);
  const linePrefix = line.text.slice(0, position.character);
  const lineSuffix = line.text.slice(position.character, position.character + 20);
  const soft = `${document.uri.toString()}:${document.languageId}:${hash(linePrefix)}:${hash(lineSuffix)}`;
  
  return { hard, soft };
}

/**
 * 简单哈希函数
 */
function hash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * 验证软匹配是否仍然有效
 */
export function isSoftMatchValid(
  cached: CachedCompletion,
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  // 检查 1：必须在同一行或相邻行
  if (Math.abs(position.line - cached.position.line) > 1) {
    return false;
  }
  
  // 检查 2：列偏移不能太大（≤ 3）
  if (Math.abs(position.character - cached.position.character) > 3) {
    return false;
  }
  
  // 检查 3：补全内容不能是空的
  if (!cached.text || cached.text.trim().length === 0) {
    return false;
  }
  
  // 检查 4：补全内容不能与当前已有内容重复
  const currentLine = document.lineAt(position.line).text;
  const afterCursor = currentLine.slice(position.character);
  if (afterCursor.startsWith(cached.text.trim())) {
    return false; // 已经有了
  }
  
  return true;
}

