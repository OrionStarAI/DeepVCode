/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { useSessionStats, SubAgentStats } from '../contexts/SessionContext.js';
import { t } from '../utils/i18n.js';
import { useSmallWindowOptimization, WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';

interface SubAgentStatsDisplayProps {
  subAgentStats: SubAgentStats;
  subAgentUsagePercent: number;
  hasSubAgentActivity: boolean;
}

const SubAgentStatsDisplay: React.FC<SubAgentStatsDisplayProps> = ({
  subAgentStats,
  subAgentUsagePercent,
  hasSubAgentActivity,
}) => {
  const smallWindowConfig = useSmallWindowOptimization();

  // 在小窗口下隐藏SubAgent统计信息，节省垂直空间
  if (!hasSubAgentActivity || smallWindowConfig.sizeLevel !== WindowSizeLevel.NORMAL) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text color={Colors.AccentBlue} bold>
          📋 {t('subagent.activity')}
        </Text>
      </Box>

      <Box flexDirection="column" paddingLeft={2}>
        {/* API调用统计 */}
        <Box marginBottom={1}>
          <Text color={Colors.Gray}>{t('subagent.api.calls')}</Text>
          <Text color={Colors.Foreground}>{subAgentStats.totalApiCalls}</Text>
          {subAgentStats.totalErrors > 0 && (
            <>
              <Text color={Colors.Gray}> (</Text>
              <Text color={Colors.AccentRed}>{subAgentStats.totalErrors} {t('subagent.errors')}</Text>
              <Text color={Colors.Gray}>)</Text>
            </>
          )}
        </Box>

        {/* Token使用统计 */}
        <Box marginBottom={1}>
          <Text color={Colors.Gray}>{t('subagent.token.usage')}</Text>
          <Text color={Colors.AccentYellow}>{subAgentStats.totalTokens.toLocaleString()}</Text>
          <Text color={Colors.Gray}> tokens (</Text>
          <Text color={Colors.AccentYellow}>{subAgentUsagePercent.toFixed(1)}%</Text>
          <Text color={Colors.Gray}> {t('subagent.of.total')})</Text>
        </Box>

        {/* Token分布 */}
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Box>
            <Text color={Colors.Gray}>• {t('subagent.prompt')}</Text>
            <Text color={Colors.Foreground}>{subAgentStats.promptTokens.toLocaleString()}</Text>
          </Box>
          <Box>
            <Text color={Colors.Gray}>• {t('subagent.response')}</Text>
            <Text color={Colors.Foreground}>{subAgentStats.candidatesTokens.toLocaleString()}</Text>
          </Box>
          {subAgentStats.cachedTokens > 0 && (
            <Box>
              <Text color={Colors.Gray}>• {t('subagent.cached')}</Text>
              <Text color={Colors.AccentGreen}>{subAgentStats.cachedTokens.toLocaleString()}</Text>
            </Box>
          )}
          {subAgentStats.thoughtsTokens > 0 && (
            <Box>
              <Text color={Colors.Gray}>• {t('subagent.thoughts')}</Text>
              <Text color={Colors.Foreground}>{subAgentStats.thoughtsTokens.toLocaleString()}</Text>
            </Box>
          )}
          {subAgentStats.toolTokens > 0 && (
            <Box>
              <Text color={Colors.Gray}>• {t('subagent.tool')}</Text>
              <Text color={Colors.Foreground}>{subAgentStats.toolTokens.toLocaleString()}</Text>
            </Box>
          )}
        </Box>

        {/* 平均延迟 */}
        <Box>
          <Text color={Colors.Gray}>{t('subagent.avg.latency')}</Text>
          <Text color={Colors.Foreground}>
            {subAgentStats.totalApiCalls > 0
              ? Math.round(subAgentStats.totalLatencyMs / subAgentStats.totalApiCalls)
              : 0}ms
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * 自动展示SubAgent统计信息的组件
 * 仅在有SubAgent活动时显示
 */
export const SubAgentStatsContainer: React.FC = () => {
  const { stats, computedStats } = useSessionStats();

  return (
    <SubAgentStatsDisplay
      subAgentStats={stats.subAgentStats}
      subAgentUsagePercent={computedStats.subAgentUsagePercent}
      hasSubAgentActivity={computedStats.hasSubAgentActivity}
    />
  );
};

export default SubAgentStatsDisplay;
