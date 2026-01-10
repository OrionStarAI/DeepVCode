/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { BackgroundTask } from 'deepv-code-core';
import { t } from '../utils/i18n.js';

interface BackgroundTasksPanelProps {
  tasks: BackgroundTask[];
  selectedIndex: number;
  onSelectTask: (index: number) => void;
  onKillTask: (taskId: string) => void;
  onClearCompleted: () => void;
  onClose: () => void;
}

/**
 * Panel component to display and manage background tasks
 * Shows task list with status and provides keyboard controls
 */
export const BackgroundTasksPanel: React.FC<BackgroundTasksPanelProps> = ({
  tasks,
  selectedIndex,
  onSelectTask,
  onKillTask,
  onClearCompleted,
  onClose,
}) => {
  const runningTasks = tasks.filter((t) => t.status === 'running');
  const completedTasks = tasks.filter((t) => t.status !== 'running');

  const formatDuration = (task: BackgroundTask): string => {
    const endTime = task.endTime || Date.now();
    const duration = (endTime - task.startTime) / 1000;
    return `${duration.toFixed(1)}s`;
  };

  const getStatusIcon = (task: BackgroundTask): string => {
    switch (task.status) {
      case 'running':
        return '⏳';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'cancelled':
        return '⛔';
      default:
        return '❓';
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Background Tasks
        </Text>
        <Text dimColor>
          {' '}
          ({runningTasks.length} running, {completedTasks.length} completed)
        </Text>
      </Box>

      {/* Task List */}
      {tasks.length === 0 ? (
        <Text dimColor>No background tasks</Text>
      ) : (
        <Box flexDirection="column">
          {tasks.map((task, index) => {
            const isSelected = index === selectedIndex;
            const isRunning = task.status === 'running';

            return (
              <Box
                key={task.id}
                flexDirection="column"
                marginBottom={0}
                paddingLeft={isSelected ? 1 : 2}
              >
                <Box>
                  <Text>{isSelected ? '> ' : '  '}</Text>
                  <Text>{getStatusIcon(task)} </Text>
                  <Text bold={isSelected}>
                    {task.command.length > 50
                      ? task.command.substring(0, 47) + '...'
                      : task.command}
                  </Text>
                  <Text dimColor> ({formatDuration(task)})</Text>
                </Box>
                {isSelected && !isRunning && task.output && (
                  <Box paddingLeft={2}>
                    <Text dimColor>
                      Output: {task.output.substring(0, 60)}...
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Controls */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>↑/↓ to select · Enter to view · k to kill · Esc to close</Text>
      </Box>
    </Box>
  );
};
