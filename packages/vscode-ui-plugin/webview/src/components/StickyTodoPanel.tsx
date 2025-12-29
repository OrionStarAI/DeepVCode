/**
 * StickyTodoPanel Component
 * A sticky panel at the bottom of the chat that shows the latest task list (Todos)
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, ListTodo } from 'lucide-react';
import './StickyTodoPanel.css';

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

interface TodoDisplay {
  type: 'todo_display';
  title?: string;
  items: TodoItem[];
}

interface StickyTodoPanelProps {
  data: TodoDisplay;
  isCollapsed: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
}

/**
 * 状态复选框组件 - 复制自 TodoDisplayRenderer 以保持一致性
 */
const StatusCheckbox: React.FC<{ status: string }> = ({ status }) => {
  const isCompleted = status === 'completed';
  const isInProgress = status === 'in_progress';
  const isCancelled = status === 'cancelled';

  return (
    <div className={`todo-checkbox ${status}`}>
      {isCompleted && (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 5L4 7L8 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {isInProgress && (
        <div className="todo-checkbox-dot" />
      )}
      {isCancelled && (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path
            d="M3 3L7 7M7 3L3 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
};

export const StickyTodoPanel: React.FC<StickyTodoPanelProps> = ({ data, isCollapsed, onToggleCollapse }) => {
  const items = data.items || [];
  const completedCount = items.filter(i => i.status === 'completed' || i.status === 'cancelled').length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (totalCount === 0) return null;

  return (
    <div className={`sticky-todo-panel ${isCollapsed ? 'collapsed' : 'expanded'}`}>
      <div className="sticky-todo-header" onClick={() => onToggleCollapse(!isCollapsed)}>
        <div className="header-left">
          <ListTodo size={14} className="header-icon" />
          <span className="header-title">{data.title || 'Tasks'}</span>
          <span className="header-progress">({completedCount}/{totalCount})</span>
        </div>
        <div className="header-right">
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="sticky-todo-content">
          <div className="todo-list">
            {items.map((item) => (
              <div key={item.id} className={`todo-item-row ${item.status}`}>
                <StatusCheckbox status={item.status} />
                <span className={`todo-item-text ${item.status}`}>
                  {item.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
