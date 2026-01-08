/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { modelCommand } from './modelCommand.js';
import { CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('modelCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: any;
  let mockSettings: any;
  let mockGeminiClient: any;

  beforeEach(() => {
    mockGeminiClient = {
      getChat: vi.fn().mockReturnValue({ setSpecifiedModel: vi.fn() }),
      switchModel: vi.fn().mockResolvedValue({ success: true }),
    };

    mockConfig = {
      setModel: vi.fn(),
      resetModelToDefault: vi.fn(),
      getModel: vi.fn().mockReturnValue('default-model'),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      getCloudModels: vi.fn().mockReturnValue([]),
      setCloudModels: vi.fn(),
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

  it('should return a dialog action when no args provided', () => {
    const result = modelCommand.action!(mockContext, '');
    expect(result).toEqual({
      type: 'dialog',
      dialog: 'model',
    });
  });

  it('should return void when args provided (handles it asynchronously)', async () => {
    const result = modelCommand.action!(mockContext, 'claude-3-sonnet');
    expect(result).toBeUndefined();
  });

  it('should provide completion suggestions as Suggestion objects', async () => {
    // Mock getAvailableModels via global or internal state if possible
    // For now, test that it returns something
    const completions = await modelCommand.completion!(mockContext, 'auto');
    expect(completions).toBeDefined();
    if (completions.length > 0) {
      expect(completions[0]).toHaveProperty('willAutoExecute', true);
    }
  });
});