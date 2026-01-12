import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessageHistory } from './useMessageHistory';
import type { ChatMessage, MessageContent } from '../types/index';

describe('useMessageHistory', () => {
  const createMessage = (id: string, type: 'user' | 'assistant', content: string): ChatMessage => ({
    id,
    type,
    content: [{ type: 'text', value: content }],
    timestamp: Date.now(),
  });

  describe('initial state', () => {
    it('should start with no history navigation', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);

      const { result } = renderHook(() =>
        useMessageHistory({
          messages: [],
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      expect(result.current.isInHistory).toBe(false);
      expect(result.current.currentHistoryIndex).toBe(-1);
      expect(result.current.historyLength).toBe(0);
    });

    it('should calculate history length from user messages', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);
      const messages = [
        createMessage('1', 'user', 'First'),
        createMessage('2', 'assistant', 'Response'),
        createMessage('3', 'user', 'Second'),
      ];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      expect(result.current.historyLength).toBe(2);
    });
  });

  describe('navigateUp', () => {
    it('should navigate to most recent user message', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => [{ type: 'text', value: 'current' }]);
      const messages = [
        createMessage('1', 'user', 'First'),
        createMessage('2', 'user', 'Second'),
      ];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.isInHistory).toBe(true);
      expect(result.current.currentHistoryIndex).toBe(0);
      expect(onHistoryNavigate).toHaveBeenCalledWith([{ type: 'text', value: 'Second' }]);
    });

    it('should save current input on first navigate up', () => {
      const onHistoryNavigate = vi.fn();
      const currentInput: MessageContent = [{ type: 'text', value: 'typing...' }];
      const getCurrentInput = vi.fn(() => currentInput);
      const messages = [createMessage('1', 'user', 'Previous')];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      act(() => {
        result.current.navigateUp();
      });

      expect(getCurrentInput).toHaveBeenCalled();
    });

    it('should navigate through multiple messages', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);
      const messages = [
        createMessage('1', 'user', 'First'),
        createMessage('2', 'user', 'Second'),
        createMessage('3', 'user', 'Third'),
      ];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      act(() => {
        result.current.navigateUp(); // Third
      });
      expect(result.current.currentHistoryIndex).toBe(0);

      act(() => {
        result.current.navigateUp(); // Second
      });
      expect(result.current.currentHistoryIndex).toBe(1);

      act(() => {
        result.current.navigateUp(); // First
      });
      expect(result.current.currentHistoryIndex).toBe(2);
    });

    it('should not go beyond oldest message', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);
      const messages = [createMessage('1', 'user', 'Only one')];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      act(() => {
        result.current.navigateUp();
        result.current.navigateUp();
        result.current.navigateUp();
      });

      expect(result.current.currentHistoryIndex).toBe(0);
    });

    it('should do nothing when no history available', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);

      const { result } = renderHook(() =>
        useMessageHistory({
          messages: [],
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      act(() => {
        result.current.navigateUp();
      });

      expect(onHistoryNavigate).not.toHaveBeenCalled();
      expect(result.current.isInHistory).toBe(false);
    });
  });

  describe('navigateDown', () => {
    it('should navigate to newer message', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);
      const messages = [
        createMessage('1', 'user', 'First'),
        createMessage('2', 'user', 'Second'),
      ];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      act(() => {
        result.current.navigateUp(); // Second (index 0)
      });

      act(() => {
        result.current.navigateUp(); // First (index 1)
      });

      const beforeIndex = result.current.currentHistoryIndex;
      expect(beforeIndex).toBeGreaterThan(0);

      act(() => {
        result.current.navigateDown(); // Back to Second
      });

      // Index should decrease
      expect(result.current.currentHistoryIndex).toBeLessThan(beforeIndex);
      expect(onHistoryNavigate).toHaveBeenCalled();
    });

    it('should restore saved input when navigating to current', () => {
      const onHistoryNavigate = vi.fn();
      const savedInput: MessageContent = [{ type: 'text', value: 'my text' }];
      const getCurrentInput = vi.fn(() => savedInput);
      const messages = [createMessage('1', 'user', 'Previous')];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      act(() => {
        result.current.navigateUp();
      });

      onHistoryNavigate.mockClear();

      act(() => {
        result.current.navigateDown();
      });

      expect(result.current.isInHistory).toBe(false);
      expect(result.current.currentHistoryIndex).toBe(-1);
      expect(onHistoryNavigate).toHaveBeenCalledWith(savedInput);
    });

    it('should do nothing when already at current input', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);
      const messages = [createMessage('1', 'user', 'Previous')];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      act(() => {
        result.current.navigateDown();
      });

      expect(onHistoryNavigate).not.toHaveBeenCalled();
      expect(result.current.isInHistory).toBe(false);
    });
  });

  describe('resetHistory', () => {
    it('should reset to current input state', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);
      const messages = [createMessage('1', 'user', 'Previous')];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.isInHistory).toBe(true);

      act(() => {
        result.current.resetHistory();
      });

      expect(result.current.isInHistory).toBe(false);
      expect(result.current.currentHistoryIndex).toBe(-1);
    });
  });

  describe('message filtering', () => {
    it('should only include user messages in history', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);
      const messages = [
        createMessage('1', 'user', 'User 1'),
        createMessage('2', 'assistant', 'AI Response'),
        createMessage('3', 'user', 'User 2'),
        createMessage('4', 'assistant', 'AI Response 2'),
      ];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      expect(result.current.historyLength).toBe(2);

      act(() => {
        result.current.navigateUp();
      });

      expect(onHistoryNavigate).toHaveBeenCalledWith([{ type: 'text', value: 'User 2' }]);
    });

    it('should reverse message order (newest first)', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);
      const messages = [
        createMessage('1', 'user', 'Oldest'),
        createMessage('2', 'user', 'Middle'),
        createMessage('3', 'user', 'Newest'),
      ];

      const { result } = renderHook(() =>
        useMessageHistory({
          messages,
          onHistoryNavigate,
          getCurrentInput,
        })
      );

      act(() => {
        result.current.navigateUp();
      });

      expect(onHistoryNavigate).toHaveBeenCalledWith([{ type: 'text', value: 'Newest' }]);

      act(() => {
        result.current.navigateUp();
      });

      expect(onHistoryNavigate).toHaveBeenCalledWith([{ type: 'text', value: 'Middle' }]);
    });
  });

  describe('dynamic message updates', () => {
    it('should update history when messages change', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);
      const messages = [createMessage('1', 'user', 'First')];

      const { result, rerender } = renderHook(
        ({ messages }) =>
          useMessageHistory({
            messages,
            onHistoryNavigate,
            getCurrentInput,
          }),
        { initialProps: { messages } }
      );

      expect(result.current.historyLength).toBe(1);

      const newMessages = [
        ...messages,
        createMessage('2', 'user', 'Second'),
      ];

      rerender({ messages: newMessages });

      expect(result.current.historyLength).toBe(2);
    });

    it('should adjust index when history shrinks', () => {
      const onHistoryNavigate = vi.fn();
      const getCurrentInput = vi.fn(() => []);
      const messages = [
        createMessage('1', 'user', 'First'),
        createMessage('2', 'user', 'Second'),
        createMessage('3', 'user', 'Third'),
      ];

      const { result, rerender } = renderHook(
        ({ messages }) =>
          useMessageHistory({
            messages,
            onHistoryNavigate,
            getCurrentInput,
          }),
        { initialProps: { messages } }
      );

      act(() => {
        result.current.navigateUp();
      });

      act(() => {
        result.current.navigateUp();
      });

      act(() => {
        result.current.navigateUp();
      });

      const oldIndex = result.current.currentHistoryIndex;
      expect(oldIndex).toBeGreaterThanOrEqual(2);

      // Remove messages
      const newMessages = [createMessage('1', 'user', 'First')];
      rerender({ messages: newMessages });

      // Index should be adjusted (not exceed new history length)
      expect(result.current.historyLength).toBe(1);
      expect(result.current.currentHistoryIndex).toBeLessThan(oldIndex);
    });
  });
});