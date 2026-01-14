/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { CustomModelWizard } from './CustomModelWizard.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { Config, CustomModelConfig } from 'deepv-code-core';
import { deleteCustomModel, loadCustomModels } from '../../config/customModelsStorage.js';
import { t, tp } from '../utils/i18n.js';

interface ModelManagementMenuProps {
  /** Callback when management is complete (returns true if models were modified) */
  onComplete: (modelsModified: boolean) => void;

  /** Callback when user cancels */
  onCancel: () => void;

  /** Settings object */
  settings: LoadedSettings;

  /** Config object */
  config: Config;
}

type MenuState = 'main' | 'add' | 'delete' | 'confirm-delete';

export function ModelManagementMenu({
  onComplete,
  onCancel,
  settings,
  config,
}: ModelManagementMenuProps): React.JSX.Element {
  const [menuState, setMenuState] = useState<MenuState>('main');
  const [selectedModelToDelete, setSelectedModelToDelete] = useState<CustomModelConfig | null>(null);
  const [modelsModified, setModelsModified] = useState(false);

  // 主菜单选项
  const mainMenuItems = [
    { label: t('model.management.add.custom'), value: 'add' },
    { label: t('model.management.delete.custom'), value: 'delete' },
    { label: t('model.management.back'), value: 'back' },
  ];

  // 处理主菜单选择
  const handleMainMenuSelect = useCallback((value: string) => {
    if (value === 'back') {
      onComplete(modelsModified);
    } else if (value === 'add') {
      setMenuState('add');
    } else if (value === 'delete') {
      setMenuState('delete');
    }
  }, [modelsModified, onComplete]);

  // 处理添加模型完成
  const handleAddComplete = useCallback((newModel: CustomModelConfig | null) => {
    if (newModel) {
      setModelsModified(true);
    }
    setMenuState('main');
  }, []);

  // 处理添加模型取消
  const handleAddCancel = useCallback(() => {
    setMenuState('main');
  }, []);

  // 获取所有自定义模型
  const customModels = config.getCustomModels() || [];

  // 删除模型列表
  const deleteMenuItems = [
    ...customModels.map((model) => ({
      label: `${model.displayName} (${model.provider})`,
      value: model.displayName,
      model,
    })),
    { label: t('model.management.back'), value: '__back__', model: null as any },
  ];

  // 处理删除菜单选择
  const handleDeleteMenuSelect = useCallback((value: string) => {
    if (value === '__back__') {
      setMenuState('main');
      return;
    }

    const modelToDelete = customModels.find(m => m.displayName === value);
    if (modelToDelete) {
      setSelectedModelToDelete(modelToDelete);
      setMenuState('confirm-delete');
    }
  }, [customModels]);

  // 确认删除选项
  const confirmDeleteItems = [
    { label: t('model.management.delete.confirm.yes'), value: 'yes' },
    { label: t('model.management.delete.confirm.no'), value: 'no' },
  ];

  // 处理删除确认
  const handleConfirmDelete = useCallback((value: string) => {
    if (value === 'yes' && selectedModelToDelete) {
      const deletedModelId = `custom:${selectedModelToDelete.displayName}`;

      // 删除模型（使用独立存储系统）
      const deleted = deleteCustomModel(deletedModelId);

      if (deleted) {
        setModelsModified(true);

        // 🔥 热重载：立即更新 Config 实例
        const updatedModels = loadCustomModels();
        config.setCustomModels(updatedModels);
        console.log(`[ModelManagement] Deleted model: ${deletedModelId}`);

        // 检查是否删除的是当前模型
        const currentModel = settings.merged.preferredModel;

        if (currentModel === deletedModelId) {
          // 尝试切换到其他自定义模型
          if (updatedModels.length > 0) {
            // 切换到下一个自定义模型
            const nextModel = `custom:${updatedModels[0].displayName}`;
            settings.setValue(SettingScope.User, 'preferredModel', nextModel);
            console.log(`[ModelManagement] Switched to next custom model: ${nextModel}`);
          } else {
            // 没有其他自定义模型了，切换回 auto
            settings.setValue(SettingScope.User, 'preferredModel', 'auto');
            console.log('[ModelManagement] Switched to auto model (last custom model deleted)');
          }
        }
      }
    }

    setSelectedModelToDelete(null);
    setMenuState('delete');
  }, [selectedModelToDelete, config, settings]);

  // 渲染不同的菜单状态
  if (menuState === 'add') {
    return (
      <CustomModelWizard
        onComplete={handleAddComplete}
        onCancel={handleAddCancel}
      />
    );
  }

  if (menuState === 'confirm-delete' && selectedModelToDelete) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold color={Colors.AccentYellow}>
          {t('model.management.delete.confirm.title')}
        </Text>
        <Box marginTop={1}>
          <Text>
            {tp('model.management.delete.confirm.message' as any, { model: selectedModelToDelete.displayName })}
          </Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={confirmDeleteItems}
            initialIndex={1}
            onSelect={handleConfirmDelete}
            onHighlight={() => {}}
            isFocused={true}
          />
        </Box>
      </Box>
    );
  }

  if (menuState === 'delete') {
    if (customModels.length === 0) {
      return (
        <Box
          borderStyle="round"
          borderColor={Colors.Gray}
          flexDirection="column"
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Text bold>{'>'} {t('model.management.delete.title')}</Text>
          <Box marginTop={1}>
            <Text color={Colors.Gray}>{t('model.management.delete.no.models')}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={Colors.Gray}>{t('model.management.delete.hint.back')}</Text>
          </Box>
        </Box>
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
      >
        <Text bold>{'>'} {t('model.management.delete.title')}</Text>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={deleteMenuItems}
            initialIndex={0}
            onSelect={handleDeleteMenuSelect}
            onHighlight={() => {}}
            isFocused={true}
          />
        </Box>
        <Box marginTop={1}>
          <Text color={Colors.Gray}>{t('model.management.delete.hint')}</Text>
        </Box>
      </Box>
    );
  }

  // Main menu
  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
    >
      <Text bold>{'>'} {t('model.management.title')}</Text>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={mainMenuItems}
          initialIndex={0}
          onSelect={handleMainMenuSelect}
          onHighlight={() => {}}
          isFocused={true}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>{t('model.management.hint')}</Text>
      </Box>
    </Box>
  );
}
