/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import stripAnsi from 'strip-ansi';

export interface ScrollingTextDisplayProps {
  /** 要显示的文本内容 */
  content: string;
  /** 显示区域的高度（行数） */
  height: number;
  /** 显示区域的宽度 */
  width: number;
  /** 是否处于滚动模式（展示最新的行） */
  isScrolling?: boolean;
  /** 标题 */
  title?: string;
  /** 标题颜色 */
  titleColor?: string;
}

/**
 * 清理文本中的非法字符
 * - 移除 ANSI 转义序列
 * - 处理 \r 字符（转换为换行）
 * - 移除其他破坏界面的控制字符
 * - 清理多余的连续换行
 */
function sanitizeText(text: string): string {
  if (!text) return text;

  let cleaned = stripAnsi(text);

  // 处理 \r\n 组合（Windows 标准换行）
  cleaned = cleaned.replace(/\r\n/g, '\n');
  // 处理连续的 \r（如 ping 命令的覆盖式输出）
  cleaned = cleaned.replace(/\r+/g, '\n');
  // 移除行首的 \r 残留
  cleaned = cleaned.replace(/^\r/gm, '');

  // 移除可能破坏界面的控制字符
  cleaned = cleaned.replace(/[\x00\x07\x08\x7F]/g, '');

  // 清理多余的连续换行（保留有意义的空行）
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

/**
 * 将文本分行，并计算省略行数
 * 采用"头部 + 省略提示 + 尾部"的策略
 */
function processTextLines(
  text: string,
  maxHeight: number,
  headRatio: number = 0.6
): { displayLines: string[]; totalLines: number; omittedCount: number } {
  const cleaned = sanitizeText(text);
  const allLines = cleaned.split('\n');
  const totalLines = allLines.length;

  if (totalLines <= maxHeight) {
    return {
      displayLines: allLines,
      totalLines,
      omittedCount: 0,
    };
  }

  // 长文本：头尾 + 省略
  const headLines = Math.ceil(maxHeight * headRatio) - 1;
  const tailLines = maxHeight - headLines - 1;
  const omittedCount = totalLines - headLines - tailLines;

  const head = allLines.slice(0, headLines);
  const tail = allLines.slice(-tailLines);
  const omittedNotice = `... (省略 ${omittedCount} 行) ...`;

  return {
    displayLines: [...head, omittedNotice, ...tail],
    totalLines,
    omittedCount,
  };
}

/**
 * 滚动文本显示组件
 * 用于展示长文本内容，自动省略超过高度限制的行
 * 类似 Shell Command 的滚动显示，支持"头+省略+尾"的布局
 */
function ScrollingTextDisplayComponent({
  content,
  height,
  width,
  isScrolling = false,
  title,
  titleColor = Colors.Foreground,
}: ScrollingTextDisplayProps) {
  const { displayLines, totalLines, omittedCount } = useMemo(
    () => processTextLines(content, Math.max(height - 2, 1), 0.6),
    [content, height]
  );

  // 确保显示行数不超过高度
  const visibleLines = displayLines.slice(
    0,
    Math.max(height - (title ? 2 : 1), 1)
  );

  return (
    <Box flexDirection="column" width={width}>
      {title && (
        <Box marginBottom={0}>
          <Text bold color={titleColor}>
            {title}
          </Text>
        </Box>
      )}
      <Box flexDirection="column" height={height - (title ? 1 : 0)}>
        {visibleLines.length === 0 ? (
          <Text color={Colors.Gray}>(empty)</Text>
        ) : (
          visibleLines.map((line, idx) => {
            // 检测是否是省略提示行
            const isOmittedLine = line.startsWith('... (省略');
            const lineColor = isOmittedLine ? Colors.Gray : Colors.Foreground;

            return (
              <Box key={idx} flexDirection="row">
                <Text color={lineColor} wrap="wrap">
                  {line}
                </Text>
              </Box>
            );
          })
        )}
        {/* 填充空白以维持固定高度 */}
        {Array.from(
          { length: Math.max(0, height - (title ? 1 : 0) - visibleLines.length) },
          (_, i) => (
            <Box key={`empty-${i}`}>
              <Text> </Text>
            </Box>
          )
        )}
      </Box>
    </Box>
  );
}

export const ScrollingTextDisplay = React.memo(
  ScrollingTextDisplayComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.content === nextProps.content &&
      prevProps.height === nextProps.height &&
      prevProps.width === nextProps.width &&
      prevProps.isScrolling === nextProps.isScrolling &&
      prevProps.title === nextProps.title &&
      prevProps.titleColor === nextProps.titleColor
    );
  }
);
