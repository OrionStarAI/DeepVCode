/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { useState, useEffect, useMemo } from 'react';
import { terminalSizeManager } from '../utils/terminalSizeManager.js';

/**
 * 定义小窗口阈值
 */
export const SMALL_WINDOW_THRESHOLDS = {
  MIN_WIDTH: 80,
  MIN_HEIGHT: 30,
  TINY_WIDTH: 50,
  TINY_HEIGHT: 12,
  IDE_TERMINAL_HEIGHT: 30,
  MOBILE_LIKE_WIDTH: 70,
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
  sizeLevel: WindowSizeLevel;
  disableAnimations: boolean;
  reducedRefreshRate: boolean;
  hideDecorations: boolean;
  simplifiedDisplay: boolean;
  refreshDebounceMs: number;
}

/**
 * 改进版本的小窗口优化 hook
 *
 * 变更说明:
 * - 从直接监听 process.stdout 改为使用集中化的 terminalSizeManager
 * - 避免了多个 hooks 创建重复的事件监听器
 * - 解决了 MaxListenersExceededWarning 问题
 *
 * API 和行为保持完全一致，完全向后兼容
 *
 * 前后对比:
 * ❌ 旧版本: 每个组件创建独立的 process.stdout 监听器
 * ✓ 新版本: 使用全局管理器，底层只有 1 个 process.stdout 监听器
 */
export function useSmallWindowOptimization(): SmallWindowConfig {
  // 初始状态使用当前的终端尺寸
  const [terminalSize, setTerminalSize] = useState(() =>
    terminalSizeManager.getSize()
  );
  const [lastValidSize, setLastValidSize] = useState(terminalSize);

  // 通过管理器订阅 resize 事件
  useEffect(() => {
    const unsubscribe = terminalSizeManager.subscribe((newSize) => {
      setTerminalSize(newSize);
    });

    return unsubscribe;
  }, []);

  // 更新最后有效尺寸（避免 resize 过程中的无效尺寸）
  useEffect(() => {
    if (terminalSize.columns > 0 && terminalSize.rows > 0) {
      setLastValidSize(terminalSize);
    }
  }, [terminalSize]);

  // 计算窗口大小级别
  const sizeLevel = useMemo((): WindowSizeLevel => {
    const { columns: width, rows: height } = lastValidSize;

    // 极小窗口：宽度或高度任一维度极小
    if (
      width <= SMALL_WINDOW_THRESHOLDS.TINY_WIDTH ||
      height <= SMALL_WINDOW_THRESHOLDS.TINY_HEIGHT
    ) {
      return WindowSizeLevel.TINY;
    }

    // 小窗口判断：更智能的组合判断
    const isNarrowWidth = width <= SMALL_WINDOW_THRESHOLDS.MIN_WIDTH;
    const isShortHeight = height <= SMALL_WINDOW_THRESHOLDS.MIN_HEIGHT;
    const isIDETerminal = height <= SMALL_WINDOW_THRESHOLDS.IDE_TERMINAL_HEIGHT;
    const isMobileLike =
      width <= SMALL_WINDOW_THRESHOLDS.MOBILE_LIKE_WIDTH &&
      height <= SMALL_WINDOW_THRESHOLDS.MIN_HEIGHT;

    // 触发小窗口优化的条件（任一满足）
    if (
      (isNarrowWidth && isShortHeight) ||
      isIDETerminal ||
      isMobileLike ||
      width <= 60
    ) {
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
          disableAnimations: true,
          reducedRefreshRate: true,
          hideDecorations: true,
          simplifiedDisplay: true,
          refreshDebounceMs: 1000,
        };

      case WindowSizeLevel.SMALL:
        return {
          sizeLevel,
          disableAnimations: true,
          reducedRefreshRate: true,
          hideDecorations: true,
          simplifiedDisplay: false,
          refreshDebounceMs: 600,
        };

      case WindowSizeLevel.NORMAL:
      default:
        return {
          sizeLevel,
          disableAnimations: false,
          reducedRefreshRate: false,
          hideDecorations: false,
          simplifiedDisplay: false,
          refreshDebounceMs: 300,
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
      return 5000; // 5秒间隔，大幅减少刷新
    case WindowSizeLevel.SMALL:
      return 3000; // 3秒间隔
    case WindowSizeLevel.NORMAL:
    default:
      return 1000; // 1秒间隔（正常）
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
      return config.sizeLevel !== WindowSizeLevel.NORMAL;
    case 'token':
      return config.sizeLevel !== WindowSizeLevel.NORMAL;
    case 'phrase':
      return config.sizeLevel === WindowSizeLevel.TINY;
    case 'loading':
      return config.sizeLevel === WindowSizeLevel.TINY;
    default:
      return false;
  }
}
