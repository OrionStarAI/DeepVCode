/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { useSmallWindowOptimization, shouldSkipAnimation } from '../hooks/useSmallWindowOptimization.js';
import { useLEDMarquee } from '../hooks/useLEDMarquee.js';
import { Colors } from '../colors.js';
import { themeManager } from '../themes/theme-manager.js';
import { createGradientColorSet } from '../utils/color-brightness.js';

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

  // LED跑马灯效果的静态字符（类似旋转动画的视觉效果）
  const ledText = "●●●";

  // 🎯 关键优化：在矮终端下直接禁用LED动画
  const shouldUseLED = streamingState === StreamingState.Responding && !shouldSkipAnimation(smallWindowConfig, 'spinner');

  const { highlightedChars, isAnimating } = useLEDMarquee(ledText, {
    isActive: shouldUseLED, // 矮终端下直接不激活
    interval: 150, // 150ms刷新间隔，spinner较慢的闪烁速度
    highlightRatio: 0.4, // 对于短的spinner文本，使用40%比例
    stepSize: 1
  });

  // 根据主题类型选择渐变颜色
  const activeTheme = themeManager.getActiveTheme();
  const isDarkTheme = activeTheme.colors.type === 'dark';
  const gradientBaseColor = isDarkTheme ? Colors.Foreground : Colors.AccentBlue; // 深色模式用前景白，浅色模式用强调蓝
  const orangeColors = createGradientColorSet(gradientBaseColor);

  // 🎯 关键修复：完全避免在非Responding状态下渲染动画组件
  // 这确保LED动画的内部定时器被完全清理，防止在确认界面继续刷新
  if (streamingState === StreamingState.Responding) {
    // 🎯 矮终端优化：在矮终端下使用静态显示代替LED动画
    if (!shouldUseLED) {
      return <Text key="spinner-static">⏳</Text>;
    }

    // 渲染LED跑马灯效果 - 使用渐变色效果
    return (
      <Text key="led-active">
        {highlightedChars.map(({ char, highlightIntensity, index }) => {
          // 根据强度选择颜色：0=暗色，1=中等，2=最亮
          let color;
          switch (highlightIntensity) {
            case 2:
              color = orangeColors.bright; // 最亮
              break;
            case 1:
              color = orangeColors.medium; // 中等亮度
              break;
            default:
              color = orangeColors.dim; // 暗色
              break;
          }

          return (
            <Text key={index} color={color}>
              {char}
            </Text>
          );
        })}
      </Text>
    );
  } else if (nonRespondingDisplay) {
    return <Text key="spinner-static">{nonRespondingDisplay}</Text>;
  }
  return null;
};
