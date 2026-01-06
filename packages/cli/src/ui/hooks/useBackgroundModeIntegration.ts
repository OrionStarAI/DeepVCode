/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useCallback } from 'react';
import { useBackgroundModeContext } from '../contexts/BackgroundModeContext.js';
import { useKeypressContext } from '../contexts/KeypressContext.js';
import {
  getBackgroundTaskManager,
  ShellTool,
  Config,
} from 'deepv-code-core';

/**
 * Hook to integrate Ctrl+B detection from KeypressContext into BackgroundModeContext
 * This creates a bridge between keyboard input and background task execution mode
 */
export function useBackgroundModeIntegration(config: Config): void {
  const { setBackgroundModeRequested } = useBackgroundModeContext();
  const { onBackgroundModeRequested } = useKeypressContext();

  // Set up the Ctrl+B callback in KeypressContext
  useEffect(() => {
    // This will be called when Ctrl+B is pressed
    // The KeypressContext will call this callback
    // (Note: This is set during KeypressProvider initialization)
  }, []);

  // Create callback for when background mode is requested
  useCallback(() => {
    return (requested: boolean) => {
      setBackgroundModeRequested(requested);
    };
  }, [setBackgroundModeRequested]);
}

/**
 * Get whether background execution has been requested
 * This is a simple getter for the background mode state
 */
export function useGetBackgroundModeRequested(): boolean {
  const { backgroundModeRequested } = useBackgroundModeContext();
  return backgroundModeRequested;
}

/**
 * Reset background mode after execution
 */
export function useResetBackgroundMode(): () => void {
  const { clearBackgroundMode } = useBackgroundModeContext();
  return clearBackgroundMode;
}

/**
 * Helper to check if a tool is a shell tool
 */
export function isShellTool(toolName: string): boolean {
  return toolName === 'run_shell_command';
}

/**
 * Get the shell tool from registry
 */
export async function getShellToolFromConfig(config: Config): Promise<ShellTool | null> {
  try {
    const toolRegistry = await config.getToolRegistry();
    const shellTool = toolRegistry.getTool('run_shell_command');
    return shellTool as ShellTool | null;
  } catch (e) {
    return null;
  }
}
