/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import {
  BackgroundTask,
  BackgroundTaskEvent,
  getBackgroundTaskManager,
} from 'deepv-code-core';

export interface UseBackgroundTasksReturn {
  tasks: BackgroundTask[];
  selectedTaskIndex: number;
  setSelectedTaskIndex: (index: number) => void;
  getTask: (taskId: string) => BackgroundTask | undefined;
  killTask: (taskId: string) => void;
  clearCompleted: () => void;
  totalTasks: number;
  runningCount: number;
  completedCount: number;
}

/**
 * Hook to manage background tasks
 * Provides access to task list and operations
 */
export function useBackgroundTasks(): UseBackgroundTasksReturn {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);

  const taskManager = getBackgroundTaskManager();

  // 监听任务事件
  useEffect(() => {
    const updateTasks = () => {
      const allTasks = taskManager.getAllTasks();
      setTasks([...allTasks]);
    };

    // 初始化任务列表
    updateTasks();

    // 监听任务事件
    const handler = (event: BackgroundTaskEvent) => {
      updateTasks();
    };

    const unsubscribe = taskManager.onTaskEvent(handler);

    // 定期更新任务列表（防止漏掉事件）
    const interval = setInterval(updateTasks, 500);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [taskManager]);

  const getTask = useCallback(
    (taskId: string): BackgroundTask | undefined => {
      return taskManager.getTask(taskId);
    },
    [taskManager],
  );

  const killTask = useCallback(
    (taskId: string) => {
      const task = taskManager.getTask(taskId);
      if (task && task.pid !== undefined && task.status === 'running') {
        // 尝试杀死进程
        const { spawn } = require('child_process');
        const os = require('os');
        const pid = task.pid; // 保存 pid 到本地变量以供闭包使用

        if (os.platform() === 'win32') {
          spawn('taskkill', ['/pid', pid.toString(), '/f', '/t']);
        } else {
          try {
            process.kill(-pid, 'SIGTERM');
            setTimeout(() => {
              const currentTask = taskManager.getTask(taskId);
              if (currentTask && currentTask.status === 'running') {
                process.kill(-pid, 'SIGKILL');
              }
            }, 200);
          } catch (e) {
            // ignore
          }
        }
      }
      // 标记任务为已取消
      taskManager.cancelTask(taskId);
    },
    [taskManager],
  );

  const clearCompleted = useCallback(() => {
    taskManager.clearCompletedTasks();
    setTasks(taskManager.getAllTasks());
  }, [taskManager]);

  const totalTasks = tasks.length;
  const runningCount = tasks.filter((t) => t.status === 'running').length;
  const completedCount = totalTasks - runningCount;

  return {
    tasks,
    selectedTaskIndex,
    setSelectedTaskIndex,
    getTask,
    killTask,
    clearCompleted,
    totalTasks,
    runningCount,
    completedCount,
  };
}
