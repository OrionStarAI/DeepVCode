/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { EventEmitter } from 'events';

export interface TokenUsageData {
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  input_tokens: number;
  output_tokens: number;
  credits_usage?: number;
  model?: string;
  timestamp?: number;
}

/**
 * 全局token使用事件管理器
 * 用于在API响应后通知UI更新token显示
 */
class TokenUsageEventManager extends EventEmitter {
  private static instance: TokenUsageEventManager | null = null;

  static getInstance(): TokenUsageEventManager {
    if (!TokenUsageEventManager.instance) {
      TokenUsageEventManager.instance = new TokenUsageEventManager();
    }
    return TokenUsageEventManager.instance;
  }

  /**
   * 发射token使用更新事件
   */
  emitTokenUsage(tokenData: TokenUsageData): void {
    this.emit('tokenUsage', tokenData);
  }

  /**
   * 订阅token使用更新事件
   */
  onTokenUsage(callback: (tokenData: TokenUsageData) => void): void {
    this.on('tokenUsage', callback);
  }

  /**
   * 取消订阅token使用更新事件
   */
  offTokenUsage(callback: (tokenData: TokenUsageData) => void): void {
    this.off('tokenUsage', callback);
  }
}

export const tokenUsageEventManager = TokenUsageEventManager.getInstance();
