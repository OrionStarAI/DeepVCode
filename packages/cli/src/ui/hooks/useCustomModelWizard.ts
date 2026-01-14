/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { type HistoryItem, type HistoryItemInfo } from '../types.js';
import { CustomModelConfig, Config } from 'deepv-code-core';
import { t } from '../utils/i18n.js';
import { addOrUpdateCustomModel, loadCustomModels } from '../../config/customModelsStorage.js';

interface UseCustomModelWizardReturn {
  isCustomModelWizardOpen: boolean;
  openCustomModelWizard: () => void;
  handleWizardComplete: (config: CustomModelConfig) => void;
  handleWizardCancel: () => void;
}

export const useCustomModelWizard = (
  loadedSettings: LoadedSettings,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
  config?: Config,
): UseCustomModelWizardReturn => {
  const [isCustomModelWizardOpen, setIsCustomModelWizardOpen] = useState(false);

  const openCustomModelWizard = useCallback(() => {
    setIsCustomModelWizardOpen(true);
  }, []);

  const handleWizardComplete = useCallback(
    (modelConfig: CustomModelConfig) => {
      try {
        // 使用独立的存储系统，避免与settings.json的并发冲突
        addOrUpdateCustomModel(modelConfig);

        // 🔥 热重载：立即更新 Config 实例，让当前会话可以使用新配置的模型
        if (config) {
          const updatedModels = loadCustomModels();
          config.setCustomModels(updatedModels);
          console.log('[CustomModelWizard] Hot-reloaded custom models into Config');
        }

        // 关闭向导
        setIsCustomModelWizardOpen(false);

        // 显示成功消息
        const successMessage = `✅ Custom model "${modelConfig.displayName}" saved successfully!`;
        addItem(
          {
            type: 'info',
            text: successMessage + '\n\n💡 Use /model to select your custom model.\n📁 Saved to: ~/.deepv/custom-models.json',
          } as HistoryItemInfo,
          Date.now(),
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addItem(
          {
            type: 'error',
            text: `❌ Failed to save custom model: ${errorMessage}`,
          } as any,
          Date.now(),
        );
      }
    },
    [addItem, config],
  );

  const handleWizardCancel = useCallback(() => {
    setIsCustomModelWizardOpen(false);
    addItem(
      {
        type: 'info',
        text: 'ℹ️ Custom model configuration cancelled.',
      } as HistoryItemInfo,
      Date.now(),
    );
  }, [addItem]);

  return {
    isCustomModelWizardOpen,
    openCustomModelWizard,
    handleWizardComplete,
    handleWizardCancel,
  };
};
