/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { ExtensionCommandLoader } from './ExtensionCommandLoader.js';
import { Config } from 'deepv-code-core';
import mock from 'mock-fs';
import os from 'os';
import path from 'path';
import { createMockCommandContext } from '../test-utils/mockCommandContext.js';
import { describe, it, expect, afterEach, vi } from 'vitest';

describe('ExtensionCommandLoader', () => {
  const signal: AbortSignal = new AbortController().signal;
  const mockWorkspaceDir = '/workspace';
  const mockHomeDir = '/home/user';

  afterEach(() => {
    mock.restore();
  });

  it('loads commands from workspace extensions', async () => {
    mock({
      [path.join(mockWorkspaceDir, '.deepv', 'extensions', 'my-ext', 'commands')]: {
        'test.toml': 'prompt = "test prompt"',
      },
    });

    const mockConfig = {
      getProjectRoot: () => mockWorkspaceDir,
    } as unknown as Config;

    const loader = new ExtensionCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('ext:my-ext:test');
  });

  it('loads commands from home directory extensions', async () => {
    const homeExtDir = path.join(mockHomeDir, '.deepv', 'extensions', 'home-ext', 'commands');

    // Mock home directory
    const mockFs: Record<string, unknown> = {
      [mockWorkspaceDir]: {},
    };
    mockFs[homeExtDir] = {
      'home-cmd.toml': 'prompt = "home command"',
    };

    mock(mockFs);

    // Mock os.homedir() to return our test home directory
    const originalHomedir = os.homedir;
    // @ts-expect-error - mocking os.homedir for test
    os.homedir = () => mockHomeDir;

    try {
      const mockConfig = {
        getProjectRoot: () => mockWorkspaceDir,
      } as unknown as Config;

      const loader = new ExtensionCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('ext:home-ext:home-cmd');
    } finally {
      os.homedir = originalHomedir;
    }
  });

  it('loads commands from both workspace and home directories', async () => {
    const mockFs: Record<string, unknown> = {
      [path.join(mockWorkspaceDir, '.deepv', 'extensions', 'workspace-ext', 'commands')]: {
        'ws-cmd.toml': 'prompt = "workspace command"',
      },
    };

    const homeExtDir = path.join(mockHomeDir, '.deepv', 'extensions', 'home-ext', 'commands');
    mockFs[homeExtDir] = {
      'home-cmd.toml': 'prompt = "home command"',
    };

    mock(mockFs);

    const originalHomedir = os.homedir;
    // @ts-expect-error - mocking os.homedir for test
    os.homedir = () => mockHomeDir;

    try {
      const mockConfig = {
        getProjectRoot: () => mockWorkspaceDir,
      } as unknown as Config;

      const loader = new ExtensionCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(2);
      const commandNames = commands.map(c => c.name).sort();
      expect(commandNames).toEqual([
        'ext:home-ext:home-cmd',
        'ext:workspace-ext:ws-cmd',
      ]);
    } finally {
      os.homedir = originalHomedir;
    }
  });

  it('handles missing extension directories gracefully', async () => {
    mock({
      [mockWorkspaceDir]: {},
    });

    const mockConfig = {
      getProjectRoot: () => mockWorkspaceDir,
    } as unknown as Config;

    const loader = new ExtensionCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(0);
  });

  it('loads nested command files with correct naming', async () => {
    mock({
      [path.join(mockWorkspaceDir, '.deepv', 'extensions', 'my-ext', 'commands')]: {
        'simple.toml': 'prompt = "simple"',
        'nested': {
          'deep.toml': 'prompt = "deep"',
          'deeper': {
            'very-deep.toml': 'prompt = "very deep"',
          },
        },
      },
    });

    const mockConfig = {
      getProjectRoot: () => mockWorkspaceDir,
    } as unknown as Config;

    const loader = new ExtensionCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(3);
    const commandNames = commands.map(c => c.name).sort();
    expect(commandNames).toEqual([
      'ext:my-ext:nested:deep',
      'ext:my-ext:nested:deeper:very-deep',
      'ext:my-ext:simple',
    ]);
  });

  it('executes extension commands correctly', async () => {
    mock({
      [path.join(mockWorkspaceDir, '.deepv', 'extensions', 'my-ext', 'commands')]: {
        'greet.toml': 'prompt = "Hello, {{name}}!"',
      },
    });

    const mockConfig = {
      getProjectRoot: () => mockWorkspaceDir,
    } as unknown as Config;

    const loader = new ExtensionCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];

    const result = await command.action?.(
      createMockCommandContext({
        invocation: {
          raw: '/ext:my-ext:greet',
          name: 'ext:my-ext:greet',
          args: 'World',
        },
      }),
      'World',
    );

    if (result?.type === 'submit_prompt') {
      expect(result.content).toContain('Hello');
    }
  });

  it('handles extensions without commands directory', async () => {
    mock({
      [path.join(mockWorkspaceDir, '.deepv', 'extensions', 'no-commands-ext')]: {
        'gemini-extension.json': '{"name": "no-commands-ext"}',
      },
    });

    const mockConfig = {
      getProjectRoot: () => mockWorkspaceDir,
    } as unknown as Config;

    const loader = new ExtensionCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(0);
  });

  it('skips invalid TOML files with error logging', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mock({
      [path.join(mockWorkspaceDir, '.deepv', 'extensions', 'bad-ext', 'commands')]: {
        'invalid.toml': 'this is not valid toml:::',
      },
    });

    const mockConfig = {
      getProjectRoot: () => mockWorkspaceDir,
    } as unknown as Config;

    const loader = new ExtensionCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(0);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('validates command definitions with Zod schema', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mock({
      [path.join(mockWorkspaceDir, '.deepv', 'extensions', 'bad-def-ext', 'commands')]: {
        'missing-prompt.toml': 'description = "no prompt here"',
      },
    });

    const mockConfig = {
      getProjectRoot: () => mockWorkspaceDir,
    } as unknown as Config;

    const loader = new ExtensionCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(0);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
