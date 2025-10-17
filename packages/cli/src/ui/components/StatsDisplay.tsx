/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { Colors } from '../colors.js';
import { formatDuration } from '../utils/formatters.js';
import { useSessionStats, ModelMetrics } from '../contexts/SessionContext.js';
import {
  getStatusColor,
  TOOL_SUCCESS_RATE_HIGH,
  TOOL_SUCCESS_RATE_MEDIUM,
  USER_AGREEMENT_RATE_HIGH,
  USER_AGREEMENT_RATE_MEDIUM,
} from '../utils/displayUtils.js';
import { computeSessionStats } from '../utils/computeStats.js';
import { SubAgentStatsContainer } from './SubAgentStats.js';
import { calculateModelCost } from '../utils/costCalculator.js';
import { t } from '../utils/i18n.js';
import { useSmallWindowOptimization, WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';

// A more flexible and powerful StatRow component
interface StatRowProps {
  title: string;
  children: React.ReactNode; // Use children to allow for complex, colored values
}

const StatRow: React.FC<StatRowProps> = ({ title, children }) => (
  <Box>
    {/* Fixed width for the label creates a clean "gutter" for alignment */}
    <Box width={28}>
      <Text color={Colors.LightBlue}>{title}</Text>
    </Box>
    {children}
  </Box>
);

// A SubStatRow for indented, secondary information
interface SubStatRowProps {
  title: string;
  children: React.ReactNode;
}

const SubStatRow: React.FC<SubStatRowProps> = ({ title, children }) => (
  <Box paddingLeft={2}>
    {/* Adjust width for the "» " prefix */}
    <Box width={26}>
      <Text>» {title}</Text>
    </Box>
    {children}
  </Box>
);

// A Section component to group related stats
interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <Box flexDirection="column" width="100%" marginBottom={1}>
    <Text bold>{title}</Text>
    {children}
  </Box>
);

const ModelUsageTable: React.FC<{
  models: Record<string, ModelMetrics>;
  totalCachedTokens: number;
  cacheEfficiency: number;
}> = ({ models, totalCachedTokens, cacheEfficiency }) => {
  const requestsWidth = 8;
  const inputTokensWidth = 12;
  const outputTokensWidth = 12;
  const cacheWidth = 12;
  const creditsWidth = 10;
  const costWidth = 10;



  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header */}
      <Box>
        <Box width={requestsWidth} justifyContent="flex-end">
          <Text bold>{t('table.header.reqs')}</Text>
        </Box>
        <Box width={inputTokensWidth} justifyContent="flex-end">
          <Text bold>{t('table.header.input')}</Text>
        </Box>
        <Box width={outputTokensWidth} justifyContent="flex-end">
          <Text bold>{t('table.header.output')}</Text>
        </Box>
        <Box width={cacheWidth} justifyContent="flex-end">
          <Text bold>{t('table.header.cache')}</Text>
        </Box>
        <Box width={creditsWidth} justifyContent="flex-end">
          <Text bold>{t('table.header.credits')}</Text>
        </Box>
        <Box width={costWidth} justifyContent="flex-end">
          <Text bold>{t('table.header.cost')}</Text>
        </Box>
      </Box>
      {/* Divider */}
      <Box
        borderStyle="round"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        width={requestsWidth + inputTokensWidth + outputTokensWidth + cacheWidth + creditsWidth + costWidth}
      ></Box>

      {/* Rows */}
      {Object.entries(models).map(([name, modelMetrics]) => {
        const cacheRead = modelMetrics.tokens.cacheRead || 0;
        const costs = calculateModelCost(name, modelMetrics);

        return (
          <Box key={name}>
            <Box width={requestsWidth} justifyContent="flex-end">
              <Text>{modelMetrics.api.totalRequests}</Text>
            </Box>
            <Box width={inputTokensWidth} justifyContent="flex-end">
              <Text color={Colors.AccentYellow}>
                {modelMetrics.tokens.prompt.toLocaleString()}
              </Text>
            </Box>
            <Box width={outputTokensWidth} justifyContent="flex-end">
              <Text color={Colors.AccentYellow}>
                {modelMetrics.tokens.candidates.toLocaleString()}
              </Text>
            </Box>
            <Box width={cacheWidth} justifyContent="flex-end">
              {cacheRead > 0 ? (
                <Text color={Colors.AccentGreen}>
                  {cacheRead.toLocaleString()}
                </Text>
              ) : (
                <Text color={Colors.Gray}>-</Text>
              )}
            </Box>
            <Box width={creditsWidth} justifyContent="flex-end">
              {modelMetrics.credits.total > 0 ? (
                <Text color={Colors.AccentPurple} bold>
                  {modelMetrics.credits.total.toLocaleString()}
                </Text>
              ) : (
                <Text color={Colors.Gray}>-</Text>
              )}
            </Box>
            <Box width={costWidth} justifyContent="flex-end">
              {costs ? (
                <Text color={Colors.AccentRed} bold>
                  ${costs.total.toFixed(4)}
                </Text>
              ) : (
                <Text color={Colors.Gray}>-</Text>
              )}
            </Box>
          </Box>
        );
      })}


    </Box>
  );
};

