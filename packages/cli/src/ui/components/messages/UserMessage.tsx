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
  const prefix = '❯ ';
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
  // 使用深灰色背景 + 白色文本（深色模式），模仿 Claude Code 的样式，
  // 避免使用纯白色背景导致在部分终端（如 iTerm2）上显示刺眼或不清晰的问题。
  // 2025-01-14: 调整深色背景为 #707070，进一步提高与深色终端背景的对比度
  // 2025-01-14: 调整浅色背景为 #C0C0C0，提高在浅色终端下的可见性
  // 2025-01-14: 文本颜色使用纯白 #FFFFFF 并加粗，确保在灰色背景下的清晰度
  const isDarkTheme = Colors.type === 'dark';
  // Claude Code style: Lighter gray background for dark mode visibility
  const backgroundColor = isDarkTheme ? '#707070' : '#C0C0C0';
  const textColor = isDarkTheme ? '#FFFFFF' : 'black';

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
        <Text color={textColor} wrap="wrap" bold={isDarkTheme}>
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
