/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { SessionManager } from './sessionManager.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let testRoot: string;

  beforeEach(async () => {
    testRoot = path.join(process.cwd(), 'test-sessions-' + Date.now());
    sessionManager = new SessionManager(testRoot);
  });

  afterEach(async () => {
    try {
      await fs.rm(testRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getLastActiveSession with requireContent', () => {
    it('should return session with content when requireContent is true', async () => {
      // Create first session with content
      const session1 = await sessionManager.createNewSession('Session with content');
      const history1 = [
        { type: 'user', text: 'Hello, this is a test message' },
        { type: 'assistant', text: 'Hello! How can I help you?' }
      ];
      await sessionManager.saveSessionHistory(session1.sessionId, history1);

      // Wait to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Create second session without content (empty)
      const session2 = await sessionManager.createNewSession('Empty session');

      // getLastActiveSession(false) should return the most recent (empty) session
      const lastActive = await sessionManager.getLastActiveSession(false);
      expect(lastActive).toBe(session2.sessionId);

      // getLastActiveSession(true) should return the session with content
      const lastWithContent = await sessionManager.getLastActiveSession(true);
      expect(lastWithContent).toBe(session1.sessionId);
    });

    it('should fall back to lastActiveSession when no sessions have content', async () => {
      // Create empty session
      const session1 = await sessionManager.createNewSession('Empty session');

      // getLastActiveSession(true) should fall back to the empty session
      const lastWithContent = await sessionManager.getLastActiveSession(true);
      expect(lastWithContent).toBe(session1.sessionId);
    });

    it('should return undefined when no sessions exist', async () => {
      const lastActive = await sessionManager.getLastActiveSession(false);
      expect(lastActive).toBeUndefined();

      const lastWithContent = await sessionManager.getLastActiveSession(true);
      expect(lastWithContent).toBeUndefined();
    });
  });

  describe('initializeSession with continue', () => {
    it('should continue session with content when continueLastSession is true', async () => {
      // Create session with content
      const session1 = await sessionManager.createNewSession('Session with content');
      const history1 = [
        { type: 'user', text: 'Hello, this is a test message' },
        { type: 'assistant', text: 'Hello! How can I help you?' }
      ];
      await sessionManager.saveSessionHistory(session1.sessionId, history1);

      // Wait to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Create empty session (simulates user starting but not sending messages)
      await sessionManager.createNewSession('Empty session');

      // Initialize session with continue should return the session with content
      const continuedSession = await sessionManager.initializeSession(true);
      expect(continuedSession.sessionId).toBe(session1.sessionId);
      expect(continuedSession.history).toHaveLength(2);
    });

    it('should create new session when no sessions exist', async () => {
      const session = await sessionManager.initializeSession(true);
      expect(session.sessionId).toBeDefined();
      expect(session.history).toHaveLength(0);
    });

    it('should create new session when continueLastSession is false', async () => {
      // Create existing session
      await sessionManager.createNewSession('Existing session');

      // Initialize without continue should create new session
      const newSession = await sessionManager.initializeSession(false);
      expect(newSession.sessionId).toBeDefined();
      expect(newSession.history).toHaveLength(0);
    });
  });

  describe('session lifecycle', () => {
    it('should create, save, and load session properly', async () => {
      // Create session
      const session = await sessionManager.createNewSession('Test session');
      expect(session.sessionId).toBeDefined();
      expect(session.metadata.title).toBe('Test session');

      // Save history
      const history = [
        { type: 'user', text: 'Test message' },
        { type: 'assistant', text: 'Test response' }
      ];
      await sessionManager.saveSessionHistory(session.sessionId, history);

      // Load session
      const loadedSession = await sessionManager.loadSession(session.sessionId);
      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.sessionId).toBe(session.sessionId);
      expect(loadedSession!.history).toHaveLength(2);
    });

    it('should create a default session when loading non-existent session', async () => {
      const loadedSession = await sessionManager.loadSession('non-existent-id');
      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.sessionId).toBe('non-existent-id');
    });
  });

  describe('empty session cleanup', () => {
    it('should identify empty sessions correctly', async () => {
      // 创建一个空会话
      const emptySession = await sessionManager.createNewSession('Empty Session');

      // 验证会话为空
      const isEmpty = await sessionManager.isSessionEmpty(emptySession.sessionId);
      expect(isEmpty).toBe(true);

      // 添加一个用户消息
      const historyWithUserMessage = [
        { type: 'user', text: 'Hello, AI!' },
        { type: 'assistant', text: 'Hello! How can I help you?' }
      ];

      await sessionManager.saveSessionHistory(emptySession.sessionId, historyWithUserMessage);

      // 验证会话不再为空
      const isEmptyAfterMessage = await sessionManager.isSessionEmpty(emptySession.sessionId);
      expect(isEmptyAfterMessage).toBe(false);
    });

    it('should clean up empty session on exit', async () => {
      // 创建一个空会话
      const emptySession = await sessionManager.createNewSession('Empty Session');
      const sessionId = emptySession.sessionId;

      // 验证会话存在
      const sessionsBefore = await sessionManager.listSessions();
      expect(sessionsBefore.some(s => s.sessionId === sessionId)).toBe(true);

      // 调用清理函数
      await sessionManager.cleanupCurrentEmptySessionOnExit(sessionId);

      // 验证空会话已被删除
      const sessionsAfter = await sessionManager.listSessions();
      expect(sessionsAfter.some(s => s.sessionId === sessionId)).toBe(false);

      // 验证会话目录也被删除
      const sessionDir = sessionManager.getSessionDirectory(sessionId);
      const exists = await fs.access(sessionDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should not clean up session with conversation content', async () => {
      // 创建一个有内容的会话
      const session = await sessionManager.createNewSession('Session with Content');
      const sessionId = session.sessionId;

      // 添加用户消息
      const history = [
        { type: 'user', text: 'Hello, AI!' },
        { type: 'assistant', text: 'Hello! How can I help you?' }
      ];

      await sessionManager.saveSessionHistory(sessionId, history);

      // 验证会话存在
      const sessionsBefore = await sessionManager.listSessions();
      expect(sessionsBefore.some(s => s.sessionId === sessionId)).toBe(true);

      // 调用清理函数
      await sessionManager.cleanupCurrentEmptySessionOnExit(sessionId);

      // 验证有内容的会话未被删除
      const sessionsAfter = await sessionManager.listSessions();
      expect(sessionsAfter.some(s => s.sessionId === sessionId)).toBe(true);

      // 验证会话目录仍然存在
      const sessionDir = sessionManager.getSessionDirectory(sessionId);
      const exists = await fs.access(sessionDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should handle cleanup errors gracefully', async () => {
      const nonExistentSessionId = 'non-existent-session-id';

      // 调用清理函数不应该抛出错误
      await expect(sessionManager.cleanupCurrentEmptySessionOnExit(nonExistentSessionId))
        .resolves.not.toThrow();
    });

    it('should update session index after cleanup', async () => {
      // 创建两个会话，一个空的，一个有内容的
      const emptySession = await sessionManager.createNewSession('Empty Session');
      const contentSession = await sessionManager.createNewSession('Content Session');

      // 为内容会话添加消息
      await sessionManager.saveSessionHistory(contentSession.sessionId, [
        { type: 'user', text: 'Test message' }
      ]);

      // 验证两个会话都在索引中
      const sessionsBefore = await sessionManager.listSessions();
      expect(sessionsBefore).toHaveLength(2);

      // 清理空会话
      await sessionManager.cleanupCurrentEmptySessionOnExit(emptySession.sessionId);

      // 验证索引已更新，只剩下有内容的会话
      const sessionsAfter = await sessionManager.listSessions();
      expect(sessionsAfter).toHaveLength(1);
      expect(sessionsAfter[0].sessionId).toBe(contentSession.sessionId);
    });
  });
});