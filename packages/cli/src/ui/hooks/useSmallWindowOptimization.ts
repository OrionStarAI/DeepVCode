/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { terminalSizeManager, type TerminalSize } from '../utils/terminalSizeManager.js';

/**
 * 定义小窗口阈值
 */
export const SMALL_WINDOW_THRESHOLDS = {
  // 窗口宽度小于80列认为是小窗口
  MIN_WIDTH: 80,
  // 窗口高度小于30行认为是小窗口（调整为更宽松的阈值，让更多窗口触发优化）
  MIN_HEIGHT: 30,
  // 极小窗口阈值
  TINY_WIDTH: 50,
  TINY_HEIGHT: 12,

  // IDE内置终端的特殊判断阈值
  IDE_TERMINAL_HEIGHT: 30, // IDE终端常见高度上限（调整为更宽松的阈值，让更多窗口触发优化）
  MOBILE_LIKE_WIDTH: 70,   // 类似移动端的窄屏宽度
} as const;

/**
 * 窗口大小级别
 */
export enum WindowSizeLevel {
  NORMAL = 'normal',
  SMALL = 'small',
  TINY = 'tiny',
}

/**
 * 小窗口优化配置
 */
export interface SmallWindowConfig {
  /** 当前窗口大小级别 */
  sizeLevel: WindowSizeLevel;
  /** 是否禁用动画 */
  disableAnimations: boolean;
  /** 是否减少刷新频率 */
  reducedRefreshRate: boolean;
  /** 是否隐藏装饰元素 */
  hideDecorations: boolean;
  /** 是否简化显示 */
  simplifiedDisplay: boolean;
  /** 刷新防抖延迟(ms) */
  refreshDebounceMs: number;
}

/**
 * 小窗口优化Hook
 * 根据终端窗口大小自动调整渲染策略，减少小窗口下的闪屏
 *
 * 优化策略：
 * - TINY: 宽度≤50列 或 高度≤12行 - 极简模式
 * - SMALL: IDE内置终端(高度≤18行) 或 窄屏(≤70列) 或 综合偏小 - 简化模式
 * - NORMAL: 标准终端尺寸 - 完整模式
 *
 * 修改：使用 TerminalSizeManager 替代直接监听 resize 事件
 * 以解决多个监听器导致的 MaxListenersExceededWarning
 */
export function useSmallWindowOptimization(): SmallWindowConfig {
  const [terminalSize, setTerminalSize] = useState(() => ({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24
  }));
  const [lastValidSize, setLastValidSize] = useState(terminalSize);

  // 监听终端尺寸变化（通过集中化管理器，替代直接监听 resize 事件）
  useEffect(() => {
    const unsubscribe = terminalSizeManager.subscribe((managerSize: TerminalSize) => {
      // 管理器的尺寸已经应用了 padding，需要补偿以获取原始尺寸
      setTerminalSize({
        columns: managerSize.columns + 8, // 补偿 TERMINAL_PADDING_X
        rows: managerSize.rows
      });
    });

    return unsubscribe;
  }, []);

  // 更新最后有效尺寸（避免resize过程中的无效尺寸）
  useEffect(() => {
    if (terminalSize.columns > 0 && terminalSize.rows > 0) {
      setLastValidSize(terminalSize);
    }
  }, [terminalSize]);

  // 计算窗口大小级别
  const sizeLevel = useMemo((): WindowSizeLevel => {
    const { columns: width, rows: height } = lastValidSize;

    // 极小窗口：宽度或高度任一维度极小
    if (width <= SMALL_WINDOW_THRESHOLDS.TINY_WIDTH || height <= SMALL_WINDOW_THRESHOLDS.TINY_HEIGHT) {
      return WindowSizeLevel.TINY;
    }

    // 小窗口判断：更智能的组合判断
    const isNarrowWidth = width <= SMALL_WINDOW_THRESHOLDS.MIN_WIDTH;
    const isShortHeight = height <= SMALL_WINDOW_THRESHOLDS.MIN_HEIGHT;
    const isIDETerminal = height <= SMALL_WINDOW_THRESHOLDS.IDE_TERMINAL_HEIGHT; // IDE内置终端特征
    const isMobileLike = width <= SMALL_WINDOW_THRESHOLDS.MOBILE_LIKE_WIDTH && height <= SMALL_WINDOW_THRESHOLDS.MIN_HEIGHT;

    // 触发小窗口优化的条件（任一满足）：
    // 1. 宽度和高度都偏小
    // 2. 典型的IDE内置终端（高度小但宽度可能正常）
    // 3. 类似移动端的窄屏
    // 4. 极窄的宽度（不管高度）
    if ((isNarrowWidth && isShortHeight) ||
        isIDETerminal ||
        isMobileLike ||
        width <= 60) {
      return WindowSizeLevel.SMALL;
    }

    return WindowSizeLevel.NORMAL;
  }, [lastValidSize]);

  // 根据窗口大小生成优化配置
  const config = useMemo((): SmallWindowConfig => {
    switch (sizeLevel) {
      case WindowSizeLevel.TINY:
        return {
          sizeLevel,
          disableAnimations: true,        // 完全禁用动画
          reducedRefreshRate: true,       // 大幅减少刷新
          hideDecorations: true,          // 隐藏装饰元素
          simplifiedDisplay: true,        // 极简显示模式
          refreshDebounceMs: 1000,        // 1秒防抖
        };

      case WindowSizeLevel.SMALL:
        return {
          sizeLevel,
          disableAnimations: true,        // 禁用大部分动画
          reducedRefreshRate: true,       // 减少刷新频率
          hideDecorations: true,          // 隐藏部分装饰
          simplifiedDisplay: false,       // 保持基本显示
          refreshDebounceMs: 600,         // 600ms防抖
        };

      case WindowSizeLevel.NORMAL:
      default:
        return {
          sizeLevel,
          disableAnimations: false,       // 保持正常动画
          reducedRefreshRate: false,      // 正常刷新频率
          hideDecorations: false,         // 显示所有装饰
          simplifiedDisplay: false,       // 完整显示模式
          refreshDebounceMs: 300,         // 300ms防抖（当前默认值）
        };
    }
  }, [sizeLevel]);

  return config;
}

/**
 * 获取适合当前窗口大小的刷新间隔
 */
export function getOptimalRefreshInterval(sizeLevel: WindowSizeLevel): number {
  switch (sizeLevel) {
    case WindowSizeLevel.TINY:
      return 5000;  // 5秒间隔，大幅减少刷新
    case WindowSizeLevel.SMALL:
      return 3000;  // 3秒间隔
    case WindowSizeLevel.NORMAL:
    default:
      return 1000;  // 1秒间隔（正常）
  }
}

/**
 * 判断是否应该跳过动画
 */
export function shouldSkipAnimation(
  config: SmallWindowConfig,
  animationType: 'spinner' | 'token' | 'phrase' | 'loading'
): boolean {
  if (!config.disableAnimations) return false;

  switch (animationType) {
    case 'spinner':
      // 小窗口下完全禁用spinner动画
      return config.sizeLevel !== WindowSizeLevel.NORMAL;
    case 'token':
      // 小窗口下禁用token计数动画
      return config.sizeLevel !== WindowSizeLevel.NORMAL;
    case 'phrase':
      // 小窗口下减少短语切换频率
      return config.sizeLevel === WindowSizeLevel.TINY;
    case 'loading':
      // 极小窗口下禁用loading动画
      return config.sizeLevel === WindowSizeLevel.TINY;
    default:
      return false;
  }
}