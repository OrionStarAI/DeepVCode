/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { contextCommand } from './contextCommand.js';
import { MessageType } from '../types.js';
import type { CommandContext } from './types.js';
import { uiTelemetryService, tokenLimit } from 'deepv-code-core';

vi.mock('deepv-code-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('deepv-code-core')>();
  return {
    ...actual,
    tokenLimit: vi.fn().mockReturnValue(1000000),
    getCoreSystemPrompt: vi.fn().mockReturnValue('Mock system prompt'),
  };
});

describe('contextCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = {
      ui: {
        addItem: vi.fn(),
      },
      services: {
        config: {
          getCloudModelInfo: vi.fn().mockReturnValue({ displayName: 'Gemini 2.0 Flash' }),
          getMemoryTokenCount: vi.fn().mockReturnValue(100),
          getUserMemory: vi.fn().mockReturnValue({}),
        },
        settings: {
          merged: {
            preferredModel: 'gemini-2.0-flash-exp',
          },
        },
      },
      session: {
        stats: {
          lastPromptTokenCount: 8000,
        },
      },
    } as any;

    vi.spyOn(uiTelemetryService, 'getLastPromptTokenCount').mockReturnValue(8000);
    vi.spyOn(uiTelemetryService, 'getMetrics').mockReturnValue({
      models: {
        'gemini-2.0-flash-exp': {
          tokens: {
            tool: 50,
          },
        },
      },
    } as any);
  });

  it('should be defined', () => {
    expect(contextCommand).toBeDefined();
  });

  it('should have correct name and description', () => {
    expect(contextCommand.name).toBe('context');
    expect(contextCommand.altNames).toEqual([]);
    expect(contextCommand.description).toBeTruthy();
  });

  it('should display token usage breakdown', async () => {
    await contextCommand.action!(mockContext, '');

    // addItem should be called twice: once for model info, once for breakdown
    expect(mockContext.ui.addItem).toHaveBeenCalledTimes(2);

    const breakdownCall = (mockContext.ui.addItem as any).mock.calls.find(
      (call: any) => call[0].type === MessageType.CONTEXT_BREAKDOWN
    );
    expect(breakdownCall).toBeDefined();

    const [item, timestamp] = breakdownCall;

    expect(item.type).toBe(MessageType.CONTEXT_BREAKDOWN);
    expect(item.maxTokens).toBeGreaterThan(0);
    expect(item.systemPromptTokens).toBeGreaterThanOrEqual(0);
    expect(item.systemToolsTokens).toBeGreaterThanOrEqual(0);
    expect(item.memoryFilesTokens).toBeGreaterThanOrEqual(0);
    expect(item.messagesTokens).toBeGreaterThanOrEqual(0);
    expect(item.reservedTokens).toBe(0); // Code sets it to 0
    expect(item.freeSpaceTokens).toBeGreaterThanOrEqual(0);
    expect(typeof timestamp).toBe('number');
  });

  it('should handle zero token usage', async () => {
    vi.spyOn(uiTelemetryService, 'getLastPromptTokenCount').mockReturnValue(0);
    vi.spyOn(uiTelemetryService, 'getMetrics').mockReturnValue({
      models: {
        'gemini-2.0-flash-exp': {
          tokens: {
            tool: 0,
          },
        },
      },
    } as any);

    await contextCommand.action!(mockContext, '');

    const breakdownCall = (mockContext.ui.addItem as any).mock.calls.find(
      (call: any) => call[0].type === MessageType.CONTEXT_BREAKDOWN
    );
    expect(breakdownCall).toBeDefined();

    const [item] = breakdownCall;

    expect(item.type).toBe(MessageType.CONTEXT_BREAKDOWN);
    // If actualPromptTokens is 0, totalInputTokens is sum of static parts
    expect(item.totalInputTokens).toBeGreaterThanOrEqual(0);
  });
});