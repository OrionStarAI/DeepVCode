/**
 * TodoDisplayRenderer Component - Web版
 * 用于在VSCode插件中显示TODO任务列表
 * 精致简洁的设计风格
 */

import React, { useMemo } from 'react';
import './TodoDisplayRenderer.css';

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

interface TodoDisplayRendererProps {
  data: TodoDisplay;
}

/**
 * 任务图标组件 - 精致的分支图标
 */
const TodoIcon: React.FC = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    className="todo-header-icon-svg"
  >
    <path
      d="M8 2V6M8 6V14M8 6H12M4 10H8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="2" r="1.5" fill="currentColor" />
    <circle cx="12" cy="6" r="1.5" fill="currentColor" />
    <circle cx="4" cy="10" r="1.5" fill="currentColor" />
    <circle cx="8" cy="14" r="1.5" fill="currentColor" />
  </svg>
);

/**
 * 状态复选框组件 - 精致的圆形设计
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

export const TodoDisplayRenderer: React.FC<TodoDisplayRendererProps> = React.memo(({ data }) => {
  const items = data.items || [];
  const totalCount = items.length;

  // 🎯 减少日志输出，只在数据实际变化时输出
  const itemsSignature = useMemo(() => {
    return items.map(item => `${item.id}-${item.status}`).join('|');
  }, [items]);

  React.useEffect(() => {
    console.log('🎯 [TodoDisplayRenderer] Data updated:', {
      totalCount,
      title: data.title,
      itemsChanged: true
    });
  }, [itemsSignature, data.title, totalCount]);

  return (
    <div className="todo-container">
      {/* 精致的标题行 */}
      <div className="todo-header-row">
        <TodoIcon />
        <span className="todo-header-title">
          {data.title || 'To-dos'}
        </span>
        <span className="todo-header-count">
          {totalCount}
        </span>
      </div>

      {/* 任务列表 */}
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
  );
});
