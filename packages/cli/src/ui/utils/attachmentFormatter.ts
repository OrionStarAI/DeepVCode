/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import chalk from 'chalk';

/**
 * 用 ANSI 转义码将引号变成"隐形"（深灰色）
 */
export const invisibleQuote = '\u001b[38;5;239m"\u001b[0m'; // 深灰色的引号，几乎看不见

/**
 * Format file and image references for DISPLAY
 * Converts @"path/to/file" to @[File #"path/to/file"] with invisible quotes
 * The quotes are rendered with ANSI codes that make them invisible to the eye
 * but they remain in the terminal output for command+click support
 */
export function formatAttachmentReferencesForDisplay(text: string): string {
  // 先处理 @"path" 形式
  let result = text.replace(/@"([^"]+)"/g, (match, path) => {
    const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|svg|ico|heic|heif|avif|tiff?|raw)$/i.test(path);
    const type = isImage ? 'Image' : 'File';
    return `@[${type} #${invisibleQuote}${path}${invisibleQuote}]`;
  });

  // 再处理 @path 形式（不含引号）
  // 匹配非空白、非引号、非特殊标点的字符（包括点号用于扩展名，冒号用于 Windows 盘符或行号）
  // 但后面必须跟空格、标点或行末
  result = result.replace(/@([a-zA-Z0-9_\-./\\:]+)(?=\s|$|[，,;；:：!！?？、。\)\]）】》>])/g, (match, path) => {
    const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|svg|ico|heic|heif|avif|tiff?|raw)$/i.test(path);
    const type = isImage ? 'Image' : 'File';
    return `@[${type} #${invisibleQuote}${path}${invisibleQuote}]`;
  });

  return result;
}

export interface AttachmentSegment {
  text: string;
  type: 'text' | 'attachment';
  attachmentType?: 'File' | 'Image';
  path?: string;
}

/**
 * 将文本解析为片段，区分普通文本和附件引用
 * 这对于在含有附件引用的文本中正确渲染光标至关重要
 */
export function getAttachmentSegments(text: string): AttachmentSegment[] {
  const segments: AttachmentSegment[] = [];
  const regex = /@"([^"]+)"|@([a-zA-Z0-9_\-./\\:]+)(?=\s|$|[，,;；:：!！?？、。\)\]）】》>])/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 添加匹配前的文本
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        type: 'text'
      });
    }

    const pathValue = match[1] || match[2];
    const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|svg|ico|heic|heif|avif|tiff?|raw)$/i.test(pathValue);

    segments.push({
      text: match[0],
      type: 'attachment',
      attachmentType: isImage ? 'Image' : 'File',
      path: pathValue
    });

    lastIndex = regex.lastIndex;
  }

  // 添加剩余文本
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      type: 'text'
    });
  }

  return segments;
}

/**
 * 格式化单个附件片段，支持可选的光标高亮
 * @param segment 片段对象
 * @param relativeCursorPos 相对于片段文本开始位置的光标位置
 */
export function formatAttachmentSegment(segment: AttachmentSegment, relativeCursorPos?: number): string {
  if (relativeCursorPos === undefined) {
    if (segment.type === 'text') return segment.text;
    return `@[${segment.attachmentType} #${invisibleQuote}${segment.path}${invisibleQuote}]`;
  }

  // 处理带有光标的情况
  const text = segment.text;
  const before = text.slice(0, relativeCursorPos);
  const char = text.charAt(relativeCursorPos) || ' ';
  const after = text.slice(relativeCursorPos + 1);
  const highlighted = chalk.inverse(char);

  if (segment.type === 'text') {
    return before + highlighted + after;
  } else {
    // 附件引用的情况，需要保持整体结构
    // 注意：segment.text 包含前面的 @ 或 @" 符号
    const isQuoted = text.startsWith('@"');
    const prefix = isQuoted ? '@"' : '@';

    // 我们需要重新计算 relativeCursorPos 相对于 segment.path 的位置
    const pathCursorPos = relativeCursorPos - prefix.length;

    if (pathCursorPos < 0) {
      // 光标在 @ 或 " 符号上
      const pathPart = `${invisibleQuote}${segment.path}${invisibleQuote}`;
      return `@[${segment.attachmentType} #${chalk.inverse(text.charAt(relativeCursorPos))}${text.slice(relativeCursorPos + 1, prefix.length)}${pathPart}]`;
    } else if (pathCursorPos >= (segment.path?.length || 0)) {
      // 光标在结尾引号上（如果是 quoted）
      const pathPart = `${invisibleQuote}${segment.path}${invisibleQuote}`;
      if (isQuoted && relativeCursorPos === text.length - 1) {
         // 光标在结尾引号上
         return `@[${segment.attachmentType} #${pathPart.slice(0, -invisibleQuote.length)}${chalk.inverse('"')}]`;
      }
      return `@[${segment.attachmentType} #${pathPart}]${highlighted}`; // 不应该发生，除非逻辑错误
    } else {
      // 光标在路径中间
      const pathBefore = segment.path!.slice(0, pathCursorPos);
      const pathChar = segment.path!.charAt(pathCursorPos);
      const pathAfter = segment.path!.slice(pathCursorPos + 1);

      return `@[${segment.attachmentType} #${invisibleQuote}${pathBefore}${chalk.inverse(pathChar)}${pathAfter}${invisibleQuote}]`;
    }
  }
}

/**
 * Ensure all attachment references have quotes for command+click support
 * Handles multiple formats:
 * 1. @[File #"path"] or @[Image #"path"] -> @"path"
 * 2. @clipboard -> @"clipboard"
 * 3. @path -> @"path"
 * 4. @"path" -> @"path" (already quoted, no change)
 */
export function ensureQuotesAroundAttachments(text: string): string {
  let result = text;

  // 1. 处理显示格式 @[File #"path"] 或 @[Image #"path"]（可能来自粘贴）
  // 提取引号内的路径，转换为标准 @"path" 格式
  result = result.replace(/@\[(File|Image)\s*#"([^"]*)"\]/g, (match, type, path) => {
    return `@"${path}"`;
  });

  // 2. 处理 @clipboard 特殊格式（需要保持原样，因为它是特殊值）
  // 这个不需要修改，但我们要确保在处理其他 @... 时不匹配它
  // 所以在下面的正则中添加负向先行断言

  // 3. 处理 @path 形式（不含引号，不是 @[...] 格式，不是 @clipboard）
  // 匹配文件路径字符（字母、数字、点、斜杠、下划线、连字符、冒号）
  result = result.replace(/@(?!clipboard)(?!\[)([a-zA-Z0-9_\-./\\:]+)(?=\s|$|[，,;；:：!！?？、。\)\]）】》>])/g, (match, path) => {
    return `@"${path}"`;
  });

  return result;
}