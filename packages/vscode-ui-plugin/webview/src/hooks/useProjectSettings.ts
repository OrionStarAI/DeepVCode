/**
 * YOLO Mode Settings Hook
 * YOLO模式设置管理Hook
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getGlobalMessageService } from '../services/globalMessageService';

// =============================================================================
// Context 类型定义
// =============================================================================

interface YoloModeContextType {
  /** YOLO模式状态 */
  yoloMode: boolean;

  /** 默认模型 */
  preferredModel: string;

  /** 更新YOLO模式 */
  updateYoloMode: (enabled: boolean) => Promise<void>;

  /** 更新默认模型 */
  updatePreferredModel: (model: string) => Promise<void>;

  /** 加载YOLO模式设置 */
  loadYoloMode: () => Promise<void>;

  /** 设置加载状态 */
  isLoading: boolean;

  /** 错误信息 */
  error: string | null;
}

// =============================================================================
// Context 创建
// =============================================================================

const YoloModeContext = createContext<YoloModeContextType | null>(null);

// =============================================================================
// YOLO Mode Provider 组件
// =============================================================================

interface YoloModeProviderProps {
  children: React.ReactNode;
}

export const YoloModeProvider: React.FC<YoloModeProviderProps> = ({ children }) => {
  const [yoloMode, setYoloMode] = useState<boolean>(false);
  const [preferredModel, setPreferredModel] = useState<string>('auto');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // =============================================================================
  // 核心功能实现
  // =============================================================================

  /**
   * 🎯 从Core配置同步YOLO模式设置
   */
  const syncFromCore = useCallback(() => {
    const messageService = getGlobalMessageService();
    if (messageService) {
      // 监听响应
      const cleanup = messageService.onProjectSettingsResponse((data: any) => {
        console.log('✅ Received settings from Core:', data);
        setYoloMode(data.yoloMode);
        if (data.preferredModel) {
          setPreferredModel(data.preferredModel);
        }
      });

      // 请求当前设置
      messageService.requestProjectSettings();

      return cleanup;
    }
  }, []);

  /**
   * 向VSCode发送设置更新
   */
  const sendToVSCode = useCallback(async (updates: { yoloMode?: boolean; preferredModel?: string }) => {
    try {
      const messageService = getGlobalMessageService();
      if (messageService) {
        // 构造完整的更新对象，确保后端能接收到所有需要的字段
        const payload = {
          yoloMode: updates.yoloMode !== undefined ? updates.yoloMode : yoloMode,
          preferredModel: updates.preferredModel !== undefined ? updates.preferredModel : preferredModel
        };

        messageService.sendProjectSettingsUpdate(payload);
        console.log('✅ Settings sent to VSCode:', payload);
      }
    } catch (error) {
      console.error('Failed to send settings to VSCode:', error);
      throw new Error('同步设置到VSCode失败');
    }
  }, [yoloMode, preferredModel]);

  /**
   * 加载设置
   */
  const loadYoloMode = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 从Core配置同步
      syncFromCore();
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载设置失败');
    } finally {
      setIsLoading(false);
    }
  }, [syncFromCore]);

  /**
   * 更新YOLO模式
   */
  const updateYoloMode = useCallback(async (enabled: boolean) => {
    setError(null);

    try {
      setYoloMode(enabled);
      await sendToVSCode({ yoloMode: enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新YOLO模式失败');
      // 如果发送失败，恢复原状态
      setYoloMode(!enabled);
    }
  }, [sendToVSCode]);

  /**
   * 更新默认模型
   */
  const updatePreferredModel = useCallback(async (model: string) => {
    setError(null);
    const oldModel = preferredModel;

    try {
      setPreferredModel(model);
      await sendToVSCode({ preferredModel: model });
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新默认模型失败');
      // 如果发送失败，恢复原状态
      setPreferredModel(oldModel);
    }
  }, [sendToVSCode, preferredModel]);

  // =============================================================================
  // 初始化加载
  // =============================================================================

  useEffect(() => {
    loadYoloMode();
  }, [loadYoloMode]);

  // =============================================================================
  // Context 值
  // =============================================================================

  const contextValue: YoloModeContextType = {
    yoloMode,
    preferredModel,
    updateYoloMode,
    updatePreferredModel,
    loadYoloMode,
    isLoading,
    error
  };

  return React.createElement(
    YoloModeContext.Provider,
    { value: contextValue },
    children
  );
};

// =============================================================================
// Hook 导出
// =============================================================================

/**
 * 使用YOLO模式的Hook
 */
export const useYoloMode = (): YoloModeContextType => {
  const context = useContext(YoloModeContext);
  if (!context) {
    throw new Error('useYoloMode must be used within a YoloModeProvider');
  }
  return context;
};

// =============================================================================
// 兼容性导出（保持原有API）
// =============================================================================

/** @deprecated 使用 useYoloMode 替代 */
export const useProjectSettings = () => {
  const { yoloMode, updateYoloMode } = useYoloMode();
  return {
    settings: { execution: { yoloMode } },
    updateSettings: async ({ updates }: any) => {
      if ('yoloMode' in updates) {
        await updateYoloMode(updates.yoloMode);
      }
    }
  };
};

/** @deprecated 使用 useYoloMode 替代 */
export const useExecutionSettings = () => {
  const { yoloMode, updateYoloMode } = useYoloMode();
  return [
    { yoloMode },
    async (updates: { yoloMode?: boolean }) => {
      if ('yoloMode' in updates && updates.yoloMode !== undefined) {
        await updateYoloMode(updates.yoloMode);
      }
    }
  ] as const;
};

/** @deprecated 使用 YoloModeProvider 替代 */
export const ProjectSettingsProvider = YoloModeProvider;