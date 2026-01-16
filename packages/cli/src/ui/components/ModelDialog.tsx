/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { ModelManagementMenu } from './ModelManagementMenu.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { useSmallWindowOptimization, WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';
import { getAvailableModels, getModelDisplayName, getModelInfo, getModelNameFromDisplayName, type ModelInfo } from '../commands/modelCommand.js';
import { Config } from 'deepv-code-core';
import { t, tp } from '../utils/i18n.js';

interface ModelDialogProps {
  /** Callback function when a model is selected */
  onSelect: (modelName: string | undefined) => void;

  /** Callback function when a model is highlighted */
  onHighlight: (modelName: string | undefined) => void;

  /** The settings object */
  settings: LoadedSettings;

  /** The config object */
  config: Config;

  /** Available terminal height */
  availableTerminalHeight?: number;

  /** Terminal width */
  terminalWidth: number;

  /**
   * 自定义模型专用模式
   * 当为 true 时：
   * 1. 不要求登录，不显示登录错误
   * 2. 隐藏 Auto 选项
   * 3. 只显示自定义模型和模型管理选项
   */
  customModelOnlyMode?: boolean;
}

export function ModelDialog({
  onSelect,
  onHighlight,
  settings,
  config,
  availableTerminalHeight,
  terminalWidth,
  customModelOnlyMode = false,
}: ModelDialogProps): React.JSX.Element {
  const smallWindowConfig = useSmallWindowOptimization();

  // 视图状态：'model-list' | 'management'
  const [viewState, setViewState] = useState<'model-list' | 'management'>('model-list');

  const [modelItems, setModelItems] = useState<Array<{
    label: string;
    value: string;
    modelInfo?: ModelInfo;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedModelName, setHighlightedModelName] = useState<string | undefined>();

  // Load available models - only on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        setLoading(true);
        const { modelNames, modelInfos, source } = await getAvailableModels(settings, config);

        // 在自定义模型专用模式下，不显示登录错误
        // 检查是否需要重新登录（401错误或未登录）
        if (!customModelOnlyMode && (source === 'auth_required' || modelNames.length === 0)) {
          setError(t('model.dialog.error.not.logged.in'));
          return;
        }

        // 在列表第一项添加"模型管理"特殊选项
        const managementItem = {
          label: `⮞ ${t('model.dialog.management.label')} ⮜`,
          value: '__management__',
          modelInfo: undefined,
          isCustomModel: false,
        };

        // 在自定义模型专用模式下，过滤掉 'auto' 选项和非自定义模型
        const filteredModelNames = customModelOnlyMode
          ? modelNames.filter((name: string) => {
              // 保留自定义模型（以 custom: 开头）
              if (name.startsWith('custom:')) return true;
              // 过滤掉 'auto'
              if (name === 'auto') return false;
              // 检查是否是自定义模型
              const info = getModelInfo(name, config);
              return info?.isCustom === true;
            })
          : modelNames;

        const modelItems = filteredModelNames.map((modelName: string) => {
          const displayName = getModelDisplayName(modelName, config);
          const modelInfo = getModelInfo(modelName, config);

          let label = displayName;
          // 只有非自定义模型才显示积分信息
          if (modelInfo && modelInfo.creditsPerRequest && !modelInfo.isCustom) {
            label += ` (${modelInfo.creditsPerRequest}x credits)`;
          }

          return {
            label,
            value: modelName,
            modelInfo,
            isCustomModel: modelInfo?.isCustom || false,
          };
        });

        // 排序：自定义模型排在前面，然后是普通模型
        modelItems.sort((a, b) => {
          // 自定义模型优先
          if (a.isCustomModel && !b.isCustomModel) return -1;
          if (!a.isCustomModel && b.isCustomModel) return 1;
          return 0; // 保持原有顺序
        });

        const items = [managementItem, ...modelItems];

        setModelItems(items);

        // Set initial highlight to current model (or first custom model in customModelOnlyMode)
        const currentModel = settings.merged.preferredModel;
        if (customModelOnlyMode && modelItems.length > 0) {
          // 在自定义模型模式下，默认选中第一个自定义模型
          setHighlightedModelName(modelItems[0].value);
        } else {
          setHighlightedModelName(currentModel || 'auto');
        }

      } catch (err) {
        setError(tp('model.dialog.error.load.failed', { error: err instanceof Error ? err.message : String(err) }));
      } finally {
        setLoading(false);
      }
    };

    loadModels();
    // Only run on mount - don't reload when settings/config change to avoid unnecessary background refreshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModelSelect = useCallback(
    (modelName: string) => {
      // 检查是否选择了"模型管理"选项
      if (modelName === '__management__') {
        setViewState('management');
        return;
      }
      onSelect(modelName);
    },
    [onSelect],
  );

  // 处理模型管理完成
  const handleManagementComplete = useCallback(
    async (modelsModified: boolean) => {
      setViewState('model-list');

      // 如果模型列表被修改了，重新加载
      if (modelsModified) {
        setLoading(true);
        try {
          const { modelNames, modelInfos } = await getAvailableModels(settings, config);

          const managementItem = {
            label: `⮞ ${t('model.dialog.management.label')} ⮜`,
            value: '__management__',
            modelInfo: undefined,
            isCustomModel: false,
          };

          // 在自定义模型专用模式下，过滤掉 'auto' 选项和非自定义模型
          const filteredModelNames = customModelOnlyMode
            ? modelNames.filter((name: string) => {
                if (name.startsWith('custom:')) return true;
                if (name === 'auto') return false;
                const info = getModelInfo(name, config);
                return info?.isCustom === true;
              })
            : modelNames;

          const modelItems = filteredModelNames.map((modelName: string) => {
            const displayName = getModelDisplayName(modelName, config);
            const modelInfo = getModelInfo(modelName, config);
            let label = displayName;
            if (modelInfo && modelInfo.creditsPerRequest && !modelInfo.isCustom) {
              label += ` (${modelInfo.creditsPerRequest}x credits)`;
            }
            return {
              label,
              value: modelName,
              modelInfo,
              isCustomModel: modelInfo?.isCustom || false,
            };
          });

          // 排序：自定义模型排在前面
          modelItems.sort((a, b) => {
            if (a.isCustomModel && !b.isCustomModel) return -1;
            if (!a.isCustomModel && b.isCustomModel) return 1;
            return 0;
          });

          setModelItems([managementItem, ...modelItems]);
        } catch (err) {
          console.error('[ModelDialog] Failed to reload models:', err);
        } finally {
          setLoading(false);
        }
      }
    },
    [settings, config, customModelOnlyMode],
  );

  // 处理模型管理取消
  const handleManagementCancel = useCallback(() => {
    setViewState('model-list');
  }, []);

  const handleModelHighlight = useCallback((modelName: string) => {
    setHighlightedModelName(modelName);
    onHighlight(modelName);
  }, [onHighlight]);

  useInput((input, key) => {
    if (key.escape) {
      onSelect(undefined);
    }
    // When there's an auth error, pressing Enter should trigger auth dialog
    if (error && key.return) {
      onSelect('__trigger_auth__');
    }
  });

  // 根据窗口大小调整显示项数
  const getMaxItemsToShow = () => {
    switch (smallWindowConfig.sizeLevel) {
      case WindowSizeLevel.TINY:
        return 5; // 极小窗口显示5个模型选项
      case WindowSizeLevel.SMALL:
        return 8; // 小窗口显示8个模型选项
      case WindowSizeLevel.NORMAL:
      default:
        return 12; // 正常窗口显示12个模型选项
    }
  };

  const maxItemsToShow = getMaxItemsToShow();

  // Find the index of the selected model
  const currentModel = settings.merged.preferredModel || 'auto';
  const initialModelIndex = modelItems.findIndex(item => item.value === currentModel);
  const safeInitialModelIndex = initialModelIndex >= 0 ? initialModelIndex : 0;

  // Show model details for highlighted model (but not for management item)
  const highlightedModel = modelItems.find(item => item.value === highlightedModelName);
  const showDetails = highlightedModel
    && highlightedModel.modelInfo
    && highlightedModel.value !== '__management__'
    && smallWindowConfig.sizeLevel === WindowSizeLevel.NORMAL;

  // 如果在管理视图中，显示管理菜单
  if (viewState === 'management') {
    return (
      <ModelManagementMenu
        onComplete={handleManagementComplete}
        onCancel={handleManagementCancel}
        settings={settings}
        config={config}
      />
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      {loading && (
        <Box flexDirection="column" alignItems="center">
          <Text>{t('model.dialog.loading')}</Text>
        </Box>
      )}

      {error && (
        <Box flexDirection="column" alignItems="center">
          <Text color={Colors.AccentRed}>{error}</Text>
          <Box marginTop={1}>
            <Text bold color={Colors.AccentYellow}>{t('model.dialog.hint.login')}</Text>
          </Box>
        </Box>
      )}

      {!loading && !error && (
        <Box flexDirection="row">
          {/* Left Column: Model Selection */}
          <Box
            flexDirection="column"
            width={showDetails ? "60%" : "100%"}
            paddingRight={showDetails ? 2 : 0}
          >
            <Text bold wrap="truncate">
              {'>'} {t('model.dialog.title')}
            </Text>
            <Text color={Colors.Gray} wrap="truncate">
              {tp('model.dialog.current', { model: getModelDisplayName(currentModel, config) })}
            </Text>
            <Box marginTop={1}>
              <RadioButtonSelect
                items={modelItems}
                initialIndex={safeInitialModelIndex}
                onSelect={handleModelSelect}
                onHighlight={handleModelHighlight}
                isFocused={true}
                maxItemsToShow={maxItemsToShow}
                showScrollArrows={smallWindowConfig.sizeLevel === WindowSizeLevel.NORMAL}
                showNumbers={smallWindowConfig.sizeLevel === WindowSizeLevel.NORMAL}
              />
            </Box>
          </Box>

          {/* Right Column: Model Details - 只在正常窗口显示 */}
          {showDetails && highlightedModel && highlightedModel.modelInfo && (
            <Box flexDirection="column" width="40%" paddingLeft={2}>
              <Text bold>{t('model.dialog.details.title')}</Text>
              <Box
                borderStyle="single"
                borderColor={Colors.Gray}
                paddingTop={1}
                paddingBottom={1}
                paddingLeft={1}
                paddingRight={1}
                flexDirection="column"
                marginTop={1}
              >
                {/* 自定义模型专用显示 */}
                {highlightedModel.modelInfo.isCustom ? (
                  (() => {
                    const customConfig = config.getCustomModelConfig(highlightedModel.value as string);
                    return (
                      <>
                        <Text>
                          <Text bold>{t('model.dialog.details.name')}</Text>
                          <Text color={Colors.AccentCyan}>{highlightedModel.modelInfo.displayName}</Text>
                        </Text>
                        <Text>
                          <Text bold>Type: </Text>
                          <Text color={Colors.AccentCyan}>Custom Model</Text>
                        </Text>
                        {customConfig && (
                          <>
                            <Text>
                              <Text bold>Base URL: </Text>
                              <Text color={Colors.Gray} wrap="truncate">{customConfig.baseUrl}</Text>
                            </Text>
                            <Text>
                              <Text bold>Model ID: </Text>
                              <Text wrap="truncate">{customConfig.modelId}</Text>
                            </Text>
                          </>
                        )}
                        {highlightedModel.modelInfo.maxToken && highlightedModel.modelInfo.maxToken > 0 && (
                          <Text>
                            <Text bold>{t('model.dialog.details.context')}</Text>
                            <Text>{highlightedModel.modelInfo.maxToken.toLocaleString()} tokens</Text>
                          </Text>
                        )}
                        <Text>
                          <Text bold>{t('model.dialog.details.status')}</Text>
                          <Text color={highlightedModel.modelInfo.available ? Colors.AccentGreen : Colors.AccentRed}>
                            {highlightedModel.modelInfo.available ? t('model.dialog.details.available') : t('model.dialog.details.unavailable')}
                          </Text>
                        </Text>
                      </>
                    );
                  })()
                ) : (
                  /* 云端模型显示 */
                  <>
                    <Text>
                      <Text bold>{t('model.dialog.details.name')}</Text>
                      <Text>{highlightedModel.modelInfo.displayName}</Text>
                    </Text>
                    <Text>
                      <Text bold>{t('model.dialog.details.cost')}</Text>
                      <Text color={Colors.AccentYellow}>{String(highlightedModel.modelInfo.creditsPerRequest)}x credits</Text>
                    </Text>
                    {highlightedModel.modelInfo.maxToken && highlightedModel.modelInfo.maxToken > 0 && (
                      <Text>
                        <Text bold>{t('model.dialog.details.context')}</Text>
                        <Text>{highlightedModel.modelInfo.maxToken.toLocaleString()} tokens</Text>
                      </Text>
                    )}
                    {highlightedModel.modelInfo.highVolumeThreshold && highlightedModel.modelInfo.highVolumeThreshold > 0 && (
                      <Text>
                        <Text bold>{t('model.dialog.details.long.context')}</Text>
                        <Text>
                          {`>${highlightedModel.modelInfo.highVolumeThreshold.toLocaleString()} tokens: `}
                          <Text color={Colors.AccentYellow}>{String(highlightedModel.modelInfo.highVolumeCredits)}x credits</Text>
                        </Text>
                      </Text>
                    )}
                    <Text>
                      <Text bold>{t('model.dialog.details.status')}</Text>
                      <Text color={highlightedModel.modelInfo.available ? Colors.AccentGreen : Colors.AccentRed}>
                        {highlightedModel.modelInfo.available ? t('model.dialog.details.available') : t('model.dialog.details.unavailable')}
                      </Text>
                    </Text>
                  </>
                )}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {!loading && !error && (
        <Box marginTop={1} flexDirection="column">
          <Text color={Colors.Gray}>
            {tp('model.dialog.total', { count: modelItems.filter(item => item.value !== '__management__').length })}
          </Text>
          <Text color={Colors.Gray} wrap="truncate">
            {smallWindowConfig.sizeLevel === WindowSizeLevel.TINY
              ? t('model.dialog.hint.tiny')
              : t('model.dialog.hint.normal')
            }
          </Text>
        </Box>
      )}
    </Box>
  );
}