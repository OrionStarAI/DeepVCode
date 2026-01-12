import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBackgroundTasks } from './useBackgroundTasks';
import type { BackgroundTaskInfo, BackgroundTasksUpdatePayload } from '../../../src/types/messages';

describe('useBackgroundTasks', () => {
  let mockPostMessage: ReturnType<typeof vi.fn>;
  let messageListeners: Array<(event: MessageEvent) => void> = [];
  let originalAddEventListener: any;
  let originalRemoveEventListener: any;

  beforeEach(() => {
    mockPostMessage = vi.fn();
    messageListeners = [];

    // Save original window methods
    originalAddEventListener = window.addEventListener;
    originalRemoveEventListener = window.removeEventListener;

    // Mock window.vscode API (specific to VSCode webview)
    (window as any).vscode = {
      postMessage: mockPostMessage,
    };

    // Override window event listeners
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === 'message') {
        messageListeners.push(handler);
      }
    }) as any;

    window.removeEventListener = vi.fn((event: string, handler: any) => {
      if (event === 'message') {
        messageListeners = messageListeners.filter(l => l !== handler);
      }
    }) as any;

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    messageListeners = [];

    // Restore original window methods
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    delete (window as any).vscode;
  });

  const createTask = (id: string, status: 'running' | 'completed' | 'failed', command: string = 'test'): BackgroundTaskInfo => ({
    id,
    command,
    status,
    output: '',
    stderr: '',
    startTime: Date.now(),
    pid: 12345,
  });

  const sendMessage = (type: string, payload: any) => {
    const event = new MessageEvent('message', {
      data: { type, payload },
    });
    messageListeners.forEach(listener => listener(event));
  };

  describe('initial state', () => {
    it('should start with empty tasks', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      expect(result.current.tasks).toEqual([]);
      expect(result.current.runningCount).toBe(0);
    });

    it('should request tasks on mount', () => {
      renderHook(() => useBackgroundTasks());

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'background_task_request',
        payload: { action: 'list' },
      });
    });
  });

  describe('task updates', () => {
    it('should update tasks when receiving background_tasks_update', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      const tasks = [
        createTask('task1', 'running', 'npm start'),
        createTask('task2', 'completed', 'npm test'),
      ];

      act(() => {
        sendMessage('background_tasks_update', {
          tasks,
          runningCount: 1,
        } as BackgroundTasksUpdatePayload);
      });

      expect(result.current.tasks).toEqual(tasks);
      expect(result.current.runningCount).toBe(1);
    });

    it('should handle real-time output updates', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      const initialTask = createTask('task1', 'running', 'npm start');

      act(() => {
        sendMessage('background_tasks_update', {
          tasks: [initialTask],
          runningCount: 1,
        });
      });

      act(() => {
        sendMessage('background_task_output', {
          taskId: 'task1',
          output: 'Server started\n',
          isStderr: false,
        });
      });

      expect(result.current.tasks[0].output).toBe('Server started\n');
    });

    it('should handle stderr output separately', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      const initialTask = createTask('task1', 'running', 'npm start');

      act(() => {
        sendMessage('background_tasks_update', {
          tasks: [initialTask],
          runningCount: 1,
        });
      });

      act(() => {
        sendMessage('background_task_output', {
          taskId: 'task1',
          output: 'Error occurred\n',
          isStderr: true,
        });
      });

      expect(result.current.tasks[0].stderr).toBe('Error occurred\n');
      expect(result.current.tasks[0].output).toBe('');
    });

    it('should append output to existing task', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      const initialTask = { ...createTask('task1', 'running'), output: 'Line 1\n' };

      act(() => {
        sendMessage('background_tasks_update', {
          tasks: [initialTask],
          runningCount: 1,
        });
      });

      act(() => {
        sendMessage('background_task_output', {
          taskId: 'task1',
          output: 'Line 2\n',
          isStderr: false,
        });
      });

      expect(result.current.tasks[0].output).toBe('Line 1\nLine 2\n');
    });
  });

  describe('killTask', () => {
    it('should send kill request', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      act(() => {
        result.current.killTask('task1');
      });

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'background_task_request',
        payload: { action: 'kill', taskId: 'task1' },
      });
    });

    it('should handle multiple kill requests', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      act(() => {
        result.current.killTask('task1');
        result.current.killTask('task2');
      });

      expect(mockPostMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshTasks', () => {
    it('should request task list', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      mockPostMessage.mockClear();

      act(() => {
        result.current.refreshTasks();
      });

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'background_task_request',
        payload: { action: 'list' },
      });
    });
  });

  describe('getTask', () => {
    it('should return task by id', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      const tasks = [
        createTask('task1', 'running'),
        createTask('task2', 'completed'),
      ];

      act(() => {
        sendMessage('background_tasks_update', {
          tasks,
          runningCount: 1,
        });
      });

      const task = result.current.getTask('task1');
      expect(task?.id).toBe('task1');
    });

    it('should return undefined for non-existent task', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      const task = result.current.getTask('nonexistent');
      expect(task).toBeUndefined();
    });
  });

  describe('message listener cleanup', () => {
    it('should remove listener on unmount', () => {
      const { unmount } = renderHook(() => useBackgroundTasks());

      const initialListenerCount = messageListeners.length;
      expect(initialListenerCount).toBeGreaterThan(0);

      unmount();

      expect(window.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('edge cases', () => {
    it('should handle missing vscode API gracefully', () => {
      (global as any).window.vscode = undefined;

      const { result } = renderHook(() => useBackgroundTasks());

      expect(() => {
        result.current.killTask('task1');
        result.current.refreshTasks();
      }).not.toThrow();
    });

    it('should handle empty task updates', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      act(() => {
        sendMessage('background_tasks_update', {
          tasks: [],
          runningCount: 0,
        });
      });

      expect(result.current.tasks).toEqual([]);
      expect(result.current.runningCount).toBe(0);
    });

    it('should ignore output for non-existent tasks', () => {
      const { result } = renderHook(() => useBackgroundTasks());

      const tasks = [createTask('task1', 'running')];

      act(() => {
        sendMessage('background_tasks_update', { tasks, runningCount: 1 });
      });

      act(() => {
        sendMessage('background_task_output', {
          taskId: 'task999',
          output: 'Should be ignored',
        });
      });

      expect(result.current.tasks[0].output).toBe('');
    });
  });
});