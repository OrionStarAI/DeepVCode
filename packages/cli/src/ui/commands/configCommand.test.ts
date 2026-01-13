/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configCommand } from './configCommand.js';
import { CommandKind, CommandContext } from './types.js';
import { Config } from 'deepv-code-core';
import { ApprovalMode } from 'deepv-code-core';

describe('configCommand', () => {
  let mockConfig: Partial<Config>;
  let mockSettings: any;
  let mockContext: Partial<CommandContext>;

  beforeEach(() => {
    mockConfig = {
      getAgentStyle: vi.fn().mockReturnValue('default'),
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
      getHealthyUseEnabled: vi.fn().mockReturnValue(false),
      setApprovalModeWithProjectSync: vi.fn(),
      setAgentStyle: vi.fn(),
      getVsCodePluginMode: vi.fn().mockReturnValue(false),
      getUserMemory: vi.fn().mockReturnValue(null),
      getGeminiClient: vi.fn(),
    };

    mockSettings = {
      merged: {
        vimMode: false,
      },
      setValue: vi.fn(),
    };

    mockContext = {
      services: {
        config: mockConfig as Config,
        settings: mockSettings,
        git: undefined,
        logger: console as any,
      },
      ui: {
        addItem: vi.fn(),
        toggleVimEnabled: vi.fn().mockResolvedValue(true),
      } as any,
      session: {
        stats: {} as any,
        cumulativeCredits: 0,
        totalSessionCredits: 0,
      },
    };
  });

  it('should have correct name and aliases', () => {
    expect(configCommand.name).toBe('config');
    expect(configCommand.altNames).toEqual(['settings', 'preferences']);
  });

  it('should have built-in kind', () => {
    expect(configCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should have 7 subcommands', () => {
    expect(configCommand.subCommands).toHaveLength(7);
    const names = configCommand.subCommands!.map(cmd => cmd.name);
    expect(names).toContain('theme');
    expect(names).toContain('editor');
    expect(names).toContain('model');
    expect(names).toContain('vim');
    expect(names).toContain('agent-style');
    expect(names).toContain('yolo');
    expect(names).toContain('healthy-use');
  });

  it('should open settings menu dialog when no args provided', async () => {
    const result = await configCommand.action!(mockContext as CommandContext, '');
    expect(result).toBeDefined();
    expect(result.type).toBe('dialog');
    expect((result as any).dialog).toBe('settings-menu');
  });

  it('should open theme dialog for theme subcommand', async () => {
    const result = await configCommand.action!(mockContext as CommandContext, 'theme');
    expect(result).toBeDefined();
    expect(result.type).toBe('dialog');
    expect((result as any).dialog).toBe('theme');
  });

  it('should open editor dialog for editor subcommand', async () => {
    const result = await configCommand.action!(mockContext as CommandContext, 'editor');
    expect(result).toBeDefined();
    expect(result.type).toBe('dialog');
    expect((result as any).dialog).toBe('editor');
  });

  it('should open model dialog for model subcommand without args', async () => {
    const result = await configCommand.action!(mockContext as CommandContext, 'model');
    expect(result).toBeDefined();
    expect(result.type).toBe('dialog');
    expect((result as any).dialog).toBe('model');
  });

  it('should toggle vim mode for vim subcommand', async () => {
    const result = await configCommand.action!(mockContext as CommandContext, 'vim');
    expect(result).toBeDefined();
    expect(result.type).toBe('message');
    expect((result as any).content).toContain('✅');
    expect(mockContext.ui?.toggleVimEnabled).toHaveBeenCalled();
  });

  it('should display agent style status for agent-style subcommand', async () => {
    const result = await configCommand.action!(mockContext as CommandContext, 'agent-style');
    expect(result).toBeDefined();
    expect(result.type).toBe('message');
  });

  it('should handle unknown subcommand', async () => {
    const result = await configCommand.action!(mockContext as CommandContext, 'unknown');
    expect(result).toBeDefined();
    expect(result.type).toBe('message');
    expect(result.messageType).toBe('error');
  });

  it('should provide completion suggestions', async () => {
    const completions = await configCommand.completion!(mockContext as CommandContext, 'th');
    expect(completions).toContain('theme');
  });

  it('should provide all completion suggestions for empty partial', async () => {
    const completions = await configCommand.completion!(mockContext as CommandContext, '');
    expect(completions).toContain('theme');
    expect(completions).toContain('vim');
    expect(completions).toContain('yolo');
    expect(completions.length).toBeGreaterThan(5);
  });

  it('should handle yolo enable', async () => {
    const result = await configCommand.action!(mockContext as CommandContext, 'yolo on');
    expect(result).toBeDefined();
    expect(result.type).toBe('message');
    expect((result as any).content).toContain('enabled');
  });

  it('should handle yolo disable', async () => {
    mockConfig.getApprovalMode = vi.fn().mockReturnValue(ApprovalMode.YOLO);
    const result = await configCommand.action!(mockContext as CommandContext, 'yolo off');
    expect(result).toBeDefined();
    expect(result.type).toBe('message');
    expect((result as any).content).toContain('disabled');
  });

  it('should handle healthy-use enable', async () => {
    const result = await configCommand.action!(mockContext as CommandContext, 'healthy-use on');
    expect(result).toBeDefined();
    expect(result.type).toBe('message');
  });

  it('should handle healthy-use disable', async () => {
    mockConfig.getHealthyUseEnabled = vi.fn().mockReturnValue(true);
    const result = await configCommand.action!(mockContext as CommandContext, 'healthy-use off');
    expect(result).toBeDefined();
    expect(result.type).toBe('message');
  });
});
