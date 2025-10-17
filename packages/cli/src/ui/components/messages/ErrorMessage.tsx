/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';

interface ErrorMessageProps {
  text: string;
}

// 根据错误类型确定颜色
function getErrorColor(text: string): string {
  // 网络连接失败 - 使用黄色（警告色）
  if (text.includes('🌐 网络连接失败') || text.includes('🌐 Network Connection Failed')) {
    return Colors.AccentYellow;
  }

  // 其他错误（地区限制 / Region Restriction, 403, API错误等）- 使用红色
  return Colors.AccentRed;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ text }) => {
  const prefix = '✕ ';
  const prefixWidth = prefix.length;
  const errorColor = getErrorColor(text);

  return (
    <Box flexDirection="row" marginBottom={1}>
      <Box width={prefixWidth}>
        <Text color={errorColor}>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap" color={errorColor}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};
