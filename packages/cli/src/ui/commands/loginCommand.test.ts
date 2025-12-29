/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type CommandContext, MessageActionReturn } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

// Mock i18n
vi.mock('../utils/i18n.js', () => {
  return {
    isChineseLocale: () => false,
    t: (key: string) => {
      const mockTranslations: Record<string, string> = {
        'command.login.description': '启动登录服务器',
      };
      return mockTranslations[key] || key;
    },
    tp: (key: string) => key,
    getLocalizedToolName: (name: string) => name,
  };
});

// Mock 外部依赖 - 必须在导入 loginCommand 之前
const { mockAuthServerStart, mockAuthServer, mockExec } = vi.hoisted(() => {
  const startFn = vi.fn().mockResolvedValue(undefined);
  return {
    mockAuthServerStart: startFn,
    mockAuthServer: vi.fn().mockImplementation(() => ({
      start: startFn,
    })),
    mockExec: vi.fn(),
  };
});

vi.mock('../../login/authServer.js', () => ({
  AuthServer: mockAuthServer,
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: mockExec,
  };
});

// 现在导入 loginCommand
import { loginCommand } from './loginCommand.js';

// Mock console 方法以避免测试输出污染
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('loginCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    // 重置所有 mock
    vi.clearAllMocks();

    // 创建 mock context
    mockContext = createMockCommandContext();

    // 重置 AuthServer mock
    mockAuthServerStart.mockResolvedValue(undefined);

    // 设置 child_process.exec mock
    mockExec.mockImplementation((_command, callback) => {
      // 模拟成功执行
      if (callback) {
        callback(null, '', '');
      }
      return {} as any;
    });
  });

  // 基本属性测试
  it('should have the correct name and description', () => {
    expect(loginCommand.name).toBe('login');
    expect(loginCommand.description).toBe('启动登录服务器');
    expect(loginCommand.kind).toBe('built-in');
  });

  it('should have an action function', () => {
    expect(loginCommand.action).toBeDefined();
    expect(typeof loginCommand.action).toBe('function');
  });

  // 成功场景测试
  describe('successful execution', () => {
    it('should start auth server and open browser successfully', async () => {
      if (!loginCommand.action) {
        throw new Error('Login command must have an action');
      }

      const result = await loginCommand.action(mockContext, '') as MessageActionReturn;

      // 验证 AuthServer 被创建和启动
      expect(mockAuthServer).toHaveBeenCalled();
      expect(mockAuthServerStart).toHaveBeenCalled();

      // 验证浏览器被打开
      expect(mockExec).toHaveBeenCalled();

      // 验证返回结果类型
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
    });
  });

  // 错误处理测试
  describe('error handling', () => {
    it('should handle auth server startup failure', async () => {
      if (!loginCommand.action) {
        throw new Error('Login command must have an action');
      }

      const errorMessage = 'Server startup failed';
      mockAuthServerStart.mockRejectedValue(new Error(errorMessage));

      const result = await loginCommand.action(mockContext, '') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
    });
  });
});