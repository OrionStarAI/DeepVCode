/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

/**
 * FileOperationQueue - 文件操作队列服务
 *
 * 确保对同一文件的并发操作按顺序执行，避免多个 replace 调用相互覆盖。
 *
 * 问题场景：
 * 当 AI 同时发起多个对同一文件的 replace 调用时（针对文件的不同位置），
 * 如果并行执行，每个调用都会读取原始文件内容，执行替换后写入，
 * 导致后面的写入覆盖前面的修改。
 *
 * 解决方案：
 * 使用 Promise 链模式，确保同一文件的操作按顺序执行：
 * 1. 第一个操作读取原始内容，执行替换，写入
 * 2. 第二个操作等待第一个完成后，读取已修改的内容，执行替换，写入
 * 3. 以此类推...
 *
 * 使用方式：
 * ```typescript
 * const queue = new FileOperationQueue();
 *
 * // 对同一文件的操作会自动排队
 * await Promise.all([
 *   queue.enqueue('/path/to/file.ts', async () => {
 *     // 第一个编辑操作
 *   }),
 *   queue.enqueue('/path/to/file.ts', async () => {
 *     // 第二个编辑操作 - 会等待第一个完成
 *   }),
 *   queue.enqueue('/other/file.ts', async () => {
 *     // 不同文件的操作可以并行
 *   }),
 * ]);
 * ```
 */
export class FileOperationQueue {
  /**
   * 存储每个文件路径对应的最后一个操作 Promise
   * key: 规范化后的文件路径（小写，统一分隔符）
   * value: 该文件最后一个操作的 Promise
   */
  private fileQueues = new Map<string, Promise<void>>();

  /**
   * 规范化文件路径，确保相同文件的不同路径表示映射到同一个队列
   * - 转换为小写（Windows 文件系统不区分大小写）
   * - 规范化路径分隔符
   * - 解析相对路径
   */
  private normalizePath(filePath: string): string {
    const normalized = path.normalize(filePath);
    // Windows 文件系统不区分大小写
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }

  /**
   * 将文件操作加入队列
   *
   * @param filePath 操作的目标文件路径
   * @param operation 要执行的异步操作
   * @returns 操作的执行结果
   *
   * 注意：即使操作失败，队列也会继续处理后续操作（错误不会阻塞队列）
   */
  async enqueue<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const normalizedPath = this.normalizePath(filePath);

    // 获取该文件当前的队列尾部（如果没有则为已完成的 Promise）
    const currentQueue = this.fileQueues.get(normalizedPath) ?? Promise.resolve();

    // 创建新的操作 Promise，等待前一个操作完成后执行
    let resolveOperation: () => void;
    let rejectOperation: (error: unknown) => void;

    // 用于跟踪此操作完成状态的 Promise
    const operationTracker = new Promise<void>((resolve, reject) => {
      resolveOperation = resolve;
      rejectOperation = reject;
    });

    // 结果 Promise - 用于返回给调用者
    const resultPromise = currentQueue
      .catch(() => {
        // 忽略前一个操作的错误，继续执行当前操作
        // 这确保一个操作失败不会阻塞后续操作
      })
      .then(async () => {
        try {
          const result = await operation();
          resolveOperation!();
          return result;
        } catch (error) {
          rejectOperation!(error);
          throw error;
        }
      });

    // 更新队列为当前操作的跟踪 Promise
    // 使用 operationTracker 而不是 resultPromise，
    // 确保即使调用者不处理结果，队列也能正确工作
    this.fileQueues.set(normalizedPath, operationTracker.catch(() => {}));

    return resultPromise;
  }

  /**
   * 将涉及多个文件的操作加入队列
   *
   * 当一个操作涉及多个文件时（如移动文件），需要获取所有相关文件的"锁"
   *
   * @param filePaths 操作涉及的所有文件路径
   * @param operation 要执行的异步操作
   * @returns 操作的执行结果
   */
  async enqueueMultiple<T>(
    filePaths: string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    if (filePaths.length === 0) {
      // 没有涉及文件，直接执行
      return operation();
    }

    if (filePaths.length === 1) {
      // 只涉及一个文件，使用单文件队列
      return this.enqueue(filePaths[0], operation);
    }

    // 涉及多个文件时，需要等待所有相关文件的队列
    // 为了避免死锁，按路径排序后依次获取
    const sortedPaths = [...filePaths]
      .map(p => this.normalizePath(p))
      .sort();

    // 等待所有相关文件的当前操作完成
    const currentQueues = sortedPaths.map(
      normalizedPath => this.fileQueues.get(normalizedPath) ?? Promise.resolve()
    );

    await Promise.all(currentQueues.map(q => q.catch(() => {})));

    // 创建操作跟踪器
    let resolveOperation: () => void;
    const operationTracker = new Promise<void>((resolve) => {
      resolveOperation = resolve;
    });

    // 为所有涉及的文件设置相同的跟踪器
    for (const normalizedPath of sortedPaths) {
      this.fileQueues.set(normalizedPath, operationTracker.catch(() => {}));
    }

    try {
      const result = await operation();
      resolveOperation!();
      return result;
    } catch (error) {
      resolveOperation!(); // 即使失败也要解锁，让后续操作可以继续
      throw error;
    }
  }

  /**
   * 清除所有队列（主要用于测试）
   */
  clear(): void {
    this.fileQueues.clear();
  }

  /**
   * 获取当前队列中的文件数量（主要用于调试）
   */
  get size(): number {
    return this.fileQueues.size;
  }
}

// 导出单例实例，供全局使用
let globalFileOperationQueue: FileOperationQueue | null = null;

/**
 * 获取全局 FileOperationQueue 单例
 */
export function getGlobalFileOperationQueue(): FileOperationQueue {
  if (!globalFileOperationQueue) {
    globalFileOperationQueue = new FileOperationQueue();
  }
  return globalFileOperationQueue;
}

/**
 * 重置全局队列（主要用于测试）
 */
export function resetGlobalFileOperationQueue(): void {
  globalFileOperationQueue?.clear();
  globalFileOperationQueue = null;
}
