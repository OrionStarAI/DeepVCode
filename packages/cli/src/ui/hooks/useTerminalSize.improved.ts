/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { terminalSizeManager } from '../utils/terminalSizeManager.js';

/**
 * 改进版本的终端尺寸 hook
 *
 * 变更说明:
 * - 从直接监听 process.stdout 改为使用集中化的 terminalSizeManager
 * - 避免了多个 hooks 创建重复的事件监听器
 * - 解决了 MaxListenersExceededWarning 问题
 *
 * API 保持不变，完全向后兼容
 *
 * 前后对比:
 * ❌ 旧版本: 每个组件创建独立的 process.stdout 监听器
 * ✓ 新版本: 使用全局管理器，底层只有 1 个 process.stdout 监听器
 */
export function useTerminalSize(): { columns: number; rows: number } {
  // 初始状态使用当前的终端尺寸
  const [size, setSize] = useState(() => terminalSizeManager.getSize());

  useEffect(() => {
    // 通过管理器订阅 resize 事件
    // 返回的函数会在 cleanup 时自动调用，取消订阅
    const unsubscribe = terminalSizeManager.subscribe((newSize) => {
      setSize(newSize);
    });

    return unsubscribe;
  }, []); // 空依赖数组，只在挂载时执行一次

  return size;
}
