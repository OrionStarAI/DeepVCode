/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { t } from '../utils/i18n.js';

interface TokenBreakdownDisplayProps {
  systemPromptTokens: number;
  userMessageTokens: number;
  memoryContextTokens: number;
  toolsTokens: number;
  totalInputTokens: number;
  maxTokens: number;
}

/**
 * 显示上下文占用的细分统计
 * 展示各个部分（System Prompt, 用户输入, Memory, Tools）的 token 占用
 */
export const TokenBreakdownDisplay: React.FC<TokenBreakdownDisplayProps> = ({
  systemPromptTokens,
  userMessageTokens,
  memoryContextTokens,
  toolsTokens,
  totalInputTokens,
  maxTokens,
}) => {
  // 计算百分比
  const systemPromptPercent = ((systemPromptTokens / maxTokens) * 100).toFixed(1);
  const userMessagePercent = ((userMessageTokens / maxTokens) * 100).toFixed(1);
  const memoryContextPercent = ((memoryContextTokens / maxTokens) * 100).toFixed(1);
  const toolsPercent = ((toolsTokens / maxTokens) * 100).toFixed(1);
  const totalPercent = ((totalInputTokens / maxTokens) * 100).toFixed(1);

  // 格式化数字（添加千分位）
  const formatNumber = (num: number) => num.toLocaleString();

  // 确定颜色：如果超过80%则为红色，60-80%为黄色，否则为绿色
  const getColorForPercent = (percent: number): string => {
    if (percent >= 80) return Colors.AccentRed;
    if (percent >= 60) return Colors.AccentYellow;
    return Colors.AccentGreen;
  };

  const totalPercentNum = parseFloat(totalPercent);
  const totalColor = getColorForPercent(totalPercentNum);

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={Colors.Gray} bold>
        📊 {t('token.breakdown.title')}
      </Text>

      <Box marginTop={1} marginBottom={1} flexDirection="column">
        {/* System Prompt */}
        <Box marginY={0}>
          <Box width={25}>
            <Text color={Colors.Gray}>{t('token.breakdown.system')}</Text>
          </Box>
          <Text>{formatNumber(systemPromptTokens)}K</Text>
          <Text color={Colors.Gray}> / </Text>
          <Text color={Colors.AccentBlue}>{systemPromptPercent}%</Text>
        </Box>

        {/* User Message */}
        <Box marginY={0}>
          <Box width={25}>
            <Text color={Colors.Gray}>{t('token.breakdown.user')}</Text>
          </Box>
          <Text>{formatNumber(userMessageTokens)}K</Text>
          <Text color={Colors.Gray}> / </Text>
          <Text color={Colors.AccentBlue}>{userMessagePercent}%</Text>
        </Box>

        {/* Memory Context */}
        <Box marginY={0}>
          <Box width={25}>
            <Text color={Colors.Gray}>{t('token.breakdown.memory')}</Text>
          </Box>
          <Text>{formatNumber(memoryContextTokens)}K</Text>
          <Text color={Colors.Gray}> / </Text>
          <Text color={Colors.AccentBlue}>{memoryContextPercent}%</Text>
        </Box>

        {/* Tools */}
        <Box marginY={0}>
          <Box width={25}>
            <Text color={Colors.Gray}>{t('token.breakdown.tools')}</Text>
          </Box>
          <Text>{formatNumber(toolsTokens)}K</Text>
          <Text color={Colors.Gray}> / </Text>
          <Text color={Colors.AccentBlue}>{toolsPercent}%</Text>
        </Box>

        {/* Separator */}
        <Box marginY={0}>
          <Text color={Colors.Gray}>{'─'.repeat(50)}</Text>
        </Box>

        {/* Total */}
        <Box marginY={0}>
          <Box width={25}>
            <Text color={Colors.Gray} bold>{t('token.breakdown.total')}</Text>
          </Box>
          <Text bold>{formatNumber(totalInputTokens)}K</Text>
          <Text color={Colors.Gray}> / </Text>
          <Text color={totalColor} bold>
            {totalPercent}%
          </Text>
          <Text color={Colors.Gray}> of {formatNumber(maxTokens)}K limit</Text>
        </Box>

        {/* Warning if > 80% */}
        {totalPercentNum > 80 && (
          <Box marginTop={1}>
            <Text color={Colors.AccentRed}>
              ⚠️  Context usage is high. Consider archiving old messages or clearing memory to avoid hitting the limit.
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
