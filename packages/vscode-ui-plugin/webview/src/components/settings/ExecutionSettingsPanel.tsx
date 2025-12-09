/**
 * Execution Settings Panel Component
 * 执行设置面板组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
import { BooleanSettingItem } from './SettingItem';
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
    </div>
  );
};