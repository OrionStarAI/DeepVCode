/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { formatDuration } from '../utils/formatters.js';
import {
  calculateAverageLatency,
  calculateCacheHitRate,
  calculateErrorRate,
} from '../utils/computeStats.js';
import { useSessionStats, ModelMetrics } from '../contexts/SessionContext.js';
import { useSmallWindowOptimization, WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';
import { t } from '../utils/i18n.js';

const METRIC_COL_WIDTH = 28;
const MODEL_COL_WIDTH = 22;

interface StatRowProps {
  title: string;
  values: Array<string | React.ReactElement>;
  isSubtle?: boolean;
  isSection?: boolean;
}

const StatRow: React.FC<StatRowProps> = ({
  title,
  values,
  isSubtle = false,
  isSection = false,
}) => (
  <Box>
    <Box width={METRIC_COL_WIDTH}>
      <Text bold={isSection} color={isSection ? undefined : Colors.LightBlue}>
        {isSubtle ? `  ↳ ${title}` : title}
      </Text>
    </Box>
    {values.map((value, index) => (
      <Box width={MODEL_COL_WIDTH} key={index}>
        <Text>{value}</Text>
      </Box>
    ))}
  </Box>
);

export const ModelStatsDisplay: React.FC = () => {
  const smallWindowConfig = useSmallWindowOptimization();

  const { stats } = useSessionStats();
  const { models } = stats.metrics;
  const activeModels = Object.entries(models).filter(
    ([, metrics]) => metrics.api.totalRequests > 0,
  );

  if (activeModels.length === 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        paddingY={1}
        paddingX={2}
      >
        <Text>{t('model.stats.no.calls')}</Text>
      </Box>
    );
  }

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
    return (
      <Box flexDirection="column">
        {activeModels.map(([modelName, metrics]) => {
          const errorRate = calculateErrorRate(metrics);
          const avgLatency = calculateAverageLatency(metrics);
          const cacheHitRate = calculateCacheHitRate(metrics);

          return (
            <Box key={modelName} flexDirection="column">
              <Text>
                <Text color={Colors.AccentPurple} bold>{modelName}</Text>
                {' '}
                {t('stats.compact.model.requests')}: <Text>{metrics.api.totalRequests}</Text>
                {' '}
                {t('stats.compact.input')}: <Text color={Colors.AccentYellow}>{metrics.tokens.prompt.toLocaleString()}</Text>
                {metrics.tokens.cached > 0 && (
                  <>
                    {' '}
                    {t('stats.compact.cache.read')}: <Text color={Colors.AccentGreen}>{metrics.tokens.cached.toLocaleString()}</Text>
                  </>
                )}
                {' '}
                {t('stats.compact.output')}: <Text color={Colors.AccentYellow}>{metrics.tokens.candidates.toLocaleString()}</Text>
                {' '}
                {t('stats.compact.total')}: <Text color={Colors.AccentYellow}>{metrics.tokens.total.toLocaleString()}</Text>
                {metrics.tokens.cached > 0 && (
                  <>
                    {' '}
                    {t('stats.compact.cache.hit.rate')}: <Text color={Colors.AccentGreen}>{cacheHitRate.toFixed(1)}%</Text>
                  </>
                )}
                {metrics.api.totalErrors > 0 && (
                  <>
                    {' '}
                    {t('stats.compact.model.errors')}: <Text color={Colors.AccentRed}>{metrics.api.totalErrors} ({errorRate.toFixed(1)}%)</Text>
                  </>
                )}
                {' '}
                {t('stats.compact.model.avg.latency')}: <Text>{formatDuration(avgLatency)}</Text>
              </Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  // 🎯 正常窗口模式：完整样式
  const modelNames = activeModels.map(([name]) => name);

  const getModelValues = (
    getter: (metrics: ModelMetrics) => string | React.ReactElement,
  ) => activeModels.map(([, metrics]) => getter(metrics));

  const hasThoughts = activeModels.some(
    ([, metrics]) => metrics.tokens.thoughts > 0,
  );
  const hasTool = activeModels.some(([, metrics]) => metrics.tokens.tool > 0);
  const hasCached = activeModels.some(
    ([, metrics]) => metrics.tokens.cached > 0,
  );

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
    >
      <Text bold color={Colors.AccentPurple}>
        {t('model.stats.title')}
      </Text>
      <Box height={1} />

      {/* Header */}
      <Box>
        <Box width={METRIC_COL_WIDTH}>
          <Text bold>{t('model.stats.header.metric')}</Text>
        </Box>
        {modelNames.map((name, index) => (
          <Box width={MODEL_COL_WIDTH} key={name}>
            <Text bold>{t('model.stats.header.model')}{String(index + 1)}</Text>
          </Box>
        ))}
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
      />

      {/* API Section */}
      <StatRow title={t('model.stats.section.api')} values={[]} isSection />
      <StatRow
        title={t('model.stats.metric.requests')}
        values={getModelValues((m) => m.api.totalRequests.toLocaleString())}
      />
      <StatRow
        title={t('model.stats.metric.errors')}
        values={getModelValues((m) => {
          const errorRate = calculateErrorRate(m);
          return (
            <Text
              color={
                m.api.totalErrors > 0 ? Colors.AccentRed : Colors.Foreground
              }
            >
              {m.api.totalErrors.toLocaleString()} ({errorRate.toFixed(1)}%)
            </Text>
          );
        })}
      />
      <StatRow
        title={t('model.stats.metric.avg.latency')}
        values={getModelValues((m) => {
          const avgLatency = calculateAverageLatency(m);
          return formatDuration(avgLatency);
        })}
      />

      <Box height={1} />

      {/* Tokens Section */}
      <StatRow title={t('model.stats.section.tokens')} values={[]} isSection />
      <StatRow
        title={t('model.stats.metric.total')}
        values={getModelValues((m) => (
          <Text color={Colors.AccentYellow}>
            {m.tokens.total.toLocaleString()}
          </Text>
        ))}
      />
      <StatRow
        title={t('model.stats.metric.prompt')}
        isSubtle
        values={getModelValues((m) => m.tokens.prompt.toLocaleString())}
      />
      {hasCached && (
        <StatRow
          title={t('model.stats.metric.cache')}
          isSubtle
          values={getModelValues((m) => {
            const cacheHitRate = calculateCacheHitRate(m);
            return (
              <Text color={Colors.AccentGreen}>
                {m.tokens.cached.toLocaleString()} ({cacheHitRate.toFixed(1)}%)
              </Text>
            );
          })}
        />
      )}
      {hasThoughts && (
        <StatRow
          title={t('model.stats.metric.thoughts')}
          isSubtle
          values={getModelValues((m) => m.tokens.thoughts.toLocaleString())}
        />
      )}
      {hasTool && (
        <StatRow
          title={t('model.stats.metric.tool')}
          isSubtle
          values={getModelValues((m) => m.tokens.tool.toLocaleString())}
        />
      )}
      <StatRow
        title={t('model.stats.metric.output')}
        isSubtle
        values={getModelValues((m) => m.tokens.candidates.toLocaleString())}
      />
    </Box>
  );
};
