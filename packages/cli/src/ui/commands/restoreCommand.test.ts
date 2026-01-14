/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import { restoreCommand } from './restoreCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { Config, GitService, SessionManager } from 'deepv-code-core';

vi.mock('deepv-code-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('deepv-code-core')>();
  return {
    ...actual,
    SessionManager: vi.fn(),
  };
});

describe('restoreCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  let mockGitService: GitService;
  let mockSessionManager: any;
  const sessionId = 'test-session-id';

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSessionManager = {
      loadSession: vi.fn(),
      getSessionCheckpoints: vi.fn(),
    };
    (SessionManager as unknown as Mock).mockImplementation(() => mockSessionManager);

    mockGitService = {
      restoreProjectFromSnapshot: vi.fn().mockResolvedValue(undefined),
      isGitDisabled: vi.fn().mockReturnValue(false),
    } as unknown as GitService;

    mockConfig = {
      getCheckpointingEnabled: vi.fn().mockReturnValue(true),
      getProjectTempDir: vi.fn().mockReturnValue('/tmp'),
      getGeminiClient: vi.fn().mockReturnValue({}),
      getProjectRoot: vi.fn().mockReturnValue('/project'),
      getSessionId: vi.fn().mockReturnValue(sessionId),
    } as unknown as Config;

    mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
        git: mockGitService,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the command if config is provided', () => {
    expect(restoreCommand(mockConfig)).not.toBeNull();
  });

  describe('action', () => {
    it('should inform when no checkpoints are found', async () => {
      mockSessionManager.loadSession.mockResolvedValue({ checkpoints: [] });

      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringMatching(/No checkpoints|未找到/),
      });
    });

    it('should list available checkpoints if checkpoints exist', async () => {
      const checkpoints = [
        { id: 'cp1', timeString: '12:00:00', lastUserMessage: 'hello' }
      ];
      mockSessionManager.loadSession.mockResolvedValue({ checkpoints });

      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, '');

      expect(result?.type).toBe('message');
      expect(result?.content).toContain('12:00:00');
      expect(result?.content).toContain('hello');
    });

    it('should restore a project state from checkpoint and send context message to AI', async () => {
      const checkpoints = [
        { id: 'my-checkpoint', commitHash: 'abcdef123', timeString: '12:00:00', lastUserMessage: 'restore me' }
      ];
      mockSessionManager.loadSession.mockResolvedValue({ checkpoints });

      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, 'my-checkpoint');

      // 验证 Git 恢复被调用
      expect(mockGitService.restoreProjectFromSnapshot).toHaveBeenCalledWith('abcdef123');

      // 验证返回类型是 submit_prompt（向 AI 发送 context 消息）
      expect(result).toEqual({
        type: 'submit_prompt',
        content: expect.stringContaining('restore'),
        silent: true,
      });

      // 验证 context 消息包含用户消息信息
      expect(result?.content).toContain('restore me');

      // 验证 UI 显示消息被添加
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: expect.stringContaining('12:00:00'),
        }),
        expect.any(Number)
      );
    });

    it('should return an error if checkpoint not found', async () => {
      mockSessionManager.loadSession.mockResolvedValue({ checkpoints: [] });

      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, 'my-checkpoint');

      expect(result?.type).toBe('message');
      expect(result?.messageType).toBe('error');
    });

    it('should include user message info in context message for AI', async () => {
      const checkpoints = [
        {
          id: 'cp-with-long-msg',
          commitHash: 'abc123',
          timeString: '14:30:00',
          lastUserMessage: 'This is a very long user message that should be truncated to 50 characters or less for display'
        }
      ];
      mockSessionManager.loadSession.mockResolvedValue({ checkpoints });

      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, 'cp-with-long-msg');

      // 验证 AI context 消息包含用户消息的前50个字符
      expect(result?.type).toBe('submit_prompt');
      expect(result?.content).toContain('This is a very long user message that should be tr');
    });

    it('should send context message indicating user manual action', async () => {
      const checkpoints = [
        { id: 'cp1', commitHash: 'hash1', timeString: '10:00:00', lastUserMessage: 'test' }
      ];
      mockSessionManager.loadSession.mockResolvedValue({ checkpoints });

      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, 'cp1');

      // 验证 context 消息强调这是用户主动操作
      expect(result?.type).toBe('submit_prompt');
      expect(result?.content).toMatch(/user.*manually|用户.*主动/i);
      expect(result?.content).toMatch(/deliberate|intentional|有意|主动/i);
    });
  });

  describe('completion', () => {
    it('should return a list of checkpoint suggestions', async () => {
      const checkpoints = [
        { id: 'cp1', timeString: '12:00:00', lastUserMessage: 'msg1' },
        { id: 'cp2', timeString: '12:05:00', lastUserMessage: 'msg2' }
      ];
      mockSessionManager.loadSession.mockResolvedValue({ checkpoints });

      const command = restoreCommand(mockConfig);
      const result = await command?.completion?.(mockContext, '');

      expect(result).toHaveLength(2);
      expect(result![0]).toEqual(expect.objectContaining({ value: 'cp1' }));
    });
  });
});