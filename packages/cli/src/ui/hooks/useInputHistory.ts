/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseInputHistoryProps {
  userMessages: readonly string[];
  onSubmit: (value: string) => void;
  isActive: boolean;
  currentQuery: string; // Renamed from query to avoid confusion
  onChange: (value: string) => void;
}

export interface UseInputHistoryReturn {
  handleSubmit: (value: string) => void;
  navigateUp: () => boolean;
  navigateDown: () => boolean;
}

export function useInputHistory({
  userMessages,
  onSubmit,
  isActive,
  currentQuery,
  onChange,
}: UseInputHistoryProps): UseInputHistoryReturn {
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  // 🔧 保存"正在输入中"的内容（持续更新的缓存区）
  const draftInputRef = useRef<string>('');

  // 🔧 每当 currentQuery 变化时，更新 draftInput 缓存
  // 只在用户实际有输入内容时更新，避免清空状态覆盖之前的草稿
  useEffect(() => {
    if (historyIndex === -1 && currentQuery.length > 0) {
      // 只有在：1) 不导航历史  2) 输入框有内容 时才更新缓存
      draftInputRef.current = currentQuery;
    }
  }, [currentQuery, historyIndex]);

  const resetHistoryNav = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        onSubmit(trimmedValue); // Parent handles clearing the query
      }
      resetHistoryNav();
    },
    [onSubmit, resetHistoryNav],
  );

  const navigateUp = useCallback(() => {
    if (!isActive) return false;
    if (userMessages.length === 0) return false;

    let nextIndex = historyIndex;
    if (historyIndex === -1) {
      nextIndex = 0;
    } else if (historyIndex < userMessages.length - 1) {
      nextIndex = historyIndex + 1;
    } else {
      return false; // Already at the oldest message
    }

    if (nextIndex !== historyIndex) {
      setHistoryIndex(nextIndex);
      const newValue = userMessages[userMessages.length - 1 - nextIndex];
      onChange(newValue);
      return true;
    }
    return false;
  }, [
    historyIndex,
    setHistoryIndex,
    onChange,
    userMessages,
    isActive,
  ]);

  const navigateDown = useCallback(() => {
    if (!isActive) return false;
    if (historyIndex === -1) return false; // Not currently navigating history

    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);

    if (nextIndex === -1) {
      // 🔧 回到 draft 输入（保留之前的缓存内容）
      onChange(draftInputRef.current);
    } else {
      const newValue = userMessages[userMessages.length - 1 - nextIndex];
      onChange(newValue);
    }
    return true;
  }, [
    historyIndex,
    setHistoryIndex,
    onChange,
    userMessages,
    isActive,
  ]);

  return {
    handleSubmit,
    navigateUp,
    navigateDown,
  };
}
