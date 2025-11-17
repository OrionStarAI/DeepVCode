/**
 * Version History Button Component
 * 版本历史按钮组件 - 显示在聊天界面顶部
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';

// VSCode API - 使用全局对象
declare const window: Window & {
  vscode: {
    postMessage: (message: any) => void;
  };
};

interface VersionHistoryButtonProps {
  sessionId: string;
  className?: string;
}

/**
 * 版本历史按钮组件
 * 提供快速访问版本控制功能的入口
 */
export const VersionHistoryButton: React.FC<VersionHistoryButtonProps> = ({
  sessionId,
  className = ''
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  /**
   * 显示版本时间线
   */
  const handleShowTimeline = useCallback(() => {
    window.vscode.postMessage({
      type: 'version_timeline_request',
      payload: { sessionId }
    });
    setIsOpen(false);
  }, [sessionId]);

  /**
   * 回退到上一版本
   */
  const handleRevertPrevious = useCallback(() => {
    window.vscode.postMessage({
      type: 'version_revert_previous',
      payload: { sessionId }
    });
    setIsOpen(false);
  }, [sessionId]);

  /**
   * 切换下拉菜单
   */
  const toggleMenu = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return (
    <div className={`version-history-dropdown ${className}`} style={{ position: 'relative' }}>
      {/* 主按钮 */}
      <button
        className="version-history-button"
        onClick={toggleMenu}
        title={t('versionHistory.tooltip') || 'Version History'}
        style={{
          padding: '4px 12px',
          borderRadius: '4px',
          border: '1px solid var(--vscode-button-border, transparent)',
          background: 'var(--vscode-button-secondaryBackground)',
          color: 'var(--vscode-button-secondaryForeground)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '13px',
          fontFamily: 'var(--vscode-font-family)',
        }}
      >
        <span className="codicon codicon-history" />
        <span>{t('versionHistory.title') || 'Version History'}</span>
        <span className={`codicon codicon-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '10px' }} />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div
          className="version-history-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: '220px',
            background: 'var(--vscode-dropdown-background)',
            border: '1px solid var(--vscode-dropdown-border)',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            overflow: 'hidden'
          }}
        >
          {/* 菜单项 - 查看时间线 */}
          <button
            className="version-menu-item"
            onClick={handleShowTimeline}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--vscode-foreground)',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontFamily: 'var(--vscode-font-family)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span className="codicon codicon-timeline-view-icon" />
            <span>{t('versionHistory.showTimeline') || 'Show Timeline'}</span>
          </button>

          {/* 分隔线 */}
          <div style={{
            height: '1px',
            background: 'var(--vscode-dropdown-border)',
            margin: '4px 0'
          }} />

          {/* 菜单项 - 回退到上一版本 */}
          <button
            className="version-menu-item"
            onClick={handleRevertPrevious}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--vscode-foreground)',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontFamily: 'var(--vscode-font-family)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span className="codicon codicon-discard" />
            <span>{t('versionHistory.revertPrevious') || 'Revert to Previous'}</span>
          </button>
        </div>
      )}

      {/* 点击外部关闭菜单 */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999
          }}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
