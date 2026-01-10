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
import { useSmallWindowOptimization, WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';

export interface TokenUsageInfo {
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  input_tokens: number;
  output_tokens: number;
  credits_usage?: number;
  model?: string;
  timestamp?: number;
}

interface TokenUsageDisplayProps {
  tokenUsage: TokenUsageInfo | null;
  inputWidth: number;
  cumulativeCredits?: number; // 当前回合累计的credits
}

export const TokenUsageDisplay: React.FC<TokenUsageDisplayProps> = ({
  tokenUsage,
  inputWidth,
  cumulativeCredits,
}) => {
  const smallWindowConfig = useSmallWindowOptimization();

  // 在小窗口或极小窗口下隐藏token统计，节省垂直空间
  if (!tokenUsage || smallWindowConfig.sizeLevel !== WindowSizeLevel.NORMAL) {
    return null;
  }

  const {
    cache_creation_input_tokens = 0,
    cache_read_input_tokens = 0,
    input_tokens = 0,
    output_tokens = 0,
    credits_usage = 0,
    model,
  } = tokenUsage;

  // 计算缓存命中率
  const hasCacheActivity = cache_creation_input_tokens > 0 || cache_read_input_tokens > 0;
  const cacheEfficiency = input_tokens > 0 ?
    ((cache_read_input_tokens / (input_tokens)) * 100) : 0;

  // 直接使用API返回的token数，无需增量计算

  const totalTokens = input_tokens + output_tokens;

  return (
    <Box
      borderStyle="single"
      borderColor={Colors.Gray}
      borderDimColor={true}
      paddingX={2}
      paddingY={0}
      marginBottom={1}
      flexDirection="column"
      width={Math.min(inputWidth, 80)}
    >
      <Box justifyContent="space-between" marginBottom={0}>
        <Text color={Colors.Gray}>{t('token.usage')}</Text>
      </Box>

      <Box justifyContent="space-between">
        <Box flexDirection="row">
          <Text color={Colors.AccentYellow} dimColor>{t('token.input')}</Text>
          <Text dimColor>{input_tokens.toLocaleString()}</Text>
        </Box>

        <Box flexDirection="row">
          <Text color={Colors.AccentBlue} dimColor>{t('token.output')}</Text>
          <Text dimColor>{output_tokens.toLocaleString()}</Text>
        </Box>

        <Box flexDirection="row">
          <Text color={Colors.Gray}>{t('token.total')}</Text>
          <Text color={Colors.Gray}>{totalTokens.toLocaleString()}</Text>
        </Box>

        {credits_usage > 0 || (cumulativeCredits && cumulativeCredits > 0) ? (
          <Box flexDirection="row">
            <Text color={Colors.AccentPurple} dimColor>{t('token.credits')}</Text>
            <Text dimColor>{(cumulativeCredits || credits_usage || 0).toLocaleString()}</Text>
          </Box>
        ) : null}
      </Box>

      {hasCacheActivity && (
        <Box justifyContent="space-between" marginTop={0}>
          <Box flexDirection="row">
            <Text color={Colors.AccentGreen} dimColor>{t('token.cache.read')}</Text>
            <Text dimColor>{cache_read_input_tokens.toLocaleString()}</Text>
          </Box>

          {cache_creation_input_tokens > 0 && (
            <Box flexDirection="row">
              <Text color={Colors.AccentPurple} dimColor>{t('token.cache.create')}</Text>
              <Text dimColor>{cache_creation_input_tokens.toLocaleString()}</Text>
            </Box>
          )}

          {cacheEfficiency > 0 && (
            <Box flexDirection="row">
              <Text color={Colors.AccentGreen} dimColor>{t('token.efficiency')}</Text>
              <Text dimColor>{cacheEfficiency.toFixed(1)}%</Text>
            </Box>
          )}
        </Box>
      )}

      {!hasCacheActivity && cache_read_input_tokens === 0 && (
        <Box>
          <Text color={Colors.Gray} dimColor>
            {t('token.no.cache')}
          </Text>
        </Box>
      )}
    </Box>
  );
};
