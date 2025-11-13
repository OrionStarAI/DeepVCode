/**
 * Chat History Modal - 对话历史模态框
 * 显示分组的历史对话列表，支持搜索和管理
 */

import React, { useState, useMemo, useEffect } from 'react';
import { X, Trash2, Edit2 } from 'lucide-react';
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
}

const ITEMS_PER_PAGE = 50; // 初始显示 50 条

interface GroupedSession {
  date: string;
  sessions: typeof sessions;
}

const getGroupLabel = (timestamp: number): string => {
  const now = new Date();
  const sessionDate = new Date(timestamp);

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
  const groups: Record<string, typeof sessions> = {};
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
      sessions: groups[date],
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
    const userMessages = messages.filter((m) => m.role === 'user');
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
}) => {

  const [searchQuery, setSearchQuery] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);

  // 搜索时重置分页
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [searchQuery]);

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

  // 计算过滤后的 sessions 总数（用于判断是否需要"加载更多"）
  const totalFilteredSessions = useMemo(() => {
    return groupedSessions.reduce((sum, group) => sum + group.sessions.length, 0);
  }, [groupedSessions]);

  // 获取要显示的 sessions（分页）
  const displayedGroupedSessions = useMemo(() => {
    let count = 0;
    return groupedSessions.map((group) => ({
      ...group,
      sessions: group.sessions.filter(() => {
        if (count < displayCount) {
          count++;
          return true;
        }
        return false;
      }),
    })).filter((group) => group.sessions.length > 0);
  }, [groupedSessions, displayCount]);

  const handleRenameClick = (session: ChatHistoryModalProps['sessions'][0]) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const handleSaveRename = (sessionId: string) => {
    if (editingTitle.trim() && onRenameSession) {
      onRenameSession(sessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="chat-history-modal__overlay" onClick={onClose}>
      <div className="chat-history-modal__container" onClick={(e) => e.stopPropagation()}>
        {/* Search - 直接搜索，节约空间 */}
        <div className="chat-history-modal__search-container">
          <input
            type="text"
            className="chat-history-modal__search-input"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Sessions List */}
        <div className="chat-history-modal__list">
          {displayedGroupedSessions.length === 0 ? (
            <div className="chat-history-modal__empty">
              {searchQuery ? 'No conversations found' : 'No chat history'}
            </div>
          ) : (
            displayedGroupedSessions.map((group) => (
              <div key={group.date} className="chat-history-modal__group">
                <div className="chat-history-modal__group-label">{group.date}</div>
                {group.sessions.map((session) => (
                  <div
                    key={session.id}
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
                        // 编辑中时不要跳转
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
                          {getDisplayTitle(session.messages, session.title)}
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

        {/* Load More Button */}
        {displayCount < totalFilteredSessions && (
          <div className="chat-history-modal__footer">
            <button
              className="chat-history-modal__load-more-btn"
              onClick={() => setDisplayCount((prev) => prev + ITEMS_PER_PAGE)}
            >
              Show {Math.min(ITEMS_PER_PAGE, totalFilteredSessions - displayCount)} more
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
