/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';

export interface BackgroundTask {
  id: string;
  command: string;
  directory?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  pid?: number;
  startTime: number;
  endTime?: number;
  output: string;
  stderr: string;
  exitCode?: number;
  signal?: string;
  error?: string;
}

export type BackgroundTaskEvent =
  | { type: 'task-started'; task: BackgroundTask }
  | { type: 'task-output'; taskId: string; output: string }
  | { type: 'task-stderr'; taskId: string; stderr: string }
  | { type: 'task-completed'; task: BackgroundTask }
  | { type: 'task-failed'; task: BackgroundTask }
  | { type: 'task-cancelled'; task: BackgroundTask };

export class BackgroundTaskManager extends EventEmitter {
  private tasks: Map<string, BackgroundTask> = new Map();
  private nextTaskId = 1;

  /**
   * 创建一个新的后台任务
   */
  createTask(command: string, directory?: string): BackgroundTask {
    const id = `task_${this.nextTaskId++}`;
    const task: BackgroundTask = {
      id,
      command,
      directory,
      status: 'running',
      startTime: Date.now(),
      output: '',
      stderr: '',
    };
    this.tasks.set(id, task);
    this.emit('task-started', { type: 'task-started', task });
    return task;
  }

  /**
   * 获取任务信息
   */
  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取运行中的任务
   */
  getRunningTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'running');
  }

  /**
   * 更新任务输出
   */
  appendOutput(taskId: string, output: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.output += output;
      this.emit('task-output', { type: 'task-output', taskId, output });
    }
  }

  /**
   * 更新任务错误输出
   */
  appendStderr(taskId: string, stderr: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.stderr += stderr;
      this.emit('task-stderr', { type: 'task-stderr', taskId, stderr });
    }
  }

  /**
   * 标记任务为已完成
   */
  completeTask(
    taskId: string,
    options: { exitCode?: number; signal?: string; error?: string } = {},
  ): BackgroundTask | undefined {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.endTime = Date.now();
      task.exitCode = options.exitCode;
      task.signal = options.signal;
      task.error = options.error;
      this.emit('task-completed', { type: 'task-completed', task });
    }
    return task;
  }

  /**
   * 标记任务为失败
   */
  failTask(
    taskId: string,
    error: string,
  ): BackgroundTask | undefined {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.endTime = Date.now();
      task.error = error;
      this.emit('task-failed', { type: 'task-failed', task });
    }
    return task;
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): BackgroundTask | undefined {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      task.status = 'cancelled';
      task.endTime = Date.now();
      this.emit('task-cancelled', { type: 'task-cancelled', task });
    }
    return task;
  }

  /**
   * 强制终止任务进程
   */
  killTask(taskId: string): BackgroundTask | undefined {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running' && task.pid) {
      try {
        // 尝试终止进程
        if (process.platform === 'win32') {
          // Windows: 使用 taskkill
          spawn('taskkill', ['/pid', task.pid.toString(), '/f', '/t']);
        } else {
          // Unix: 发送 SIGTERM
          process.kill(task.pid, 'SIGTERM');
        }

        task.status = 'failed';
        task.endTime = Date.now();
        task.error = 'Killed by user';
        this.emit('task-killed', { type: 'task-killed', task });
      } catch (error) {
        console.error(`Failed to kill task ${taskId}:`, error);
      }
    }
    return task;
  }

  /**
   * 设置任务的 PID
   */
  setTaskPid(taskId: string, pid: number): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.pid = pid;
    }
  }

  /**
   * 清空已完成的任务
   */
  clearCompletedTasks(): void {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status !== 'running') {
        this.tasks.delete(id);
      }
    }
  }

  /**
   * 清空所有任务
   */
  clearAllTasks(): void {
    this.tasks.clear();
    this.nextTaskId = 1;
  }

  /**
   * 监听任务事件
   */
  onTaskEvent(callback: (event: BackgroundTaskEvent) => void): () => void {
    const handler = (event: BackgroundTaskEvent) => callback(event);

    // 监听所有事件
    this.on('task-started', (evt) => handler(evt));
    this.on('task-output', (evt) => handler(evt));
    this.on('task-stderr', (evt) => handler(evt));
    this.on('task-completed', (evt) => handler(evt));
    this.on('task-failed', (evt) => handler(evt));
    this.on('task-cancelled', (evt) => handler(evt));

    // 返回取消监听函数
    return () => {
      this.removeAllListeners();
    };
  }
}

// 全局单例实例
let globalTaskManager: BackgroundTaskManager | null = null;

export function getBackgroundTaskManager(): BackgroundTaskManager {
  if (!globalTaskManager) {
    globalTaskManager = new BackgroundTaskManager();
  }
  return globalTaskManager;
}

export function resetBackgroundTaskManager(): void {
  if (globalTaskManager) {
    globalTaskManager.clearAllTasks();
  }
  globalTaskManager = null;
}