interface StatsDisplayProps {
  duration: string;
  title?: string;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({
  duration,
  title,
}) => {
  const smallWindowConfig = useSmallWindowOptimization();

  // 在小窗口下隐藏详细统计信息，节省垂直空间
  if (smallWindowConfig.sizeLevel !== WindowSizeLevel.NORMAL) {
    return null;
  }

  const { stats } = useSessionStats();
  const { metrics } = stats;
  const { models, tools } = metrics;
  const computed = computeSessionStats(metrics);

  const successThresholds = {
    green: TOOL_SUCCESS_RATE_HIGH,
    yellow: TOOL_SUCCESS_RATE_MEDIUM,
  };
  const agreementThresholds = {
    green: USER_AGREEMENT_RATE_HIGH,
    yellow: USER_AGREEMENT_RATE_MEDIUM,
  };
  const successColor = getStatusColor(computed.successRate, successThresholds);
  const agreementColor = getStatusColor(
    computed.agreementRate,
    agreementThresholds,
  );

  const renderTitle = () => {
    if (title) {
      return Colors.GradientColors && Colors.GradientColors.length > 0 ? (
        <Gradient colors={Colors.GradientColors}>
          <Text bold>{title}</Text>
        </Gradient>
      ) : (
        <Text bold color={Colors.AccentPurple}>
          {title}
        </Text>
      );
    }
    return (
      <Text bold color={Colors.AccentPurple}>
        {t('stats.session.stats')}
      </Text>
    );
  };

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
    >
      {renderTitle()}
      <Box height={1} />

      {tools.totalCalls > 0 && (
        <Section title={t('section.interaction.summary')}>
          <StatRow title={t('stats.tool.calls')}>
            <Text>
              {tools.totalCalls} ({' '}
              <Text color={Colors.AccentGreen}>✔ {tools.totalSuccess}</Text>{' '}
              <Text color={Colors.AccentRed}>✖ {tools.totalFail}</Text> )
            </Text>
          </StatRow>
          <StatRow title={t('stats.success.rate')}>
            <Text color={successColor}>{computed.successRate.toFixed(1)}%</Text>
          </StatRow>
          {computed.totalDecisions > 0 && (
            <StatRow title={t('stats.user.agreement')}>
              <Text color={agreementColor}>
                {computed.agreementRate.toFixed(1)}%{' '}
                <Text color={Colors.Gray}>
                  ({computed.totalDecisions} {t('stats.reviewed')})
                </Text>
              </Text>
            </StatRow>
          )}
        </Section>
      )}

      <Section title={t('section.performance')}>
        <StatRow title={t('stats.wall.time')}>
          <Text>{duration}</Text>
        </StatRow>
        <StatRow title={t('stats.agent.active')}>
          <Text>{formatDuration(computed.agentActiveTime)}</Text>
        </StatRow>
        <SubStatRow title={t('stats.api.time')}>
          <Text>
            {formatDuration(computed.totalApiTime)}{' '}
            <Text color={Colors.Gray}>
              ({computed.apiTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
        <SubStatRow title={t('stats.tool.time')}>
          <Text>
            {formatDuration(computed.totalToolTime)}{' '}
            <Text color={Colors.Gray}>
              ({computed.toolTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
      </Section>

      {Object.keys(models).length > 0 && (
        <ModelUsageTable
          models={models}
          totalCachedTokens={computed.totalCachedTokens}
          cacheEfficiency={computed.cacheEfficiency}
        />
      )}

      {/* SubAgent统计展示 - 仅在有活动时显示 */}
      <SubAgentStatsContainer />
    </Box>
  );
};
