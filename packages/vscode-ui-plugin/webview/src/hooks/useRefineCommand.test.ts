import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRefineCommand } from './useRefineCommand';

describe('useRefineCommand', () => {
  let mockVscode: any;

  beforeEach(() => {
    // Mock VSCode API
    mockVscode = {
      postMessage: vi.fn(),
    };
    (window as any).vscode = mockVscode;
  });

  afterEach(() => {
    delete (window as any).vscode;
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have null refineResult initially', () => {
      const { result } = renderHook(() => useRefineCommand());
      expect(result.current.refineResult).toBeNull();
    });

    it('should not be loading initially', () => {
      const { result } = renderHook(() => useRefineCommand());
      expect(result.current.isLoading).toBe(false);
    });

    it('should provide all required functions', () => {
      const { result } = renderHook(() => useRefineCommand());
      expect(typeof result.current.executeRefine).toBe('function');
      expect(typeof result.current.clearRefineResult).toBe('function');
      expect(typeof result.current.acceptRefinement).toBe('function');
      expect(typeof result.current.refineAgain).toBe('function');
    });
  });

  describe('executeRefine', () => {
    it('should set loading state when executing', async () => {
      const { result } = renderHook(() => useRefineCommand());

      await act(async () => {
        await result.current.executeRefine('test text');
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should post message to VSCode', async () => {
      const { result } = renderHook(() => useRefineCommand());

      await act(async () => {
        await result.current.executeRefine('test text');
      });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'execute_slash_command',
        payload: {
          command: 'refine',
          args: 'test text',
        },
      });
    });

    it('should not execute with empty text', async () => {
      const { result } = renderHook(() => useRefineCommand());

      await act(async () => {
        await result.current.executeRefine('');
      });

      expect(mockVscode.postMessage).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('should not execute with whitespace only', async () => {
      const { result } = renderHook(() => useRefineCommand());

      await act(async () => {
        await result.current.executeRefine('   ');
      });

      expect(mockVscode.postMessage).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle missing VSCode API gracefully', async () => {
      delete (window as any).vscode;
      const { result } = renderHook(() => useRefineCommand());

      await act(async () => {
        await result.current.executeRefine('test text');
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('event listeners', () => {
    it('should handle refine-result event', async () => {
      const { result } = renderHook(() => useRefineCommand());

      const event = new CustomEvent('refine-result', {
        detail: {
          original: 'original text',
          refined: 'refined text',
        },
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(result.current.refineResult).toEqual({
        original: 'original text',
        refined: 'refined text',
        isLoading: false,
      });
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle refine-error event', async () => {
      const { result } = renderHook(() => useRefineCommand());

      const event = new CustomEvent('refine-error', {
        detail: {
          error: 'Test error message',
        },
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(result.current.refineResult).toEqual({
        original: '',
        refined: '',
        isLoading: false,
        error: 'Test error message',
      });
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('clearRefineResult', () => {
    it('should clear the refine result', () => {
      const { result } = renderHook(() => useRefineCommand());

      // Set a result first
      const event = new CustomEvent('refine-result', {
        detail: {
          original: 'original',
          refined: 'refined',
        },
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(result.current.refineResult).not.toBeNull();

      // Clear it
      act(() => {
        result.current.clearRefineResult();
      });

      expect(result.current.refineResult).toBeNull();
    });
  });

  describe('acceptRefinement', () => {
    it('should clear result when accepting', () => {
      const { result } = renderHook(() => useRefineCommand());

      // Set a result
      const event = new CustomEvent('refine-result', {
        detail: {
          original: 'original',
          refined: 'refined',
        },
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(result.current.refineResult).not.toBeNull();

      // Accept it
      act(() => {
        result.current.acceptRefinement();
      });

      expect(result.current.refineResult).toBeNull();
    });

    it('should do nothing if no result exists', () => {
      const { result } = renderHook(() => useRefineCommand());

      expect(result.current.refineResult).toBeNull();

      act(() => {
        result.current.acceptRefinement();
      });

      expect(result.current.refineResult).toBeNull();
    });
  });

  describe('refineAgain', () => {
    it('should re-execute with original text', async () => {
      const { result } = renderHook(() => useRefineCommand());

      // Set a result
      const event = new CustomEvent('refine-result', {
        detail: {
          original: 'original text',
          refined: 'refined text',
        },
      });

      act(() => {
        window.dispatchEvent(event);
      });

      // Refine again
      await act(async () => {
        await result.current.refineAgain();
      });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'execute_slash_command',
        payload: {
          command: 'refine',
          args: 'original text',
        },
      });
    });

    it('should do nothing if no result exists', async () => {
      const { result } = renderHook(() => useRefineCommand());

      expect(result.current.refineResult).toBeNull();

      await act(async () => {
        await result.current.refineAgain();
      });

      expect(mockVscode.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useRefineCommand());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('refine-result', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('refine-error', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });
});