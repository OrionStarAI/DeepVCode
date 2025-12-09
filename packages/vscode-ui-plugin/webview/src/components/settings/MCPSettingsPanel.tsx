/**
 * MCP Settings Panel Component
 * MCP服务器管理面板组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
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
}

interface MCPSettingsPanelProps {
  /** MCP 服务器状态列表 */
  mcpServers: MCPServerInfo[];
  /** MCP 发现状态 */
  discoveryState: 'not_started' | 'in_progress' | 'completed';
  /** 打开配置文件的回调 */
  onOpenSettings: () => void;
}

// =============================================================================
// MCP设置面板
// =============================================================================

export const MCPSettingsPanel: React.FC<MCPSettingsPanelProps> = ({
  mcpServers,
  discoveryState,
  onOpenSettings
}) => {

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
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      default:
        return 'Unknown';
    }
  };

  // 获取发现状态文本
  const getDiscoveryStateText = () => {
    switch (discoveryState) {
      case 'not_started':
        return 'Not Started';
      case 'in_progress':
        return 'Discovering...';
      case 'completed':
        return 'Completed';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="mcp-settings-panel">
      {/* 页面标题 */}
      <div className="settings-panel__header">
        <h2 className="settings-panel__title">
          MCP Server Management
        </h2>
        <p className="settings-panel__description">
          Model Context Protocol (MCP) servers extend AI capabilities by providing additional tools and resources.
        </p>
      </div>

      {/* MCP服务器状态概览 */}
      <SettingGroup
        title="Server Status"
        description={`Discovery: ${getDiscoveryStateText()}`}
      >
        {mcpServers.length === 0 ? (
          <div className="mcp-empty-state">
            <div className="mcp-empty-state__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <p className="mcp-empty-state__title">No MCP Servers Configured</p>
            <p className="mcp-empty-state__description">
              Configure MCP servers in settings.json to extend AI capabilities.
            </p>
            <button
              className="mcp-empty-state__button"
              onClick={onOpenSettings}
            >
              Open Settings
            </button>
          </div>
        ) : (
          <div className="mcp-server-list">
            {mcpServers.map((server) => (
              <div key={server.name} className="mcp-server-item">
                <div className="mcp-server-item__header">
                  <div className="mcp-server-item__name-row">
                    <span
                      className={`mcp-server-item__status-indicator ${getStatusClass(server.status)}`}
                      title={getStatusText(server.status)}
                    >
                      {getStatusIcon(server.status)}
                    </span>
                    <span className="mcp-server-item__name">{server.name}</span>
                  </div>
                  <span className={`mcp-server-item__status-text ${getStatusClass(server.status)}`}>
                    {getStatusText(server.status)}
                  </span>
                </div>

                <div className="mcp-server-item__details">
                  <div className="mcp-server-item__detail">
                    <span className="mcp-server-item__detail-label">Tools:</span>
                    <span className="mcp-server-item__detail-value">{server.toolCount}</span>
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

                {server.error && (
                  <div className="mcp-server-item__error">
                    <span className="mcp-server-item__error-icon">!</span>
                    <span className="mcp-server-item__error-text">{server.error}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingGroup>

      {/* 配置管理 */}
      <SettingGroup
        title="Configuration"
        description="Manage MCP server settings"
      >
        <div className="mcp-config-actions">
          <button
            className="mcp-config-button"
            onClick={onOpenSettings}
          >
            <svg className="mcp-config-button__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span className="mcp-config-button__text">Edit Configuration File</span>
          </button>

          <div className="mcp-config-info">
            <p className="mcp-config-info__text">
              Configuration file: <code>~/.deepv/settings.json</code>
            </p>
            <p className="mcp-config-info__text mcp-config-info__text--muted">
              Changes require restarting VS Code to take effect.
            </p>
          </div>
        </div>
      </SettingGroup>

      {/* 帮助信息 */}
      <div className="mcp-help-section">
        <h3 className="mcp-help-section__title">About MCP Servers</h3>
        <div className="mcp-help-section__content">
          <p>
            MCP (Model Context Protocol) allows AI to access external tools and services.
            Each server provides specialized capabilities like file system access, database queries, or API integrations.
          </p>
          <p className="mcp-help-section__learn-more">
            Learn more: <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">modelcontextprotocol.io</a>
          </p>
        </div>
      </div>
    </div>
  );
};