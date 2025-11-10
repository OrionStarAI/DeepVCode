/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { formatDuration } from '../utils/formatters.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

interface TaskCompletionSummaryProps {
  elapsedTime: number; // 秒数
  isVisible: boolean;
}

/**
 * 任务完成总结组件
 * 显示格式: ✓ Worked for 2m 38s
 *          ─────────────────────────
 */
export const TaskCompletionSummary: React.FC<TaskCompletionSummaryProps> = ({
  elapsedTime,
  isVisible,
}) => {
  const { columns } = useTerminalSize();

  if (!isVisible || elapsedTime < 20) {
    return null;
  }

  // 格式化时间
  const formattedTime = elapsedTime < 60
    ? `${elapsedTime}s`
    : formatDuration(elapsedTime * 1000);

  // 构建完成消息
  const message = `✓ Worked for ${formattedTime}`;

  // 计算下划线长度，使其与消息等宽
  const dashCount = Math.max(1, message.length);
  const dashes = '─'.repeat(dashCount);

  return (
    <Box marginTop={1} marginBottom={1} flexDirection="column">
      <Text color={Colors.Comment}>{message}</Text>
      <Text color={Colors.Gray}>{dashes}</Text>
    </Box>
  );
};
