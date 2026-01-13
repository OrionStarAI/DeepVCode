/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { cpLen, cpSlice, getRealLineCount } from './textUtils.js';
import { Colors } from '../colors.js';


// --- Thresholds ---
export const TOOL_SUCCESS_RATE_HIGH = 95;
export const TOOL_SUCCESS_RATE_MEDIUM = 85;

export const USER_AGREEMENT_RATE_HIGH = 75;
export const USER_AGREEMENT_RATE_MEDIUM = 45;

export const CACHE_EFFICIENCY_HIGH = 40;
export const CACHE_EFFICIENCY_MEDIUM = 15;

// --- Color Logic ---
export const getStatusColor = (
  value: number,
  thresholds: { green: number; yellow: number },
  options: { defaultColor?: string } = {},
) => {
  if (value >= thresholds.green) {
    return Colors.AccentGreen;
  }
  if (value >= thresholds.yellow) {
    return Colors.AccentYellow;
  }
  return options.defaultColor || Colors.AccentRed;
};

// --- Text Display Utils ---

/**
 * 简单截断长文本，超过限制就显示开头部分 + 省略号
 */
export function truncateTextForDisplay(text: string, maxLines = 15): string {
  const totalLines = getRealLineCount(text);

  // 短文本直接返回
  if (totalLines <= maxLines) {
    return text;
  }

  // 长文本截断：只显示前几行 + 省略号
  const lines = text.split(/\r?\n/);
  const truncatedLines = lines.slice(0, maxLines);

  return truncatedLines.join('\n') + '\n...';
}

/**
 * 检测是否为长文本
 */
export function isLongText(text: string, maxLines = 15): boolean {
  return getRealLineCount(text) > maxLines;
}

/**
 * 智能换行处理：将超长行按指定宽度进行换行
 */
export function wrapLongLines(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return text;

  const lines = text.split(/\r?\n/);
  const wrappedLines: string[] = [];

  for (const line of lines) {
    if (cpLen(line) <= maxWidth) {
      wrappedLines.push(line);
    } else {
      // 检查是否包含文件路径（@"..." 或 @path）
      // 如果包含，尝试在路径边界处断行，而不是在路径中间
      const filePathPattern = /@(?:"[^"]+"|[^\s]+)/g;
      const hasFilePath = filePathPattern.test(line);

      if (hasFilePath) {
        // 如果行中有文件路径，尝试在路径之前或之后断行
        // 简单策略：如果文件路径太长，截断显示
        const parts: string[] = [];
        let lastIndex = 0;
        const matches = line.matchAll(/@(?:"([^"]+)"|([^\s]+))/g);

        for (const match of matches) {
          const beforePath = line.substring(lastIndex, match.index);
          const pathPart = match[0];

          // 添加路径之前的文本
          if (beforePath) {
            parts.push(beforePath);
          }

          // 添加路径（可能需要截断）
          if (cpLen(pathPart) > maxWidth) {
            // 路径太长，截断显示
            parts.push(cpSlice(pathPart, 0, maxWidth - 3) + '...');
          } else {
            parts.push(pathPart);
          }

          lastIndex = (match.index || 0) + match[0].length;
        }

        // 添加剩余部分
        if (lastIndex < line.length) {
          parts.push(line.substring(lastIndex));
        }

        wrappedLines.push(parts.join(''));
      } else {
        // 普通文本，使用原有的换行逻辑
        let currentPos = 0;
        while (currentPos < cpLen(line)) {
          let endPos = Math.min(currentPos + maxWidth, cpLen(line));
          let chunk = cpSlice(line, currentPos, endPos);

          // 如果不是最后一段，尝试在空格处断行
          if (endPos < cpLen(line)) {
            const lastSpaceIndex = chunk.lastIndexOf(' ');
            if (lastSpaceIndex > 0 && lastSpaceIndex > maxWidth * 0.7) {
              // 如果找到空格且位置合理，在空格处断行
              chunk = chunk.substring(0, lastSpaceIndex);
              endPos = currentPos + lastSpaceIndex + 1; // +1 跳过空格
            }
          }

          wrappedLines.push(chunk);
          currentPos = endPos;
        }
      }
    }
  }

  return wrappedLines.join('\n');
}

/**
 * 强制换行处理：确保每行都不超过指定宽度
 */
export function forceWrapText(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return text;

  // 先进行智能换行
  const wrappedText = wrapLongLines(text, maxWidth);

  // 再次检查并强制截断任何仍然过长的行
  const lines = wrappedText.split('\n');
  const finalLines = lines.map(line => {
    if (cpLen(line) > maxWidth) {
      return cpSlice(line, 0, maxWidth - 3) + '...';
    }
    return line;
  });

  return finalLines.join('\n');
}

/**
 * 智能截断文本：优先保留开头和结尾，中间用省略号
 */
export function smartTruncateText(text: string, maxLines = 15): string {
  const totalLines = getRealLineCount(text);

  if (totalLines <= maxLines) {
    return text;
  }

  const lines = text.split(/\r?\n/);

  // 如果行数不是太多，使用简单截断
  if (totalLines <= maxLines * 2) {
    return truncateTextForDisplay(text, maxLines);
  }

  // 对于非常长的文本，保留开头和结尾
  const headLines = Math.floor(maxLines * 0.6);
  const tailLines = Math.floor(maxLines * 0.3);
  const remainingLines = totalLines - headLines - tailLines;

  const headPart = lines.slice(0, headLines).join('\n');
  const tailPart = lines.slice(-tailLines).join('\n');

  return `${headPart}\n\n... (${remainingLines} lines omitted) ...\n\n${tailPart}`;
}

/**
 * 清理文本中的特殊字符和ANSI转义序列
 */
export function sanitizeText(text: string): string {
  if (!text) return text;

  // 移除ANSI转义序列（颜色代码、光标控制等）
  let cleaned = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  // 先规范化换行符
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 移除有害的控制字符，但保留换行符(\n=\x0A)和制表符(\t=\x09)
  // 移除: \x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 移除其他可能有问题的字符，但不影响换行符
  cleaned = cleaned.replace(/[\x7F-\x9F]/g, '');

  return cleaned;
}

/**
 * 安全地处理粘贴内容，清理特殊字符并格式化
 * @param content 要处理的内容
 */
export function sanitizePasteContent(content: string): string {
  // 先清理特殊字符（保留换行符）
  let sanitized = sanitizeText(content);

  // 默认处理：移除过多的连续空行
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');

  // 移除行末空格，但保留行首缩进
  const lines = sanitized.split('\n');
  const cleanedLines = lines.map(line => line.trimEnd());

  // 处理文件开头和结尾的空行
  let result = cleanedLines.join('\n');
  result = result.replace(/^\n+/, '').replace(/\n+$/, '');

  return result;
}