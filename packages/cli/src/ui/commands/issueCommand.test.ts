/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import open from 'open';
import { issueCommand } from './issueCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { type CommandContext } from './types.js';

vi.mock('open', () => ({
  default: vi.fn(),
}));

vi.mock('../../utils/version.js', () => ({
  getCliVersion: vi.fn().mockResolvedValue('1.2.3'),
}));

const lastOpenUrl = () => {
  const calls = vi.mocked(open).mock.calls;
  return calls[calls.length - 1]?.[0];
};

describe('issueCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext({
      ui: {
        debugMessages: [
          { type: 'error', content: 'Boom', count: 2 },
          { type: 'warn', content: 'Ignored warn', count: 1 },
        ],
      },
    });
    vi.mocked(open).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns error when description is missing', async () => {
    if (!issueCommand.action) {
      throw new Error('issueCommand must have an action.');
    }

    const result = await issueCommand.action(mockContext, '   ');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Please provide a short issue description after /issue.',
    });
  });

  it('opens issue url with prefilled data', async () => {
    if (!issueCommand.action) {
      throw new Error('issueCommand must have an action.');
    }

    await issueCommand.action(mockContext, 'Crash when opening file');

    expect(open).toHaveBeenCalledTimes(1);
    const url = lastOpenUrl();
    expect(url).toContain('https://github.com/OrionStarAI/DeepVCode/issues/new');
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('title=Crash when opening file');
    expect(decoded).toContain('## Description');
    expect(decoded).toContain('Crash when opening file');
    expect(decoded).toContain('## Environment');
    expect(decoded).toContain('- CLI: 1.2.3');
    expect(decoded).toContain('- Runtime: Node');
    expect(decoded).toContain('- Model:');
    expect(decoded).toContain('## Error Logs');
    expect(decoded).toContain('Boom');
    expect(decoded).not.toContain('Ignored warn');
  });

  it('includes model displayName in environment info', async () => {
    if (!issueCommand.action) {
      throw new Error('issueCommand must have an action.');
    }

    // Mock context with preferredModel set
    const contextWithModel = createMockCommandContext({
      ui: {
        debugMessages: [],
      },
      services: {
        settings: {
          merged: {
            preferredModel: 'gemini-2.0-flash',
          },
        },
      },
    });

    await issueCommand.action(contextWithModel, 'Test model info');

    const url = lastOpenUrl();
    const decoded = decodeURIComponent(url);
    // Without config, getModelDisplayName returns the model name itself
    expect(decoded).toContain('- Model: gemini-2.0-flash');
  });

  it('masks sensitive data in error logs', async () => {
    if (!issueCommand.action) {
      throw new Error('issueCommand must have an action.');
    }

    mockContext = createMockCommandContext({
      ui: {
        debugMessages: [
          { type: 'error', content: 'Authorization: Bearer sk-1234567890', count: 1 },
          { type: 'error', content: 'token=abcd1234efgh5678', count: 1 },
        ],
      },
    });

    await issueCommand.action(mockContext, 'Leak repro');

    const decoded = decodeURIComponent(lastOpenUrl());
    expect(decoded).toContain('Bearer *');
    expect(decoded).toContain('token=*');
    expect(decoded).not.toContain('sk-1234567890');
  });

  it('returns manual url in sandbox environment', async () => {
    if (!issueCommand.action) {
      throw new Error('issueCommand must have an action.');
    }

    const previousSandbox = process.env.SANDBOX;
    process.env.SANDBOX = 'gemini-sandbox';

    const result = await issueCommand.action(mockContext, 'Sandbox failure');

    if (previousSandbox === undefined) {
      delete process.env.SANDBOX;
    } else {
      process.env.SANDBOX = previousSandbox;
    }

    expect(open).not.toHaveBeenCalled();
    expect(result?.type).toBe('message');
    if (result?.type === 'message') {
      expect(result.content).toContain('https://github.com/OrionStarAI/DeepVCode/issues/new');
    }
  });

  it('uses bun version when running in bun', async () => {
    if (!issueCommand.action) {
      throw new Error('issueCommand must have an action.');
    }

    Object.defineProperty(process.versions, 'bun', {
      value: '1.1.20',
      configurable: true,
    });

    await issueCommand.action(mockContext, 'Bun runtime issue');

    const url = lastOpenUrl();
    expect(url).toBeDefined();
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('- Runtime: Bun 1.1.20');

    delete (process.versions as Record<string, string>).bun;
  });
});
