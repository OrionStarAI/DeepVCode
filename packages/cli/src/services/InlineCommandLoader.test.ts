/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { InlineCommandLoader } from './InlineCommandLoader.js';
import { CommandKind } from '../ui/commands/types.js';
import { findInlineCommand, getEnabledInlineCommands } from './inlineCommands.js';

describe('InlineCommandLoader', () => {
  it('should load enabled inline commands', async () => {
    const loader = new InlineCommandLoader(null);
    const signal = new AbortController().signal;

    const commands = await loader.loadCommands(signal);

    expect(commands.length).toBeGreaterThan(0);
    expect(commands[0]).toHaveProperty('name');
    expect(commands[0]).toHaveProperty('description');
    expect(commands[0]).toHaveProperty('kind', CommandKind.INLINE);
    expect(commands[0]).toHaveProperty('action');
  });

  it('should return empty array when aborted', async () => {
    const loader = new InlineCommandLoader(null);
    const controller = new AbortController();
    controller.abort();

    const commands = await loader.loadCommands(controller.signal);

    expect(commands).toEqual([]);
  });

  it('should create command with proper action', async () => {
    const loader = new InlineCommandLoader(null);
    const signal = new AbortController().signal;

    const commands = await loader.loadCommands(signal);
    const analyzeCommand = commands.find(cmd => cmd.name === 'analyze');

    expect(analyzeCommand).toBeDefined();
    expect(analyzeCommand?.action).toBeDefined();

    if (analyzeCommand?.action) {
      const mockContext = {
        invocation: {
          raw: '/analyze test code',
          name: 'analyze',
          args: 'test code'
        }
      } as any;

      const result = await analyzeCommand.action(mockContext, 'test code');

      expect(result).toEqual({
        type: 'submit_prompt',
        content: expect.stringContaining('test code')
      });
    }
  });
});

describe('inlineCommands utilities', () => {
  it('should find command by name', () => {
    const command = findInlineCommand('analyze');
    expect(command).toBeDefined();
    expect(command?.name).toBe('analyze');
  });

  it('should find command by alias', () => {
    const command = findInlineCommand('分析');
    expect(command).toBeDefined();
    expect(command?.name).toBe('analyze');
  });

  it('should return undefined for non-existent command', () => {
    const command = findInlineCommand('nonexistent');
    expect(command).toBeUndefined();
  });

  it('should get enabled commands only', () => {
    const commands = getEnabledInlineCommands();
    expect(commands.every(cmd => cmd.enabled !== false)).toBe(true);
  });
});