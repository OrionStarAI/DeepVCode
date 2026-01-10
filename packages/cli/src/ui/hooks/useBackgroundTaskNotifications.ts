/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { useEffect, useCallback } from 'react';
import { getBackgroundTaskManager, BackgroundTask } from 'deepv-code-core';

interface BackgroundTaskNotificationsProps {
  onTaskCompleted?: (task: BackgroundTask) => void;
  onTaskFailed?: (task: BackgroundTask) => void;
  onTaskKilled?: (task: BackgroundTask) => void;
  onTaskOutput?: (taskId: string, output: string) => void;
}

/**
 * Hook to listen for background task events and notify the UI/AI
 */
export function useBackgroundTaskNotifications({
  onTaskCompleted,
  onTaskFailed,
  onTaskKilled,
  onTaskOutput,
}: BackgroundTaskNotificationsProps) {
  useEffect(() => {
    const taskManager = getBackgroundTaskManager();

    const handleTaskCompleted = (event: { type: string; task: BackgroundTask }) => {
      console.log('[useBackgroundTaskNotifications] Task completed:', event.task.id);
      onTaskCompleted?.(event.task);
    };

    const handleTaskFailed = (event: { type: string; task: BackgroundTask }) => {
      console.log('[useBackgroundTaskNotifications] Task failed:', event.task.id);
      onTaskFailed?.(event.task);
    };

    const handleTaskKilled = (event: { type: string; task: BackgroundTask }) => {
      console.log('[useBackgroundTaskNotifications] Task killed:', event.task.id);
      onTaskKilled?.(event.task);
    };

    const handleTaskOutput = (event: { type: string; taskId: string; output: string }) => {
      onTaskOutput?.(event.taskId, event.output);
    };

    taskManager.on('task-completed', handleTaskCompleted);
    taskManager.on('task-failed', handleTaskFailed);
    taskManager.on('task-killed', handleTaskKilled);
    taskManager.on('task-output', handleTaskOutput);

    return () => {
      taskManager.removeListener('task-completed', handleTaskCompleted);
      taskManager.removeListener('task-failed', handleTaskFailed);
      taskManager.removeListener('task-killed', handleTaskKilled);
      taskManager.removeListener('task-output', handleTaskOutput);
    };
  }, [onTaskCompleted, onTaskFailed, onTaskKilled, onTaskOutput]);
}

/**
 * Format a completed background task result for AI consumption
 */
export function formatBackgroundTaskResult(task: BackgroundTask): string {
  const duration = task.endTime ? Math.round((task.endTime - task.startTime) / 1000) : 0;

  let result = `Background task completed:\n`;
  result += `- Task ID: ${task.id}\n`;
  result += `- Command: ${task.command}\n`;
  result += `- Exit Code: ${task.exitCode ?? 'unknown'}\n`;
  result += `- Duration: ${duration} seconds\n`;

  if (task.output && task.output.trim()) {
    result += `- Output:\n${task.output}\n`;
  } else {
    result += `- Output: (no output)\n`;
  }

  if (task.stderr && task.stderr.trim()) {
    result += `- Stderr:\n${task.stderr}\n`;
  }

  if (task.error) {
    result += `- Error: ${task.error}\n`;
  }

  return result;
}
