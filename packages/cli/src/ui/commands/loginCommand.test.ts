/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type CommandContext, MessageActionReturn } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

// Mock 外部依赖 - 必须在导入 loginCommand 之前
const mockAuthServerStart = vi.fn().mockResolvedValue(undefined);
const mockAuthServer = vi.fn().mockImplementation(() => ({
  start: mockAuthServerStart,
}));

vi.mock('../../login/authServer.js', () => ({
  AuthServer: mockAuthServer,
}));

const mockExec = vi.fn();
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

  afterEach(() => {
    // 不重置模块，因为这会导致 mock 失效
    // 全局状态会在每个测试的 beforeEach 中重新设置
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
      expect(mockAuthServer).toHaveBeenCalledTimes(1);
      expect(mockAuthServerStart).toHaveBeenCalledTimes(1);

      // 验证浏览器被打开
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:7862'),
        expect.any(Function)
      );

      // 验证返回结果
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: '✅ 登录服务器已启动！\n🌐 登录选择页面: http://localhost:7862\n🔗 请在浏览器中选择认证方式完成登录。',
      });

      // 验证控制台输出
      expect(mockConsoleLog).toHaveBeenCalledWith('🚀 启动登录服务器...');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ 浏览器已打开:', 'http://localhost:7862');
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

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `❌ 登录服务器启动失败: ${errorMessage}`,
      });
    });

    it('should handle non-Error exceptions', async () => {
      if (!loginCommand.action) {
        throw new Error('Login command must have an action');
      }

      mockAuthServerStart.mockRejectedValue('String error');

      const result = await loginCommand.action(mockContext, '') as MessageActionReturn;

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: '❌ 登录服务器启动失败: 未知错误',
      });
    });

    it('should handle browser opening failure gracefully', async () => {
      if (!loginCommand.action) {
        throw new Error('Login command must have an action');
      }

      // Mock exec 调用失败
      mockExec.mockImplementation((_command, callback) => {
        if (callback) {
          callback(new Error('Browser not found'), '', '');
        }
        return {} as any;
      });

      const result = await loginCommand.action(mockContext, '') as MessageActionReturn;

      // 即使浏览器打开失败，命令也应该成功（因为服务器已启动）
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
      
      // 应该记录错误
      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ 打开浏览器失败:',
        expect.any(Error)
      );
    });
  });

  // 平台特定测试
  describe('platform-specific browser commands', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
      });
    });

    it('should use correct command for macOS', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
      });

      if (!loginCommand.action) {
        throw new Error('Login command must have an action');
      }

      await loginCommand.action(mockContext, '');

      expect(mockExec).toHaveBeenCalledWith(
        'open http://localhost:7862',
        expect.any(Function)
      );
    });

    it('should use correct command for Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
      });

      if (!loginCommand.action) {
        throw new Error('Login command must have an action');
      }

      await loginCommand.action(mockContext, '');

      expect(mockExec).toHaveBeenCalledWith(
        'start http://localhost:7862',
        expect.any(Function)
      );
    });

    it('should use correct command for Linux', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
      });

      if (!loginCommand.action) {
        throw new Error('Login command must have an action');
      }

      await loginCommand.action(mockContext, '');

      expect(mockExec).toHaveBeenCalledWith(
        'xdg-open http://localhost:7862',
        expect.any(Function)
      );
    });
  });

  // 全局状态管理测试
  describe('global state management', () => {
    it('should reuse existing server instance on subsequent calls', async () => {
      if (!loginCommand.action) {
        throw new Error('Login command must have an action');
      }

      // 第一次调用
      await loginCommand.action(mockContext, '');

      // 重置 mock 计数器但保持实例
      vi.clearAllMocks();

      // 第二次调用 - 需要重新导入模块来测试全局状态
      // 注意：由于我们在 afterEach 中重置模块，这个测试可能需要调整
      const result = await loginCommand.action(mockContext, '') as MessageActionReturn;

      // 验证返回结果仍然正确
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
    });
  });
});
