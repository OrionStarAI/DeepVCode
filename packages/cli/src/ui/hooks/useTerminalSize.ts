/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { terminalSizeManager, type TerminalSize } from '../utils/terminalSizeManager.js';

/**
 * Hook 用于监听终端尺寸变化
 *
 * 这个 hook 使用集中化的 TerminalSizeManager 来避免重复的 resize 监听器
 * 之前的实现会在每个组件中添加独立的 resize 监听器，导致监听器数超过限制
 */
export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>(() =>
    terminalSizeManager.getTerminalSize()
  );

  useEffect(() => {
    // 通过管理器订阅尺寸变化，返回的是取消订阅函数
    const unsubscribe = terminalSizeManager.subscribe(setSize);
    return unsubscribe;
  }, []);

  return size;
}
