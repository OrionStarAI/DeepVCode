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

  // 🔧 修复：仅在极小窗口（TINY）下隐藏，SMALL窗口仍显示模型统计
  // 标准终端 80x24 不应被视为小窗口
  if (smallWindowConfig.sizeLevel === WindowSizeLevel.TINY) {
    return null;
  }

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
        <Text>本次会话中尚未进行API调用。</Text>
      </Box>
    );
  }

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
        Geek专用模型统计
      </Text>
      <Box height={1} />

      {/* Header */}
      <Box>
        <Box width={METRIC_COL_WIDTH}>
          <Text bold>指标</Text>
        </Box>
        {modelNames.map((name, index) => (
          <Box width={MODEL_COL_WIDTH} key={name}>
            <Text bold>模型{index + 1}</Text>
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
      <StatRow title="API" values={[]} isSection />
      <StatRow
        title="请求数"
        values={getModelValues((m) => m.api.totalRequests.toLocaleString())}
      />
      <StatRow
        title="错误数"
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
        title="平均延迟"
        values={getModelValues((m) => {
          const avgLatency = calculateAverageLatency(m);
          return formatDuration(avgLatency);
        })}
      />

      <Box height={1} />

      {/* Tokens Section */}
      <StatRow title="令牌" values={[]} isSection />
      <StatRow
        title="总计"
        values={getModelValues((m) => (
          <Text color={Colors.AccentYellow}>
            {m.tokens.total.toLocaleString()}
          </Text>
        ))}
      />
      <StatRow
        title="提示"
        isSubtle
        values={getModelValues((m) => m.tokens.prompt.toLocaleString())}
      />
      {hasCached && (
        <StatRow
          title="缓存"
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
          title="思考"
          isSubtle
          values={getModelValues((m) => m.tokens.thoughts.toLocaleString())}
        />
      )}
      {hasTool && (
        <StatRow
          title="工具"
          isSubtle
          values={getModelValues((m) => m.tokens.tool.toLocaleString())}
        />
      )}
      <StatRow
        title="输出"
        isSubtle
        values={getModelValues((m) => m.tokens.candidates.toLocaleString())}
      />
    </Box>
  );
};
