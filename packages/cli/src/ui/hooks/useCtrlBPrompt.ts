/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * Hook to determine if Ctrl+B prompt should be shown
 * Shows only when shell command is executing (not completed or failed)
 */
export function useCtrlBPrompt(toolName: string, isExecuting: boolean): boolean {
  // Only show for shell commands that are currently executing
  return toolName === 'run_shell_command' && isExecuting;
}