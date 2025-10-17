/**
 * SubAgentDisplayRenderer Component - Web版
 * 用于在VSCode插件中显示SubAgent执行状态
 */

import React from 'react';

interface ToolCall {
  id: string;
  name: string;
  displayName?: string;
  status: string;
  description?: string;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface SubAgentStats {
  totalToolCalls: number;
  tokenUsage?: TokenUsage;
}

interface SubAgentDisplay {
  type: 'subagent_display';
  status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  toolCalls?: ToolCall[];
  stats: SubAgentStats;
  error?: string;
}

interface SubAgentDisplayRendererProps {
  data: SubAgentDisplay;
}

/**
 * 获取状态信息
 */
const getStatusInfo = (status: string) => {
  switch (status) {
    case 'starting':
    case 'running':
      return { icon: '●', color: 'var(--vscode-charts-blue)' };
    case 'completed':
      return { icon: '✓', color: 'var(--vscode-charts-green)' };
    case 'failed':
      return { icon: '✗', color: 'var(--vscode-charts-red)' };
    case 'cancelled':
      return { icon: '■', color: 'var(--vscode-charts-yellow)' };
    default:
      return { icon: '●', color: 'var(--vscode-foreground)' };
  }
};

/**
 * 获取工具状态图标
 */
const getToolStatusIcon = (status: string): string => {
  switch (status) {
    case 'pending':
      return '○';
    case 'executing':
      return '~';
    case 'subagent_running':
      return '●';
    case 'success':
      return '✓';
    case 'error':
      return '✗';
    case 'canceled':
      return '■';
    case 'confirming':
      return '?';
    default:
      return '?';
  }
};

/**
 * 格式化执行时间
 */
const formatDuration = (durationMs?: number): string => {
  if (!durationMs) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
};

/**
 * 格式化Token使用量
 */
const formatTokenUsage = (tokenUsage?: TokenUsage): string => {
  if (!tokenUsage || tokenUsage.totalTokens === 0) {
    return '0';
  }
  
  const { totalTokens } = tokenUsage;
  if (totalTokens >= 1000) {
    return `${(totalTokens / 1000).toFixed(1)}k`;
  }
  return totalTokens.toString();
};

export const SubAgentDisplayRenderer: React.FC<SubAgentDisplayRendererProps> = ({ data }) => {
  const statusInfo = getStatusInfo(data.status);
  
  console.log('🎯 [SubAgentDisplayRenderer] Rendering SubAgent data:', data);
  
  // 渲染执行中的工具列表
  const renderRunningToolsList = () => {
    if (!data.toolCalls || data.toolCalls.length === 0) return null;

    return (
      <div className="subagent-running-tools">
        {data.toolCalls.map((toolCall, index) => {
          const isLast = index === data.toolCalls!.length - 1;
          const connector = isLast ? '└' : '├';
          
          return (
            <div key={toolCall.id} className="subagent-tool-item">
              <span className="subagent-connector">{connector}─</span>
              <span className="subagent-tool-icon">
                {getToolStatusIcon(toolCall.status)}
              </span>
              <span className="subagent-tool-name">
                {toolCall.displayName || toolCall.name}
              </span>
              {toolCall.description && (
                <span className="subagent-tool-desc">
                  {toolCall.description}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 渲染完成状态的统计信息
  const renderCompletedStats = () => {
    const totalDuration = data.endTime ? data.endTime - data.startTime : 0;
    const formattedDuration = formatDuration(totalDuration);
    
    return (
      <div className="subagent-stats">
        <div className="subagent-stat-item">
          <span className="subagent-connector">├─</span>
          <span className="subagent-stat-label">工具调用:</span>
          <span className="subagent-stat-value">{data.stats.totalToolCalls}次</span>
        </div>
        
        <div className="subagent-stat-item">
          <span className="subagent-connector">├─</span>
          <span className="subagent-stat-label">执行时间:</span>
          <span className="subagent-stat-value">{formattedDuration || '< 1ms'}</span>
        </div>
        
        <div className="subagent-stat-item">
          <span className="subagent-connector">└─</span>
          <span className="subagent-stat-label">Token消耗:</span>
          <span className="subagent-stat-value">{formatTokenUsage(data.stats.tokenUsage)}</span>
        </div>

        {/* 错误信息 */}
        {data.status === 'failed' && data.error && (
          <div className="subagent-error">
            <span className="subagent-error-icon">⚠️</span>
            <span className="subagent-error-text">{data.error}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="subagent-display-container">
      {/* 渲染内容 */}
      {(data.status === 'starting' || data.status === 'running') 
        ? renderRunningToolsList() 
        : renderCompletedStats()}

      {/* 当前状态提示（仅在执行中显示） */}
      {data.status === 'running' && data.toolCalls && data.toolCalls.length > 0 && (
        <div className="subagent-running-hint">
          <span className="subagent-spinner">⠏</span>
          <span className="subagent-running-text">子Agent正在思考和执行...</span>
        </div>
      )}
    </div>
  );
};
