/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { createContext, useContext, useCallback, useState } from 'react';

interface BackgroundModeContextValue {
  // 用户是否按下了 Ctrl+B 要求后台执行
  backgroundModeRequested: boolean;
  setBackgroundModeRequested: (requested: boolean) => void;
  // 当前正在执行的任务 ID（如果有）
  currentTaskId: string | null;
  setCurrentTaskId: (taskId: string | null) => void;
  // 清除状态（在任务执行后调用）
  clearBackgroundMode: () => void;
}

const BackgroundModeContext = createContext<BackgroundModeContextValue | undefined>(
  undefined,
);

export function useBackgroundModeContext() {
  const context = useContext(BackgroundModeContext);
  if (!context) {
    throw new Error(
      'useBackgroundModeContext must be used within a BackgroundModeProvider',
    );
  }
  return context;
}

export function BackgroundModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [backgroundModeRequested, setBackgroundModeRequested] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

  const handleSetBackgroundModeRequested = (requested: boolean) => {
    console.log('[BackgroundModeContext] setBackgroundModeRequested:', requested);
    setBackgroundModeRequested(requested);
  };

  const handleSetCurrentTaskId = (taskId: string | null) => {
    console.log('[BackgroundModeContext] setCurrentTaskId:', taskId);
    setCurrentTaskId(taskId);
  };

  const clearBackgroundMode = useCallback(() => {
    console.log('[BackgroundModeContext] clearBackgroundMode called');
    setBackgroundModeRequested(false);
    setCurrentTaskId(null);
  }, []);

  return (
    <BackgroundModeContext.Provider
      value={{
        backgroundModeRequested,
        setBackgroundModeRequested: handleSetBackgroundModeRequested,
        currentTaskId,
        setCurrentTaskId: handleSetCurrentTaskId,
        clearBackgroundMode,
      }}
    >
      {children}
    </BackgroundModeContext.Provider>
  );
}
