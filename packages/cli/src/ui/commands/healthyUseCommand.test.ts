
/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { healthyUseCommand } from './healthyUseCommand.js';
import { CommandContext } from './types.js';
import { SettingScope } from '../../config/settings.js';

describe('healthyUseCommand', () => {
  let mockContext: CommandContext;
  let mockSettings: any;
  let mockConfig: any;

  beforeEach(() => {
    mockSettings = {
      setValue: vi.fn(),
    };
    mockConfig = {
      getHealthyUseEnabled: vi.fn(),
    };
    mockContext = {
      services: {
        settings: mockSettings,
        config: mockConfig,
      },
    } as unknown as CommandContext;

    // Mock i18n
    vi.mock('../utils/i18n.js', () => ({
      t: (key: string) => key,
      tp: (key: string, args: any) => `${key}:${JSON.stringify(args)}`,
    }));
  });

  it('should show current status when no args provided', () => {
    mockConfig.getHealthyUseEnabled.mockReturnValue(true);
    const result = healthyUseCommand.action(mockContext, '');

    expect(result.type).toBe('message');
    expect(result.content).toContain('command.healthyUse.status:{"status":"skill.label.enabled"}');
  });

  it('should enable healthy use', () => {
    mockConfig.getHealthyUseEnabled.mockReturnValue(false);
    const result = healthyUseCommand.action(mockContext, 'on');

    expect(mockSettings.setValue).toHaveBeenCalledWith(SettingScope.User, 'healthyUse', true);
    expect(result.content).toContain('command.healthyUse.on');
  });

  it('should disable healthy use', () => {
    mockConfig.getHealthyUseEnabled.mockReturnValue(true);
    const result = healthyUseCommand.action(mockContext, 'off');

    expect(mockSettings.setValue).toHaveBeenCalledWith(SettingScope.User, 'healthyUse', false);
    expect(result.content).toContain('command.healthyUse.off');
  });

  it('should handle invalid arguments', () => {
    const result = healthyUseCommand.action(mockContext, 'invalid');

    expect(result.messageType).toBe('error');
    expect(result.content).toContain('command.healthyUse.error.invalid_args:{"args":"invalid"}');
  });

  it('should provide completion suggestions', async () => {
    const suggestions = await healthyUseCommand.completion!(mockContext, 'e');
    expect(suggestions).toContain('enable');
  });
});
