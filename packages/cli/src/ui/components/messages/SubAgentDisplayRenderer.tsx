/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import { ToolCallStatus } from '../../types.js';
import { SubAgentDisplay } from 'deepv-code-core';
import { GeminiRespondingSpinner } from '../GeminiRespondingSpinner.js';
import { getLocalizedToolName, t, tp } from '../../utils/i18n.js';

interface SubAgentDisplayRendererProps {
  data: SubAgentDisplay;
}

/**
 * SubAgent执行状态的UI渲染器
 * 采用新的ASCII树状结构显示
 */
export const SubAgentDisplayRenderer: React.FC<SubAgentDisplayRendererProps> = ({ data }) => {
  // 根据整体状态决定标题颜色和图标
  const getTitleInfo = () => {
    switch (data.status) {
      case 'starting':
      case 'running':
        return { icon: '●', color: Colors.AccentBlue };
      case 'completed':
        return { icon: '✓', color: Colors.AccentGreen };
      case 'failed':
        return { icon: '✗', color: Colors.AccentRed };
      case 'cancelled':
        return { icon: '■', color: Colors.AccentYellow };
      default:
        return { icon: '●', color: Colors.Foreground };
    }
  };

  const titleInfo = getTitleInfo();

  // 工具状态对应的图标
  const getToolStatusIcon = (status: ToolCallStatus) => {
    switch (status) {
      case ToolCallStatus.Pending:
        return '○';
      case ToolCallStatus.Executing:
        return '~';
      case ToolCallStatus.SubAgentRunning:
        return '●';
      case ToolCallStatus.Success:
        return '✓';
      case ToolCallStatus.Error:
        return '✗';
      case ToolCallStatus.Canceled:
        return '■';
      case ToolCallStatus.Confirming:
        return '?';
      default:
        return '?';
    }
  };

  // 格式化执行时间
  const formatDuration = (durationMs?: number): string => {
    if (!durationMs) return '';
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
  };

  // 格式化Token使用量
  const formatTokenUsage = (tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }): string => {
    if (!tokenUsage || tokenUsage.totalTokens === 0) {
      return '0';
    }

    const { totalTokens } = tokenUsage;
    if (totalTokens >= 1000) {
      return `${(totalTokens / 1000).toFixed(1)}k`;
    }
    return totalTokens.toString();
  };

  // 渲染执行中的工具列表
  const renderToolCallsList = () => {
    if (!data.toolCalls || data.toolCalls.length === 0) {
      return (
        <Box>
          <Text color={Colors.Gray}>├─ initializing...</Text>
        </Box>
      );
    }

    // 只显示最近的3个工具调用
    const maxDisplayTools = 3;
    const totalTools = data.toolCalls.length;
    const hiddenToolsCount = Math.max(0, totalTools - maxDisplayTools);
    const displayTools = data.toolCalls.slice(-maxDisplayTools);

    return (
      <Box flexDirection="column">
        {/* 如果有隐藏的工具，先显示汇总信息 */}
        {hiddenToolsCount > 0 && (
          <Box>
            <Text color={Colors.Gray}>├─ </Text>
            <Text color={Colors.Gray}>({hiddenToolsCount} more tools)</Text>
          </Box>
        )}

        {displayTools.map((toolCall, idx) => {
          const isLast = idx === displayTools.length - 1 && hiddenToolsCount === 0;
          const connector = isLast ? '└─' : '├─';
          const statusIcon = getToolStatusIcon(toolCall.status as ToolCallStatus);
          const duration = formatDuration(toolCall.durationMs);

          // 🔧 截断过长的描述，确保单行显示
          const maxDescLength = 80;
          const truncatedDesc = toolCall.description.length > maxDescLength
            ? toolCall.description.slice(0, maxDescLength) + '...'
            : toolCall.description;

          // 🔧 构建完整的单行文本
          const fullText = `${connector} ${statusIcon} ${getLocalizedToolName(toolCall.toolName)}  ${truncatedDesc}${duration ? `  (${duration})` : ''}`;

          return (
            <Box key={toolCall.callId || `tool-${idx}`}>
              <Text color={Colors.Gray} wrap="truncate">{fullText}</Text>
              {/* 正在执行的工具显示spinner */}
              {toolCall.status === ToolCallStatus.Executing && (
                <Text> </Text>
              )}
            </Box>
          );
        })}
      </Box>
    );
  };

  // 渲染完成状态的统计信息
  const renderCompletedStats = () => {
    const totalDuration = data.endTime ? data.endTime - data.startTime : 0;
    const formattedTotalDuration = formatDuration(totalDuration);

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={Colors.Gray}>├─ {t('subagent.tool.calls')} </Text>
          <Text>{tp('subagent.tool.calls.count', { count: data.stats.totalToolCalls })}</Text>
        </Box>

        <Box>
          <Text color={Colors.Gray}>├─ {t('subagent.execution.time')} </Text>
          <Text>{formattedTotalDuration || '< 1ms'}</Text>
        </Box>

        <Box>
          <Text color={Colors.Gray}>└─ {t('subagent.token.consumption')} </Text>
          <Text>{formatTokenUsage(data.stats.tokenUsage)}</Text>
        </Box>

        {/* 错误信息（如果失败） */}
        {data.status === 'failed' && data.error && (
          <Box marginTop={1}>
            <Text color={Colors.AccentRed}>   ⚠️  {data.error}</Text>
          </Box>
        )}
      </Box>
    );
  };

  // 主渲染逻辑 - 参考TODO的样式，去掉重复的标题
  return (
    <Box flexDirection="column">
      {/* 直接渲染内容，不需要重复的Task标题 */}
      {(data.status === 'starting' || data.status === 'running')
        ? renderToolCallsList()
        : renderCompletedStats()}

      {/* 当前状态提示（仅在执行中显示） */}
      {data.status === 'running' && data.toolCalls && data.toolCalls.length > 0 && (
        <Box marginTop={1}>
          <Text color={Colors.Gray}>   </Text>
          <GeminiRespondingSpinner
            nonRespondingDisplay="⠏"
          />
          <Text color={Colors.AccentBlue}> 子Agent正在思考和执行...</Text>
        </Box>
      )}
    </Box>
  );
};
