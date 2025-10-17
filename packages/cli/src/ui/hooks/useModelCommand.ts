/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { type HistoryItem, MessageType } from '../types.js';
import { t, tp } from '../utils/i18n.js';
import { Config } from 'deepv-code-core';
import { appEvents, AppEvent } from '../../utils/events.js';
import { getModelDisplayName } from '../commands/modelCommand.js';

interface UseModelCommandReturn {
  isModelDialogOpen: boolean;
  openModelDialog: () => void;
  handleModelSelect: (modelName: string | undefined) => void;
  handleModelHighlight: (modelName: string | undefined) => void;
}

export const useModelCommand = (
  loadedSettings: LoadedSettings,
  config: Config,
  setModelError: (error: string | null) => void,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseModelCommandReturn => {
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);

  const openModelDialog = useCallback(() => {
    setIsModelDialogOpen(true);
  }, []);

  const handleModelHighlight = useCallback(
    (modelName: string | undefined) => {
      // 可以在这里添加预览逻辑，比如显示模型信息
    },
    [],
  );

  const handleModelSelect = useCallback(
    (modelName: string | undefined) => {
      try {
        if (!modelName) {
          // User cancelled selection
          // Delay closing the dialog to prevent the Escape key from being processed by InputPrompt
          setImmediate(() => {
            setIsModelDialogOpen(false);
          });
          return;
        }

        // 设置模型（包括auto选项）
        loadedSettings.setValue(SettingScope.User, 'preferredModel', modelName);
        if (config) {
          config.setModel(modelName);

          // 同时更新当前GeminiChat实例的specifiedModel
          const geminiClient = config.getGeminiClient();
          if (geminiClient) {
            const chat = geminiClient.getChat();
            chat.setSpecifiedModel(modelName);
          }

          // 发出模型变化事件，通知UI更新
          appEvents.emit(AppEvent.ModelChanged, modelName);
        }

        // 构建成功消息
        const modelDisplayName = getModelDisplayName(modelName, config);
        let content = tp('model.command.set.success', { model: modelDisplayName });

        if (modelName === 'auto') {
          content += `\n${t('model.command.auto.mode')}`;
        }

        addItem(
          {
            type: MessageType.INFO,
            text: content,
          },
          Date.now(),
        );

        setModelError(null);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorText = tp('model.dialog.set.failed', { error: errorMessage });
        setModelError(errorText);
        addItem(
          {
            type: MessageType.ERROR,
            text: errorText,
          },
          Date.now(),
        );
      } finally {
        // Delay closing the dialog to prevent the Enter key from being processed by InputPrompt
        // This ensures the keyboard event is fully consumed by the dialog before InputPrompt sees it
        setImmediate(() => {
          setIsModelDialogOpen(false);
        });
      }
    },
    [loadedSettings, config, setModelError, addItem],
  );

  return {
    isModelDialogOpen,
    openModelDialog,
    handleModelSelect,
    handleModelHighlight,
  };
};