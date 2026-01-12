/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import Link from 'ink-link';
import { Colors } from '../colors.js';
import stringWidth from 'string-width';
import { platform } from 'os';

// Constants for Markdown parsing
const BOLD_MARKER_LENGTH = 2; // For "**"
const ITALIC_MARKER_LENGTH = 1; // For "*" or "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // For "~~"
const INLINE_CODE_MARKER_LENGTH = 1; // For "`"
const UNDERLINE_TAG_START_LENGTH = 3; // For "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // For "</u>"

interface RenderInlineProps {
  text: string;
}

const RenderInlineInternal: React.FC<RenderInlineProps> = ({ text }) => {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  // 预处理：将纯文本的 file:// URL 转换为友好的显示格式
  // 这样可以防止终端自动识别并使其可点击打开浏览器
  let processedText = text;
  const fileUrlRegex = /file:\/\/[^\s)]+/g;
  processedText = processedText.replace(fileUrlRegex, (fileUrl) => {
    const filePath = decodeURIComponent(fileUrl.replace('file://', ''));
    const fileName = filePath.split('/').pop() || filePath;
    const os = platform();

    let previewCommand = '';
    if (os === 'darwin') {
      previewCommand = `open "${filePath}"`;
    } else if (os === 'win32') {
      previewCommand = `start "" "${filePath}"`;
    } else {
      previewCommand = `xdg-open "${filePath}"`;
    }

    // 用友好的文本替换 file:// URL，避免终端自动识别
    return `${fileName} (Run: ${previewCommand})`;
  });

  const inlineRegex =
    /(\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>)/g;
  let match;

  while ((match = inlineRegex.exec(processedText)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Text key={`t-${lastIndex}`}>
          {processedText.slice(lastIndex, match.index)}
        </Text>,
      );
    }

    const fullMatch = match[0];
    let renderedNode: React.ReactNode = null;
    const key = `m-${match.index}`;

    try {
      if (
        fullMatch.startsWith('**') &&
        fullMatch.endsWith('**') &&
        fullMatch.length > BOLD_MARKER_LENGTH * 2
      ) {
        renderedNode = (
          <Text key={key} bold>
            {fullMatch.slice(BOLD_MARKER_LENGTH, -BOLD_MARKER_LENGTH)}
          </Text>
        );
      } else if (
        fullMatch.length > ITALIC_MARKER_LENGTH * 2 &&
        ((fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
          (fullMatch.startsWith('_') && fullMatch.endsWith('_'))) &&
        !/\w/.test(text.substring(match.index - 1, match.index)) &&
        !/\w/.test(
          text.substring(inlineRegex.lastIndex, inlineRegex.lastIndex + 1),
        ) &&
        !/\S[./\\]/.test(text.substring(match.index - 2, match.index)) &&
        !/[./\\]\S/.test(
          text.substring(inlineRegex.lastIndex, inlineRegex.lastIndex + 2),
        )
      ) {
        renderedNode = (
          <Text key={key} italic>
            {fullMatch.slice(ITALIC_MARKER_LENGTH, -ITALIC_MARKER_LENGTH)}
          </Text>
        );
      } else if (
        fullMatch.startsWith('~~') &&
        fullMatch.endsWith('~~') &&
        fullMatch.length > STRIKETHROUGH_MARKER_LENGTH * 2
      ) {
        renderedNode = (
          <Text key={key} strikethrough>
            {fullMatch.slice(
              STRIKETHROUGH_MARKER_LENGTH,
              -STRIKETHROUGH_MARKER_LENGTH,
            )}
          </Text>
        );
      } else if (
        fullMatch.startsWith('`') &&
        fullMatch.endsWith('`') &&
        fullMatch.length > INLINE_CODE_MARKER_LENGTH
      ) {
        const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
        if (codeMatch && codeMatch[2]) {
          // Use a blue-purple color similar to Claude Code CLI for inline code
          // This provides better visual distinction from purple accent elements
          renderedNode = (
            <Text key={key} color="#7B8CDE">
              {codeMatch[2]}
            </Text>
          );
        }
      } else if (
        fullMatch.startsWith('[') &&
        fullMatch.includes('](') &&
        fullMatch.endsWith(')')
      ) {
        const linkMatch = fullMatch.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          const linkText = linkMatch[1];
          const url = linkMatch[2];

          // 检测是否为本地文件链接 (file:// 协议)
          if (url.startsWith('file://')) {
            // 对于本地文件（尤其是图片），提供系统命令来预览
            // 因为浏览器出于安全原因无法打开 file:// 协议的本地文件
            const filePath = decodeURIComponent(url.replace('file://', ''));

            let previewCommand = '';
            const os = platform();

            if (os === 'darwin') {
              // macOS: 使用 open 命令打开系统预览
              previewCommand = `open "${filePath}"`;
            } else if (os === 'win32') {
              // Windows: 使用 start 命令
              previewCommand = `start "" "${filePath}"`;
            } else {
              // Linux: 使用 xdg-open
              previewCommand = `xdg-open "${filePath}"`;
            }

            // 显示文件路径和预览命令提示
            // 用户可以复制命令到终端执行，或者手动打开文件
            renderedNode = (
              <Text key={key} color={Colors.AccentBlue}>
                {linkText} → Run: <Text color={Colors.Comment}>{previewCommand}</Text>
              </Text>
            );
          } else {
            // 普通的 http/https 链接
            renderedNode = (
              <Link key={key} url={url}>
                <Text color={Colors.AccentBlue} underline>
                  {linkText}
                </Text>
              </Link>
            );
          }
        }
      } else if (
        fullMatch.startsWith('<u>') &&
        fullMatch.endsWith('</u>') &&
        fullMatch.length >
          UNDERLINE_TAG_START_LENGTH + UNDERLINE_TAG_END_LENGTH - 1 // -1 because length is compared to combined length of start and end tags
      ) {
        renderedNode = (
          <Text key={key} underline>
            {fullMatch.slice(
              UNDERLINE_TAG_START_LENGTH,
              -UNDERLINE_TAG_END_LENGTH,
            )}
          </Text>
        );
      }
    } catch (e) {
      console.error('Error parsing inline markdown part:', fullMatch, e);
      renderedNode = null;
    }

    nodes.push(renderedNode ?? <Text key={key}>{fullMatch}</Text>);
    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < processedText.length) {
    nodes.push(<Text key={`t-${lastIndex}`}>{processedText.slice(lastIndex)}</Text>);
  }

  return <>{nodes.filter((node) => node !== null)}</>;
};

export const RenderInline = React.memo(RenderInlineInternal);

/**
 * Utility function to get the plain text length of a string with markdown formatting
 * This is useful for calculating column widths in tables
 */
export const getPlainTextLength = (text: string): number => {
  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/<u>(.*?)<\/u>/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1');
  return stringWidth(cleanText);
};
