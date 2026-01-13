/**
 * Execution Settings Panel Component
 * 执行设置面板组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { BooleanSettingItem, SelectSettingItem } from './SettingItem';
import './SettingItem.css';
import './SettingsPanel.css';

// =============================================================================
// 执行设置面板
// =============================================================================

interface ExecutionSettingsPanelProps {
  /** YOLO模式状态 */
  yoloMode: boolean;
  /** YOLO模式状态更新回调 */
  onYoloModeChange: (value: boolean) => void;
  /** 默认模型 */
  preferredModel: string;
  /** 默认模型更新回调 */
  onPreferredModelChange: (value: string) => void;
  /** 健康使用提醒 */
  healthyUse: boolean;
  /** 健康使用提醒更新回调 */
  onHealthyUseChange: (value: boolean) => void;
  /** 可用模型列表 */
  availableModels: any[];
}

export const ExecutionSettingsPanel: React.FC<ExecutionSettingsPanelProps> = ({
  yoloMode,
  onYoloModeChange,
  preferredModel,
  onPreferredModelChange,
  healthyUse,
  onHealthyUseChange,
  availableModels
}) => {
  const { t } = useTranslation();

  // 构造模型选项，确保 Auto 在第一位且不重复，其余按字母排序
  const otherModels = availableModels
    .filter(m => m.name !== 'auto')
    .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));

  const modelOptions = [
    { label: t('settings.general.autoModel'), value: 'auto', description: t('settings.general.autoModelDesc') },
    ...otherModels.map(model => ({
      label: model.displayName || model.name,
      value: model.name,
      description: model.description
    }))
  ];

  return (
    <div className="execution-settings-panel">
      {/* YOLO模式开关 - 直接生效，不需要Save按钮 */}
      <div className="execution-settings-panel__yolo-section">
        <BooleanSettingItem
          id="yolo-mode"
          label={t('settings.general.yoloLabel')}
          description={t('settings.general.yoloDesc')}
          value={yoloMode}
          onChange={(value) => {
            console.log('[YOLO] Toggle changed, immediately updating:', value);
            onYoloModeChange(value);
          }}
        />
      </div>

      {/* 健康使用提醒开关 */}
      <div className="execution-settings-panel__healthy-section" style={{ marginTop: '20px' }}>
        <BooleanSettingItem
          id="healthy-use"
          label={t('settings.general.healthyUseLabel') || '健康使用提醒'}
          description={t('settings.general.healthyUseDesc') || '开启深夜（22:00 - 06:00）用眼健康提醒'}
          value={healthyUse}
          onChange={(value) => {
            onHealthyUseChange(value);
          }}
        />
      </div>

      {/* 默认模型选择 */}
      <div className="execution-settings-panel__model-section" style={{ marginTop: '20px' }}>
        <SelectSettingItem
          id="preferred-model"
          label={t('settings.general.modelLabel')}
          description={t('settings.general.modelDesc')}
          value={preferredModel}
          onChange={(value) => onPreferredModelChange(value)}
          options={modelOptions}
        />
      </div>
    </div>
  );
};