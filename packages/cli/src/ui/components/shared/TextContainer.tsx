/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { Text, Box } from 'ink';
import { wrapLongLines } from '../../utils/displayUtils.js';

interface TextContainerProps {
  text: string;
  maxWidth: number;
  color?: string;
  wrap?: boolean;
  preserveWhitespace?: boolean;
}

/**
 * 智能文本容器组件，能够处理长文本的换行和显示
 */
export const TextContainer: React.FC<TextContainerProps> = ({
  text,
  maxWidth,
  color,
  wrap = true,
  preserveWhitespace = false,
}) => {
  // 如果不需要换行，直接显示
  if (!wrap) {
    return (
      <Text color={color}>
        {text}
      </Text>
    );
  }

  // 处理文本换行
  const processedText = wrapLongLines(text, maxWidth);
  
  // 如果需要保留空白字符，使用不同的渲染方式
  if (preserveWhitespace) {
    return (
      <Box flexDirection="column" width={maxWidth}>
        {processedText.split('\n').map((line, index) => (
          <Box key={index} width={maxWidth}>
            <Text color={color}>{line}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box width={maxWidth} flexShrink={0}>
      <Text color={color} wrap="wrap">
        {processedText}
      </Text>
    </Box>
  );
};
