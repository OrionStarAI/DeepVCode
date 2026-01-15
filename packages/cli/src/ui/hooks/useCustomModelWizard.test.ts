/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCustomModelWizard } from './useCustomModelWizard.js';
import { CustomModelConfig } from 'deepv-code-core';

// Mock the customModelsStorage module
vi.mock('../../config/customModelsStorage.js', () => ({
  addOrUpdateCustomModel: vi.fn(),
  loadCustomModels: vi.fn(() => []),
}));

import { addOrUpdateCustomModel, loadCustomModels } from '../../config/customModelsStorage.js';

describe('useCustomModelWizard', () => {
  const mockLoadedSettings = {} as any;
  const mockAddItem = vi.fn();
  const mockConfig = {
    setCustomModels: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with wizard closed', () => {
    const { result } = renderHook(() =>
      useCustomModelWizard(mockLoadedSettings, mockAddItem, mockConfig)
    );

    expect(result.current.isCustomModelWizardOpen).toBe(false);
  });

  it('should open wizard when openCustomModelWizard is called', () => {
    const { result } = renderHook(() =>
      useCustomModelWizard(mockLoadedSettings, mockAddItem, mockConfig)
    );

    act(() => {
      result.current.openCustomModelWizard();
    });

    expect(result.current.isCustomModelWizardOpen).toBe(true);
  });

  it('should save model and close wizard when handleWizardComplete is called', () => {
    const { result } = renderHook(() =>
      useCustomModelWizard(mockLoadedSettings, mockAddItem, mockConfig)
    );

    const testConfig: CustomModelConfig = {
      displayName: 'Test Model',
      provider: 'openai',
      baseUrl: 'http://localhost:8000',
      apiKey: 'test-key',
      modelId: 'gpt-4',
      enabled: true,
    };

    // Open wizard first
    act(() => {
      result.current.openCustomModelWizard();
    });
    expect(result.current.isCustomModelWizardOpen).toBe(true);

    // Complete wizard
    act(() => {
      result.current.handleWizardComplete(testConfig);
    });

    // Verify addOrUpdateCustomModel was called with the config
    expect(addOrUpdateCustomModel).toHaveBeenCalledWith(testConfig);

    // Verify loadCustomModels was called for hot reload
    expect(loadCustomModels).toHaveBeenCalled();

    // Verify config.setCustomModels was called
    expect(mockConfig.setCustomModels).toHaveBeenCalled();

    // Verify wizard was closed
    expect(result.current.isCustomModelWizardOpen).toBe(false);

    // Verify success message was added
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        text: expect.stringContaining('Test Model'),
      }),
      expect.any(Number)
    );
  });

  it('should close wizard and show message when handleWizardCancel is called', () => {
    const { result } = renderHook(() =>
      useCustomModelWizard(mockLoadedSettings, mockAddItem, mockConfig)
    );

    // Open wizard first
    act(() => {
      result.current.openCustomModelWizard();
    });
    expect(result.current.isCustomModelWizardOpen).toBe(true);

    // Cancel wizard
    act(() => {
      result.current.handleWizardCancel();
    });

    // Verify wizard was closed
    expect(result.current.isCustomModelWizardOpen).toBe(false);

    // Verify cancel message was added
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        text: expect.stringContaining('cancelled'),
      }),
      expect.any(Number)
    );
  });

  it('should handle save errors gracefully', () => {
    // Make addOrUpdateCustomModel throw an error
    (addOrUpdateCustomModel as any).mockImplementationOnce(() => {
      throw new Error('Storage error');
    });

    const { result } = renderHook(() =>
      useCustomModelWizard(mockLoadedSettings, mockAddItem, mockConfig)
    );

    const testConfig: CustomModelConfig = {
      displayName: 'Test Model',
      provider: 'openai',
      baseUrl: 'http://localhost:8000',
      apiKey: 'test-key',
      modelId: 'gpt-4',
      enabled: true,
    };

    act(() => {
      result.current.handleWizardComplete(testConfig);
    });

    // Verify error message was added
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text: expect.stringContaining('Storage error'),
      }),
      expect.any(Number)
    );
  });
});
