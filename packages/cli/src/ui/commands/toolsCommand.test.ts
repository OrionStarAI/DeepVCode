/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toolsCommand } from './toolsCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

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
        text: 'Unable to retrieve tool registry.',
      }),
      expect.any(Number),
    );
  });

  it('should display "No tools available" when none are found', async () => {
    context.services.config!.getToolRegistry = vi.fn().mockResolvedValue({
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
    });
    await toolsCommand.action!(context, '');
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'No tools available.',
      }),
      expect.any(Number),
    );
  });

  it('should list tools without descriptions by default', async () => {
    const mockDeclarations = [
      { name: 'tool1', description: 'desc1' },
      { name: 'tool2', description: 'desc2' },
    ];
    context.services.config!.getToolRegistry = vi.fn().mockResolvedValue({
      getFunctionDeclarations: vi.fn().mockReturnValue(mockDeclarations),
    });
    await toolsCommand.action!(context, '');
    const call = (context.ui.addItem as any).mock.calls[0][0];
    expect(call.type).toBe(MessageType.INFO);
    expect(call.text).toContain('tool1');
    expect(call.text).toContain('tool2');
    expect(call.text).not.toContain('desc1');
  });

  it('should list tools with descriptions when "desc" arg is passed', async () => {
    const mockDeclarations = [
      { name: 'tool1', description: 'desc1' },
    ];
    context.services.config!.getToolRegistry = vi.fn().mockResolvedValue({
      getFunctionDeclarations: vi.fn().mockReturnValue(mockDeclarations),
    });
    await toolsCommand.action!(context, 'desc');
    const call = (context.ui.addItem as any).mock.calls[0][0];
    expect(call.text).toContain('tool1');
    expect(call.text).toContain('desc1');
  });
});