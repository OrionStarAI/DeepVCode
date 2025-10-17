/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { useSmallWindowOptimization, WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';
import { getCancelKeyHint } from '../utils/i18n.js';

interface CompactFooterProps {
  sessionStats?: {
    totalTokensUsed: number;
    totalCostUsd: number;
  };
  showBasicInfo?: boolean;
}

/**
 * 针对小窗口优化的紧凑Footer组件
 * 根据窗口大小自动调整显示内容
 */
export const CompactFooter: React.FC<CompactFooterProps> = ({
  sessionStats,
  showBasicInfo = true,
}) => {
  const smallWindowConfig = useSmallWindowOptimization();
  
  // 在极小窗口下完全隐藏Footer
  if (smallWindowConfig.sizeLevel === WindowSizeLevel.TINY) {
    return null;
  }
  
  // 小窗口下的简化显示
  if (smallWindowConfig.sizeLevel === WindowSizeLevel.SMALL) {
    if (!showBasicInfo || !sessionStats) {
      return (
        <Box marginTop={1}>
          <Text color={Colors.Comment}>Press {getCancelKeyHint()} to cancel • /help for commands</Text>
        </Box>
      );
    }
    
    return (
      <Box marginTop={1}>
        <Text color={Colors.Comment}>
          Tokens: {sessionStats.totalTokensUsed.toLocaleString()} | 
          Cost: ${sessionStats.totalCostUsd.toFixed(4)} | 
          {getCancelKeyHint()} to cancel
        </Text>
      </Box>
    );
  }
  
  // 正常窗口返回null，让原Footer组件处理
  return null;
};

export default CompactFooter;