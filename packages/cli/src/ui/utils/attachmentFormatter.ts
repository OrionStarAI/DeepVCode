/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Format file and image references for DISPLAY
 * Converts @"path/to/file" to @[File #"path/to/file"] with invisible quotes
 * The quotes are rendered with ANSI codes that make them invisible to the eye
 * but they remain in the terminal output for command+click support
 */
export function formatAttachmentReferencesForDisplay(text: string): string {
  // 用 ANSI 转义码将引号变成"隐形"（深灰色）
  const invisibleQuote = '\u001b[38;5;239m"\u001b[0m'; // 深灰色的引号，几乎看不见

  // 先处理 @"path" 形式
  let result = text.replace(/@"([^"]+)"/g, (match, path) => {
    const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|svg|ico|heic|heif|avif|tiff?|raw)$/i.test(path);
    const type = isImage ? 'Image' : 'File';
    return `@[${type} #${invisibleQuote}${path}${invisibleQuote}]`;
  });

  // 再处理 @path 形式（不含引号）
  // 匹配非空白、非引号、非特殊标点的字符（包括点号用于扩展名）
  // 但后面必须跟空格、标点或行末
  result = result.replace(/@([a-zA-Z0-9_\-./\\]+)(?=\s|$|[，,;；:：!！?？、。\)\]）】》>])/g, (match, path) => {
    const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|svg|ico|heic|heif|avif|tiff?|raw)$/i.test(path);
    const type = isImage ? 'Image' : 'File';
    return `@[${type} #${invisibleQuote}${path}${invisibleQuote}]`;
  });

  return result;
}

/**
 * Ensure all attachment references have quotes for command+click support
 * Converts @path to @"path" so terminal can properly detect file paths
 */
export function ensureQuotesAroundAttachments(text: string): string {
  // 已经是 @"path" 格式的，直接返回
  // 如果是 @path 形式，添加引号变成 @"path"
  // 匹配文件路径字符（字母、数字、点、斜杠、下划线、连字符）
  return text.replace(/@([a-zA-Z0-9_\-./\\]+)(?=\s|$|[，,;；:：!！?？、。\)\]）】》>])/g, (match, path) => {
    return `@"${path}"`;
  });
}
