/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { getBackgroundTaskManager, BackgroundTask } from 'deepv-code-core';
import { Colors } from '../colors.js';
import { t } from '../utils/i18n.js';

interface BackgroundTaskPanelProps {
  isVisible: boolean;
  onClose: () => void;
  terminalWidth: number;
}

/**
 * Background Task Management Panel
 * Shows list of background tasks with status, allows killing tasks
 */
export const BackgroundTaskPanel: React.FC<BackgroundTaskPanelProps> = ({
  isVisible,
  onClose,
  terminalWidth,
}) => {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [, setTick] = useState(0); // Force re-render for timer updates

  // Refresh tasks list
  const refreshTasks = useCallback(() => {
    const taskManager = getBackgroundTaskManager();
    const allTasks = taskManager.getAllTasks();
    // Sort by start time (newest first)
    const sorted = [...allTasks].sort((a, b) => b.startTime - a.startTime);
    setTasks(sorted);
  }, []);

  // Listen to task events and set up periodic refresh
  useEffect(() => {
    if (!isVisible) return;

    refreshTasks();

    const taskManager = getBackgroundTaskManager();

    const handleTaskEvent = () => {
      refreshTasks();
    };

    taskManager.on('task-started', handleTaskEvent);
    taskManager.on('task-completed', handleTaskEvent);
    taskManager.on('task-failed', handleTaskEvent);
    taskManager.on('task-killed', handleTaskEvent);

    // 🎯 定时刷新以更新执行时间显示
    const intervalId = setInterval(() => {
      setTick(prev => prev + 1);
      refreshTasks();
    }, 1000);

    return () => {
      taskManager.removeListener('task-started', handleTaskEvent);
      taskManager.removeListener('task-completed', handleTaskEvent);
      taskManager.removeListener('task-failed', handleTaskEvent);
      taskManager.removeListener('task-killed', handleTaskEvent);
      clearInterval(intervalId);
    };
  }, [isVisible, refreshTasks]);

  // 🎯 Handle keyboard input - 只处理面板内导航，ESC 由 App.tsx 统一处理
  useInput((input, key) => {
    // 注意：ESC 和 Q 的处理已移至 App.tsx，避免事件被多次处理

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(tasks.length - 1, prev + 1));
      return;
    }

    if (input.toLowerCase() === 'k' && tasks.length > 0) {
      const selectedTask = tasks[selectedIndex];
      if (selectedTask && selectedTask.status === 'running') {
        const taskManager = getBackgroundTaskManager();
        taskManager.killTask(selectedTask.id);
        refreshTasks();
      }
      return;
    }
  }, { isActive: isVisible }); // 🎯 关键：只有面板可见时才捕获按键

  if (!isVisible) {
    return null;
  }

  const getStatusColor = (status: BackgroundTask['status']) => {
    switch (status) {
      case 'running': return Colors.AccentYellow;
      case 'completed': return Colors.AccentGreen;
      case 'failed': return Colors.AccentRed;
      default: return Colors.Gray;
    }
  };

  const getStatusIcon = (status: BackgroundTask['status']) => {
    switch (status) {
      case 'running': return '»';
      case 'completed': return '●';
      case 'failed': return '✗';
      default: return '?';
    }
  };

  const formatDuration = (task: BackgroundTask) => {
    const endTime = task.endTime || Date.now();
    const durationMs = endTime - task.startTime;
    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const panelWidth = Math.min(terminalWidth - 4, 80);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      width={panelWidth}
      marginLeft={2}
      paddingX={1}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={Colors.AccentBlue}>
          {t('background.task.panel.title')}
        </Text>
        <Text color={Colors.Gray}>
          {t('background.task.panel.hint')}
        </Text>
      </Box>

      {/* Task list */}
      {tasks.length === 0 ? (
        <Box paddingY={1}>
          <Text color={Colors.Gray}>{t('background.task.panel.empty')}</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {tasks.map((task, index) => {
            const isSelected = index === selectedIndex;
            const statusColor = getStatusColor(task.status);

            // Truncate command if too long
            const maxCmdLength = panelWidth - 30;
            const displayCmd = task.command.length > maxCmdLength
              ? task.command.substring(0, maxCmdLength - 3) + '...'
              : task.command;

            return (
              <Box key={task.id} flexDirection="row">
                {/* Selection indicator */}
                <Text color={isSelected ? Colors.AccentBlue : undefined}>
                  {isSelected ? '▸ ' : '  '}
                </Text>

                {/* Task ID */}
                <Text color={Colors.Gray}>[{task.id}] </Text>

                {/* Status */}
                <Text color={statusColor}>
                  {getStatusIcon(task.status)}
                </Text>
                <Text> </Text>

                {/* Command */}
                <Text bold={isSelected}>
                  {displayCmd}
                </Text>

                {/* Duration */}
                <Text color={Colors.Gray}> ({formatDuration(task)})</Text>

                {/* Exit code for completed tasks */}
                {task.status === 'completed' && task.exitCode !== undefined && (
                  <Text color={task.exitCode === 0 ? Colors.AccentGreen : Colors.AccentRed}>
                    {' '}[{task.exitCode}]
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};