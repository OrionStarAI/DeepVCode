/**
 * TodoDisplayRenderer Component - Web版
 * 用于在VSCode插件中显示TODO任务列表
 */

import React, { useState, useMemo } from 'react';

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
 * 获取状态对应的颜色
 */
const getStatusColor = (status: string): string => {
  switch (status) {
    case 'completed':
      return 'var(--vscode-charts-green)';
    case 'in_progress':
      return 'var(--vscode-charts-blue)';
    case 'cancelled':
      return 'var(--vscode-charts-red)';
    default:
      return 'var(--vscode-descriptionForeground)';
  }
};

/**
 * 获取状态对应的简洁图标（类似图片中的风格）
 */
const getStatusIcon = (status: string): React.ReactNode => {
  const baseStyle = {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0
  };

  switch (status) {
    case 'completed':
      return (
        <div style={{
          ...baseStyle,
          backgroundColor: 'var(--vscode-charts-green, #4CAF50)'
        }} />
      );
    case 'in_progress':
      return (
        <div style={{
          ...baseStyle,
          backgroundColor: 'var(--vscode-charts-blue, #2196F3)'
        }} />
      );
    case 'cancelled':
      return (
        <div style={{
          ...baseStyle,
          backgroundColor: 'var(--vscode-charts-red, #f44336)'
        }} />
      );
    default:
      return (
        <div style={{
          ...baseStyle,
          border: '1px solid var(--vscode-panel-border, #666)',
          backgroundColor: 'transparent'
        }} />
      );
  }
};

export const TodoDisplayRenderer: React.FC<TodoDisplayRendererProps> = React.memo(({ data }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const items = data.items || [];

  // 计算完成进度 - 使用useMemo优化
  const { completedCount, totalCount } = useMemo(() => {
    const completedCount = items.filter(item => item.status === 'completed').length;
    return { completedCount, totalCount: items.length };
  }, [items]);

  // 🎯 减少日志输出，只在数据实际变化时输出
  const itemsSignature = useMemo(() => {
    return items.map(item => `${item.id}-${item.status}`).join('|');
  }, [items]);

  React.useEffect(() => {
    console.log('🎯 [TodoDisplayRenderer] Data updated:', {
      totalCount,
      completedCount,
      title: data.title,
      itemsChanged: true
    });
  }, [itemsSignature, data.title, totalCount, completedCount]);

  return (
    <div className="todo-display-container" style={{
      borderRadius: '6px',
      backgroundColor: 'var(--vscode-textBlockQuote-background, #2D2D2D)',
      border: '1px solid var(--vscode-panel-border, #404040)',
      overflow: 'hidden',
      margin: '3px 0'
    }}>
      {/* 中等紧凑的标题行 */}
      <div
        className="todo-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--vscode-descriptionForeground, #888)', fontSize: '11px' }}>📋</span>
          <span
            className="todo-title"
            style={{
              color: 'var(--vscode-foreground, #E0E0E0)',
              fontSize: '12px',
              fontWeight: '500'
            }}
          >
            {data.title || 'To-dos'}
          </span>
          <span
            style={{
              color: 'var(--vscode-descriptionForeground, #888)',
              fontSize: '10px'
            }}
          >
            ({completedCount}/{totalCount})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            className="todo-collapse-arrow"
            style={{
              fontSize: '9px',
              color: 'var(--vscode-descriptionForeground, #888)',
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease'
            }}
          >
            ▼
          </span>
          <span style={{ color: 'var(--vscode-descriptionForeground, #666)', fontSize: '12px' }}>⋄</span>
        </div>
      </div>

      {/* 中等紧凑的任务列表 */}
      {!isCollapsed && (
        <div className="todo-items" style={{ paddingBottom: '2px' }}>
          {items.map((item, index) => (
            <div key={item.id} className="todo-item" style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              padding: '2px 8px',
              borderTop: index === 0 ? '1px solid var(--vscode-panel-border, #404040)' : 'none'
            }}>
              <div style={{ marginTop: '2px' }}>
                {getStatusIcon(item.status)}
              </div>
              <span
                className={`todo-text ${item.status === 'completed' ? 'completed' : ''}`}
                style={{
                  color: item.status === 'completed' ? 'var(--vscode-descriptionForeground, #888)' : 'var(--vscode-foreground, #E0E0E0)',
                  textDecoration: item.status === 'completed' ? 'line-through' : 'none',
                  fontSize: '12px',
                  flex: 1,
                  lineHeight: '1.2'
                }}
              >
                {item.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
