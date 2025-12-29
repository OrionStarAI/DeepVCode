/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TerminalSize {
  columns: number;
  rows: number;
}

/**
 * 集中化的终端尺寸管理器
 *
 * 问题: 之前有 15+ 个组件独立监听 process.stdout 的 'resize' 事件，
 *      导致超过 Node.js 默认监听器限制（10 个），引发 MaxListenersExceededWarning
 *
 * 解决方案: 创建单一全局监听器，所有消费者通过 subscribe 订阅变化
 *
 * 效果:
 * - 监听器数: 17 -> 1 (降低 94%)
 * - 事件处理: 减少重复处理
 * - 消除警告: ✓
 */
export class TerminalSizeManager {
  private static instance: TerminalSizeManager;

  private padding_x = 8;
  private currentSize: TerminalSize;
  private subscribers = new Set<(size: TerminalSize) => void>();
  private resizeHandler = () => {
    this.updateAndNotify();
  };

  private constructor() {
    this.currentSize = this.getSize();
    // 仅在这里添加唯一的 resize 监听器
    process.stdout.on('resize', this.resizeHandler);
  }

  /**
   * 获取单例实例
   */
  static getInstance(): TerminalSizeManager {
    if (!TerminalSizeManager.instance) {
      TerminalSizeManager.instance = new TerminalSizeManager();
    }
    return TerminalSizeManager.instance;
  }

  /**
   * 获取当前终端尺寸
   */
  getSize(): TerminalSize {
    return {
      columns: (process.stdout.columns || 60) - this.padding_x,
      rows: process.stdout.rows || 20,
    };
  }

  /**
   * 获取当前的终端尺寸（同步）
   */
  getTerminalSize(): TerminalSize {
    return { ...this.currentSize };
  }

  /**
   * 订阅尺寸变化
   * @param callback 当尺寸改变时的回调
   * @returns 取消订阅函数
   */
  subscribe(callback: (size: TerminalSize) => void): () => void {
    this.subscribers.add(callback);

    // 立即执行一次，确保初始值正确
    callback(this.currentSize);

    // 返回取消订阅函数
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * 内部方法：更新尺寸并通知所有订阅者
   */
  private updateAndNotify(): void {
    const newSize = this.getSize();

    // 仅在尺寸实际改变时通知
    if (
      newSize.columns !== this.currentSize.columns ||
      newSize.rows !== this.currentSize.rows
    ) {
      this.currentSize = newSize;
      this.subscribers.forEach(callback => {
        try {
          callback(newSize);
        } catch (error) {
          console.error('Error in terminal size subscriber:', error);
        }
      });
    }
  }

  /**
   * 获取当前的订阅者数量（用于调试）
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * 清理所有资源（仅用于测试）
   */
  dispose(): void {
    process.stdout.removeListener('resize', this.resizeHandler);
    this.subscribers.clear();
  }
}

// 为方便使用导出单例实例
export const terminalSizeManager = TerminalSizeManager.getInstance();