/**
 * Chat History Modal - 对话历史模态框
 * 显示分组的历史对话列表，支持搜索和管理
 */

import React, { useState, useMemo, useEffect } from 'react';
import { X, Trash2, Edit2, ChevronsDown, Loader2 } from 'lucide-react';
import { ChatMessage } from '../types';
import { messageContentToString } from '../utils/messageContentUtils';
import './ChatHistoryModal.css';

interface ChatHistoryModalProps {
  isOpen: boolean;
  sessions: Array<{
    id: string;
    title: string;
    timestamp: number;
    messageCount: number;
    messages: ChatMessage[];
  }>;
  currentSessionId?: string;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onRenameSession?: (sessionId: string, newTitle: string) => void;
  // 🎯 分页相关
  hasMore?: boolean;
  isLoading?: boolean;
  total?: number;
  onLoadMore?: () => void;
}

// 不再使用前端分页，直接显示所有已加载的数据

interface GroupedSession {
  date: string;
  sessions: ChatHistoryModalProps['sessions'];
}

const getGroupLabel = (timestamp: number): string => {
  const now = new Date();
  // 🔥 确保 timestamp 是毫秒单位（如果是秒则乘以 1000）
  const timestampMs = timestamp > 9999999999 ? timestamp : timestamp * 1000;
  const sessionDate = new Date(timestampMs);

  // 获取今天的起始时间（00:00:00）
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionStart = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

  // 计算天数差
  const diffTime = todayStart.getTime() - sessionStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // 🎯 更细致的时间分组逻辑（参照 ChatGPT/Cursor）
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return 'last 7 days';
  if (diffDays <= 30) return 'last 30 days';

  // 🎯 精确的月份差计算
  const monthDiff = (now.getFullYear() - sessionDate.getFullYear()) * 12 +
                    (now.getMonth() - sessionDate.getMonth());

  if (monthDiff === 0) return 'this month';
  if (monthDiff === 1) return 'last month';
  if (monthDiff <= 3) return 'last 3 months';
  if (monthDiff <= 6) return 'last 6 months';
  if (monthDiff <= 12) return 'this year';
  return 'older';
};

const groupSessions = (sessions: ChatHistoryModalProps['sessions']): GroupedSession[] => {
  const groups: Record<string, ChatHistoryModalProps['sessions']> = {};
  const dateOrder = ['today', 'yesterday', 'last 7 days', 'last 30 days', 'this month', 'last month', 'last 3 months', 'last 6 months', 'this year', 'older'];

  sessions.forEach((session) => {
    const group = getGroupLabel(session.timestamp);
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(session);
  });

  return dateOrder
    .filter((date) => groups[date])
    .map((date) => ({
      date,
      // 🔥 每个分组内部也按时间倒序排序（最新的在上面）
      sessions: groups[date].sort((a, b) => b.timestamp - a.timestamp),
    }));
};

/**
 * 获取要显示的标题
 * 优先级：
 * 1. 使用后端返回的 name/title（应该总是有的）
 * 2. 都没有才从消息提取
 * 3. 最后才是默认值
 */
const getDisplayTitle = (messages: ChatMessage[], title: string): string => {
  // 1. 如果有标题且不是默认值，直接显示
  if (title && title.trim() && title !== 'Untitled Chat' && title !== 'New Chat') {
    return title.substring(0, 120);
  }

  // 2. 从消息中提取内容
  if (messages && messages.length > 0) {
    const userMessages = messages.filter((m) => m.type === 'user');
    if (userMessages.length > 0) {
      const firstUserMsg = userMessages[0];
      const content = messageContentToString(firstUserMsg.content);
      if (content && content.trim()) {
        return content.substring(0, 120);
      }
    }
  }

  // 3. 如果有标题（包括默认值），显示它
  if (title && title.trim()) {
    return title;
  }

  // 4. 最终默认值
  return 'New Chat';
};

