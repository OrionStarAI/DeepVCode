/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import { useKeypress, type Key } from './useKeypress.js';

export interface UseBackgroundTasksUIReturn {
  isPanelOpen: boolean;
  togglePanel: () => void;
  selectedTaskIndex: number;
  moveSelection: (direction: 'up' | 'down') => void;
  requestKillTask: () => string | null; // returns task ID to kill, or null
  clearKillRequest: () => void;
}

/**
 * Hook to manage background tasks UI state and keyboard interactions
 * Handles Ctrl+B to toggle panel and ↑/↓ for navigation
 */
export function useBackgroundTasksUI(
  totalTasks: number,
): UseBackgroundTasksUIReturn {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [taskToKill, setTaskToKill] = useState<string | null>(null);

  const togglePanel = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
    if (totalTasks > 0) {
      setSelectedTaskIndex(0);
    }
  }, [totalTasks]);

  const moveSelection = useCallback(
    (direction: 'up' | 'down') => {
      if (totalTasks === 0) return;

      setSelectedTaskIndex((prev) => {
        if (direction === 'up') {
          return Math.max(0, prev - 1);
        } else {
          return Math.min(totalTasks - 1, prev + 1);
        }
      });
    },
    [totalTasks],
  );

  const requestKillTask = useCallback(() => {
    return taskToKill;
  }, [taskToKill]);

  const clearKillRequest = useCallback(() => {
    setTaskToKill(null);
  }, []);

  // 处理按键事件
  const handleKeypress = useCallback(
    (key: Key) => {
      // Ctrl+B: 切换面板
      if (key.ctrl && key.name === 'b') {
        togglePanel();
        return;
      }

      // 只在面板打开时处理以下按键
      if (!isPanelOpen) {
        return;
      }

      // ↑: 向上移动选择
      if (key.name === 'up') {
        moveSelection('up');
        return;
      }

      // ↓: 向下移动选择
      if (key.name === 'down') {
        moveSelection('down');
        return;
      }

      // Escape: 关闭面板
      if (key.name === 'escape') {
        setIsPanelOpen(false);
        return;
      }

      // k: 杀死任务（稍后由外部处理）
      if (key.name === 'k') {
        // 由外部组件处理具体的杀死逻辑
        return;
      }
    },
    [isPanelOpen, togglePanel, moveSelection],
  );

  useKeypress(handleKeypress, { isActive: true });

  return {
    isPanelOpen,
    togglePanel,
    selectedTaskIndex,
    moveSelection,
    requestKillTask,
    clearKillRequest,
  };
}
