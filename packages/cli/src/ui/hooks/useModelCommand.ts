/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { type HistoryItem, type HistoryItemInfo, MessageType } from '../types.js';
import { t, tp } from '../utils/i18n.js';
import { Config, SessionManager } from 'deepv-code-core';
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
    async (modelName: string | undefined) => {
      try {
        if (!modelName) {
          // User cancelled selection
          // Delay closing the dialog to prevent the Escape key from being processed by InputPrompt
          setImmediate(() => {
            setIsModelDialogOpen(false);
          });
          return;
        }

        // Immediately close the dialog to show the switching/compressing message below
        // Don't delay here - we want the user to see the status updates immediately
        setIsModelDialogOpen(false);

        // 设置模型（包括auto选项）
        loadedSettings.setValue(SettingScope.User, 'preferredModel', modelName);

        if (config) {
          const geminiClient = config.getGeminiClient();

          if (geminiClient) {
            // 显示正在切换的消息，并提示可能需要压缩
            const modelDisplayName = getModelDisplayName(modelName, config);
            addItem(
              {
                type: 'info',
                text: `ℹ️Switching to model ${modelDisplayName}, please wait...`,
              } as HistoryItemInfo,
              Date.now(),
            );

            // Add a pending message to show compression progress
            addItem(
              {
                type: 'info',
                text: `⏳ Attempting to compress history to fit the new model's context window...`,
              } as HistoryItemInfo,
              Date.now(),
            );

            // 使用 switchModel 进行安全切换（包含自动压缩）
            const switchResult = await geminiClient.switchModel(modelName, new AbortController().signal);

            if (!switchResult.success) {
              throw new Error(`Failed to switch to model ${modelName}. ${switchResult.error || 'Context compression may have failed.'}`);
            }

            // 显示压缩结果或跳过原因
            if (switchResult.compressionInfo) {
              addItem(
                {
                  type: 'info',
                  text: `📦 Context compressed: ${switchResult.compressionInfo.originalTokenCount} → ${switchResult.compressionInfo.newTokenCount} tokens`,
                } as HistoryItemInfo,
                Date.now(),
              );
            } else if (switchResult.compressionSkipReason) {
              addItem(
                {
                  type: 'info',
                  text: `✓ ${switchResult.compressionSkipReason}`,
                } as HistoryItemInfo,
                Date.now(),
              );
            }

            // 🔧 CRITICAL: Save the compressed history to disk immediately
            // Without this, the new compressed history only exists in memory
            // and next API calls will use the correct history, but the session file
            // will still contain the old history, causing inconsistency
            try {
              const projectRoot = config.getProjectRoot();
              if (projectRoot) {
                const sessionManager = new SessionManager(projectRoot);
                const clientHistory = await geminiClient.getHistory();
                await sessionManager.saveSessionHistory(
                  config.getSessionId(),
                  [], // UI history not needed here, only the client history matters
                  clientHistory
                );
                console.log('[useModelCommand] ✅ Compressed history saved to session file');
              }
            } catch (error) {
              console.warn('[useModelCommand] ⚠️ Failed to save compressed history:', error);
              // Don't throw - the model switch succeeded, just warn about the save failure
            }
          } else {
            // Fallback if client not initialized (should rarely happen)
            config.setModel(modelName);
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
            type: 'info',
            text: content,
          } as HistoryItemInfo,
          Date.now(),
        );

        setModelError(null);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorText = tp('model.dialog.set.failed', { error: errorMessage });
        setModelError(errorText);
        addItem(
          {
            type: 'error',
            text: errorText,
          } as any,
          Date.now(),
        );
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