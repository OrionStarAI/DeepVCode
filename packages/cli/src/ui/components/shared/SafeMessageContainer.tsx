/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { Box } from 'ink';

interface SafeMessageContainerProps {
  children: React.ReactNode;
  preventOverflow?: boolean;
}

/**
 * 安全的消息容器组件，防止内容溢出导致布局破损
 */
export const SafeMessageContainer: React.FC<SafeMessageContainerProps> = ({
  children,
  preventOverflow = true,
}) => {
  // 不设置固定宽度，让内容自然流动
  // 传入的宽度已经是App.tsx中调整过的宽度（90%）
  const containerProps = preventOverflow
    ? {
        flexShrink: 0,
        overflow: 'hidden' as const,
      }
    : {};

  return (
    <Box
      flexDirection="column"
      {...containerProps}
    >
      {children}
    </Box>
  );
};
