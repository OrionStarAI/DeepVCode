/**
 * Settings Dialog Component
 * 设置对话框组件（包含 YOLO 模式和 MCP 管理）
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState } from 'react';
import { useYoloMode } from '../hooks/useProjectSettings';
import { useTranslation } from '../hooks/useTranslation';
import { ExecutionSettingsPanel } from './settings/ExecutionSettingsPanel';
import { MCPSettingsPanel } from './settings/MCPSettingsPanel';
import { webviewModelService } from '../services/webViewModelService';
import './ProjectSettingsDialog.css';

// =============================================================================
// 组件接口
// =============================================================================

interface MCPServerInfo {
  name: string;
  status: 'disconnected' | 'connecting' | 'connected';
  toolCount: number;
  error?: string;
  enabled?: boolean; // 是否启用（控制工具是否注册给 AI）
}

interface YoloModeSettingsDialogProps {
  /** 是否显示对话框 */
  isOpen: boolean;

  /** 关闭对话框回调 */
  onClose: () => void;

  /** MCP 服务器状态列表 */
  mcpServers?: MCPServerInfo[];

  /** MCP 发现状态 */
  mcpDiscoveryState?: 'not_started' | 'in_progress' | 'completed';

  /** 是否已收到 MCP 状态 */
  mcpStatusLoaded?: boolean;

  /** 切换 MCP 启用状态的回调 */
  onToggleMcpEnabled?: (serverName: string, enabled: boolean) => void;
}

type SettingsTab = 'execution' | 'mcp';

// =============================================================================
// 主组件
// =============================================================================

export const YoloModeSettingsDialog: React.FC<YoloModeSettingsDialogProps> = ({
  isOpen,
  onClose,
  mcpServers = [],
  mcpDiscoveryState = 'not_started',
  mcpStatusLoaded = false,
  onToggleMcpEnabled
}) => {
  const { t } = useTranslation();
  const {
    yoloMode: originalYoloMode,
    preferredModel: originalPreferredModel,
    updateYoloMode,
    updatePreferredModel,
    loadYoloMode,
    isLoading,
    error
  } = useYoloMode();

  const [activeTab, setActiveTab] = useState<SettingsTab>('execution');
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  // 🎯 对话框打开时初始化数据（仅在isOpen改变时触发）
  React.useEffect(() => {
    if (isOpen) {
      console.log('[YOLO] Dialog opened, initializing settings');
      // 加载最新的设置
      loadYoloMode();

      // 获取可用模型
      webviewModelService.getAvailableModels().then(models => {
        setAvailableModels(models);
      }).catch(err => {
        console.error('Failed to load models:', err);
      });
    }
  }, [isOpen, loadYoloMode]);

  // =============================================================================
  // 事件处理
  // =============================================================================

  /**
   * 处理YOLO模式改变 - 直接生效
   */
  const handleYoloModeChange = async (enabled: boolean) => {
    console.log('[YOLO] YOLO mode toggle changed, immediately updating:', enabled);
    try {
      await updateYoloMode(enabled);
    } catch (error) {
      console.error('[YOLO] Failed to update YOLO mode:', error);
    }
  };

  /**
   * 处理默认模型改变 - 直接生效
   */
  const handlePreferredModelChange = async (model: string) => {
    console.log('[YOLO] Preferred model changed, immediately updating:', model);
    try {
      await updatePreferredModel(model);
    } catch (error) {
      console.error('[YOLO] Failed to update preferred model:', error);
    }
  };

  /**
   * 处理关闭对话框
   */
  const handleCancel = () => {
    console.log('[YOLO] Dialog closed');
    onClose();
  };

  /**
   * 处理键盘事件
   */
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleCancel();
    }
  };

  /**
   * 打开 MCP 配置文件
   */
  const handleOpenMCPSettings = () => {
    // 发送消息给扩展打开配置文件
    window.vscode?.postMessage({
      type: 'open_mcp_settings',
      payload: {}
    });
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
            Settings
          </h2>
          <button
            className="project-settings-dialog__close-btn"
            onClick={handleCancel}
            title="Close Settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
            </svg>
          </button>
        </div>

        {/* 标签页导航 */}
        <div className="project-settings-dialog__tabs">
          <button
            className={`project-settings-dialog__tab ${activeTab === 'execution' ? 'project-settings-dialog__tab--active' : ''}`}
            onClick={() => setActiveTab('execution')}
          >
            Execution
          </button>
          <button
            className={`project-settings-dialog__tab ${activeTab === 'mcp' ? 'project-settings-dialog__tab--active' : ''}`}
            onClick={() => setActiveTab('mcp')}
          >
            MCP Servers
          </button>
        </div>

        {/* 对话框主体 */}
        <div className="project-settings-dialog__body yolo-mode-body">
          {/* 错误提示 */}
          {error && activeTab === 'execution' && (
            <div className="project-settings-dialog__error">
              <svg className="project-settings-dialog__error-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
              </svg>
              {error}
            </div>
          )}

          {/* 设置面板 */}
          <div className="project-settings-dialog__panel yolo-mode-panel">
            {activeTab === 'execution' && (
              <ExecutionSettingsPanel
                yoloMode={originalYoloMode}
                onYoloModeChange={handleYoloModeChange}
                preferredModel={originalPreferredModel}
                onPreferredModelChange={handlePreferredModelChange}
                availableModels={availableModels}
              />
            )}
            {activeTab === 'mcp' && (
              <MCPSettingsPanel
                mcpServers={mcpServers}
                discoveryState={mcpDiscoveryState}
                statusLoaded={mcpStatusLoaded}
                onOpenSettings={handleOpenMCPSettings}
                onToggleEnabled={onToggleMcpEnabled}
              />
            )}
          </div>
        </div>

        {/* 对话框底部 - 仅有Close按钮，YOLO模式toggle直接生效 */}
        {activeTab === 'execution' && (
          <div className="project-settings-dialog__footer">
            <div className="project-settings-dialog__footer-left">
              {/* 可以添加帮助信息 */}
            </div>

            <div className="project-settings-dialog__footer-right">
              <button
                className="project-settings-dialog__cancel-btn"
                onClick={handleCancel}
                disabled={isLoading}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// 兼容性导出
// =============================================================================

/** @deprecated 使用 YoloModeSettingsDialog 替代 */
export const ProjectSettingsDialog = YoloModeSettingsDialog;