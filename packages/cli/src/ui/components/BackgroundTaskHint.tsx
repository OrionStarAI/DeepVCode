/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { getBackgroundTaskManager, BackgroundTask } from 'deepv-code-core';
import { Colors } from '../colors.js';
import { tp } from '../utils/i18n.js';

interface BackgroundTaskHintProps {
  maxCommandLength?: number;
}

/**
 * Shows a hint below input prompt about running background tasks
 * - Single task: shows truncated command with (running)
 * - Multiple tasks: shows "N background tasks"
 */
export const BackgroundTaskHint: React.FC<BackgroundTaskHintProps> = ({
  maxCommandLength = 40,
}) => {
  const [runningTasks, setRunningTasks] = useState<BackgroundTask[]>([]);

  useEffect(() => {
    const taskManager = getBackgroundTaskManager();

    const updateTasks = () => {
      const tasks = taskManager.getRunningTasks();
      setRunningTasks(tasks);
    };

    // Initial load
    updateTasks();

    // Listen to task events
    taskManager.on('task-started', updateTasks);
    taskManager.on('task-completed', updateTasks);
    taskManager.on('task-failed', updateTasks);
    taskManager.on('task-killed', updateTasks);

    // Periodic refresh
    const intervalId = setInterval(updateTasks, 1000);

    return () => {
      taskManager.removeListener('task-started', updateTasks);
      taskManager.removeListener('task-completed', updateTasks);
      taskManager.removeListener('task-failed', updateTasks);
      taskManager.removeListener('task-killed', updateTasks);
      clearInterval(intervalId);
    };
  }, []);

  if (runningTasks.length === 0) {
    return null;
  }

  // Multiple tasks
  if (runningTasks.length > 1) {
    return (
      <Box marginLeft={2}>
        <Text color={Colors.Gray}>⎿ </Text>
        <Text color={Colors.AccentCyan}>
          {tp('background.task.hint.multiple', { count: runningTasks.length })}
        </Text>
        <Text color={Colors.Gray}> (↓ to manage)</Text>
      </Box>
    );
  }

  // Single task - show truncated command
  const task = runningTasks[0];
  const displayCmd = task.command.length > maxCommandLength
    ? task.command.substring(0, maxCommandLength - 3) + '...'
    : task.command;

  return (
    <Box marginLeft={2}>
      <Text color={Colors.Gray}>⎿ </Text>
      <Text color={Colors.AccentCyan}>
        {displayCmd}
      </Text>
      <Text color={Colors.Gray}> (running) (↓ to manage)</Text>
    </Box>
  );
};
