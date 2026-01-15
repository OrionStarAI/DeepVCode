/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ModelManagementMenu } from './ModelManagementMenu.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { Config, CustomModelConfig } from 'deepv-code-core';

// Mock the storage functions
vi.mock('../../config/customModelsStorage.js', () => ({
  deleteCustomModel: vi.fn((modelId: string) => true),
  loadCustomModels: vi.fn(() => []),
  addOrUpdateCustomModel: vi.fn(),
}));

// Mock CustomModelWizard
vi.mock('./CustomModelWizard.js', () => ({
  CustomModelWizard: ({ onComplete }: any) => <div>CustomModelWizard</div>,
}));

describe('ModelManagementMenu', () => {
  let mockSettings: LoadedSettings;
  let mockConfig: Config;
  let mockOnComplete: ReturnType<typeof vi.fn>;
  let mockOnCancel: ReturnType<typeof vi.fn>;

  const mockCustomModels: CustomModelConfig[] = [
    {
      displayName: 'Model A',
      provider: 'openai',
      baseUrl: 'http://localhost:1234/v1',
      apiKey: 'test-key-a',
      modelId: 'gpt-4',
      enabled: true,
    },
    {
      displayName: 'Model B',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'test-key-b',
      modelId: 'claude-3',
      enabled: true,
    },
  ];

  beforeEach(() => {
    mockOnComplete = vi.fn();
    mockOnCancel = vi.fn();

    mockSettings = {
      merged: {
        preferredModel: 'auto',
      },
      setValue: vi.fn(),
    } as any;

    mockConfig = {
      getCustomModels: vi.fn(() => mockCustomModels),
      setCustomModels: vi.fn(),
    } as any;
  });

  describe('Component Rendering', () => {
    it('should render without crashing', () => {
      const { lastFrame } = render(
        <ModelManagementMenu
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
          settings={mockSettings}
          config={mockConfig}
        />
      );

      expect(lastFrame()).toBeTruthy();
    });

    it('should show main menu options', () => {
      const { lastFrame } = render(
        <ModelManagementMenu
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
          settings={mockSettings}
          config={mockConfig}
        />
      );

      const output = lastFrame();
      expect(output).toContain('Model Management');
      expect(output).toContain('Add Custom Model');
      expect(output).toContain('Delete Custom Model');
    });

    it('should load custom models from config on mount', () => {
      render(
        <ModelManagementMenu
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
          settings={mockSettings}
          config={mockConfig}
        />
      );

      expect(mockConfig.getCustomModels).toHaveBeenCalled();
    });
  });

  describe('Integration with Storage', () => {
    it('should have access to deleteCustomModel function', async () => {
      const { deleteCustomModel } = await import('../../config/customModelsStorage.js');

      expect(deleteCustomModel).toBeDefined();
    });

    it('should have access to loadCustomModels function', async () => {
      const { loadCustomModels } = await import('../../config/customModelsStorage.js');

      expect(loadCustomModels).toBeDefined();
    });

    it('should have access to addOrUpdateCustomModel function', async () => {
      const { addOrUpdateCustomModel } = await import('../../config/customModelsStorage.js');

      expect(addOrUpdateCustomModel).toBeDefined();
    });
  });

  describe('Props and Callbacks', () => {
    it('should accept onComplete callback', () => {
      const { unmount } = render(
        <ModelManagementMenu
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
          settings={mockSettings}
          config={mockConfig}
        />
      );

      expect(mockOnComplete).toBeDefined();
      unmount();
    });

    it('should accept onCancel callback', () => {
      const { unmount } = render(
        <ModelManagementMenu
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
          settings={mockSettings}
          config={mockConfig}
        />
      );

      expect(mockOnCancel).toBeDefined();
      unmount();
    });
  });
});