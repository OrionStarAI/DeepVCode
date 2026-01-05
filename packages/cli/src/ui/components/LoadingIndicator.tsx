/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThoughtSummary } from 'deepv-code-core';
import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { themeManager } from '../themes/theme-manager.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';
import { formatDuration } from '../utils/formatters.js';
import { useRealTimeToken } from '../hooks/useRealTimeToken.js';
import { getCancelKeyHint } from '../utils/i18n.js';
import { isChineseLocale } from '../utils/i18n.js';
import { useSmallWindowOptimization, shouldSkipAnimation } from '../hooks/useSmallWindowOptimization.js';
import { useLEDMarquee } from '../hooks/useLEDMarquee.js';
import { createGradientColorSet } from '../utils/color-brightness.js';

interface LoadingIndicatorProps {
  currentLoadingPhrase?: string;
  elapsedTime: number;
  rightContent?: React.ReactNode;
  thought?: ThoughtSummary | null;
  estimatedInputTokens?: number;
  isExecutingTools?: boolean; // 🎯 新增：是否正在执行工具
}

// 格式化token数字，大于1000时用k单位显示
const formatTokenCount = (count: number): string => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toLocaleString();
};

// 动画token增长组件
const AnimatedTokenCount: React.FC<{
  targetCount: number;
  isRealTime: boolean;
  streamingState: StreamingState;
}> = ({ targetCount, isRealTime, streamingState }) => {
  const [displayCount, setDisplayCount] = useState(0);
  const smallWindowConfig = useSmallWindowOptimization();

  // 快速增长到目标数字的动画效果
  useEffect(() => {
    if (targetCount === 0) return;

    // 🎯 关键修复：在等待确认状态下停止token计数动画
    if (streamingState === StreamingState.WaitingForConfirmation) {
      setDisplayCount(targetCount); // 直接设置为目标值，不使用动画
      return;
    }

    // 🎯 小窗口优化：跳过token计数动画
    if (shouldSkipAnimation(smallWindowConfig, 'token')) {
      setDisplayCount(targetCount); // 直接设置，不使用动画
      return;
    }

    const startCount = displayCount;
    const diff = targetCount - startCount;
    const steps = Math.min(20, Math.max(5, Math.abs(diff) / 100)); // 动画步数
    const stepSize = diff / steps;
    const stepDuration = 50; // 每步50ms

    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayCount(targetCount);
        clearInterval(interval);
      } else {
        setDisplayCount(Math.round(startCount + stepSize * currentStep));
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [targetCount, streamingState]);



  return (
    <Text>
      {formatTokenCount(displayCount)}
    </Text>
  );
};

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  currentLoadingPhrase,
  elapsedTime,
  rightContent,
  thought,
  estimatedInputTokens,
  isExecutingTools = false, // 🎯 新增参数
}) => {
  const streamingState = useStreamingContext();
  const realTimeToken = useRealTimeToken();
  const smallWindowConfig = useSmallWindowOptimization();

  // 🎯 修复：直接使用传入的工具执行状态，而不是基于文本猜测
  const isCallingTools = isExecutingTools;



  // Token闪烁组件 - 图标出现/消失闪烁
  const TokenIndicator: React.FC<{ isToolCall: boolean }> = ({ isToolCall }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
      // 🎯 强化保护：在等待确认状态下完全停止Token指示器闪烁
      if (streamingState === StreamingState.WaitingForConfirmation) {
        setIsVisible(true); // 保持显示状态，停止闪烁
        return;
      }

      const interval = setInterval(() => {
        setIsVisible(prev => !prev);
      }, 800); // 稍微快一点的闪烁频率

      return () => clearInterval(interval);
    }, [streamingState]);



    return (
      <Text color={Colors.AccentOrange}>
        {isVisible ? (isToolCall ? '⚒️' : '↑') : (isToolCall ? '  ' : ' ')}
      </Text>
    );
  };

  // 🎯 重要：所有hooks必须在任何条件判断之前调用
  // 预计算主要文本用于LED效果
  const textForLED = streamingState === StreamingState.WaitingForConfirmation
    ? (isChineseLocale() ? '等待用户确认...' : 'Waiting for user confirmation...')
    : thought?.subject || currentLoadingPhrase || '';

  // 🎯 关键优化：在矮终端下直接禁用LED动画
  const shouldUseLED = streamingState === StreamingState.Responding && !shouldSkipAnimation(smallWindowConfig, 'loading');

  // LED跑马灯效果用于主要文本
  const { highlightedChars: textLED } = useLEDMarquee(textForLED, {
    isActive: shouldUseLED, // 矮终端下直接不激活
    interval: 80, // 与spinner同步的80ms间隔，平衡的流畅效果
    highlightRatio: 0.3, // 动态计算高亮长度为文本长度的30%
    stepSize: 1
  });

  // 根据主题类型选择渐变颜色
  const activeTheme = themeManager.getActiveTheme();
  const isDarkTheme = activeTheme.colors.type === 'dark';
  const gradientBaseColor = isDarkTheme ? Colors.Foreground : Colors.AccentBlue; // 深色模式用前景白，浅色模式用强调蓝
  const gradientColors = createGradientColorSet(gradientBaseColor);

  if (streamingState === StreamingState.Idle) {
    return null;
  }

  const primaryText = streamingState === StreamingState.WaitingForConfirmation
    ? (isChineseLocale() ? '等待用户确认...' : 'Waiting for user confirmation...')
    : thought?.subject || currentLoadingPhrase;

  // 获取token数量
  const tokenCount = realTimeToken?.inputTokens || estimatedInputTokens;
  const isRealTime = !!realTimeToken?.inputTokens;

  // 预计算是否应该显示LED效果（与shouldUseLED保持一致）
  const shouldShowLEDEffect = shouldUseLED;

  return (
    <Box marginTop={1} paddingLeft={0} flexDirection="column">
      {/* Main loading line */}
      <Box width="100%">
        <Box marginRight={1}>
          {/* 🎯 关键修复：在等待确认时完全不渲染GeminiRespondingSpinner，
              使用静态Text组件代替，确保没有任何动画效果 */}
          {streamingState === StreamingState.WaitingForConfirmation ? (
            <Text key="static-indicator">⠏</Text>
          ) : (
            <GeminiRespondingSpinner key="dynamic-spinner" />
          )}
        </Box>
        <Box flexShrink={1}>
          <Text wrap="wrap" color={Colors.AccentOrange}>
            {primaryText ? (
              shouldShowLEDEffect ? (
                // LED跑马灯效果的文本 - 使用渐变色效果
                <Text>
                  {textLED.map(({ char, highlightIntensity, index }) => {
                    // 根据强度选择颜色：0=暗色，1=中等，2=最亮
                    let color;
                    switch (highlightIntensity) {
                      case 2:
                        color = gradientColors.bright; // 最亮
                        break;
                      case 1:
                        color = gradientColors.medium; // 中等亮度
                        break;
                      default:
                        color = gradientColors.dim; // 暗色
                        break;
                    }

                    return (
                      <Text key={index} color={color}>
                        {char}
                      </Text>
                    );
                  })}
                </Text>
              ) : (
                // 静态文本（等待确认状态、小窗口优化或矮终端）- 保持原始颜色
                <Text color={Colors.AccentOrange}>{primaryText}</Text>
              )
            ) : null}
            <Text color={Colors.Gray}>
              {streamingState === StreamingState.WaitingForConfirmation
                ? ''
                : ` (${getCancelKeyHint()} to cancel, ${elapsedTime < 60 ? `${elapsedTime}s` : formatDuration(elapsedTime * 1000)})`}
              {/* Token 计数已隐藏 - 不再显示 ↑ 和 🪓 符号 */}
            </Text>
          </Text>
        </Box>
        <Box flexGrow={1}>{/* Spacer */}</Box>
        {rightContent ? <Box>{rightContent}</Box> : null}
      </Box>
    </Box>
  );
};
