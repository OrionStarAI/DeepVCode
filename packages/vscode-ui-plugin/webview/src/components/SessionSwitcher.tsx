/**
 * Session Switcher Component
 * Session切换器UI组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState, useRef, useEffect } from 'react';
import { Edit3, Trash2, Settings, Wrench, Plus, X } from 'lucide-react';
import { SessionInfo } from '../../../src/types/sessionTypes';
import { SessionType, SESSION_UI_CONSTANTS } from '../../../src/constants/sessionConstants';
import { useTranslation } from '../hooks/useTranslation';
import './SessionSwitcher.css';

interface SessionSwitcherProps {
  /** 当前活跃的Session */
  currentSession: SessionInfo | null;

  /** 所有Session列表 */
  sessions: SessionInfo[];

  /** Session切换回调 */
  onSessionSwitch: (sessionId: string) => void;

  /** 创建新Session回调 */
  onCreateSession: (type: SessionType) => void;

  /** Session操作回调 */
  onSessionAction: (action: 'rename' | 'delete' | 'duplicate', sessionId: string) => void;

  /** 获取Session标题的函数 */
  getSessionTitle?: (sessionId: string) => string;

  /** 检查Session是否未使用过（没有聊天历史） */
  isSessionUnused?: (sessionId: string) => boolean;

  /** 是否禁用 */
  disabled?: boolean;

  /** 自定义样式 */
  className?: string;
}

/**
 * SessionSwitcher - Session横向标签切换组件
 *
 * 功能：
 * - 横向滑动的Session标签列表
 * - 点击标签直接切换Session
 * - "+"按钮创建新Session
 * - 使用第一条用户消息作为标题
 * - Session右键操作菜单
 */
