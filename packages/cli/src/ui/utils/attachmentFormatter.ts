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
  // 匹配文件路径字符（字母、数字、点、斜杠、下划线、连字符）
  result = result.replace(/@(?!clipboard)(?!\[)([a-zA-Z0-9_\-./\\]+)(?=\s|$|[，,;；:：!！?？、。\)\]）】》>])/g, (match, path) => {
    return `@"${path}"`;
  });

  return result;
}
