/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';
import { isLongText, smartTruncateText } from '../../utils/displayUtils.js';
import { formatAttachmentReferencesForDisplay } from '../../utils/attachmentFormatter.js';


interface UserMessageProps {
  text: string;
  terminalWidth?: number;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text, terminalWidth }) => {
  const prefix = '› ';
  const userIndicator = '🧑💬'; // 小人 + 聊天emoji

  // 计算安全的消息框宽度
  const userIndicatorWidth = 4; // 用户指示器宽度
  const marginAndPadding = 8; // 边距和内边距
  const maxMessageBoxWidth = Math.max((terminalWidth || 80) - userIndicatorWidth - marginAndPadding, 40);

  // 处理文本：先截断长文本，再格式化附件引用
  let displayText = text;

  // 截断超长文本
  if (isLongText(text, 20)) {
    displayText = smartTruncateText(text, 15);
  }

  // 格式化附件引用（@"path" -> [File #path]）
  displayText = formatAttachmentReferencesForDisplay(displayText);

  // 根据主题类型选择背景色和文本颜色
  // 为了获得高对比度效果（类似 Claude Code）：
  // 深色主题：使用白色背景 + 黑色文本
  // 浅色主题：使用黑色背景 + 白色文本
  const isDarkTheme = Colors.type === 'dark';
  const backgroundColor = isDarkTheme ? 'white' : 'black';
  const textColor = isDarkTheme ? 'black' : 'white';

  return (
    <Box flexDirection="row" width="100%">
      <Box
        paddingX={1}
        paddingY={0}
        marginY={1}
        alignSelf="flex-start"
        flexShrink={1}
        maxWidth={maxMessageBoxWidth}
        backgroundColor={backgroundColor}
      >
        <Text color={textColor} wrap="wrap">
          {prefix}{displayText}
        </Text>
      </Box>
      {terminalWidth ? (
        <Box flexGrow={1} justifyContent="flex-end" alignItems="flex-start" marginY={1}>
          <Text>{userIndicator}</Text>
        </Box>
      ) : null}
    </Box>
  );
};
