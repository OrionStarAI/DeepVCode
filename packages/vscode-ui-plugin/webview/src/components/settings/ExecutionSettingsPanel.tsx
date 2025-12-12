/**
 * Execution Settings Panel Component
 * 执行设置面板组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
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
  /** 可用模型列表 */
  availableModels: any[];
}

export const ExecutionSettingsPanel: React.FC<ExecutionSettingsPanelProps> = ({
  yoloMode,
  onYoloModeChange,
  preferredModel,
  onPreferredModelChange,
  availableModels
}) => {

  // 构造模型选项，确保 Auto 在第一位且不重复
  const otherModels = availableModels.filter(m => m.name !== 'auto');

  const modelOptions = [
    { label: 'Auto', value: 'auto', description: 'Automatically select the best model' },
    ...otherModels.map(model => ({
      label: model.displayName || model.name,
      value: model.name,
      description: model.description
    }))
  ];

  return (
    <div className="execution-settings-panel">
      {/* 页面标题 */}
      <div className="settings-panel__header">
        <h2 className="settings-panel__title">
          Execution
        </h2>
      </div>

      {/* YOLO模式开关 */}
      <div className="execution-settings-panel__yolo-section">
        <BooleanSettingItem
          id="yolo-mode"
          label="YOLO Mode"
          description="Skip confirmations for file edits and shell commands. Dangerous operations still require approval."
          value={yoloMode}
          onChange={(value) => onYoloModeChange(value)}
        />
      </div>

      {/* 默认模型选择 */}
      <div className="execution-settings-panel__model-section" style={{ marginTop: '20px' }}>
        <SelectSettingItem
          id="preferred-model"
          label="Default Model"
          description="The default AI model to use for new sessions."
          value={preferredModel}
          onChange={(value) => onPreferredModelChange(value)}
          options={modelOptions}
        />
      </div>
    </div>
  );
};