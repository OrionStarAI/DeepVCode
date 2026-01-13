/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { SettingsMenuDialog } from './SettingsMenuDialog.js';
import { Config, ApprovalMode } from 'deepv-code-core';
import { LoadedSettings } from '../../config/settings.js';

// Mock shared components
vi.mock('./shared/RadioButtonSelect.js', async () => {
  const { Text, Box } = await vi.importActual<typeof import('ink')>('ink');
  return {
    RadioButtonSelect: ({ items }: { items: any[] }) => (
      <Box flexDirection="column">
        {items.map((item: any, index: number) => (
          <Text key={index}>{item.label}</Text>
        ))}
      </Box>
    ),
  };
});

// Mock utils
vi.mock('../../utils/modelUtils.js', () => ({
  getModelDisplayName: () => 'Test Model',
}));

describe('SettingsMenuDialog', () => {
  const mockConfig = {
    getAgentStyle: () => 'default',
    getApprovalMode: () => ApprovalMode.DEFAULT,
    getHealthyUseEnabled: () => true,
    getGeminiClient: vi.fn(),
    setApprovalModeWithProjectSync: vi.fn(),
    setAgentStyle: vi.fn(),
    getVsCodePluginMode: () => false,
    getUserMemory: () => 'test memory',
  } as unknown as Config;

  const mockSettings = {
    merged: {
      theme: 'Dark',
      preferredEditor: 'VS Code',
      preferredModel: 'gemini-pro',
      vimMode: false,
    },
    setValue: vi.fn(),
  } as unknown as LoadedSettings;

  it('renders correctly', () => {
    const { lastFrame } = render(
      <SettingsMenuDialog
        onClose={vi.fn()}
        settings={mockSettings}
        config={mockConfig}
        terminalWidth={80}
        onOpenTheme={vi.fn()}
        onOpenEditor={vi.fn()}
        onOpenModel={vi.fn()}
      />
    );

    expect(lastFrame()).toContain('Settings Menu');
    expect(lastFrame()).toContain('Theme');
    expect(lastFrame()).toContain('Editor');
    expect(lastFrame()).toContain('AI Model');
  });
});