export const SessionSwitcher: React.FC<SessionSwitcherProps> = ({
  currentSession,
  sessions,
  onSessionSwitch,
  onCreateSession,
  onSessionAction,
  getSessionTitle,
  isSessionUnused,
  disabled = false,
  className = ''
}) => {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<{
    sessionId: string;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // 关闭右键菜单的点击外部处理
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ESC键关闭菜单
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 当前session变化时自动滚动到该session
  useEffect(() => {
    if (currentSession?.id) {
      console.log('🎯 [SCROLL] Current session changed, scrolling to:', currentSession.id);
      // 使用setTimeout确保DOM已更新
      setTimeout(() => {
        scrollToSession(currentSession.id);
      }, 150); // 增加延迟确保DOM完全更新
    }
  }, [currentSession?.id]);

  // 当sessions列表变化时（例如创建新session），如果有当前session就滚动到它
  useEffect(() => {
    if (currentSession?.id && sessions.length > 0) {
      // 检查新session是否存在于列表中
      const sessionExists = sessions.some(s => s.id === currentSession.id);
      console.log('🎯 [SCROLL] Sessions list changed, current session exists:', sessionExists, 'sessionId:', currentSession.id);
      if (sessionExists) {
        setTimeout(() => {
          scrollToSession(currentSession.id);
        }, 300); // 更长延迟确保新tab已完全渲染和排序
      }
    }
  }, [sessions.length, currentSession?.id, sessions]);

  /**
   * 处理Session切换
   */
  const handleSessionSelect = (sessionId: string) => {
    if (sessionId !== currentSession?.id) {
      onSessionSwitch(sessionId);
    }
  };

  /**
   * 滚动到指定的session标签
   */
  const scrollToSession = (sessionId: string) => {
    if (!tabsContainerRef.current) return;

    const sessionTab = tabsContainerRef.current.querySelector(`[data-session-id="${sessionId}"]`) as HTMLElement;
    if (!sessionTab) {
      console.log('Session tab not found:', sessionId);
      return;
    }

    const container = tabsContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const tabRect = sessionTab.getBoundingClientRect();

    // 计算需要滚动的距离
    const scrollLeft = container.scrollLeft;
    const tabLeft = tabRect.left - containerRect.left + scrollLeft;
    const tabRight = tabLeft + tabRect.width;
    const containerWidth = containerRect.width;

    //console.log('Scrolling to session:', sessionId, { tabLeft, scrollLeft, containerWidth });

    // 对于新创建的session（通常在第一个位置），直接滚动到开始
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === 0) {
      container.scrollTo({
        left: 0,
        behavior: 'smooth'
      });
      return;
    }

    // 如果tab在可视区域外，则滚动到它
    if (tabLeft < scrollLeft) {
      // tab在左边，滚动到tab的左边
      container.scrollTo({
        left: Math.max(0, tabLeft - 10), // 留一点边距，但不能小于0
        behavior: 'smooth'
      });
    } else if (tabRight > scrollLeft + containerWidth) {
      // tab在右边，滚动到tab的右边
      container.scrollTo({
        left: tabRight - containerWidth + 10, // 留一点边距
        behavior: 'smooth'
      });
    }
  };

  /**
   * 处理创建新Session
   * 🎯 直接创建新session，不做智能检查
   * 🎯 立即响应优化：UI立即反馈，后台操作异步进行
   */
  const handleCreateSession = () => {
    console.log('🆕 [+按钮] 创建新Session');
    console.log('🔍 [+按钮] 当前sessions数量:', sessions.length);

    // 🎯 立即滚动到开始位置，给用户即时反馈
    if (tabsContainerRef.current) {
      tabsContainerRef.current.scrollTo({
        left: 0,
        behavior: 'smooth'
      });
    }

    // 🎯 直接创建新session（底层会处理数量限制和踢出逻辑）
    setTimeout(() => {
      onCreateSession(SessionType.CHAT);
    }, 0);
  };

  /**
   * 处理右键菜单
   */
  const handleContextMenu = (event: React.MouseEvent, sessionId: string) => {
    event.preventDefault();
    event.stopPropagation();

    setContextMenu({
      sessionId,
      x: event.clientX,
      y: event.clientY
    });
  };

  /**
   * 处理Session操作
   */
  const handleSessionAction = (action: 'rename' | 'delete' | 'duplicate', sessionId: string) => {
    onSessionAction(action, sessionId);
    setContextMenu(null);
  };

  /**
   * 处理关闭按钮点击（删除session）
   */
  const handleCloseSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发tab切换
    
    // 如果只剩一个session，不允许删除
    if (sessions.length <= 1) {
      console.warn('Cannot delete the last session');
      return;
    }
    
    onSessionAction('delete', sessionId);
  };


  /**
   * 获取Session显示标题（使用第一条用户消息或默认名称）
   */
  const getSessionDisplayTitle = (session: SessionInfo) => {
    if (getSessionTitle) {
      return getSessionTitle(session.id);
    }
    return session.name;
  };

  // 无Session的情况下仅显示创建按钮
  if (sessions.length === 0) {
    return (
      <div className={`session-switcher session-switcher--empty ${className}`}>
        <button
          className="session-switcher__create-btn"
          onClick={handleCreateSession}
          disabled={disabled}
          title="Create New Session"
        >
          <Plus size={14} stroke="currentColor" />
        </button>
      </div>
    );
  }

  return (
    <div className={`session-switcher ${className}`} ref={containerRef}>
      {/* 固定的创建新Session按钮 - Pinned Header */}
      <div className="session-switcher__pinned-header">
        <button
          className="session-switcher__create-btn session-switcher__create-btn--pinned"
          onClick={handleCreateSession}
          disabled={disabled}
          title="Create New Session"
        >
          <Plus size={14} stroke="currentColor" />
        </button>
      </div>

      {/* 横向滑动的Session标签列表 */}
      <div className="session-switcher__tabs-container">
        <div className="session-switcher__tabs" ref={tabsContainerRef}>
          {sessions.map((session) => (
            <button
              key={session.id}
              data-session-id={session.id}
              className={`session-switcher__tab ${
                session.id === currentSession?.id ? 'session-switcher__tab--active' : ''
              } ${isSessionUnused && isSessionUnused(session.id) ? 'session-switcher__tab--unused' : ''}`}
              onClick={() => handleSessionSelect(session.id)}
              onContextMenu={(e) => handleContextMenu(e, session.id)}
              disabled={disabled}
              title={session.description || getSessionDisplayTitle(session)}
            >
              <span className="session-switcher__tab-title">
                {getSessionDisplayTitle(session)}
              </span>
              
              {/* 关闭按钮 */}
              {sessions.length > 1 && (
                <button
                  className="session-switcher__tab-close"
                  onClick={(e) => handleCloseSession(e, session.id)}
                  title="关闭此会话"
                  disabled={disabled}
                >
                  <X size={12} stroke="currentColor" />
                </button>
              )}
              
              {/* 未使用session的视觉标识 */}
              {isSessionUnused && isSessionUnused(session.id) && (
                <span className="session-switcher__tab-indicator">●</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="session-switcher__context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}
        >
          <button
            className="session-switcher__context-item"
            onClick={() => handleSessionAction('rename', contextMenu.sessionId)}
          >
            <Edit3 size={12} stroke="currentColor" className="session-switcher__context-icon" />
            {t('session.rename')}
          </button>

          <button
            className="session-switcher__context-item"
            onClick={() => handleSessionAction('duplicate', contextMenu.sessionId)}
          >
            <span className="session-switcher__context-icon">📄</span>
            {t('session.duplicate')}
          </button>

          {sessions.length > 1 && (
            <button
              className="session-switcher__context-item session-switcher__context-item--danger"
              onClick={() => handleSessionAction('delete', contextMenu.sessionId)}
            >
              <Trash2 size={12} stroke="currentColor" className="session-switcher__context-icon" />
              {t('session.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 获取Session类型图标
 */
function getSessionTypeIcon(type: SessionType): React.ReactNode {
  const iconProps = { size: 12, stroke: "currentColor" };
  switch (type) {
    case SessionType.CHAT:
      return <span>💬</span>;
    case SessionType.CODE_REVIEW:
      return <span>👀</span>;
    case SessionType.DEBUG:
      return <span>🐛</span>;
    case SessionType.DOCUMENTATION:
      return <span>📝</span>;
    case SessionType.REFACTORING:
      return <Wrench {...iconProps} />;
    case SessionType.CUSTOM:
      return <Settings {...iconProps} />;
    default:
      return <span>💬</span>;
  }
}

/**
 * 获取Session类型名称
 */
function getSessionTypeName(type: SessionType): string {
  switch (type) {
    case SessionType.CHAT:
      return '聊天会话';
    case SessionType.CODE_REVIEW:
      return '代码审查';
    case SessionType.DEBUG:
      return '调试助手';
    case SessionType.DOCUMENTATION:
      return '文档生成';
    case SessionType.REFACTORING:
      return '重构建议';
    case SessionType.CUSTOM:
      return '自定义会话';
    default:
      return '聊天会话';
  }
}
