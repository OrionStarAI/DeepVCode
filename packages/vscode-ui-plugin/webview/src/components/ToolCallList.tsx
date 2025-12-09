/**
 * ToolCallList Component - 工具调用列表管理
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Circle, RotateCcw, CheckCircle, XCircle, AlertTriangle, Square, HelpCircle, Info, Check, X, Zap, ShieldAlert, Repeat } from 'lucide-react';
import { ToolCall } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { TOOL_CALL_STATUS } from '../constants/toolConstants';
import { TodoDisplayRenderer } from './renderers/TodoDisplayRenderer';
import { SubAgentDisplayRenderer } from './renderers/SubAgentDisplayRenderer';
import { DiffRenderer } from './renderers/DiffRenderer';
import './renderers/Renderers.css';

// 结果类型检测函数
const getResultType = (result: any): string | null => {
  if (!result || typeof result === 'string') return null;

  const dataType = result?.data?.type || result?.type;

  // 检查特殊渲染类型
  if (dataType === 'todo_display') return 'todo_display';
  if (dataType === 'subagent_display' || dataType === 'subagent_update') return 'subagent_display';
  if (result?.fileDiff || result?.data?.fileDiff) return 'diff_display';

  return null;
};

// 结果渲染函数 - 根据结果类型选择不同的渲染器
const renderResult = (result: any): React.ReactNode => {
  console.log('🎯 [renderResult] Processing result:', result);

  // 🔍 专门检查lint相关数据
  if (result && typeof result === 'object') {
    if (result.lintStatus || result.lintDiagnostics) {
      console.log('🔍 [LINT-CHECK] Found lint data in result:', {
        lintStatus: result.lintStatus,
        lintDiagnostics: result.lintDiagnostics
      });
    }

    if (result.data && (result.data.lintStatus || result.data.lintDiagnostics)) {
      console.log('🔍 [LINT-CHECK] Found lint data in result.data:', {
        lintStatus: result.data.lintStatus,
        lintDiagnostics: result.data.lintDiagnostics
      });
    }
  }

  // 字符串结果 - 直接显示
  if (typeof result === 'string') {
    console.log('🎯 [renderResult] String result');
    return <pre>{result}</pre>;
  }

  // 检查 result.data.type 结构
  const dataType = result?.data?.type || result?.type;
  console.log('🎯 [renderResult] Detected type:', dataType);

  // TODO显示 - 检查两种可能的结构
  if (dataType === 'todo_display') {
    console.log('🎯 [renderResult] TODO display detected');
    const todoData = result.data || result;
    return <TodoDisplayRenderer data={todoData} />;
  }

  // SubAgent显示 - 检查两种可能的结构
  if (dataType === 'subagent_display' || dataType === 'subagent_update') {
    console.log('🎯 [renderResult] SubAgent display detected');
    let agentData = result;
    if (result.data) {
      agentData = dataType === 'subagent_update' ? result.data.data : result.data;
    }
    return <SubAgentDisplayRenderer data={agentData} />;
  }

  // Diff显示 - 检查两种可能的结构
  if (result?.fileDiff || result?.data?.fileDiff) {
    console.log('🎯 [renderResult] Diff display detected');
    const diffData = result.data || result;
    return <DiffRenderer data={diffData} simplified={false} />;
  }

  // 其他对象结果 - 只显示data字段，使用横向滚动
  console.log('🎯 [renderResult] Fallback to JSON display');
  const dataToShow = result?.data || result;

  // 共用的内联样式，保留原有换行但不自动换行
  const noAutoWrapStyle = {
    whiteSpace: 'pre' as const, // 保留换行符，但不自动换行
    overflowX: 'auto' as const,
    overflowY: 'auto' as const,
    wordBreak: 'normal' as const,
    wordWrap: 'normal' as const,
    maxWidth: '100%'
  };

  // 如果是字符串，直接显示原始内容，不进行JSON序列化
  if (typeof dataToShow === 'string') {
    return <pre className="compact-json-result" style={noAutoWrapStyle}>{dataToShow}</pre>;
  }

  // 如果是对象，尝试智能显示
  if (typeof dataToShow === 'object' && dataToShow !== null) {
    // 如果对象有content字段，优先显示content
    if (dataToShow.content && typeof dataToShow.content === 'string') {
      return <pre className="compact-json-result" style={noAutoWrapStyle}>{dataToShow.content}</pre>;
    }
    // 如果对象有text字段，显示text
    if (dataToShow.text && typeof dataToShow.text === 'string') {
      return <pre className="compact-json-result" style={noAutoWrapStyle}>{dataToShow.text}</pre>;
    }
    // 如果对象有message字段，显示message
    if (dataToShow.message && typeof dataToShow.message === 'string') {
      return <pre className="compact-json-result" style={noAutoWrapStyle}>{dataToShow.message}</pre>;
    }
  }

  // 其他情况才使用JSON序列化
  return <pre className="compact-json-result" style={noAutoWrapStyle}>{JSON.stringify(dataToShow, null, 2)}</pre>;
};

// 单个工具调用项组件
const ToolCallItem: React.FC<{
  toolCall: ToolCall;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onConfirm: (confirmed: boolean, userInput?: string) => void;
}> = ({ toolCall, isExpanded, onToggleExpand, onConfirm }) => {
  const { t } = useTranslation();
  const [userInput, setUserInput] = useState('');
  const liveOutputRef = useRef<HTMLDivElement>(null);
  const [permissionMode, setPermissionMode] = useState<'once' | 'always_type' | 'always_project'>('once');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 🎯 直接在渲染时计算，不依赖useState和useEffect
  const hasConfirmation = toolCall.status === TOOL_CALL_STATUS.WAITING_FOR_CONFIRMATION;

  // 🎯 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // 🎯 检测是否为todo结果且工具已执行完成
  const isTodoResultCompleted = () => {
    const result = toolCall.result as any;
    const dataType = result?.data?.type || result?.type;
    return dataType === 'todo_display' && toolCall.status === TOOL_CALL_STATUS.SUCCESS;
  };

  // 🎯 检测是否为diff结果
  const isDiffResult = () => {
    const result = toolCall.result;
    return result && result.data && result.data.fileDiff;
  };

  // 🎯 处理diff项目点击
  const handleDiffClick = (event: React.MouseEvent) => {
    if (!isDiffResult()) return;

    // 阻止事件冒泡到展开/收起按钮
    if ((event.target as HTMLElement).closest('.tool-controls')) {
      return;
    }

    const result = toolCall.result;
    const diffData = result?.data || result;

    if (diffData && typeof window !== 'undefined' && window.vscode) {
      window.vscode.postMessage({
        type: 'openDiffInEditor',
        payload: {
          fileDiff: diffData.fileDiff,
          fileName: diffData.fileName || t('tools.unknownFile', {}, 'Unknown file'),
          originalContent: diffData.originalContent || '',
          newContent: diffData.newContent || ''
        }
      });
    }
  };

  // 🎯 自动滚动到实时输出底部
  useEffect(() => {
    if (liveOutputRef.current && toolCall.liveOutput) {
      liveOutputRef.current.scrollTop = liveOutputRef.current.scrollHeight;
    }
  }, [toolCall.liveOutput]);

  // 🎯 确认选择处理函数
  const handleConfirmationChoice = (choice: string) => {
    let confirmed = true;
    let outcome: string | undefined;

    switch (choice) {
      case 'once':
        outcome = 'proceed_once';
        break;
      case 'always_type':
        outcome = 'proceed_always';
        break;
      case 'always_project':  // 🎯 关键选项
        outcome = 'proceed_always_project';
        break;
      case 'cancel':
        confirmed = false;
        outcome = 'cancel';
        break;
      default:
        confirmed = false;
        outcome = 'cancel';
    }

    // 🎯 扩展onConfirm调用以传递outcome
    (onConfirm as any)(confirmed, userInput.trim() || undefined, outcome);
  };

  // 获取工具描述 - 优先使用动态描述，回退到参数格式化
  const getToolDescription = (): string => {
    // 🎯 优先使用工具的动态描述（不手动截断，让CSS处理）
    if (toolCall.description) {
      return toolCall.description;
    }

    // 🎯 回退到参数格式化（兼容旧版本）
    const entries = Object.entries(toolCall.parameters);
    if (entries.length === 0) return t('tools.noParameters', {}, 'No parameters');

    const paramStrings = entries.slice(0, 2).map(([key, value]) => {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      return `${key}="${strValue}"`;
    });

    const moreCount = Math.max(0, entries.length - 2);
    const result = paramStrings.join(' ');
    return moreCount > 0 ? `${result} +${moreCount} ${t('tools.more', {}, 'more')}` : result;
  };

  // 🎯 获取预览内容
  const getPreviewContent = (): string => {
    if (toolCall.toolName === 'run_shell_command' || toolCall.toolName === 'bash') {
      return `$ ${toolCall.parameters.command || ''}`;
    }
    if (toolCall.toolName === 'write_file') {
      return `Write to: ${toolCall.parameters.file_path}\n\n${(toolCall.parameters.content || '').slice(0, 200)}${(toolCall.parameters.content || '').length > 200 ? '...' : ''}`;
    }
    return JSON.stringify(toolCall.parameters, null, 2);
  };

  const hasMultipleParams = Object.keys(toolCall.parameters).length > 2;

  // 🎯 如果是已完成的todo结果，直接渲染TodoDisplayRenderer，不显示tool-main-line
  if (isTodoResultCompleted()) {
    const todoData = toolCall.result?.data || toolCall.result;
    return <TodoDisplayRenderer data={todoData} />;
  }

  // 🎯 获取当前模式的显示文本
  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'once': return t('tools.executeOnce', {}, 'Ask Every Time');
      case 'always_type': return t('tools.alwaysAllowType', {}, 'Always Allow Type');
      case 'always_project': return t('tools.enableYolo', {}, 'Run Everything');
      default: return t('tools.executeOnce', {}, 'Ask Every Time');
    }
  };

  return (
    <div
      className={`tool-call-item ${isDiffResult() ? 'diff-clickable' : ''}`}
      onClick={isDiffResult() ? handleDiffClick : undefined}
      style={isDiffResult() ? { cursor: 'pointer' } : undefined}
      title={isDiffResult() ? t('tools.clickToViewDiff', {}, 'Click to view complete diff in editor') : undefined}
    >
      {/* 主要工具信息行 - 单行显示 */}
      <div className="tool-main-line">
        <div className="tool-info">
          {getStatusIcon(toolCall.status)}
          <span className="tool-name">{toolCall.displayName}</span>
          <span className="tool-description">{getToolDescription()}</span>
        </div>

        <div className="tool-controls">
          <button
            className="expand-btn"
            onClick={onToggleExpand}
            title={isExpanded ? t('tools.collapseDetails', {}, 'Collapse details') : t('tools.expandDetails', {}, 'Expand details')}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* 确认提示 - 现代设计 */}
      {hasConfirmation && (
        <div className="tool-confirmation-modern">
          {/* 预览区域 */}
          <div className="confirmation-preview">
            <pre>{getPreviewContent()}</pre>
          </div>

          {/* 底部操作栏 */}
          <div className="confirmation-footer-modern">
            {/* 左侧：模式选择下拉菜单 */}
            <div className="mode-selector" ref={dropdownRef}>
              <button
                className="mode-dropdown-trigger"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                title={t('tools.executeOnceTooltip', {}, 'Select execution mode')}
              >
                <span>{getModeLabel(permissionMode)}</span>
                <ChevronDown size={12} />
              </button>

              {isDropdownOpen && (
                <div className="mode-dropdown-menu">
                  <div
                    className={`mode-option ${permissionMode === 'once' ? 'selected' : ''}`}
                    onClick={() => { setPermissionMode('once'); setIsDropdownOpen(false); }}
                  >
                    <Check size={12} className="option-check" />
                    <span>{t('tools.executeOnce', {}, 'Ask Every Time')}</span>
                  </div>
                  <div
                    className={`mode-option ${permissionMode === 'always_type' ? 'selected' : ''}`}
                    onClick={() => { setPermissionMode('always_type'); setIsDropdownOpen(false); }}
                  >
                    <Check size={12} className="option-check" />
                    <span>{t('tools.alwaysAllowType', {}, 'Always Allow Type')}</span>
                  </div>
                  <div
                    className={`mode-option warning ${permissionMode === 'always_project' ? 'selected' : ''}`}
                    onClick={() => { setPermissionMode('always_project'); setIsDropdownOpen(false); }}
                  >
                    <Check size={12} className="option-check" />
                    <span>{t('tools.enableYolo', {}, 'Run Everything')}</span>
                  </div>
                </div>
              )}
            </div>

            {/* 右侧：操作按钮 */}
            <div className="action-buttons">
              <button
                className="action-btn cancel"
                onClick={() => handleConfirmationChoice('cancel')}
              >
                {t('tools.skip', {}, 'Skip')}
              </button>
              <button
                className="action-btn run"
                onClick={() => handleConfirmationChoice(permissionMode)}
              >
                {t('tools.run', {}, 'Run')}
                <RotateCcw size={12} style={{ marginLeft: 4 }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎯 实时输出区域 - 只在工具执行中且有实时输出时显示 */}
      {toolCall.status === TOOL_CALL_STATUS.EXECUTING && toolCall.liveOutput && (
        <div className="tool-live-output">
          <div className="live-output-header">
            <span className="live-output-label">
              {toolCall.status === TOOL_CALL_STATUS.EXECUTING ? t('tools.status.executing', {}, '🔄 Executing...') : t('tools.output', {}, '📄 Output')}
            </span>
            {toolCall.liveOutput && (
              <span className="live-output-size">
                {Math.round((toolCall.liveOutput.length / 1024) * 100) / 100}KB
              </span>
            )}
          </div>
          <div className="live-output-content" ref={liveOutputRef}>
            {toolCall.liveOutput ? (
              <pre className="live-output-text">{toolCall.liveOutput}</pre>
            ) : (
              <div className="live-output-placeholder">{t('tools.waitingForOutput', {}, 'Waiting for output...')}</div>
            )}
          </div>
        </div>
      )}

      {/* 展开的详情：参数 + 结果（均限制高度并可滚动） */}
      {isExpanded && (() => {
        const resultType = getResultType(toolCall.result);
        const isSpecialResult = resultType !== null;

        // 特殊结果类型：只显示结果，不显示参数
        if (isSpecialResult) {
          return (
            <div className="tool-expanded-params">
              <div className="params-json">
                {toolCall.result ? (
                  renderResult(toolCall.result)
                ) : (
                  <div>Working...</div>
                )}
              </div>
            </div>
          );
        }

        // 普通结果：只显示结果的data字段
        return (
          <div className="tool-expanded-params">
            {/* 只显示结果区域 */}
            <div className="params-json compact-result">

              {toolCall.result ? (
                renderResult(toolCall.result)
              ) : (
                <div>{t('tools.working', {}, 'Working...')}</div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// 状态图标组件 - 参考CLI实现
const getStatusIcon = (status: string) => {
  const iconProps = { size: 16, className: "status-icon" };

  switch (status) {
    case TOOL_CALL_STATUS.SCHEDULED:
      return <Circle {...iconProps} className="status-icon pending" />;
    case TOOL_CALL_STATUS.EXECUTING:
      return <RotateCcw {...iconProps} className="status-icon executing animate-spin" />;
    case TOOL_CALL_STATUS.SUCCESS:
      return <CheckCircle {...iconProps} className="status-icon success" />;
    case TOOL_CALL_STATUS.ERROR:
      return <XCircle {...iconProps} className="status-icon error" />;
    case TOOL_CALL_STATUS.WAITING_FOR_CONFIRMATION:
      return <AlertTriangle {...iconProps} className="status-icon confirming" />;
    case TOOL_CALL_STATUS.CANCELED:
      return <Square {...iconProps} className="status-icon cancelled" />;
    default:
      return <HelpCircle {...iconProps} className="status-icon unknown" />;
  }
};

interface ToolCallListProps {
  toolCalls: ToolCall[];
  onConfirm?: (toolCallId: string, confirmed: boolean, userInput?: string, outcome?: string) => void;
  showCompact?: boolean;
}

export const ToolCallList: React.FC<ToolCallListProps> = ({ toolCalls, onConfirm, showCompact = false }) => {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  if (!toolCalls || toolCalls.length === 0) {
    console.log('🔨 [ToolCallList] No tool calls to render');
    return null;
  }

  const toggleExpand = (toolId: string) => {
    setExpandedTools(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolId)) {
        newSet.delete(toolId);
      } else {
        newSet.add(toolId);
      }
      return newSet;
    });
  };

  const handleConfirm = (toolCallId: string) => (confirmed: boolean, userInput?: string, outcome?: string) => {
    onConfirm?.(toolCallId, confirmed, userInput, outcome);
  };

  return (
    <div className="tool-call-list">
      {toolCalls.map((toolCall) => (
        <ToolCallItem
          key={toolCall.id}
          toolCall={toolCall}
          isExpanded={expandedTools.has(toolCall.id)}
          onToggleExpand={() => toggleExpand(toolCall.id)}
          onConfirm={handleConfirm(toolCall.id)}
        />
      ))}
    </div>
  );
};
