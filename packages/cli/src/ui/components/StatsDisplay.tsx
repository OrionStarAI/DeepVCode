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
      </Box>
      {/* Divider */}
      <Box
        borderStyle="round"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        width={requestsWidth + inputTokensWidth + outputTokensWidth + cacheWidth + creditsWidth}
      ></Box>

      {/* Rows */}
      {Object.entries(models).map(([name, modelMetrics]) => {
        const cacheRead = modelMetrics.tokens.cacheRead || 0;

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

  // 🎯 检测 VS Code 环境
  const isVSCode = !!(
    process.env.VSCODE_PID ||
    process.env.TERM_PROGRAM === 'vscode'
  );

  // 🎯 小窗口模式：精简单行格式
  // 注意：VS Code 中始终显示完整格式
  if (!isVSCode &&
      (smallWindowConfig.sizeLevel === WindowSizeLevel.SMALL ||
       smallWindowConfig.sizeLevel === WindowSizeLevel.TINY)) {
    // 从所有模型中计算总计数据
    const totalInput = Object.values(models).reduce(
      (sum, model) => sum + model.tokens.prompt,
      0
    );
    const totalOutput = Object.values(models).reduce(
      (sum, model) => sum + model.tokens.candidates,
      0
    );
    const totalTokens = totalInput + totalOutput;
    const totalCached = Object.values(models).reduce(
      (sum, model) => sum + (model.tokens.cacheRead || 0),
      0
    );
    const totalCredits = Object.values(models).reduce(
      (sum, model) => sum + model.credits.total,
      0
    );
    const cacheEfficiency = computed.cacheEfficiency;

    return (
      <Box flexDirection="column">
        <Text>
          <Text color={Colors.AccentPurple} bold>{t('stats.compact.token.usage')}</Text>
          {' '}
          {t('stats.compact.input')}: <Text color={Colors.AccentYellow}>{totalInput.toLocaleString()}</Text>
          {totalCached > 0 && (
            <>
              {' '}
              {t('stats.compact.cache.read')}: <Text color={Colors.AccentGreen}>{totalCached.toLocaleString()}</Text>
            </>
          )}
          {' '}
          {t('stats.compact.output')}: <Text color={Colors.AccentYellow}>{totalOutput.toLocaleString()}</Text>
          {' '}
          {t('stats.compact.total')}: <Text color={Colors.AccentYellow}>{totalTokens.toLocaleString()}</Text>
          {totalCredits > 0 && (
            <>
              {' '}
              {t('stats.compact.credits')}: <Text color={Colors.AccentPurple}>{totalCredits.toLocaleString()}</Text>
            </>
          )}
          {cacheEfficiency > 0 && (
            <>
              {' '}
              {t('stats.compact.cache.hit.rate')}: <Text color={Colors.AccentGreen}>{cacheEfficiency.toFixed(1)}%</Text>
            </>
          )}
        </Text>
      </Box>
    );
  }

  // 🎯 正常窗口模式：完整样式
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
