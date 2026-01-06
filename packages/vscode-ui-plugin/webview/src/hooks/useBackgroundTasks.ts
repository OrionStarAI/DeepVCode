/**
 * useBackgroundTasks Hook - 后台任务状态管理
 *
 * 管理后台运行的 shell 命令任务，接收来自 Extension 的任务状态更新，
 * 提供任务列表、终止任务等功能。
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import { useState, useEffect, useCallback } from 'react';
import type { BackgroundTaskInfo, BackgroundTasksUpdatePayload } from '../../../src/types/messages';

interface UseBackgroundTasksReturn {
  /** 所有后台任务列表 */
  tasks: BackgroundTaskInfo[];
  /** 正在运行的任务数量 */
  runningCount: number;
  /** 终止指定任务 */
  killTask: (taskId: string) => void;
  /** 请求刷新任务列表 */
  refreshTasks: () => void;
  /** 获取指定任务 */
  getTask: (taskId: string) => BackgroundTaskInfo | undefined;
}

/**
 * 后台任务管理 Hook
 *
 * @example
 * ```tsx
 * const { tasks, runningCount, killTask } = useBackgroundTasks();
 *
 * return (
 *   <div>
 *     <span>运行中任务: {runningCount}</span>
 *     {tasks.map(task => (
 *       <div key={task.id}>
 *         {task.command} - {task.status}
 *         {task.status === 'running' && (
 *           <button onClick={() => killTask(task.id)}>终止</button>
 *         )}
 *       </div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useBackgroundTasks(): UseBackgroundTasksReturn {
  const [tasks, setTasks] = useState<BackgroundTaskInfo[]>([]);
  const [runningCount, setRunningCount] = useState(0);

  // 监听来自 Extension 的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === 'background_tasks_update') {
        const payload = message.payload as BackgroundTasksUpdatePayload;
        setTasks(payload.tasks);
        setRunningCount(payload.runningCount);
      } else if (message.type === 'background_task_output') {
        // 处理实时输出更新
        const { taskId, output, isStderr } = message.payload as {
          taskId: string;
          output: string;
          isStderr?: boolean;
        };

        setTasks(prevTasks =>
          prevTasks.map(task => {
            if (task.id === taskId) {
              return {
                ...task,
                output: isStderr ? task.output : task.output + output,
                stderr: isStderr ? task.stderr + output : task.stderr,
              };
            }
            return task;
          })
        );
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 终止任务
  const killTask = useCallback((taskId: string) => {
    if (typeof window !== 'undefined' && window.vscode) {
      window.vscode.postMessage({
        type: 'background_task_request',
        payload: { action: 'kill', taskId }
      });
    }
  }, []);

  // 刷新任务列表
  const refreshTasks = useCallback(() => {
    if (typeof window !== 'undefined' && window.vscode) {
      window.vscode.postMessage({
        type: 'background_task_request',
        payload: { action: 'list' }
      });
    }
  }, []);

  // 获取指定任务
  const getTask = useCallback((taskId: string) => {
    return tasks.find(t => t.id === taskId);
  }, [tasks]);

  // 初始请求任务列表
  useEffect(() => {
    // 等待 vscode API 初始化后请求任务列表
    const timer = setTimeout(() => {
      refreshTasks();
    }, 100);
    return () => clearTimeout(timer);
  }, [refreshTasks]);

  return {
    tasks,
    runningCount,
    killTask,
    refreshTasks,
    getTask,
  };
}

export default useBackgroundTasks;
