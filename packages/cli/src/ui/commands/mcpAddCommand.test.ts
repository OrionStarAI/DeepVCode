/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addCommand } from './mcpAddCommand.js';
import { CommandContext } from './types.js';
import { Config } from 'deepv-code-core';
import { LoadedSettings, SettingScope } from '../../config/settings.js';

// Mock i18n
vi.mock('../utils/i18n.js', () => {
  return {
    isChineseLocale: () => false,
    t: (key: string) => key,
    tp: (key: string) => key,
    getLocalizedToolName: (name: string) => name,
  };
});

describe('mcpAddCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: Partial<Config>;
  let mockSettings: Partial<LoadedSettings>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getMcpServers: vi.fn().mockReturnValue({}),
    };

    mockSettings = {
      forScope: vi.fn().mockReturnValue({
        path: '/test/.deepv/settings.json',
        settings: { mcpServers: {} }
      }),
      setValue: vi.fn(),
    };

    mockContext = {
      services: {
        config: mockConfig as Config,
        settings: mockSettings as LoadedSettings,
        git: undefined,
        logger: {} as any,
      },
      ui: {} as any,
      session: {} as any,
    };
  });

  it('should show interactive wizard when no arguments provided', async () => {
    const result = await addCommand.action!(mockContext, '');

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('info');
    expect(result.content).toContain('mcp.wizard.title');
  });

  it('should list available templates in wizard', async () => {
    const result = await addCommand.action!(mockContext, '');

    expect(result.content).toContain('github');
    expect(result.content).toContain('sqlite');
    expect(result.content).toContain('filesystem');
    expect(result.content).toContain('search');
  });

  it('should detect template names correctly', async () => {
    const result = await addCommand.action!(mockContext, 'github');

    expect(result.type).toBe('message');
    // Should attempt to configure GitHub template
    expect(mockSettings.setValue).toHaveBeenCalled();
  });

  it('should handle custom server configuration', async () => {
    const result = await addCommand.action!(mockContext, 'my-server --command "npx @my/server"');

    expect(result.type).toBe('message');
    expect(mockSettings.setValue).toHaveBeenCalled();
  });

  it('should validate custom server parameters', async () => {
    const result = await addCommand.action!(mockContext, 'my-server');

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('error');
    expect(result.content).toContain('mcp.error.missing.connection.params');
  });

  it('should prevent duplicate server names', async () => {
    // Mock existing server
    mockConfig.getMcpServers = vi.fn().mockReturnValue({
      'existing-server': {}
    });

    const result = await addCommand.action!(mockContext, 'existing-server --command "test"');

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('error');
    expect(result.content).toContain('mcp.error.server.already.exists');
  });

  it('should provide template name completions', async () => {
    const completions = await addCommand.completion!(mockContext, 'git');

    expect(completions).toContain('github');
  });

  it('should filter completions based on partial input', async () => {
    const completions = await addCommand.completion!(mockContext, 'sql');

    expect(completions).toContain('sqlite');
    expect(completions).not.toContain('github');
  });
});