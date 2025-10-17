/**
 * YOLO Mode Settings Dialog Component
 * YOLO模式设置对话框组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState } from 'react';
import { useYoloMode } from '../hooks/useProjectSettings';
import { useTranslation } from '../hooks/useTranslation';
import { ExecutionSettingsPanel } from './settings/ExecutionSettingsPanel';
import './ProjectSettingsDialog.css';

// =============================================================================
// 组件接口
// =============================================================================

interface YoloModeSettingsDialogProps {
  /** 是否显示对话框 */
  isOpen: boolean;

  /** 关闭对话框回调 */
  onClose: () => void;
}

// =============================================================================
// 主组件
// =============================================================================

export const YoloModeSettingsDialog: React.FC<YoloModeSettingsDialogProps> = ({
  isOpen,
  onClose
}) => {
  const { t } = useTranslation();
  const {
    yoloMode: originalYoloMode,
    updateYoloMode,
    loadYoloMode,
    isLoading,
    error
  } = useYoloMode();

  const [currentYoloMode, setCurrentYoloMode] = useState<boolean>(originalYoloMode);

  // 监控原始YOLO模式变化，同步到本地状态
  React.useEffect(() => {
    if (isOpen) {
      // 🎯 对话框打开时主动刷新底层数据
      loadYoloMode();
      setCurrentYoloMode(originalYoloMode);
    }
  }, [isOpen, originalYoloMode, loadYoloMode]);

  // 计算是否有变化
  const hasChanges = currentYoloMode !== originalYoloMode;

  // =============================================================================
  // 事件处理
  // =============================================================================

  /**
   * 处理保存设置
   */
  const handleSave = async () => {
    try {
      // 保存当前设置到后端
      await updateYoloMode(currentYoloMode);
      onClose();
    } catch (error) {
      console.error('Failed to save YOLO mode:', error);
    }
  };

  /**
   * 处理取消
   */
  const handleCancel = () => {
    if (hasChanges) {
      try {
        const confirmed = window.confirm('YOLO mode has been modified. Are you sure you want to discard changes?');
        if (!confirmed) return;
        // 恢复到原始设置
        setCurrentYoloMode(originalYoloMode);
      } catch (error) {
        console.warn('Confirm dialog failed, closing anyway:', error);
        // 即使确认对话框失败，也要恢复原始设置
        setCurrentYoloMode(originalYoloMode);
      }
    }
    onClose();
  };

  /**
   * 处理键盘事件
   */
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleCancel();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      handleSave();
    }
  };

  // =============================================================================
  // 渲染
  // =============================================================================

  if (!isOpen) return null;

  return (
    <div className="project-settings-dialog__backdrop" onClick={handleCancel}>
      <div
        className="project-settings-dialog yolo-mode-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* 对话框头部 */}
        <div className="project-settings-dialog__header">
          <h2 className="project-settings-dialog__title">
            <span className="project-settings-dialog__title-icon">🚀</span>
            YOLO模式设置
          </h2>
          <button
            className="project-settings-dialog__close-btn"
            onClick={handleCancel}
            title="Close Settings"
          >
            ✕
          </button>
        </div>

        {/* 对话框主体 */}
        <div className="project-settings-dialog__body yolo-mode-body">
          {/* 错误提示 */}
          {error && (
            <div className="project-settings-dialog__error">
              <span className="project-settings-dialog__error-icon">⚠️</span>
              {error}
            </div>
          )}

          {/* 设置面板 */}
          <div className="project-settings-dialog__panel yolo-mode-panel">
            <ExecutionSettingsPanel
              yoloMode={currentYoloMode}
              onYoloModeChange={setCurrentYoloMode}
            />
          </div>
        </div>

        {/* 对话框底部 */}
        <div className="project-settings-dialog__footer">
          <div className="project-settings-dialog__footer-left">
            {/* 可以添加重置YOLO模式的按钮 */}
          </div>

          <div className="project-settings-dialog__footer-right">
            <button
              className="project-settings-dialog__cancel-btn"
              onClick={handleCancel}
              disabled={isLoading}
            >
              取消
            </button>
            <button
              className={`project-settings-dialog__save-btn ${
                hasChanges ? 'project-settings-dialog__save-btn--highlight' : ''
              }`}
              onClick={handleSave}
              disabled={isLoading || !hasChanges}
            >
              {isLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// 兼容性导出
// =============================================================================

/** @deprecated 使用 YoloModeSettingsDialog 替代 */
export const ProjectSettingsDialog = YoloModeSettingsDialog;