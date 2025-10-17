/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { modelCommand } from './modelCommand.js';
import { CommandContext, MessageActionReturn } from './types.js';
import { SettingScope } from '../../config/settings.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('modelCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: any;
  let mockSettings: any;
  let mockGeminiClient: any;
  let mockChat: any;

  beforeEach(() => {
    mockChat = {
      setSpecifiedModel: vi.fn(),
    };

    mockGeminiClient = {
      getChat: vi.fn().mockReturnValue(mockChat),
    };

    mockConfig = {
      setModel: vi.fn(),
      resetModelToDefault: vi.fn(),
      getModel: vi.fn().mockReturnValue('default-model'),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      getCloudModels: vi.fn().mockReturnValue([
        {
          name: 'claude-sonnet-4@20250514',
          displayName: 'claude-sonnet-4',
          creditsPerRequest: 6.7,
          available: true,
          maxToken: 200000
        },
        {
          name: 'claude-opus-4@20250514',
          displayName: 'claude-opus-4',
          creditsPerRequest: 15,
          available: true,
          maxToken: 200000
        },
        {
          name: 'claude-haiku-4@20250514',
          displayName: 'claude-haiku-4',
          creditsPerRequest: 1,
          available: true,
          maxToken: 200000
        }
      ]),
    };

    mockSettings = {
      merged: {
        preferredModel: undefined,
      },
      setValue: vi.fn(),
    };

    mockContext = createMockCommandContext();
    mockContext.services.config = mockConfig;
    mockContext.services.settings = mockSettings;
  });

  it('should show current model when no args provided', () => {
    mockSettings.merged.preferredModel = 'claude-sonnet-4@20250514';

    const result = modelCommand.action!(mockContext, '') as MessageActionReturn;

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('info');
    expect(result.content).toContain('当前首选模型：claude-sonnet-4@20250514');
  });

  it('should show available models when no preferred model is set', () => {
    const result = modelCommand.action!(mockContext, '') as MessageActionReturn;

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('info');
    expect(result.content).toContain('当前未设置首选模型');
    expect(result.content).toContain('claude-sonnet-4@20250514');
    expect(result.content).toContain('gemini-2.5-flash');
  });

  it('should set model successfully', () => {
    const result = modelCommand.action!(mockContext, 'claude-sonnet-4@20250514') as MessageActionReturn;

    expect(mockSettings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'preferredModel',
      'claude-sonnet-4@20250514'
    );
    expect(mockConfig.setModel).toHaveBeenCalledWith('claude-sonnet-4@20250514');
    expect(mockChat.setSpecifiedModel).toHaveBeenCalledWith('claude-sonnet-4@20250514');

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('info');
    expect(result.content).toContain('已设置首选模型为：claude-sonnet-4@20250514');
  });

  it('should reject invalid model', () => {
    const result = modelCommand.action!(mockContext, 'invalid-model') as MessageActionReturn;

    expect(mockSettings.setValue).not.toHaveBeenCalled();
    expect(mockConfig.setModel).not.toHaveBeenCalled();

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('error');
    expect(result.content).toContain('无效的模型：invalid-model');
  });

  it('should clear model setting', () => {
    const result = modelCommand.action!(mockContext, 'clear') as MessageActionReturn;

    expect(mockSettings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'preferredModel',
      undefined
    );
    expect(mockConfig.resetModelToDefault).toHaveBeenCalled();
    expect(mockChat.setSpecifiedModel).toHaveBeenCalledWith('default-model');

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('info');
    expect(result.content).toContain('已清除首选模型设置');
  });

  it('should handle reset command', () => {
    const result = modelCommand.action!(mockContext, 'reset') as MessageActionReturn;

    expect(mockSettings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'preferredModel',
      undefined
    );
    expect(mockConfig.resetModelToDefault).toHaveBeenCalled();
    expect(mockChat.setSpecifiedModel).toHaveBeenCalledWith('default-model');

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('info');
    expect(result.content).toContain('已清除首选模型设置');
  });

  it('should handle null config gracefully', () => {
    mockContext.services.config = null;

    const result = modelCommand.action!(mockContext, 'claude-sonnet-4@20250514') as MessageActionReturn;

    expect(mockSettings.setValue).toHaveBeenCalled();
    expect(result.type).toBe('message');
    expect(result.messageType).toBe('info');
  });

  it('should provide completion suggestions', async () => {
    const completions = await modelCommand.completion!(mockContext, 'claude');

    expect(completions).toContain('claude-sonnet-4@20250514');
    expect(completions).toContain('claude-opus-4@20250514');
    expect(completions).toContain('claude-haiku-4@20250514');
  });

  it('should provide special command completions', async () => {
    const completions = await modelCommand.completion!(mockContext, 'c');

    expect(completions).toContain('clear');
    expect(completions).toContain('claude-sonnet-4@20250514');
    expect(completions).toContain('claude-opus-4@20250514');
  });
});
