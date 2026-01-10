/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { EventEmitter } from 'events';

export interface RealTimeTokenData {
  inputTokens: number;
  outputTokens?: number;
  totalTokens: number;
  timestamp: number;
}

/**
 * 实时token事件管理器
 * 用于在请求发送时立即显示token数量，提供用户反馈
 */
class RealTimeTokenEventManager extends EventEmitter {
  private static instance: RealTimeTokenEventManager | null = null;

  static getInstance(): RealTimeTokenEventManager {
    if (!RealTimeTokenEventManager.instance) {
      RealTimeTokenEventManager.instance = new RealTimeTokenEventManager();
    }
    return RealTimeTokenEventManager.instance;
  }

  /**
   * 发射实时token数据事件
   */
  emitRealTimeToken(tokenData: RealTimeTokenData): void {
    this.emit('realTimeToken', tokenData);
  }

  /**
   * 订阅实时token数据事件
   */
  onRealTimeToken(callback: (tokenData: RealTimeTokenData) => void): void {
    this.on('realTimeToken', callback);
  }

  /**
   * 取消订阅实时token数据事件
   */
  offRealTimeToken(callback: (tokenData: RealTimeTokenData) => void): void {
    this.off('realTimeToken', callback);
  }

  /**
   * 清除所有实时token数据（比如请求完成时）
   */
  clearRealTimeToken(): void {
    this.emit('clearRealTimeToken');
  }

  /**
   * 监听清除事件
   */
  onClearRealTimeToken(callback: () => void): void {
    this.on('clearRealTimeToken', callback);
  }

  /**
   * 取消监听清除事件
   */
  offClearRealTimeToken(callback: () => void): void {
    this.off('clearRealTimeToken', callback);
  }
}

export const realTimeTokenEventManager = RealTimeTokenEventManager.getInstance();