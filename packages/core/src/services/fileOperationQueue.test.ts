/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FileOperationQueue,
  getGlobalFileOperationQueue,
  resetGlobalFileOperationQueue,
} from './fileOperationQueue.js';

describe('FileOperationQueue', () => {
  let queue: FileOperationQueue;

  beforeEach(() => {
    queue = new FileOperationQueue();
  });

  describe('enqueue', () => {
    it('should execute a single operation immediately', async () => {
      const result = await queue.enqueue('/path/to/file.ts', async () => {
        return 'done';
      });

      expect(result).toBe('done');
    });

    it('should execute operations on the same file sequentially', async () => {
      const executionOrder: number[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Start two operations on the same file concurrently
      const promise1 = queue.enqueue('/path/to/file.ts', async () => {
        executionOrder.push(1);
        await delay(50);
        executionOrder.push(2);
        return 'first';
      });

      const promise2 = queue.enqueue('/path/to/file.ts', async () => {
        executionOrder.push(3);
        await delay(10);
        executionOrder.push(4);
        return 'second';
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('first');
      expect(result2).toBe('second');
      // The second operation should wait for the first to complete
      expect(executionOrder).toEqual([1, 2, 3, 4]);
    });

    it('should execute operations on different files in parallel', async () => {
      const executionOrder: string[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Start two operations on different files concurrently
      const promise1 = queue.enqueue('/path/to/file1.ts', async () => {
        executionOrder.push('1-start');
        await delay(50);
        executionOrder.push('1-end');
        return 'first';
      });

      const promise2 = queue.enqueue('/path/to/file2.ts', async () => {
        executionOrder.push('2-start');
        await delay(10);
        executionOrder.push('2-end');
        return 'second';
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('first');
      expect(result2).toBe('second');
      // Both should start immediately (parallel execution)
      expect(executionOrder[0]).toBe('1-start');
      expect(executionOrder[1]).toBe('2-start');
      // file2 should complete first (shorter delay)
      expect(executionOrder[2]).toBe('2-end');
      expect(executionOrder[3]).toBe('1-end');
    });

    it('should handle errors without blocking subsequent operations', async () => {
      const executionOrder: number[] = [];

      // First operation throws an error
      const promise1 = queue.enqueue('/path/to/file.ts', async () => {
        executionOrder.push(1);
        throw new Error('First operation failed');
      });

      // Second operation should still run
      const promise2 = queue.enqueue('/path/to/file.ts', async () => {
        executionOrder.push(2);
        return 'second';
      });

      await expect(promise1).rejects.toThrow('First operation failed');
      const result2 = await promise2;

      expect(result2).toBe('second');
      expect(executionOrder).toEqual([1, 2]);
    });

    it('should normalize paths for case-insensitive comparison on Windows', async () => {
      const executionOrder: number[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // On Windows, these paths should be treated as the same file
      const path1 = 'C:\\Users\\Test\\file.ts';
      const path2 = 'c:\\users\\test\\file.ts';

      const promise1 = queue.enqueue(path1, async () => {
        executionOrder.push(1);
        await delay(20);
        executionOrder.push(2);
        return 'first';
      });

      const promise2 = queue.enqueue(path2, async () => {
        executionOrder.push(3);
        return 'second';
      });

      await Promise.all([promise1, promise2]);

      // On Windows, they should execute sequentially
      // On other platforms, they might execute in parallel (different normalized paths)
      if (process.platform === 'win32') {
        expect(executionOrder).toEqual([1, 2, 3]);
      }
      // On other platforms, the order might vary
    });
  });

  describe('enqueueMultiple', () => {
    it('should execute without queuing when no files are involved', async () => {
      const result = await queue.enqueueMultiple([], async () => {
        return 'done';
      });

      expect(result).toBe('done');
    });

    it('should use single file queue when only one file is involved', async () => {
      const executionOrder: number[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      const promise1 = queue.enqueue('/path/to/file.ts', async () => {
        executionOrder.push(1);
        await delay(20);
        executionOrder.push(2);
        return 'first';
      });

      const promise2 = queue.enqueueMultiple(['/path/to/file.ts'], async () => {
        executionOrder.push(3);
        return 'second';
      });

      await Promise.all([promise1, promise2]);

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should wait for all involved files before executing', async () => {
      const executionOrder: string[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Operation on file1
      const promise1 = queue.enqueue('/path/to/file1.ts', async () => {
        executionOrder.push('file1-start');
        await delay(30);
        executionOrder.push('file1-end');
        return 'file1';
      });

      // Operation on file2
      const promise2 = queue.enqueue('/path/to/file2.ts', async () => {
        executionOrder.push('file2-start');
        await delay(20);
        executionOrder.push('file2-end');
        return 'file2';
      });

      // Operation involving both files - should wait for both to complete
      const promise3 = queue.enqueueMultiple(
        ['/path/to/file1.ts', '/path/to/file2.ts'],
        async () => {
          executionOrder.push('both-start');
          return 'both';
        }
      );

      await Promise.all([promise1, promise2, promise3]);

      // The multi-file operation should start after both single-file operations complete
      expect(executionOrder.indexOf('both-start')).toBeGreaterThan(
        executionOrder.indexOf('file1-end')
      );
      expect(executionOrder.indexOf('both-start')).toBeGreaterThan(
        executionOrder.indexOf('file2-end')
      );
    });
  });

  describe('clear', () => {
    it('should clear all queues', async () => {
      // Add some operations
      await queue.enqueue('/path/to/file.ts', async () => 'done');

      expect(queue.size).toBeGreaterThan(0);

      queue.clear();

      expect(queue.size).toBe(0);
    });
  });

  describe('size', () => {
    it('should return the number of files in the queue', async () => {
      expect(queue.size).toBe(0);

      await queue.enqueue('/path/to/file1.ts', async () => 'done1');
      expect(queue.size).toBe(1);

      await queue.enqueue('/path/to/file2.ts', async () => 'done2');
      expect(queue.size).toBe(2);

      await queue.enqueue('/path/to/file1.ts', async () => 'done3');
      expect(queue.size).toBe(2); // Same file, no new entry
    });
  });
});

describe('Global FileOperationQueue', () => {
  beforeEach(() => {
    resetGlobalFileOperationQueue();
  });

  it('should return the same instance on multiple calls', () => {
    const queue1 = getGlobalFileOperationQueue();
    const queue2 = getGlobalFileOperationQueue();

    expect(queue1).toBe(queue2);
  });

  it('should create a new instance after reset', () => {
    const queue1 = getGlobalFileOperationQueue();
    resetGlobalFileOperationQueue();
    const queue2 = getGlobalFileOperationQueue();

    expect(queue1).not.toBe(queue2);
  });
});

describe('FileOperationQueue - Real-world scenarios', () => {
  let queue: FileOperationQueue;

  beforeEach(() => {
    queue = new FileOperationQueue();
  });

  it('should handle concurrent replace operations on the same file correctly', async () => {
    // Simulate file content
    let fileContent = 'line1\nline2\nline3\nline4\nline5';

    // Simulate two replace operations called concurrently by AI
    const replace1 = queue.enqueue('/path/to/code.ts', async () => {
      // Read current content (as EditTool does)
      const content = fileContent;
      // Replace line2
      const newContent = content.replace('line2', 'modified-line2');
      // Write back
      fileContent = newContent;
      return 'replaced line2';
    });

    const replace2 = queue.enqueue('/path/to/code.ts', async () => {
      // Read current content (as EditTool does)
      const content = fileContent;
      // Replace line4
      const newContent = content.replace('line4', 'modified-line4');
      // Write back
      fileContent = newContent;
      return 'replaced line4';
    });

    await Promise.all([replace1, replace2]);

    // Both replacements should be present in the final content
    expect(fileContent).toContain('modified-line2');
    expect(fileContent).toContain('modified-line4');
    expect(fileContent).toBe('line1\nmodified-line2\nline3\nmodified-line4\nline5');
  });

  it('should handle three concurrent operations correctly', async () => {
    let fileContent = 'A B C D E';

    const promises = [
      queue.enqueue('/file.txt', async () => {
        const content = fileContent;
        fileContent = content.replace('A', '1');
        return 'A->1';
      }),
      queue.enqueue('/file.txt', async () => {
        const content = fileContent;
        fileContent = content.replace('C', '3');
        return 'C->3';
      }),
      queue.enqueue('/file.txt', async () => {
        const content = fileContent;
        fileContent = content.replace('E', '5');
        return 'E->5';
      }),
    ];

    await Promise.all(promises);

    // All three replacements should be applied
    expect(fileContent).toBe('1 B 3 D 5');
  });
});
