/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { accountCommand } from './accountCommand.js';
import { CommandContext } from './types.js';

// Mock dependencies
vi.mock('deepv-code-core', () => ({
  ProxyAuthManager: {
    getInstance: vi.fn()
  }
}));
vi.mock('open');

// Mock fetch globally
global.fetch = vi.fn();

const mockOpen = vi.mocked(await import('open')).default as Mock;
const { ProxyAuthManager } = await import('deepv-code-core');
const mockProxyAuthManager = vi.mocked(ProxyAuthManager.getInstance) as Mock;

describe('accountCommand', () => {
  const mockContext: CommandContext = {
    services: {} as any,
    ui: {
      addItem: vi.fn(),
    } as any,
    session: {} as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variable
    delete process.env.DEEPX_SERVER_URL;
  });

  it('should be defined with correct properties', () => {
    expect(accountCommand.name).toBe('account');
    expect(accountCommand.description).toBeTruthy();
    expect(accountCommand.kind).toBe('built-in');
  });

  it('should handle successful temp code generation and open browser', async () => {
    // Mock ProxyAuthManager
    const mockAuthManager = {
      getAccessToken: vi.fn().mockResolvedValue('mock-jwt-token'),
    };
    mockProxyAuthManager.mockReturnValue(mockAuthManager);

    // Mock successful API response
    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        code: 'temp-code-123',
        expiresIn: 600,
        expiresAt: Date.now() + 600000,
      }),
    };
    (global.fetch as Mock).mockResolvedValue(mockResponse);

    // Mock successful browser opening
    mockOpen.mockResolvedValue(undefined);

    const result = await accountCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.any(String),
    });
    expect(mockAuthManager.getAccessToken).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
    expect(mockOpen).toHaveBeenCalledWith(
      'https://dvcode.deepvlab.ai/token-login?code=temp-code-123&redirect=/userinfo&method=dvcode'
    );
  });

  it('should handle case when no access token is available', async () => {
    const mockAuthManager = {
      getAccessToken: vi.fn().mockResolvedValue(null),
    };
    mockProxyAuthManager.mockReturnValue(mockAuthManager);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await accountCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.any(String),
    });
    expect(mockAuthManager.getAccessToken).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('❌ 未找到有效的认证令牌，请先登录');

    consoleSpy.mockRestore();
  });

  it('should handle API error response', async () => {
    const mockAuthManager = {
      getAccessToken: vi.fn().mockResolvedValue('mock-jwt-token'),
    };
    mockProxyAuthManager.mockReturnValue(mockAuthManager);

    // Mock API error response
    const mockResponse = {
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('Unauthorized'),
    };
    (global.fetch as Mock).mockResolvedValue(mockResponse);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await accountCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.any(String),
    });
    expect(global.fetch).toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('❌ 生成临时代码失败 (401): Unauthorized');

    consoleSpy.mockRestore();
  });

  it('should handle unsuccessful API response with error', async () => {
    const mockAuthManager = {
      getAccessToken: vi.fn().mockResolvedValue('mock-jwt-token'),
    };
    mockProxyAuthManager.mockReturnValue(mockAuthManager);

    // Mock unsuccessful API response
    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        success: false,
        error: 'Invalid request',
      }),
    };
    (global.fetch as Mock).mockResolvedValue(mockResponse);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await accountCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.any(String),
    });
    expect(global.fetch).toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('❌ 生成临时代码失败: Invalid request');

    consoleSpy.mockRestore();
  });

  it('should use custom server URL from environment variable', async () => {
    // Set custom server URL
    process.env.DEEPX_SERVER_URL = 'https://custom-server.example.com';

    const mockAuthManager = {
      getAccessToken: vi.fn().mockResolvedValue('mock-jwt-token'),
    };
    mockProxyAuthManager.mockReturnValue(mockAuthManager);

    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        code: 'temp-code-123',
        expiresIn: 600,
      }),
    };
    (global.fetch as Mock).mockResolvedValue(mockResponse);
    mockOpen.mockResolvedValue(undefined);

    await accountCommand.action!(mockContext, '');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://custom-server.example.com/auth/temp-code/generate',
      expect.any(Object)
    );
  });

  it('should handle network errors gracefully', async () => {
    const mockAuthManager = {
      getAccessToken: vi.fn().mockResolvedValue('mock-jwt-token'),
    };
    mockProxyAuthManager.mockReturnValue(mockAuthManager);

    // Mock network error
    (global.fetch as Mock).mockRejectedValue(new Error('Network error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await accountCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: expect.stringContaining('Network error'),
    });

    expect(consoleSpy).toHaveBeenCalledWith('❌ 操作失败:', 'Network error');

    consoleSpy.mockRestore();
  });
});
