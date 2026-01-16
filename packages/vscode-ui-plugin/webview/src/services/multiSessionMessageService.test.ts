/**
 * MultiSessionMessageService 测试
 * 测试多会话消息服务的核心功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MultiSessionMessageService } from './multiSessionMessageService';
import type { SessionInfo } from '../../../src/types/sessionTypes';
import { SessionType } from '../../../src/constants/sessionConstants';
import type { MessageContent } from '../types';

describe('MultiSessionMessageService', () => {
  let service: MultiSessionMessageService;
  let mockVscode: any;
  let messageListeners: Array<(event: MessageEvent) => void>;
  let originalAddEventListener: any;
  let originalRemoveEventListener: any;
  let originalWindowVscode: any;

  beforeEach(() => {
    vi.clearAllMocks();
    messageListeners = [];

    // Save original methods
    originalAddEventListener = window.addEventListener;
    originalRemoveEventListener = window.removeEventListener;
    originalWindowVscode = (window as any).vscode;

    // Mock window.vscode API
    mockVscode = {
      postMessage: vi.fn(),
    };
    (window as any).vscode = mockVscode;

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

    // Create service instance
    service = new MultiSessionMessageService();
  });

  afterEach(() => {
    service.dispose();
    messageListeners = [];

    // Restore original methods
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    if (originalWindowVscode) {
      (window as any).vscode = originalWindowVscode;
    } else {
      delete (window as any).vscode;
    }
  });

  const createMockSession = (id: string, name: string): SessionInfo => ({
    id,
    name,
    type: SessionType.CHAT,
    status: 'active' as any,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    messageCount: 0,
  });

  const sendMessage = (type: string, payload: any) => {
    const event = new MessageEvent('message', {
      data: { type, payload },
    });
    messageListeners.forEach(listener => listener(event));
  };

  describe('initialization', () => {
    it('should send ready message on creation', () => {
      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'ready',
        payload: {},
      });
    });

    it('should request session list on ready', () => {
      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_list_request',
        payload: {},
      });
    });

    it('should register message event listener', () => {
      expect(window.addEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
    });

    it('should mark as ready immediately', () => {
      service.markAsReady();
      // Should not throw or cause issues
      expect(true).toBe(true);
    });
  });

  describe('session management', () => {
    it('should request session list', () => {
      mockVscode.postMessage.mockClear();

      service.requestSessionList();

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_list_request',
        payload: {},
      });
    });

    it('should request session list with options', () => {
      mockVscode.postMessage.mockClear();

      service.requestSessionList({ includeAll: true });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_list_request',
        payload: { includeAll: true },
      });
    });

    it('should request session history with pagination', () => {
      mockVscode.postMessage.mockClear();

      service.requestSessionHistory({ offset: 0, limit: 20 });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_list_request',
        payload: { offset: 0, limit: 20 },
      });
    });

    it('should create new session', () => {
      mockVscode.postMessage.mockClear();

      service.createSession({
        name: 'Test Session',
        type: SessionType.CHAT,
      });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_create',
        payload: {
          name: 'Test Session',
          type: SessionType.CHAT,
        },
      });
    });

    it('should create session from template', () => {
      mockVscode.postMessage.mockClear();

      service.createSession({
        name: 'Template Session',
        type: SessionType.CHAT,
        fromTemplate: true,
        systemPrompt: 'You are a helpful assistant',
      });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_create',
        payload: {
          name: 'Template Session',
          type: SessionType.CHAT,
          fromTemplate: true,
          systemPrompt: 'You are a helpful assistant',
        },
      });
    });

    it('should delete session', () => {
      mockVscode.postMessage.mockClear();

      service.deleteSession('session-1');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_delete',
        payload: { sessionId: 'session-1' },
      });
    });

    it('should switch session', () => {
      mockVscode.postMessage.mockClear();

      service.switchSession('session-2');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_switch',
        payload: { sessionId: 'session-2' },
      });
    });

    it('should update session info', () => {
      mockVscode.postMessage.mockClear();

      service.updateSession({
        sessionId: 'session-1',
        updates: {
          name: 'Updated Name',
          description: 'New description',
        },
      });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_update',
        payload: {
          sessionId: 'session-1',
          updates: {
            name: 'Updated Name',
            description: 'New description',
          },
        },
      });
    });

    it('should duplicate session', () => {
      mockVscode.postMessage.mockClear();

      service.duplicateSession('session-1');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_duplicate',
        payload: { sessionId: 'session-1' },
      });
    });

    it('should clear session', () => {
      mockVscode.postMessage.mockClear();

      service.clearSession('session-1');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_clear',
        payload: { sessionId: 'session-1' },
      });
    });

    it('should export sessions', () => {
      mockVscode.postMessage.mockClear();

      service.exportSessions({ sessionIds: ['session-1', 'session-2'] });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_export',
        payload: { sessionIds: ['session-1', 'session-2'] },
      });
    });

    it('should export all sessions by default', () => {
      mockVscode.postMessage.mockClear();

      service.exportSessions();

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_export',
        payload: {},
      });
    });

    it('should import sessions', () => {
      mockVscode.postMessage.mockClear();

      service.importSessions({
        filePath: '/path/to/backup.json',
        overwriteExisting: true,
      });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_import',
        payload: {
          filePath: '/path/to/backup.json',
          overwriteExisting: true,
        },
      });
    });

    it('should import sessions with default options', () => {
      mockVscode.postMessage.mockClear();

      service.importSessions();

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'session_import',
        payload: {},
      });
    });
  });

  describe('chat messages', () => {
    it('should send chat message', () => {
      mockVscode.postMessage.mockClear();

      const content: MessageContent = [{ type: 'text', value: 'Hello AI' }];
      service.sendChatMessage('session-1', content, 'msg-1');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'chat_message',
        payload: {
          sessionId: 'session-1',
          id: 'msg-1',
          content,
          timestamp: expect.any(Number),
        },
      });
    });

    it('should send edit message and regenerate', () => {
      mockVscode.postMessage.mockClear();

      const content: MessageContent = [{ type: 'text', value: 'Updated message' }];
      const originalMessages = [{ id: 'msg-1', type: 'user' }];
      service.sendEditMessageAndRegenerate('session-1', 'msg-1', content, originalMessages);

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'edit_message_and_regenerate',
        payload: {
          sessionId: 'session-1',
          messageId: 'msg-1',
          newContent: content,
          originalMessages,
          timestamp: expect.any(Number),
        },
      });
    });

    it('should send rollback to message request', () => {
      mockVscode.postMessage.mockClear();

      const originalMessages = [{ id: 'msg-1', type: 'user' }];
      service.sendRollbackToMessage('session-1', 'msg-1', originalMessages);

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'rollback_to_message',
        payload: {
          sessionId: 'session-1',
          messageId: 'msg-1',
          originalMessages,
          timestamp: expect.any(Number),
        },
      });
    });

    it('should undo file change', () => {
      mockVscode.postMessage.mockClear();

      service.undoFileChange('session-1', {
        fileName: 'test.txt',
        filePath: '/path/test.txt',
        originalContent: 'original',
        isNewFile: false,
        isDeletedFile: false,
      });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'undo_file_change',
        payload: {
          sessionId: 'session-1',
          fileName: 'test.txt',
          filePath: '/path/test.txt',
          originalContent: 'original',
          isNewFile: false,
          isDeletedFile: false,
        },
      });
    });
  });

  describe('tool execution', () => {
    it('should send tool execution request', () => {
      mockVscode.postMessage.mockClear();

      service.sendToolExecutionRequest('session-1', {
        id: 'tool-1',
        toolName: 'read_file',
        parameters: { filePath: '/path/to/file.txt' },
        requiresConfirmation: false,
      });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'tool_execution_request',
        payload: {
          sessionId: 'session-1',
          id: 'tool-1',
          toolName: 'read_file',
          parameters: { filePath: '/path/to/file.txt' },
          requiresConfirmation: false,
        },
      });
    });

    it('should send tool confirmation response', () => {
      mockVscode.postMessage.mockClear();

      service.sendToolConfirmationResponse('session-1', 'tool-1', true, 'yes', 'approved');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'tool_confirmation_response',
        payload: {
          sessionId: 'session-1',
          toolId: 'tool-1',
          confirmed: true,
          userInput: 'yes',
          outcome: 'approved',
        },
      });
    });

    it('should cancel all tools', () => {
      mockVscode.postMessage.mockClear();

      service.sendCancelAllTools('session-1');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'tool_cancel_all',
        payload: { sessionId: 'session-1' },
      });
    });

    it('should send flow abort', () => {
      mockVscode.postMessage.mockClear();

      service.sendFlowAbort('session-1');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'flow_abort',
        payload: { sessionId: 'session-1' },
      });
    });
  });

  describe('context and settings', () => {
    it('should request context', () => {
      mockVscode.postMessage.mockClear();

      service.requestContext('session-1');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'get_context',
        payload: { sessionId: 'session-1' },
      });
    });

    it('should request context without session', () => {
      mockVscode.postMessage.mockClear();

      service.requestContext();

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'get_context',
        payload: {},
      });
    });

    it('should save UI message', () => {
      mockVscode.postMessage.mockClear();

      const message = {
        id: 'msg-1',
        type: 'user',
        content: [{ type: 'text', value: 'Hello' }],
        timestamp: Date.now(),
      };
      service.saveUIMessage('session-1', message as any);

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'save_ui_message',
        payload: {
          sessionId: 'session-1',
          message,
        },
      });
    });

    it('should save session UI history', () => {
      mockVscode.postMessage.mockClear();

      const messages = [
        { id: 'msg-1', type: 'user', content: [], timestamp: Date.now() },
        { id: 'msg-2', type: 'assistant', content: [], timestamp: Date.now() },
      ];
      service.saveSessionUIHistory('session-1', messages as any);

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'save_session_ui_history',
        payload: {
          sessionId: 'session-1',
          messages,
        },
      });
    });

    it('should send project settings update', () => {
      mockVscode.postMessage.mockClear();

      service.sendProjectSettingsUpdate({
        yoloMode: true,
        preferredModel: 'claude-3-5-sonnet',
      });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'project_settings_update',
        payload: {
          yoloMode: true,
          preferredModel: 'claude-3-5-sonnet',
        },
      });
    });

    it('should request project settings', () => {
      mockVscode.postMessage.mockClear();

      service.requestProjectSettings();

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'project_settings_request',
        payload: {},
      });
    });
  });

  describe('message handlers', () => {
    it('should handle session list update', () => {
      const handler = vi.fn();
      service.onSessionListUpdate(handler);

      const sessions = [createMockSession('s1', 'Session 1'), createMockSession('s2', 'Session 2')];
      sendMessage('session_list_update', {
        sessions,
        currentSessionId: 's1',
      });

      expect(handler).toHaveBeenCalledWith({
        sessions,
        currentSessionId: 's1',
      });
    });

    it('should handle session created', () => {
      const handler = vi.fn();
      service.onSessionCreated(handler);

      const session = createMockSession('s1', 'New Session');
      sendMessage('session_created', { session });

      expect(handler).toHaveBeenCalledWith({ session });
    });

    it('should handle session updated', () => {
      const handler = vi.fn();
      service.onSessionUpdated(handler);

      const session = createMockSession('s1', 'Updated Session');
      sendMessage('session_updated', {
        sessionId: 's1',
        session,
      });

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        session,
      });
    });

    it('should handle session deleted', () => {
      const handler = vi.fn();
      service.onSessionDeleted(handler);

      sendMessage('session_deleted', { sessionId: 's1' });

      expect(handler).toHaveBeenCalledWith({ sessionId: 's1' });
    });

    it('should handle session switched', () => {
      const handler = vi.fn();
      service.onSessionSwitched(handler);

      const session = createMockSession('s2', 'Session 2');
      sendMessage('session_switched', {
        sessionId: 's2',
        session,
      });

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's2',
        session,
      });
    });

    it('should handle chat start', () => {
      const handler = vi.fn();
      service.onChatStart(handler);

      sendMessage('chat_start', {
        sessionId: 's1',
        messageId: 'msg-1',
      });

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        messageId: 'msg-1',
      });
    });

    it('should handle chat chunk', () => {
      const handler = vi.fn();
      service.onChatChunk(handler);

      sendMessage('chat_chunk', {
        sessionId: 's1',
        content: 'Hello',
        messageId: 'msg-1',
        isComplete: false,
      });

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        content: 'Hello',
        messageId: 'msg-1',
        isComplete: false,
      });
    });

    it('should handle chat complete', () => {
      const handler = vi.fn();
      service.onChatComplete(handler);

      sendMessage('chat_complete', {
        sessionId: 's1',
        messageId: 'msg-1',
        tokenUsage: { total: 100 },
      });

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        messageId: 'msg-1',
        tokenUsage: { total: 100 },
      });
    });

    it('should handle tool calls update', () => {
      const handler = vi.fn();
      service.onToolCallsUpdate(handler);

      const toolCalls = [{ id: 'tool-1', toolName: 'test_tool' }];
      sendMessage('tool_calls_update', {
        sessionId: 's1',
        toolCalls,
        associatedMessageId: 'msg-1',
      });

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        toolCalls,
        associatedMessageId: 'msg-1',
      });
    });

    it('should handle flow state update', () => {
      const handler = vi.fn();
      service.onFlowStateUpdate(handler);

      sendMessage('flow_state_update', {
        sessionId: 's1',
        isProcessing: true,
        currentProcessingMessageId: 'msg-1',
        canAbort: true,
      });

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        isProcessing: true,
        currentProcessingMessageId: 'msg-1',
        canAbort: true,
      });
    });

    it('should handle multiple handlers for same message type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      service.onSessionCreated(handler1);
      service.onSessionCreated(handler2);

      const session = createMockSession('s1', 'New Session');
      sendMessage('session_created', { session });

      expect(handler1).toHaveBeenCalledWith({ session });
      expect(handler2).toHaveBeenCalledWith({ session });
    });

    it('should handle errors in handlers gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      service.onSessionCreated(errorHandler);
      service.onSessionCreated(normalHandler);

      const session = createMockSession('s1', 'New Session');
      sendMessage('session_created', { session });

      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled(); // Should still be called
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('message queuing', () => {
    it('should queue messages when vscode API is not ready', () => {
      delete (window as any).vscode;
      const newService = new MultiSessionMessageService();

      newService.requestSessionList();

      // Should not throw, message should be queued
      expect(messageListeners.length).toBeGreaterThan(0);

      newService.dispose();
    });

    it('should flush queued messages when vscode becomes ready', () => {
      delete (window as any).vscode;
      const newService = new MultiSessionMessageService();

      newService.requestSessionList();
      newService.createSession({ name: 'Test', type: SessionType.CHAT });

      // Now provide vscode API
      (window as any).vscode = mockVscode;

      // Wait for retry timer
      vi.advanceTimersByTime(600);

      // Messages should be sent
      expect(mockVscode.postMessage).toHaveBeenCalled();

      newService.dispose();
    });
  });

  describe('cleanup', () => {
    it('should remove event listener on dispose', () => {
      service.dispose();

      expect(window.removeEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
    });

    it('should handle multiple dispose calls', () => {
      expect(() => {
        service.dispose();
        service.dispose();
        service.dispose();
      }).not.toThrow();
    });
  });

  describe('login methods', () => {
    it('should check login status', () => {
      mockVscode.postMessage.mockClear();

      service.checkLoginStatus();

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'login_check_status',
        payload: {},
      });
    });

    it('should start login', () => {
      mockVscode.postMessage.mockClear();

      service.startLogin();

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'login_start',
        payload: {},
      });
    });

    it('should handle login status response', () => {
      const handler = vi.fn();
      service.onLoginStatusResponse(handler);

      sendMessage('login_status_response', {
        isLoggedIn: true,
        username: 'testuser',
      });

      expect(handler).toHaveBeenCalledWith({
        isLoggedIn: true,
        username: 'testuser',
      });
    });
  });

  describe('clipboard cache methods', () => {
    it('should request clipboard cache', () => {
      mockVscode.postMessage.mockClear();

      service.requestClipboardCache('const x = 1;');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'request_clipboard_cache',
        payload: { code: 'const x = 1;' },
      });
    });

    it('should handle clipboard cache response', () => {
      const handler = vi.fn();
      service.onClipboardCacheResponse(handler);

      sendMessage('clipboard_cache_response', {
        found: true,
        fileName: 'app.ts',
        filePath: '/src/app.ts',
        startLine: 10,
        endLine: 15,
      });

      expect(handler).toHaveBeenCalledWith({
        found: true,
        fileName: 'app.ts',
        filePath: '/src/app.ts',
        startLine: 10,
        endLine: 15,
      });
    });
  });

  describe('model methods', () => {
    it('should request available models', () => {
      mockVscode.postMessage.mockClear();

      service.requestAvailableModels();

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'get_available_models',
        payload: {},
      });
    });

    it('should set current model', () => {
      mockVscode.postMessage.mockClear();

      service.setCurrentModel('claude-3-5-sonnet');

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'set_current_model',
        payload: { modelId: 'claude-3-5-sonnet' },
      });
    });

    it('should get current model', () => {
      mockVscode.postMessage.mockClear();

      service.getCurrentModel();

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'get_current_model',
        payload: {},
      });
    });

    it('should handle model response', () => {
      const handler = vi.fn();
      service.onModelResponse(handler);

      sendMessage('model_response', {
        available: [
          { name: 'auto', displayName: 'Auto', available: true },
          { name: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', available: true },
        ],
        current: 'auto',
      });

      expect(handler).toHaveBeenCalledWith({
        available: expect.any(Array),
        current: 'auto',
      });
    });
  });
});
