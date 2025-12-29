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

    it('should restore a project state from checkpoint', async () => {
      const checkpoints = [
        { id: 'my-checkpoint', commitHash: 'abcdef123', timeString: '12:00:00', lastUserMessage: 'restore me' }
      ];
      mockSessionManager.loadSession.mockResolvedValue({ checkpoints });

      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, 'my-checkpoint');

      expect(mockGitService.restoreProjectFromSnapshot).toHaveBeenCalledWith('abcdef123');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Checkpoint恢复完成'),
      });
    });

    it('should return an error if checkpoint not found', async () => {
      mockSessionManager.loadSession.mockResolvedValue({ checkpoints: [] });

      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, 'my-checkpoint');

      expect(result?.type).toBe('message');
      expect(result?.messageType).toBe('error');
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