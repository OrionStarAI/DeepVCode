/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { t } from '../utils/i18n.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import type { ReasoningSummary } from 'deepv-code-core';

interface ReasoningDisplayProps {
  reasoning: ReasoningSummary | null;
  terminalHeight: number;
  terminalWidth: number;
}

/**
 * 显示AI的思考过程，带有固定行数窗口和自动滚动功能
 * - 窗口高度：终端高度的20%（最小4行）
 * - 自动滚动显示最后的内容
 * - 框样式显示
 * - 动画指示器：○和●交替显示，低调表示思考中
 */
export const ReasoningDisplay = ({
  reasoning,
  terminalHeight,
  terminalWidth,
}: ReasoningDisplayProps) => {
  const streamingState = useStreamingContext();
  const [isFilled, setIsFilled] = useState(true); // true=实心●, false=空心○
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 圆点动画：每秒在实心和空心之间切换
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // 只在思考过程存在且处于 Responding 状态时启动动画
    if (reasoning?.text && streamingState === StreamingState.Responding) {
      // 每秒切换一次
      intervalRef.current = setInterval(() => {
        setIsFilled(prev => !prev);
      }, 1000);
    } else {
      // 非动画状态重置为实心
      setIsFilled(true);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [reasoning?.text, streamingState]);
  if (!reasoning?.text) {
    return null;
  }

  // 计算窗口高度：终端高度的20%，最小4行
  const windowHeight = Math.max(Math.floor(terminalHeight * 0.2), 4);

  // 将思考内容按行分割
  const reasoningLines = reasoning.text.split('\n');

  // 构建最终显示行数：如果超过窗口高度，留出一行给省略号
  const hasOmitted = reasoningLines.length > windowHeight;
  const contentLinesToShow = hasOmitted ? windowHeight - 1 : windowHeight;

  // 获取要显示的内容行
  const displayLines =
    reasoningLines.length > contentLinesToShow
      ? reasoningLines.slice(-contentLinesToShow)
      : reasoningLines;

  // 构建最终显示列表：如果有省略，在开头添加省略号
  const finalDisplayLines = hasOmitted
    ? ['...', ...displayLines]
    : displayLines;

  return (
    <Box
      flexDirection="column"
      marginY={1}
      borderStyle="round"
      borderColor={Colors.Gray}
      paddingX={1}
      paddingY={0}
    >
      {/* 标题行（带动画指示器） */}
      <Box marginBottom={0}>
        <Text color={Colors.Gray}>
          {isFilled ? '●' : '○'}
        </Text>
        <Box marginLeft={1}>
          <Text bold color={Colors.AccentBlue}>
            {t('model.reasoning')}
          </Text>
        </Box>
      </Box>

      {/* 思考内容区域（固定高度窗口） */}
      <Box flexDirection="column">
        {finalDisplayLines.map((line, index) => (
          <Text
            key={index}
            color={Colors.Foreground}
            wrap="wrap"
          >
            {line || ' '} {/* 保留空行 */}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
