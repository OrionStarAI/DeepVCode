/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toolsCommand } from './toolsCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

// Mock i18n
vi.mock('../utils/i18n.js', () => {
  return {
    isChineseLocale: () => false,
    t: (key: string) => key,
    tp: (key: string) => key,
    getLocalizedToolName: (name: string) => name,
  };
});

describe('toolsCommand', () => {
  let context: ReturnType<typeof createMockCommandContext>;

  beforeEach(() => {
    context = createMockCommandContext({
      services: {
        config: {
          getToolRegistry: vi.fn(),
        } as any,
      } as any,
    });
  });

  it('should display an error if the tool registry is unavailable', async () => {
    context.services.config!.getToolRegistry = vi
      .fn()
      .mockRejectedValue(new Error('Test error'));
    await toolsCommand.action!(context, '');
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: 'error.tool.registry.unavailable',
      }),
      expect.any(Number),
    );
  });

  it('should display "No tools available" when none are found', async () => {
    context.services.config!.getToolRegistry = vi.fn().mockResolvedValue({
      getAllTools: vi.fn().mockReturnValue([]),
    });
    await toolsCommand.action!(context, '');
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('No tools available'),
      }),
      expect.any(Number),
    );
  });

  it('should list tools without descriptions by default', async () => {
    const mockTools = [
      { displayName: 'tool1', description: 'desc1', name: 'tool1' },
      { displayName: 'tool2', description: 'desc2', name: 'tool2' },
    ];
    context.services.config!.getToolRegistry = vi.fn().mockResolvedValue({
      getAllTools: vi.fn().mockReturnValue(mockTools),
    });
    await toolsCommand.action!(context, 'nodesc');
    const call = (context.ui.addItem as any).mock.calls[0][0];
    expect(call.type).toBe(MessageType.INFO);
    expect(call.text).toContain('tool1');
    expect(call.text).toContain('tool2');
    expect(call.text).not.toContain('desc1');
  });

  it('should list tools with descriptions when "desc" arg is not passed (it is default now)', async () => {
    const mockTools = [
      { displayName: 'tool1', description: 'desc1', name: 'tool1' },
    ];
    context.services.config!.getToolRegistry = vi.fn().mockResolvedValue({
      getAllTools: vi.fn().mockReturnValue(mockTools),
    });
    await toolsCommand.action!(context, '');
    const call = (context.ui.addItem as any).mock.calls[0][0];
    expect(call.text).toContain('tool1');
    expect(call.text).toContain('desc1');
  });
});
