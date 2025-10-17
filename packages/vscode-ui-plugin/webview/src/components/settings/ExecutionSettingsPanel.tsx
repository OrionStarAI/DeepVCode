/**
 * YOLO Mode Settings Panel Component
 * YOLO模式设置面板组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
import { BooleanSettingItem, SettingGroup } from './SettingItem';
import './SettingItem.css';
import './SettingsPanel.css';

// =============================================================================
// YOLO模式设置面板
// =============================================================================

interface ExecutionSettingsPanelProps {
  /** YOLO模式状态 */
  yoloMode: boolean;
  /** YOLO模式状态更新回调 */
  onYoloModeChange: (value: boolean) => void;
}

export const ExecutionSettingsPanel: React.FC<ExecutionSettingsPanelProps> = ({
  yoloMode,
  onYoloModeChange
}) => {

  return (
    <div className="execution-settings-panel">
      {/* 页面标题 */}
      <div className="settings-panel__header">
        <h2 className="settings-panel__title">
          <span className="settings-panel__title-icon">🚀</span>
          YOLO模式设置
        </h2>
        <p className="settings-panel__description">
          控制AI助手的执行行为，YOLO模式可提升操作效率，减少确认步骤。
        </p>
      </div>

      {/* YOLO模式设置组 */}
      <SettingGroup
        title="YOLO模式"
        icon="⚡"
        description="快速执行模式，减少用户确认步骤，提升效率"
      >
        <BooleanSettingItem
          id="yolo-mode"
          label="启用YOLO模式"
          description="开启后，AI将更积极地执行操作，减少确认对话框。适合熟悉AI助手的用户。"
          value={yoloMode}
          onChange={(value) => onYoloModeChange(value)}
        />
      </SettingGroup>

      {/* YOLO模式说明 */}
      <div className="settings-panel__info-box">
        <div className="settings-panel__info-header">
          <span className="settings-panel__info-icon">💡</span>
          <strong>YOLO模式说明</strong>
        </div>
        <ul className="settings-panel__info-list">
          <li><strong>关闭YOLO模式</strong>：AI会在执行重要操作前请求确认，更加安全保守。</li>
          <li><strong>启用YOLO模式</strong>：AI会更主动地执行操作，适合经验丰富的用户。</li>
          <li><strong>安全保障</strong>：即使在YOLO模式下，危险操作（如删除文件）仍会请求确认。</li>
        </ul>
      </div>

      {/* 风险提示 */}
      {yoloMode && (
        <div className="settings-panel__warning-box">
          <div className="settings-panel__warning-header">
            <span className="settings-panel__warning-icon">⚠️</span>
            <strong>注意事项</strong>
          </div>
          <p className="settings-panel__warning-text">
            YOLO模式已启用。AI将更积极地执行操作，请确保您了解可能的影响。
            如有需要，您可以随时关闭此模式。
          </p>
        </div>
      )}
    </div>
  );
};