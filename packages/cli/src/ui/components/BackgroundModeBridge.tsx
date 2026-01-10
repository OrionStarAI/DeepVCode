/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useEffect } from 'react';
import { useBackgroundModeContext } from '../contexts/BackgroundModeContext.js';
import { getBackgroundModeSignal } from 'deepv-code-core';

/**
 * Bridge component that connects KeypressContext's Ctrl+B detection to BackgroundModeContext
 * AND to the Core layer's BackgroundModeSignal for ShellTool to detect during execution
 */
export const BackgroundModeBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const backgroundModeContext = useBackgroundModeContext();

  useEffect(() => {
    console.log('[BackgroundModeBridge] Setting up onBackgroundModeRequested callback');

    // Create callback that will be called when Ctrl+B is detected
    const onCtrlB = (requested: boolean) => {
      console.log('[BackgroundModeBridge] 🔥 onCtrlB called with:', requested);

      // Update React state (for UI)
      backgroundModeContext.setBackgroundModeRequested(requested);

      // 🔥 CRITICAL: Also signal the Core layer so ShellTool can detect it during execution
      if (requested) {
        const signal = getBackgroundModeSignal();
        signal.requestBackgroundMode();
        console.log('[BackgroundModeBridge] 📡 Sent signal to Core layer');
      }
    };

    // Store in global for KeypressProvider to access
    (globalThis as any).__backgroundModeCallback = onCtrlB;

    return () => {
      delete (globalThis as any).__backgroundModeCallback;
    };
  }, [backgroundModeContext]);

  return <>{children}</>;
};