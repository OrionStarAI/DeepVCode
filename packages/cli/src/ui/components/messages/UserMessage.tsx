/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import chalk from 'chalk';
import { Colors } from '../../colors.js';
import { isLongText, smartTruncateText, forceWrapText } from '../../utils/displayUtils.js';


interface UserMessageProps {
  text: string;
  terminalWidth?: number;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text, terminalWidth }) => {
  const prefix = '› ';
  const prefixWidth = prefix.length;
  const userIndicator = '🧑💬'; // 小人 + 聊天emoji

  // 计算安全的消息框宽度
  const userIndicatorWidth = 4; // 用户指示器宽度
  const marginAndPadding = 8; // 边距和内边距
  const maxMessageBoxWidth = Math.max((terminalWidth || 80) - userIndicatorWidth - marginAndPadding, 40);

  // 计算文本内容的最大宽度（消息框宽度 - 前缀 - 边框和padding）
  const maxTextWidth = Math.max(maxMessageBoxWidth - prefixWidth - 6, 20); // 6 = 边框(2) + padding(4)

  // 处理文本：截断长文本，再强制换行
  let displayText = text;

  // 截断超长文本
  if (isLongText(text, 20)) {
    displayText = smartTruncateText(text, 15);
  }

  // 强制换行，确保每行都不超过最大宽度
  displayText = forceWrapText(displayText, maxTextWidth);

  // 将处理后的文本按行分割，逐行渲染
  const textLines = displayText.split('\n');

  // 根据主题类型选择背景色和前景色
  // 深色主题：使用中灰色背景 + 纯白文本（更高对比度）
  // 浅色主题：使用浅灰色背景 + 深色文本
  const isDarkTheme = Colors.type === 'dark';
  const backgroundColor = isDarkTheme ? '#585858' : '#E8E8E8';
  const textColor = isDarkTheme ? '#FFFFFF' : '#404040';
  // 前缀颜色：在深色主题下使用纯白，浅色主题下使用深色
  const prefixColor = isDarkTheme ? '#FFFFFF' : '#303030';

  // 构建完整的带背景色的文本块，避免逐行渲染产生间隙
  const formattedLines = textLines.map((line, index) => {
    const linePrefix = index === 0 ? prefix : ' '.repeat(prefixWidth);
    const lineContent = line || ' ';
    return chalk.hex(index === 0 ? prefixColor : textColor).bgHex(backgroundColor)(linePrefix) +
           chalk.hex(textColor).bgHex(backgroundColor)(lineContent);
  });

  // 将所有行合并为一个字符串，用真实换行符连接
  const fullText = formattedLines.join('\n');

  return (
    <Box flexDirection="row" width="100%">
      <Box
        paddingX={2}
        paddingY={0}
        marginY={1}
        alignSelf="flex-start"
        flexShrink={1}
      >
        <Text>{fullText}</Text>
      </Box>
      {terminalWidth ? (
        <Box flexGrow={1} justifyContent="flex-end" alignItems="flex-start" marginY={1}>
          <Text>{userIndicator}</Text>
        </Box>
      ) : null}
    </Box>
  );
};
