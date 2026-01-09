/**
 * 后台任务状态栏组件
 *
 * 显示正在运行和已完成的后台任务，支持展开查看详情和终止任务。
 * 放置在 FilesChangedBar 上方，与其样式保持一致。
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { Play, Square, CheckCircle, XCircle, ChevronDown, ChevronRight, X, Loader2, Clock } from 'lucide-react';
import type { BackgroundTaskInfo } from '../../../src/types/messages';
import './BackgroundTasksBar.css';

interface BackgroundTasksBarProps {
  /** 所有后台任务列表 */
  tasks: BackgroundTaskInfo[];
  /** 正在运行的任务数量 */
  runningCount: number;
  /** 终止任务回调 */
  onKillTask: (taskId: string) => void;
  /** 清除已完成任务回调（可选） */
  onClearCompleted?: () => void;
  /** 关闭任务栏回调（可选，仅当没有 running 任务时可关闭） */
  onClose?: () => void;
}

/**
 * 格式化时间差
 */
function formatDuration(startTime: number, endTime?: number): string {
  const end = endTime || Date.now();
  const diff = end - startTime;

  if (diff < 1000) {
    return '<1s';
  } else if (diff < 60000) {
    return `${Math.floor(diff / 1000)}s`;
  } else if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }
}

/**
 * 截断命令显示
 */
function truncateCommand(command: string, maxLength: number = 60): string {
  if (command.length <= maxLength) {
    return command;
  }
  return command.slice(0, maxLength - 3) + '...';
}

const BackgroundTasksBar: React.FC<BackgroundTasksBarProps> = ({
  tasks,
  runningCount,
  onKillTask,
  onClearCompleted,
  onClose
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭展开列表
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && event.target && containerRef.current.contains(event.target as Node) === false) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleKillTask = (taskId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onKillTask(taskId);
  };

  // 如果没有任务，不显示组件
  if (tasks.length === 0) {
    return null;
  }

  // 分类任务
  const runningTasks = tasks.filter(t => t.status === 'running');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const failedTasks = tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');

  // 获取状态图标
  const getStatusIcon = (status: BackgroundTaskInfo['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 size={14} className="task-icon-spin" />;
      case 'completed':
        return <CheckCircle size={14} className="task-icon-success" />;
      case 'failed':
      case 'cancelled':
        return <XCircle size={14} className="task-icon-error" />;
      default:
        return <Play size={14} />;
    }
  };

  // 获取状态文本
  const getStatusText = (status: BackgroundTaskInfo['status']) => {
    switch (status) {
      case 'running':
        return t('backgroundTasks.statusRunning', {}, 'Running');
      case 'completed':
        return t('backgroundTasks.statusCompleted', {}, 'Completed');
      case 'failed':
        return t('backgroundTasks.statusFailed', {}, 'Failed');
      case 'cancelled':
        return t('backgroundTasks.statusCancelled', {}, 'Cancelled');
      default:
        return status;
    }
  };

  return (
    <div className="background-tasks-container" ref={containerRef}>
      {/* 悬浮任务列表 - 在上方展开 */}
      {isExpanded && (
        <div className="tasks-expanded-list">
          {tasks.map(task => (
            <div
              key={task.id}
              className={`task-item task-status-${task.status}`}
              title={task.command}
            >
              <div className="task-item-left">
                <span className="task-status-icon">
                  {getStatusIcon(task.status)}
                </span>
                <div className="task-info">
                  <div className="task-command">{truncateCommand(task.command)}</div>
                  <div className="task-meta">
                    <span className="task-id">#{task.id}</span>
                    <span className="task-duration">
                      <Clock size={10} />
                      {formatDuration(task.startTime, task.endTime)}
                    </span>
                    {task.directory && (
                      <span className="task-directory" title={task.directory}>
                        {task.directory.split(/[/\\]/).pop()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="task-item-right">
                <span className={`task-status-badge status-${task.status}`}>
                  {getStatusText(task.status)}
                </span>
                {task.status === 'running' && (
                  <button
                    className="task-kill-btn"
                    onClick={(e) => handleKillTask(task.id, e)}
                    title={t('backgroundTasks.killTask', {}, 'Stop this task')}
                    aria-label={t('backgroundTasks.killTask', {}, 'Stop this task')}
                  >
                    <Square size={12} />
                  </button>
                )}
                {task.exitCode !== undefined && task.exitCode !== 0 && (
                  <span className="task-exit-code" title="Exit code">
                    {task.exitCode}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 主要的单行栏 */}
      <div
        className={`background-tasks-bar ${isExpanded ? 'expanded' : ''} ${runningCount > 0 ? 'has-running' : ''}`}
        onClick={handleToggleExpand}
        title={t('backgroundTasks.viewTasks', {}, 'Click to view background tasks')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleExpand();
          }
        }}
      >
        <div className="bar-left">
          <span className="bar-icon">
            {runningCount > 0 ? (
              <Loader2 size={12} className="task-icon-spin" />
            ) : (
              <Play size={12} />
            )}
          </span>
          <span className="bar-title">{t('backgroundTasks.title', {}, 'TASKS')}</span>
          <span className="tasks-count">
            {(() => {
              const parts = [];
              if (runningCount > 0) {
                parts.push(`${runningCount} ${t('backgroundTasks.running', {}, 'running')}`);
              }
              if (completedTasks.length > 0) {
                parts.push(`${completedTasks.length} ${t('backgroundTasks.completed', {}, 'done')}`);
              }
              if (failedTasks.length > 0) {
                parts.push(`${failedTasks.length} ${t('backgroundTasks.failed', {}, 'failed')}`);
              }
              return parts.join(', ');
            })()}
          </span>
        </div>

        <div className="bar-right">
          {isExpanded ? (
            <ChevronDown className="expand-indicator" size={14} />
          ) : (
            <ChevronRight className="expand-indicator" size={14} />
          )}

          {/* 关闭按钮 - 只在没有 running 任务时显示 */}
          {onClose && runningCount === 0 && (
            <button
              className="close-tasks-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title={t('backgroundTasks.closeTasksBar', {}, 'Close tasks bar')}
              aria-label={t('backgroundTasks.closeTasksBar', {}, 'Close tasks bar')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BackgroundTasksBar;
