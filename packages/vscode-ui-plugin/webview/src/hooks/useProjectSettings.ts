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

  /** 更新YOLO模式 */
  updateYoloMode: (enabled: boolean) => Promise<void>;

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
      const cleanup = messageService.onProjectSettingsResponse((data) => {
        console.log('✅ Received YOLO mode from Core:', data.yoloMode);
        setYoloMode(data.yoloMode);
      });

      // 请求当前设置
      messageService.requestProjectSettings();
      
      return cleanup;
    }
  }, []);

  /**
   * 向VSCode发送YOLO模式更新
   */
  const sendToVSCode = useCallback(async (enabled: boolean) => {
    try {
      const messageService = getGlobalMessageService();
      if (messageService) {
        messageService.sendProjectSettingsUpdate(enabled);
        console.log('✅ YOLO mode sent to VSCode:', enabled);
      }
    } catch (error) {
      console.error('Failed to send YOLO mode to VSCode:', error);
      throw new Error('同步YOLO模式到VSCode失败');
    }
  }, []);

  /**
   * 加载YOLO模式设置
   */
  const loadYoloMode = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 从Core配置同步YOLO模式
      syncFromCore();
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载YOLO模式失败');
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
      await sendToVSCode(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新YOLO模式失败');
      // 如果发送失败，恢复原状态
      setYoloMode(!enabled);
    }
  }, [sendToVSCode]);

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
    updateYoloMode,
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