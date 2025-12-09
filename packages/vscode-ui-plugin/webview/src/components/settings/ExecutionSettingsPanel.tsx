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
          Execution Settings
        </h2>
        <p className="settings-panel__description">
          Control AI assistant execution behavior. YOLO mode reduces confirmation steps for faster operation.
        </p>
      </div>

      {/* YOLO模式设置组 */}
      <SettingGroup
        title="YOLO Mode"
        description="Fast execution mode with fewer confirmation prompts"
      >
        <BooleanSettingItem
          id="yolo-mode"
          label="Enable YOLO Mode"
          description="When enabled, AI will execute operations more proactively with fewer confirmation dialogs. Recommended for experienced users."
          value={yoloMode}
          onChange={(value) => onYoloModeChange(value)}
        />
      </SettingGroup>

      {/* YOLO模式说明 */}
      <div className="settings-panel__info-box">
        <div className="settings-panel__info-header">
          <svg className="settings-panel__info-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 4v4M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <strong>Mode Comparison</strong>
        </div>
        <ul className="settings-panel__info-list">
          <li><strong>Default Mode</strong>: AI requests confirmation before critical operations for safety.</li>
          <li><strong>YOLO Mode</strong>: AI executes operations proactively, suitable for experienced users.</li>
          <li><strong>Safety</strong>: Dangerous operations (e.g., file deletion) still require confirmation in either mode.</li>
        </ul>
      </div>

      {/* 风险提示 */}
      {yoloMode && (
        <div className="settings-panel__warning-box">
          <div className="settings-panel__warning-header">
            <svg className="settings-panel__warning-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
            </svg>
            <strong>Notice</strong>
          </div>
          <p className="settings-panel__warning-text">
            YOLO mode is enabled. AI will execute operations more proactively.
            You can disable this mode at any time if needed.
          </p>
        </div>
      )}
    </div>
  );
};