export const ChatHistoryModal: React.FC<ChatHistoryModalProps> = ({
  isOpen,
  sessions,
  currentSessionId,
  onClose,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  hasMore,
  isLoading,
  total,
  onLoadMore,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const listRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // 当 modal 打开且有当前 session 时，自动滚动到当前对话位置
  useEffect(() => {
    if (isOpen && currentSessionId) {
      const timer = setTimeout(() => {
        const currentItem = document.querySelector(`[data-session-id="${currentSessionId}"]`);
        if (currentItem) {
          currentItem.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, currentSessionId]);

  // 快捷键支持
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === '/' && !editingSessionId) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, editingSessionId]);

  const groupedSessions = useMemo(() => {
    let filtered = sessions;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = sessions.filter((session) => {
        const titleMatch = session.title.toLowerCase().includes(query);
        const contentMatch = session.messages.some((msg) => {
          const content = messageContentToString(msg.content);
          return content.toLowerCase().includes(query);
        });
        return titleMatch || contentMatch;
      });
    }
    return groupSessions(filtered);
  }, [sessions, searchQuery]);

  // 直接显示所有已加载的分组数据（不做前端分页）
  const displayedGroupedSessions = groupedSessions;

  const handleRenameClick = (session: ChatHistoryModalProps['sessions'][0]) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const handleSaveRename = (sessionId: string) => {
    const trimmedTitle = editingTitle.trim();

    // 🔥 验证：标题不能为空
    if (!trimmedTitle) {
      console.warn('⚠️ Cannot save empty title');
      // 恢复原标题
      const originalSession = sessions.find(s => s.id === sessionId);
      if (originalSession) {
        setEditingTitle(originalSession.title);
      }
      return;
    }

    console.log('💾 Saving rename:', { sessionId, oldTitle: sessions.find(s => s.id === sessionId)?.title, newTitle: trimmedTitle });

    if (onRenameSession) {
      onRenameSession(sessionId, trimmedTitle);
    }

    setEditingSessionId(null);
  };

  // 高亮搜索关键词
  const highlightText = (text: string, query: string) => {
    if (!query || !text) return text;

    try {
      const parts = text.split(new RegExp(`(${query})`, 'gi'));
      return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="chat-history-modal__highlight">{part}</mark>
          : part
      );
    } catch {
      return text;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="chat-history-modal__overlay" onClick={onClose}>
      <div className="chat-history-modal__container" onClick={(e) => e.stopPropagation()}>
        {/* Search - 直接搜索，节约空间 */}
        <div className="chat-history-modal__search-container">
          <input
            ref={searchInputRef}
            type="text"
            className="chat-history-modal__search-input"
            placeholder="Search conversations... (Press / to focus)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Sessions List */}
        <div className="chat-history-modal__list" ref={listRef}>
          {/* 首次加载骨架屏 */}
          {isLoading && sessions.length === 0 ? (
            <div className="chat-history-modal__skeleton">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="chat-history-modal__skeleton-item">
                  <div className="chat-history-modal__skeleton-icon"></div>
                  <div className="chat-history-modal__skeleton-content">
                    <div className="chat-history-modal__skeleton-title"></div>
                    <div className="chat-history-modal__skeleton-subtitle"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : displayedGroupedSessions.length === 0 ? (
            <div className="chat-history-modal__empty">
              <div className="chat-history-modal__empty-icon">💬</div>
              <div className="chat-history-modal__empty-title">
                {searchQuery ? 'No conversations found' : 'No chat history'}
              </div>
              <div className="chat-history-modal__empty-subtitle">
                {searchQuery ? 'Try a different search term' : 'Start a new conversation to see it here'}
              </div>
            </div>
          ) : (
            displayedGroupedSessions.map((group) => (
              <div key={group.date} className="chat-history-modal__group">
                <div className="chat-history-modal__group-label">{group.date}</div>
                {group.sessions.map((session) => (
                  <div
                    key={session.id}
                    data-session-id={session.id}
                    className={`chat-history-modal__item ${
                      currentSessionId === session.id ? 'active' : ''
                    }`}
                  >
                    <div className="chat-history-modal__item-icon">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="chat-history-modal__chat-icon-svg"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div
                      className="chat-history-modal__item-main"
                      onClick={() => {
                        if (editingSessionId !== session.id) {
                          onSelectSession(session.id);
                        }
                      }}
                    >
                      {editingSessionId === session.id ? (
                        <input
                          type="text"
                          className="chat-history-modal__edit-input"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            // ✏️ Enter 快速保存
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              handleSaveRename(session.id);
                            }
                            // ✏️ Esc 取消编辑
                            if (e.key === 'Escape') {
                              e.stopPropagation();
                              setEditingSessionId(null);
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <span className="chat-history-modal__item-title" title={session.title}>
                          {highlightText(getDisplayTitle(session.messages, session.title), searchQuery)}
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    {editingSessionId === session.id ? (
                      <div className="chat-history-modal__edit-actions">
                        <button
                          className="chat-history-modal__action-btn confirm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveRename(session.id);
                          }}
                        >
                          Save
                        </button>
                        <button
                          className="chat-history-modal__action-btn cancel"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="chat-history-modal__actions">
                        <button
                          className="chat-history-modal__action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameClick(session);
                          }}
                          title="Rename session"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="chat-history-modal__action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onDeleteSession) {
                              onDeleteSession(session.id);
                            }
                          }}
                          title="Delete session"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* 底部统计和加载 */}
        <div className="chat-history-modal__footer">
          {/* 统计信息 */}
          {total !== undefined && total > 0 && (
            <div className="chat-history-modal__footer-stats">
              <span className="chat-history-modal__stats-text">
                {sessions.length} of {total} conversations
              </span>
            </div>
          )}

          {/* 从服务器加载更多 */}
          {hasMore && !isLoading && (
            <button
              className="chat-history-modal__load-more-btn"
              onClick={onLoadMore}
            >
              <ChevronsDown size={16} />
              <span>Load More ({total && total > sessions.length ? total - sessions.length : 0} remaining)</span>
            </button>
          )}

          {/* 加载中状态 */}
          {isLoading && (
            <div className="chat-history-modal__loading">
              <Loader2 size={14} className="chat-history-modal__loading-icon" />
              <span>Loading...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
