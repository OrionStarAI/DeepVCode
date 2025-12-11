/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { contextCommand } from './contextCommand.js';
import { MessageType } from '../types.js';
import type { CommandContext } from './types.js';
import { uiTelemetryService } from 'deepv-code-core';

describe('contextCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = {
      ui: {
        addItem: vi.fn(),
      },
      services: {
        config: null,
      },
      session: {
        stats: {
          lastPromptTokenCount: 8000,
        },
      },
    } as any;
  });

  it('should be defined', () => {
    expect(contextCommand).toBeDefined();
  });

  it('should have correct name and description', () => {
    expect(contextCommand.name).toBe('context');
    expect(contextCommand.altNames).toEqual([]);
    expect(contextCommand.description).toBeTruthy();
  });

  it('should call addItem with context breakdown data', () => {
    contextCommand.action!(mockContext);

    expect(mockContext.ui.addItem).toHaveBeenCalled();
    const [item, timestamp] = (mockContext.ui.addItem as any).mock.calls[0];

    expect(item.type).toBe(MessageType.CONTEXT_BREAKDOWN);
    expect(item.maxTokens).toBeGreaterThan(0);
    expect(item.systemPromptTokens).toBeGreaterThanOrEqual(0);
    expect(item.systemToolsTokens).toBeGreaterThanOrEqual(0);
    expect(item.memoryFilesTokens).toBeGreaterThanOrEqual(0);
    expect(item.messagesTokens).toBeGreaterThanOrEqual(0);
    expect(item.reservedTokens).toBeGreaterThan(0);
    expect(item.freeSpaceTokens).toBeGreaterThanOrEqual(0);
    expect(typeof timestamp).toBe('number');
  });

  it('should handle zero token usage', () => {
    // Mock metrics with zero tokens
    const metricsSpy = vi.spyOn(uiTelemetryService, 'getMetrics').mockReturnValue({
      models: {},
    } as any);

    contextCommand.action!(mockContext);

    expect(mockContext.ui.addItem).toHaveBeenCalled();
    const [item] = (mockContext.ui.addItem as any).mock.calls[0];

    expect(item.type).toBe(MessageType.CONTEXT_BREAKDOWN);
    expect(item.totalInputTokens).toBe(0);

    metricsSpy.mockRestore();
  });
});
