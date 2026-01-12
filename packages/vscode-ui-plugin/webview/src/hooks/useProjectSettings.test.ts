import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { useYoloMode, YoloModeProvider, useProjectSettings, useExecutionSettings } from './useProjectSettings';
import * as globalMessageServiceModule from '../services/globalMessageService';

// Mock the global message service
vi.mock('../services/globalMessageService');

describe('useProjectSettings', () => {
  let mockMessageService: any;

  beforeEach(() => {
    mockMessageService = {
      onProjectSettingsResponse: vi.fn(),
      requestProjectSettings: vi.fn(),
      sendProjectSettingsUpdate: vi.fn(),
    };

    vi.mocked(globalMessageServiceModule.getGlobalMessageService).mockReturnValue(mockMessageService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(YoloModeProvider, null, children);

  describe('YoloModeProvider and useYoloMode', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useYoloMode());
      }).toThrow('useYoloMode must be used within a YoloModeProvider');

      consoleSpy.mockRestore();
    });

    it('should have default values', () => {
      const { result } = renderHook(() => useYoloMode(), { wrapper });

      expect(result.current.yoloMode).toBe(false);
      expect(result.current.preferredModel).toBe('auto');
      expect(result.current.healthyUse).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should load settings from core', async () => {
      let settingsCallback: any;
      mockMessageService.onProjectSettingsResponse.mockImplementation((cb: any) => {
        settingsCallback = cb;
      });

      const { result } = renderHook(() => useYoloMode(), { wrapper });

      await act(async () => {
        await result.current.loadYoloMode();
      });

      expect(mockMessageService.onProjectSettingsResponse).toHaveBeenCalled();
      expect(mockMessageService.requestProjectSettings).toHaveBeenCalled();

      // Simulate response from core
      act(() => {
        settingsCallback({
          yoloMode: true,
          preferredModel: 'claude-3-opus',
          healthyUse: false,
        });
      });

      expect(result.current.yoloMode).toBe(true);
      expect(result.current.preferredModel).toBe('claude-3-opus');
      expect(result.current.healthyUse).toBe(false);
    });

    it('should update yolo mode', async () => {
      const { result } = renderHook(() => useYoloMode(), { wrapper });

      await act(async () => {
        await result.current.updateYoloMode(true);
      });

      expect(result.current.yoloMode).toBe(true);
      expect(mockMessageService.sendProjectSettingsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          yoloMode: true,
        })
      );
    });

    it('should update preferred model', async () => {
      const { result } = renderHook(() => useYoloMode(), { wrapper });

      await act(async () => {
        await result.current.updatePreferredModel('claude-3-opus');
      });

      expect(result.current.preferredModel).toBe('claude-3-opus');
      expect(mockMessageService.sendProjectSettingsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredModel: 'claude-3-opus',
        })
      );
    });

    it('should update healthy use', async () => {
      const { result } = renderHook(() => useYoloMode(), { wrapper });

      await act(async () => {
        await result.current.updateHealthyUse(false);
      });

      expect(result.current.healthyUse).toBe(false);
      expect(mockMessageService.sendProjectSettingsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          healthyUse: false,
        })
      );
    });

    it('should handle update error and rollback', async () => {
      mockMessageService.sendProjectSettingsUpdate.mockImplementation(() => {
        throw new Error('Network error');
      });

      const { result } = renderHook(() => useYoloMode(), { wrapper });

      await act(async () => {
        await result.current.updateYoloMode(true);
      });

      // Should rollback to false due to error
      expect(result.current.yoloMode).toBe(false);
      expect(result.current.error).toBe('同步设置到VSCode失败');
    });

    it('should handle load error', async () => {
      mockMessageService.onProjectSettingsResponse.mockImplementation(() => {
        throw new Error('Load failed');
      });

      const { result } = renderHook(() => useYoloMode(), { wrapper });

      await act(async () => {
        await result.current.loadYoloMode();
      });

      expect(result.current.error).toBe('Load failed');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('useProjectSettings (deprecated)', () => {
    it('should provide backward compatible API', async () => {
      const { result } = renderHook(() => useProjectSettings(), { wrapper });

      expect(result.current.settings.execution.yoloMode).toBe(false);

      await act(async () => {
        await result.current.updateSettings({ updates: { yoloMode: true } });
      });

      expect(mockMessageService.sendProjectSettingsUpdate).toHaveBeenCalled();
    });
  });

  describe('useExecutionSettings (deprecated)', () => {
    it('should provide backward compatible tuple API', async () => {
      const { result } = renderHook(() => useExecutionSettings(), { wrapper });

      const [settings, updateSettings] = result.current;

      expect(settings.yoloMode).toBe(false);

      await act(async () => {
        await updateSettings({ yoloMode: true });
      });

      expect(mockMessageService.sendProjectSettingsUpdate).toHaveBeenCalled();
    });

    it('should ignore updates without yoloMode', async () => {
      const { result } = renderHook(() => useExecutionSettings(), { wrapper });

      const [, updateSettings] = result.current;

      await act(async () => {
        await updateSettings({});
      });

      expect(mockMessageService.sendProjectSettingsUpdate).not.toHaveBeenCalled();
    });
  });

  describe('message service integration', () => {
    it('should handle missing message service gracefully', async () => {
      vi.mocked(globalMessageServiceModule.getGlobalMessageService).mockReturnValue(null as any);

      const { result } = renderHook(() => useYoloMode(), { wrapper });

      await act(async () => {
        await result.current.loadYoloMode();
      });

      // Should not throw error
      expect(result.current.error).toBeNull();
    });

    it('should send complete payload on update', async () => {
      let settingsCallback: any;
      mockMessageService.onProjectSettingsResponse.mockImplementation((cb: any) => {
        settingsCallback = cb;
      });

      const { result } = renderHook(() => useYoloMode(), { wrapper });

      // Set initial state
      await act(async () => {
        await result.current.loadYoloMode();
      });

      act(() => {
        settingsCallback({
          yoloMode: true,
          preferredModel: 'claude-3-opus',
          healthyUse: false,
        });
      });

      mockMessageService.sendProjectSettingsUpdate.mockClear();

      // Update only yoloMode
      await act(async () => {
        await result.current.updateYoloMode(false);
      });

      // Should send all current values
      expect(mockMessageService.sendProjectSettingsUpdate).toHaveBeenCalledWith({
        yoloMode: false,
        preferredModel: 'claude-3-opus',
        healthyUse: false,
      });
    });
  });
});