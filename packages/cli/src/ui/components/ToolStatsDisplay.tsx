/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { formatDuration, formatContentLength } from '../utils/formatters.js';
import {
  getStatusColor,
  TOOL_SUCCESS_RATE_HIGH,
  TOOL_SUCCESS_RATE_MEDIUM,
  USER_AGREEMENT_RATE_HIGH,
  USER_AGREEMENT_RATE_MEDIUM,
} from '../utils/displayUtils.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { ToolCallStats } from 'deepv-code-core';
import { useSmallWindowOptimization, WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';
import { t } from '../utils/i18n.js';

const TOOL_NAME_COL_WIDTH = 22;
const CALLS_COL_WIDTH = 8;
const SUCCESS_RATE_COL_WIDTH = 12;
const AVG_DURATION_COL_WIDTH = 12;
const AVG_RESPONSE_LENGTH_COL_WIDTH = 12;

const StatRow: React.FC<{
  name: string;
  stats: ToolCallStats;
}> = ({ name, stats }) => {
  const successRate = stats.count > 0 ? (stats.success / stats.count) * 100 : 0;
  const avgDuration = stats.count > 0 ? stats.durationMs / stats.count : 0;
  const totalResponseLength = stats.responseLength;
  const successColor = getStatusColor(successRate, {
    green: TOOL_SUCCESS_RATE_HIGH,
    yellow: TOOL_SUCCESS_RATE_MEDIUM,
  });

  return (
    <Box>
      <Box width={TOOL_NAME_COL_WIDTH}>
        <Text color={Colors.LightBlue}>{name}</Text>
      </Box>
      <Box width={CALLS_COL_WIDTH} justifyContent="flex-end">
        <Text>{stats.count}</Text>
      </Box>
      <Box width={SUCCESS_RATE_COL_WIDTH} justifyContent="flex-end">
        <Text color={successColor}>{successRate.toFixed(1)}%</Text>
      </Box>
      <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
        <Text>{formatDuration(avgDuration)}</Text>
      </Box>
      <Box width={AVG_RESPONSE_LENGTH_COL_WIDTH} justifyContent="flex-end">
        <Text>{formatContentLength(totalResponseLength)}</Text>
      </Box>
    </Box>
  );
};

export const ToolStatsDisplay: React.FC = () => {
  const smallWindowConfig = useSmallWindowOptimization();

  const { stats } = useSessionStats();
  const { tools } = stats.metrics;
  const activeTools = Object.entries(tools.byName).filter(
    ([, metrics]) => metrics.count > 0,
  );

  if (activeTools.length === 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        paddingY={1}
        paddingX={2}
      >
        <Text>{t('tool.stats.no.calls')}</Text>
      </Box>
    );
  }

  const totalDecisions = Object.values(tools.byName).reduce(
    (acc, tool) => {
      acc.accept += tool.decisions.accept;
      acc.reject += tool.decisions.reject;
      acc.modify += tool.decisions.modify;
      return acc;
    },
    { accept: 0, reject: 0, modify: 0 },
  );

  const totalReviewed =
    totalDecisions.accept + totalDecisions.reject + totalDecisions.modify;
  const agreementRate =
    totalReviewed > 0 ? (totalDecisions.accept / totalReviewed) * 100 : 0;
  const agreementColor = getStatusColor(agreementRate, {
    green: USER_AGREEMENT_RATE_HIGH,
    yellow: USER_AGREEMENT_RATE_MEDIUM,
  });

  // 🎯 小窗口模式：精简单行格式
  if (smallWindowConfig.sizeLevel === WindowSizeLevel.SMALL ||
      smallWindowConfig.sizeLevel === WindowSizeLevel.TINY) {
    return (
      <Box flexDirection="column">
        <Text>
          <Text color={Colors.AccentPurple} bold>Tool Stats</Text>
          {' '}
          <Text color={Colors.LightBlue}>Total:</Text> <Text>{tools.totalCalls}</Text>
          {' '}
          <Text color={Colors.LightBlue}>Success:</Text> <Text color={Colors.AccentGreen}>{tools.totalSuccess}</Text>
          {' '}
          <Text color={Colors.LightBlue}>Fail:</Text> <Text color={Colors.AccentRed}>{tools.totalFail}</Text>
          {totalReviewed > 0 && (
            <>
              {' '}
              <Text color={Colors.LightBlue}>Agreement:</Text> <Text color={agreementColor}>{agreementRate.toFixed(1)}%</Text>
              {' '}
              <Text color={Colors.Gray}>({totalReviewed} reviewed)</Text>
            </>
          )}
        </Text>
        {activeTools.map(([toolName, toolStats]) => {
          const successRate = toolStats.count > 0 ? (toolStats.success / toolStats.count) * 100 : 0;
          const avgDuration = toolStats.count > 0 ? toolStats.durationMs / toolStats.count : 0;
          const totalResponseLength = toolStats.responseLength;
          const successColor = getStatusColor(successRate, {
            green: TOOL_SUCCESS_RATE_HIGH,
            yellow: TOOL_SUCCESS_RATE_MEDIUM,
          });

          return (
            <Text key={toolName}>
              {' • '}
              <Text color={Colors.LightBlue}>{toolName}</Text>
              {': '}
              <Text>{toolStats.count}x</Text>
              {' '}
              <Text color={successColor}>{successRate.toFixed(1)}%</Text>
              {' '}
              <Text>{formatDuration(avgDuration)}</Text>
              {' '}
              <Text>{formatContentLength(totalResponseLength)}</Text>
            </Text>
          );
        })}
      </Box>
    );
  }

  // 🎯 正常窗口模式：完整样式
  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
      width={82}
    >
      <Text bold color={Colors.AccentPurple}>
        Tool Stats For Nerds
      </Text>
      <Box height={1} />

      {/* Header */}
      <Box>
        <Box width={TOOL_NAME_COL_WIDTH}>
          <Text bold>工具名称</Text>
        </Box>
        <Box width={CALLS_COL_WIDTH} justifyContent="flex-end">
          <Text bold>调用次数</Text>
        </Box>
        <Box width={SUCCESS_RATE_COL_WIDTH} justifyContent="flex-end">
          <Text bold>成功率</Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text bold>平均耗时</Text>
        </Box>
        <Box width={AVG_RESPONSE_LENGTH_COL_WIDTH} justifyContent="flex-end">
          <Text bold>响应大小</Text>
        </Box>
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        width="100%"
      />

      {/* Tool Rows */}
      {activeTools.map(([name, stats]) => (
        <StatRow key={name} name={name} stats={stats as ToolCallStats} />
      ))}

      <Box height={1} />

      {/* User Decision Summary */}
      <Text bold>用户决策摘要</Text>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH + AVG_DURATION_COL_WIDTH}
        >
          <Text color={Colors.LightBlue}>已审核建议总数:</Text>
        </Box>
        <Box width={AVG_RESPONSE_LENGTH_COL_WIDTH} justifyContent="flex-end">
          <Text>{totalReviewed}</Text>
        </Box>
      </Box>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH + AVG_DURATION_COL_WIDTH}
        >
          <Text> » 已接受:</Text>
        </Box>
        <Box width={AVG_RESPONSE_LENGTH_COL_WIDTH} justifyContent="flex-end">
          <Text color={Colors.AccentGreen}>{totalDecisions.accept}</Text>
        </Box>
      </Box>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH + AVG_DURATION_COL_WIDTH}
        >
          <Text> » 已拒绝:</Text>
        </Box>
        <Box width={AVG_RESPONSE_LENGTH_COL_WIDTH} justifyContent="flex-end">
          <Text color={Colors.AccentRed}>{totalDecisions.reject}</Text>
        </Box>
      </Box>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH + AVG_DURATION_COL_WIDTH}
        >
          <Text> » 已修改:</Text>
        </Box>
        <Box width={AVG_RESPONSE_LENGTH_COL_WIDTH} justifyContent="flex-end">
          <Text color={Colors.AccentYellow}>{totalDecisions.modify}</Text>
        </Box>
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        width="100%"
      />

      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH + AVG_DURATION_COL_WIDTH}
        >
          <Text> 总体接受率:</Text>
        </Box>
        <Box width={AVG_RESPONSE_LENGTH_COL_WIDTH} justifyContent="flex-end">
          <Text bold color={totalReviewed > 0 ? agreementColor : undefined}>
            {totalReviewed > 0 ? `${agreementRate.toFixed(1)}%` : '--'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
