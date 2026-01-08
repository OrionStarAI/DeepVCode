/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Text } from 'ink';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { useSmallWindowOptimization, shouldSkipAnimation } from '../hooks/useSmallWindowOptimization.js';
import { Colors } from '../colors.js';
import { themeManager } from '../themes/theme-manager.js';

interface GeminiRespondingSpinnerProps {
  /**
   * Optional string to display when not in Responding state.
   * If not provided and not Responding, renders null.
   */
  nonRespondingDisplay?: string;
}

export const GeminiRespondingSpinner: React.FC<
  GeminiRespondingSpinnerProps
> = ({ nonRespondingDisplay }) => {
  const streamingState = useStreamingContext();
  const smallWindowConfig = useSmallWindowOptimization();
  const [isFilled, setIsFilled] = useState(true); // true=实心●, false=空心○
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 简单的圆点动画：每秒在实心和空心之间切换
  useEffect(() => {
    // 清理之前的定时器
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // 只在 Responding 状态且未禁用动画时启动
    const shouldAnimate = streamingState === StreamingState.Responding &&
                         !shouldSkipAnimation(smallWindowConfig, 'spinner');

    if (shouldAnimate) {
      // 每秒切换一次
      intervalRef.current = setInterval(() => {
        setIsFilled(prev => !prev);
      }, 1000);
    } else {
      // 非动画状态重置为实心
      setIsFilled(true);
    }

    // 清理函数
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [streamingState, smallWindowConfig]);

  // 根据主题选择颜色
  const activeTheme = themeManager.getActiveTheme();
  const isDarkTheme = activeTheme.colors.type === 'dark';
  const dotColor = isDarkTheme ? Colors.Foreground : Colors.AccentBlue;

  // 🎯 关键修复：完全避免在非Responding状态下渲染动画组件
  if (streamingState === StreamingState.Responding) {
    // 矮终端优化：使用静态显示
    if (shouldSkipAnimation(smallWindowConfig, 'spinner')) {
      return <Text key="spinner-static" color={dotColor}>●</Text>;
    }

    // 渲染简洁的圆点动画：实心●和空心○切换
    return (
      <Text key="spinner-animated" color={dotColor}>
        {isFilled ? '●' : '○'}
      </Text>
    );
  } else if (nonRespondingDisplay) {
    return <Text key="spinner-static">{nonRespondingDisplay}</Text>;
  }
  return null;
};
