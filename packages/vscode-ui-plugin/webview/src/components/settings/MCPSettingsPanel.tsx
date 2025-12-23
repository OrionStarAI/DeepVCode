/**
 * MCP Settings Panel Component
 * MCP服务器管理面板组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { SettingGroup } from './SettingItem';
import './SettingItem.css';
import './SettingsPanel.css';
import './MCPSettings.css';

// =============================================================================
// 类型定义
// =============================================================================

interface MCPServerInfo {
  name: string;
  status: 'disconnected' | 'connecting' | 'connected';
  toolCount: number;
  toolNames?: string[];
  error?: string;
  enabled?: boolean; // 是否启用（控制工具是否注册给 AI）
}

interface MCPSettingsPanelProps {
  /** MCP 服务器状态列表 */
  mcpServers: MCPServerInfo[];
  /** MCP 发现状态 */
  discoveryState: 'not_started' | 'in_progress' | 'completed';
  /** 是否已收到 MCP 状态（用于区分加载中和真正没有配置） */
  statusLoaded?: boolean;
  /** 打开配置文件的回调 */
  onOpenSettings: () => void;
  /** 切换 MCP 启用状态的回调 */
  onToggleEnabled?: (serverName: string, enabled: boolean) => void;
}

// =============================================================================
// MCP设置面板
// =============================================================================

export const MCPSettingsPanel: React.FC<MCPSettingsPanelProps> = ({
  mcpServers,
  discoveryState,
  statusLoaded = false,
  onOpenSettings,
  onToggleEnabled
}) => {
  const { t } = useTranslation();
  const isLoading = mcpServers.length === 0 && !statusLoaded;
  const isEmpty = mcpServers.length === 0 && statusLoaded;

  console.log('🔌 [MCPSettingsPanel] Render:', {
    mcpServersLength: mcpServers?.length,
    mcpServersValue: JSON.stringify(mcpServers),
    discoveryState,
    statusLoaded,
    isLoading,
    isEmpty
  });

  // 获取状态图标
  const getStatusIcon = (status: MCPServerInfo['status']) => {
    switch (status) {
      case 'connected':
        return '●'; // 实心圆点
      case 'connecting':
        return '○'; // 空心圆点
      case 'disconnected':
        return '✕'; // X号
      default:
        return '?';
    }
  };

  // 获取状态颜色类名
  const getStatusClass = (status: MCPServerInfo['status']) => {
    switch (status) {
      case 'connected':
        return 'mcp-status--connected';
      case 'connecting':
        return 'mcp-status--connecting';
      case 'disconnected':
        return 'mcp-status--disconnected';
      default:
        return '';
    }
  };

  // 获取状态文本
  const getStatusText = (status: MCPServerInfo['status']) => {
    switch (status) {
      case 'connected':
        return t('mcp.status.connected');
      case 'connecting':
        return t('mcp.status.connecting');
      case 'disconnected':
        return t('mcp.status.disconnected');
      default:
        return t('mcp.status.unknown');
    }
  };

  // 获取发现状态文本
  const getDiscoveryStateText = () => {
    switch (discoveryState) {
      case 'not_started':
        return t('mcp.discovery.notStarted');
      case 'in_progress':
        return t('mcp.discovery.discovering');
      case 'completed':
        return t('mcp.discovery.completed');
      default:
        return t('mcp.status.unknown');
    }
  };

  return (
    <div className="mcp-settings-panel">
      {/* MCP服务器状态概览 */}
      <div className="mcp-servers-section">
        {mcpServers.length === 0 && !statusLoaded ? (
          // 还没收到后端响应，显示加载中
          <div className="mcp-empty-state mcp-empty-state--loading">
            <div className="mcp-empty-state__icon mcp-empty-state__icon--loading">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12"/>
              </svg>
            </div>
            <p className="mcp-empty-state__title">{t('mcp.loading')}</p>
            <p className="mcp-empty-state__description">
              {t('mcp.discovering')}
            </p>
          </div>
        ) : mcpServers.length === 0 ? (
          // 真正没有配置
          <div className="mcp-empty-state">
            <div className="mcp-empty-state__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <p className="mcp-empty-state__title">{t('mcp.noServers')}</p>
            <p className="mcp-empty-state__description">
              {t('mcp.noServersDesc')}
            </p>
            <button
              className="mcp-empty-state__button"
              onClick={onOpenSettings}
            >
              {t('mcp.openSettings')}
            </button>
          </div>
        ) : (
          <div className="mcp-server-list">
            {mcpServers.map((server) => {
              const isEnabled = server.enabled !== false; // 默认启用
              return (
                <div key={server.name} className={`mcp-server-item ${!isEnabled ? 'mcp-server-item--disabled' : ''}`}>
                  <div className="mcp-server-item__header">
                    <div className="mcp-server-item__name-row">
                      {/* 只在启用时显示状态指示器 */}
                      {isEnabled && (
                        <span
                          className={`mcp-server-item__status-indicator ${getStatusClass(server.status)}`}
                          title={getStatusText(server.status)}
                        >
                          {getStatusIcon(server.status)}
                        </span>
                      )}
                      <span className="mcp-server-item__name">{server.name}</span>
                      {!isEnabled && (
                        <span className="mcp-server-item__disabled-badge">{t('mcp.disabled')}</span>
                      )}
                    </div>
                    <div className="mcp-server-item__actions">
                      {/* 只在启用时显示连接状态文本 */}
                      {isEnabled && (
                        <span className={`mcp-server-item__status-text ${getStatusClass(server.status)}`}>
                          {getStatusText(server.status)}
                        </span>
                      )}
                      {/* Toggle 开关 */}
                      <label className="mcp-toggle" title={isEnabled ? t('mcp.disableServer') : t('mcp.enableServer')}>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => onToggleEnabled?.(server.name, e.target.checked)}
                          className="mcp-toggle__input"
                        />
                        <span className="mcp-toggle__slider"></span>
                      </label>
                    </div>
                  </div>

                  {/* 只在启用时显示工具详情 */}
                  {isEnabled && (
                    <div className="mcp-server-item__details">
                      <div className="mcp-server-item__detail">
                        <span className="mcp-server-item__detail-label">{t('mcp.tools')}</span>
                        <span className="mcp-server-item__detail-value">
                          {server.toolCount}
                        </span>
                      </div>
                      {server.toolNames && server.toolNames.length > 0 && (
                        <div className="mcp-server-item__tools">
                          {server.toolNames.map((toolName, index) => (
                            <span key={index} className="mcp-server-item__tool-tag">
                              {toolName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 只在启用时显示错误信息 */}
                  {isEnabled && server.error && (
                    <div className="mcp-server-item__error">
                      <span className="mcp-server-item__error-icon">!</span>
                      <span className="mcp-server-item__error-text">{server.error}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 快速操作按钮 */}
      {mcpServers.length > 0 && (
        <div className="mcp-quick-actions">
          <button
            className="mcp-quick-action-btn"
            onClick={onOpenSettings}
            title={t('mcp.editConfig')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            {t('mcp.settings')}
          </button>
        </div>
      )}
    </div>
  );
};