/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { ConsoleMessageItem } from '../types.js';
import stripAnsi from 'strip-ansi';

interface ScrollingDebugConsoleProps {
  messages: ConsoleMessageItem[];
  height: number;
  width: number;
}

/**
 * 清理控制台消息中的非法字符
 */
function sanitizeMessage(content: string): string {
  if (!content) return content;

  let cleaned = stripAnsi(content);

  // 处理 \r\n 组合
  cleaned = cleaned.replace(/\r\n/g, '\n');
  // 处理连续的 \r
  cleaned = cleaned.replace(/\r+/g, '\n');
  // 移除行首的 \r
  cleaned = cleaned.replace(/^\r/gm, '');

  // 移除破坏界面的控制字符
  cleaned = cleaned.replace(/[\x00\x07\x08\x7F]/g, '');

  // 清理多余的连续换行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

/**
 * 将消息列表转换为可显示的行列表
 * 采用"显示最新消息"的策略（屏幕总是显示最新的日志）
 */
function processConsoleMessages(
  messages: ConsoleMessageItem[],
  maxVisibleHeight: number
): {
  displayItems: Array<{
    type: 'message' | 'omitted';
    message?: ConsoleMessageItem;
    omittedCount?: number;
  }>;
  totalMessages: number;
} {
  if (messages.length <= maxVisibleHeight) {
    return {
      displayItems: messages.map((msg) => ({ type: 'message', message: msg })),
      totalMessages: messages.length,
    };
  }

  // 显示最新的消息（从最后往前数）
  const omittedCount = messages.length - maxVisibleHeight;
  const visibleMessages = messages.slice(-maxVisibleHeight);

  const displayItems: Array<{
    type: 'message' | 'omitted';
    message?: ConsoleMessageItem;
    omittedCount?: number;
  }> = [
    { type: 'omitted' as const, omittedCount },
    ...visibleMessages.map((msg) => ({ type: 'message' as const, message: msg })),
  ];

  return {
    displayItems,
    totalMessages: messages.length,
  };
}

function ScrollingDebugConsoleComponent({
  messages,
  height,
  width,
}: ScrollingDebugConsoleProps) {
  const errorCount = messages.filter((msg) => msg.type === 'error').length;

  // 预留 2 行给标题和错误计数
  const contentHeight = Math.max(height - 2, 3);

  const errors = messages.filter((msg) => msg.type === 'error');
  const recentErrorsDisplayCount = Math.min(3, errors.length);
  const reservedForErrors = errors.length > 0 ? 2 + recentErrorsDisplayCount : 0;
  const adjustedContentHeight = Math.max(contentHeight - reservedForErrors, 3);

  const { displayItems, totalMessages } = useMemo(
    () => processConsoleMessages(messages, adjustedContentHeight),
    [messages, adjustedContentHeight]
  );

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={Colors.Gray}
      paddingX={1}
      width={width}
      height={height}
    >
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color={Colors.Foreground}>
          Debug Console{' '}
          <Text color={Colors.Gray}>
            (ctrl+o to toggle, ctrl+s to expand)
          </Text>
        </Text>
        <Text color={errorCount > 0 ? Colors.AccentRed : Colors.Gray}>
          Errors: {errorCount}
        </Text>
      </Box>

      {/* Content area with scrolling logic */}
      <Box flexDirection="column" height={contentHeight}>
        {displayItems.length === 0 ? (
          <Box>
            <Text color={Colors.Gray}>No messages</Text>
          </Box>
        ) : (
          displayItems.map((item, idx) => {
            if (item.type === 'omitted' && item.omittedCount) {
              return (
                <Box key={`omitted-${idx}`} flexDirection="row">
                  <Text color={Colors.Gray}>
                    ... ({item.omittedCount} messages omitted) ...
                  </Text>
                </Box>
              );
            }

            const msg = item.message!;
            let textColor = Colors.InfoColor; // Muted yellow for log/info
            let icon = '\u2139'; // Information source (ℹ)

            switch (msg.type) {
              case 'warn':
                textColor = Colors.AccentYellow;
                icon = '\u26A0'; // Warning sign (⚠)
                break;
              case 'error':
                textColor = Colors.AccentRed;
                icon = '\u2716'; // Heavy multiplication x (✖)
                break;
              case 'debug':
                textColor = Colors.Gray;
                icon = '\u1F50D'; // Left-pointing magnifying glass (🔍)
                break;
              case 'log':
              default:
                // Use InfoColor (muted yellow) for log messages
                break;
            }

            const sanitized = sanitizeMessage(msg.content);
            return (
              <Box key={`msg-${msg.type}-${idx}`} flexDirection="row">
                <Text color={textColor}>{icon} </Text>
                <Text color={textColor} wrap="wrap">
                  {sanitized}
                  {msg.count && msg.count > 1 && (
                    <Text color={Colors.Gray}> (x{msg.count})</Text>
                  )}
                </Text>
              </Box>
            );
          })
        )}

        {/* Fill remaining space to maintain fixed height */}
        {Array.from(
          { length: Math.max(0, adjustedContentHeight - displayItems.length) },
          (_, i) => (
            <Box key={`empty-${i}`}>
              <Text> </Text>
            </Box>
          )
        )}
      </Box>

      {/* Recent Errors Section - Fixed Area */}
      {errors.length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingX={0}>
          <Text bold color={Colors.AccentRed}>
            Recent Errors:
          </Text>
          {errors.slice(-recentErrorsDisplayCount).map((error, idx) => {
            const sanitized = sanitizeMessage(error.content);
            return (
              <Box key={`recent-error-${idx}`} flexDirection="row" paddingX={1}>
                <Text color={Colors.AccentRed}>✖ </Text>
                <Text color={Colors.AccentRed} wrap="wrap">
                  {sanitized}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export const ScrollingDebugConsole = React.memo(
  ScrollingDebugConsoleComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.messages.length === nextProps.messages.length &&
      prevProps.height === nextProps.height &&
      prevProps.width === nextProps.width
    );
  }
);
