import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiSessionState } from './useMultiSessionState';
import { SessionStatus } from '../../../src/constants/sessionConstants';

describe('useMultiSessionState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have empty sessions initially', () => {
      const { result } = renderHook(() => useMultiSessionState());

      expect(result.current.state.sessions.size).toBe(0);
      expect(result.current.state.currentSessionId).toBeNull();
      expect(result.current.state.sessionList).toEqual([]);
    });

    it('should have default UI state', () => {
      const { result } = renderHook(() => useMultiSessionState());

      expect(result.current.state.ui.sidebarExpanded).toBe(true);
      expect(result.current.state.ui.showSessionManager).toBe(false);
      expect(result.current.state.ui.showProjectSettings).toBe(false);
      expect(result.current.state.ui.showConfirmationDialog).toBe(false);
    });

    it('should have zero stats initially', () => {
      const { result } = renderHook(() => useMultiSessionState());

      expect(result.current.state.stats.totalSessions).toBe(0);
      expect(result.current.state.stats.totalMessages).toBe(0);
      expect(result.current.state.stats.processingMessages).toBe(0);
    });

    it('should not be loading initially', () => {
      const { result } = renderHook(() => useMultiSessionState());

      expect(result.current.state.isLoading).toBe(false);
    });
  });

  describe('session management', () => {
    it('should create a new session', () => {
      const { result } = renderHook(() => useMultiSessionState());

      const sessionInfo = {
        id: 'session-1',
        name: 'Test Session',
        status: SessionStatus.ACTIVE,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
      };

      act(() => {
        result.current.createSession(sessionInfo, false);
      });

      expect(result.current.state.sessions.size).toBe(1);
      expect(result.current.state.currentSessionId).toBe('session-1');
      expect(result.current.state.stats.totalSessions).toBe(1);
    });

    it('should set currentSessionId when creating first session', () => {
      const { result } = renderHook(() => useMultiSessionState());

      const sessionInfo = {
        id: 'session-1',
        name: 'First Session',
        status: SessionStatus.ACTIVE,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
      };

      act(() => {
        result.current.createSession(sessionInfo);
      });

      expect(result.current.state.currentSessionId).toBe('session-1');
    });

    it('should delete a session', () => {
      const { result } = renderHook(() => useMultiSessionState());

      const sessionInfo = {
        id: 'session-1',
        name: 'Test Session',
        status: SessionStatus.ACTIVE,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
      };

      act(() => {
        result.current.createSession(sessionInfo);
      });

      expect(result.current.state.sessions.size).toBe(1);

      act(() => {
        result.current.deleteSession('session-1');
      });

      expect(result.current.state.sessions.size).toBe(0);
      expect(result.current.state.currentSessionId).toBeNull();
    });

    it('should switch to next session when deleting current session', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Session 1',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
        result.current.createSession({
          id: 'session-2',
          name: 'Session 2',
          status: SessionStatus.IDLE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
      });

      expect(result.current.state.currentSessionId).toBe('session-1');

      act(() => {
        result.current.deleteSession('session-1');
      });

      expect(result.current.state.currentSessionId).toBe('session-2');
    });

    it('should switch to a session', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Session 1',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
        result.current.createSession({
          id: 'session-2',
          name: 'Session 2',
          status: SessionStatus.IDLE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
      });

      act(() => {
        result.current.switchToSession('session-2');
      });

      expect(result.current.state.currentSessionId).toBe('session-2');
    });

    it('should update session info', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Original Name',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
      });

      act(() => {
        result.current.updateSessionInfo('session-1', { name: 'Updated Name' });
      });

      const session = result.current.state.sessions.get('session-1');
      expect(session?.info.name).toBe('Updated Name');
    });
  });

  describe('message management', () => {
    it('should add a message to a session', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Test Session',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
      });

      const message = {
        id: 'msg-1',
        type: 'user' as const,
        content: [{ type: 'text' as const, value: 'Hello' }],
        timestamp: Date.now(),
      };

      act(() => {
        result.current.addMessage('session-1', message);
      });

      const session = result.current.state.sessions.get('session-1');
      expect(session?.messages.length).toBe(1);
      expect(session?.messages[0].id).toBe('msg-1');
    });

    it('should not add duplicate messages', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Test Session',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
      });

      const message = {
        id: 'msg-1',
        type: 'user' as const,
        content: [{ type: 'text' as const, value: 'Hello' }],
        timestamp: Date.now(),
      };

      act(() => {
        result.current.addMessage('session-1', message);
        result.current.addMessage('session-1', message); // Add again
      });

      const session = result.current.state.sessions.get('session-1');
      expect(session?.messages.length).toBe(1); // Should still be 1
    });

    it('should clear messages from a session', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Test Session',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });

        result.current.addMessage('session-1', {
          id: 'msg-1',
          type: 'user',
          content: [{ type: 'text', value: 'Hello' }],
          timestamp: Date.now(),
        });
      });

      const sessionBefore = result.current.state.sessions.get('session-1');
      expect(sessionBefore?.messages.length).toBe(1);

      act(() => {
        result.current.clearMessages('session-1');
      });

      const sessionAfter = result.current.state.sessions.get('session-1');
      expect(sessionAfter?.messages.length).toBe(0);
    });
  });

  describe('UI state management', () => {
    it('should toggle sidebar', () => {
      const { result } = renderHook(() => useMultiSessionState());

      expect(result.current.state.ui.sidebarExpanded).toBe(true);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.state.ui.sidebarExpanded).toBe(false);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.state.ui.sidebarExpanded).toBe(true);
    });

    it('should toggle session manager', () => {
      const { result } = renderHook(() => useMultiSessionState());

      expect(result.current.state.ui.showSessionManager).toBe(false);

      act(() => {
        result.current.toggleSessionManager(true);
      });

      expect(result.current.state.ui.showSessionManager).toBe(true);

      act(() => {
        result.current.toggleSessionManager(false);
      });

      expect(result.current.state.ui.showSessionManager).toBe(false);
    });

    it('should toggle project settings', () => {
      const { result } = renderHook(() => useMultiSessionState());

      expect(result.current.state.ui.showProjectSettings).toBe(false);

      act(() => {
        result.current.toggleProjectSettings(true);
      });

      expect(result.current.state.ui.showProjectSettings).toBe(true);
    });
  });

  describe('query methods', () => {
    it('should get current session', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Test Session',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
      });

      const currentSession = result.current.getCurrentSession();
      expect(currentSession).not.toBeNull();
      expect(currentSession?.info.id).toBe('session-1');
    });

    it('should get session by id', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Test Session',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
      });

      const session = result.current.getSession('session-1');
      expect(session).not.toBeNull();
      expect(session?.info.name).toBe('Test Session');
    });

    it('should check if session exists', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Test Session',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
      });

      expect(result.current.hasSession('session-1')).toBe(true);
      expect(result.current.hasSession('non-existent')).toBe(false);
    });
  });

  describe('loading state', () => {
    it('should set global loading state', () => {
      const { result } = renderHook(() => useMultiSessionState());

      expect(result.current.state.isLoading).toBe(false);

      act(() => {
        result.current.setGlobalLoading(true);
      });

      expect(result.current.state.isLoading).toBe(true);
    });

    it('should set session loading state', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Test Session',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });
      });

      act(() => {
        result.current.setSessionLoading('session-1', true);
      });

      const session = result.current.state.sessions.get('session-1');
      expect(session?.isLoading).toBe(true);
    });
  });

  describe('stats', () => {
    it('should update stats automatically', () => {
      const { result } = renderHook(() => useMultiSessionState());

      act(() => {
        result.current.createSession({
          id: 'session-1',
          name: 'Session 1',
          status: SessionStatus.ACTIVE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });

        result.current.createSession({
          id: 'session-2',
          name: 'Session 2',
          status: SessionStatus.IDLE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
        });

        result.current.addMessage('session-1', {
          id: 'msg-1',
          type: 'user',
          content: [{ type: 'text', value: 'Hello' }],
          timestamp: Date.now(),
        });
      });

      expect(result.current.state.stats.totalSessions).toBe(2);
      expect(result.current.state.stats.totalMessages).toBe(1);
    });
  });
});