/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 语言感知的文本处理工具
 * 用于在编辑工具中应用语言特定的文本处理逻辑
 */

export interface LanguageProcessingConfig {
  preserveTrailingSpaces: boolean;
  indentSensitive: boolean;
  emptyLineHandling: 'preserve' | 'normalize' | 'remove_excess';
  maxConsecutiveEmptyLines: number;
  trailingSpaceHandling: 'preserve' | 'remove' | 'normalize';
}

/**
 * Windows脚本和配置文件扩展名
 * 这些文件在Windows上通常需要CRLF换行符才能正常执行
 */
const WINDOWS_SCRIPT_EXTENSIONS = new Set([
  // 核心批处理和命令脚本
  'bat', 'cmd',

  // PowerShell脚本
  'ps1', 'psm1', 'psd1', 'ps1xml',

  // VBScript
  'vbs', 'vbe',

  // Windows注册表
  'reg',

  // Windows Script Host
  'wsf', 'wsh',

  // Windows配置文件
  'inf', 'ini',

  // AutoHotkey
  'ahk',

  // 其他Windows脚本
  'hta', 'sct', 'vb'
]);

/**
 * 语言配置映射表
 */
const LANGUAGE_CONFIGS: { [key: string]: LanguageProcessingConfig } = {
  'c': {
    preserveTrailingSpaces: false,
    indentSensitive: false,
    emptyLineHandling: 'preserve',
    maxConsecutiveEmptyLines: 10,
    trailingSpaceHandling: 'remove',
  },
  'cpp': {
    preserveTrailingSpaces: false,
    indentSensitive: false,
    emptyLineHandling: 'preserve',
    maxConsecutiveEmptyLines: 10,
    trailingSpaceHandling: 'remove',
  },
  'default': {
    preserveTrailingSpaces: false,
    indentSensitive: false,
    emptyLineHandling: 'normalize',
    maxConsecutiveEmptyLines: 3,
    trailingSpaceHandling: 'remove',
  },
};

/**
 * 从文件路径推断编程语言
 */
export function inferLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';

  // 特殊文件名
  if (fileName === 'makefile' || fileName.startsWith('makefile.')) {
    return 'makefile';
  }

  // 扩展名映射
  const extensionMap: { [key: string]: string } = {
    'c': 'c',
    'cpp': 'cpp',
    'cxx': 'cpp',
    'cc': 'cpp',
    'c++': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'hxx': 'cpp',
    'py': 'python',
    'js': 'javascript',
    'ts': 'typescript',
  };

  return extensionMap[extension] || 'default';
}

/**
 * 获取语言处理配置
 */
export function getLanguageProcessingConfig(filePath: string): LanguageProcessingConfig {
  const language = inferLanguageFromPath(filePath);
  return LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.default;
}

/**
 * 判断文件是否应该使用CRLF换行符（Windows脚本文件）
 */
export function shouldUseCRLF(filePath: string): boolean {
  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  return WINDOWS_SCRIPT_EXTENSIONS.has(extension);
}

/**
 * 语言感知的文本后处理
 * 在文本替换完成后，根据语言特性进行优化
 */
export function postProcessTextByLanguage(
  content: string,
  filePath: string,
  isNewFile: boolean = false,
  autoTrimTrailingSpaces?: boolean
): string {
  if (!content) return content;

  const config = getLanguageProcessingConfig(filePath);
  const language = inferLanguageFromPath(filePath);

  // 如果项目配置明确禁用了行末空格自动删除，则覆盖语言配置
  let effectiveConfig = config;
  if (autoTrimTrailingSpaces !== undefined) {
    effectiveConfig = {
      ...config,
      trailingSpaceHandling: autoTrimTrailingSpaces ? 'remove' : 'preserve'
    };
  }

  let processed: string;

  // C++特殊处理
  if (['c', 'cpp'].includes(language)) {
    processed = postProcessCppText(content, effectiveConfig);
  } else {
    // 通用处理
    processed = postProcessGenericText(content, effectiveConfig);
  }

  // Windows脚本文件：转换为CRLF换行符
  if (shouldUseCRLF(filePath)) {
    processed = convertToCRLF(processed);
  }

  return processed;
}

/**
 * C++专用文本后处理
 */
function postProcessCppText(content: string, config: LanguageProcessingConfig): string {
  if (!content) return content;

  // 标准化换行符
  let processed = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 处理每一行
  const lines = processed.split('\n');
  const processedLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === '') {
      // 空行：确保完全为空（这是C++的关键需求）
      processedLines.push('');
    } else {
      // 非空行：根据配置决定是否移除行末空格
      if (config.trailingSpaceHandling === 'remove') {
        processedLines.push(line.trimEnd());
      } else {
        processedLines.push(line);
      }
    }
  }

  // 限制连续空行，但对C++较为宽松
  processed = processedLines.join('\n');
  if (config.emptyLineHandling === 'normalize') {
    // 对C++，最多允许5个连续空行
    processed = processed.replace(/\n{7,}/g, '\n\n\n\n\n\n');
  }

  return processed;
}

/**
 * 通用文本后处理
 */
function postProcessGenericText(content: string, config: LanguageProcessingConfig): string {
  if (!content) return content;

  let processed = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 处理行末空格
  if (config.trailingSpaceHandling === 'remove') {
    const lines = processed.split('\n');
    const cleanedLines = lines.map(line =>
      line.trim() === '' ? '' : line.trimEnd()
    );
    processed = cleanedLines.join('\n');
  }

  // 处理连续空行
  if (config.emptyLineHandling === 'normalize') {
    const maxEmpty = config.maxConsecutiveEmptyLines;
    const pattern = new RegExp(`\\n{${maxEmpty + 2},}`, 'g');
    const replacement = '\n'.repeat(maxEmpty + 1);
    processed = processed.replace(pattern, replacement);
  }

  return processed;
}

/**
 * 检查是否为C++系列语言
 */
export function isCppFamily(filePath: string): boolean {
  const language = inferLanguageFromPath(filePath);
  return ['c', 'cpp'].includes(language);
}

/**
 * 转换文本为CRLF换行符（Windows格式）
 * 先标准化为LF，再统一转换为CRLF
 */
function convertToCRLF(content: string): string {
  // 先统一为LF，避免重复的CRLF
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // 转换为CRLF
  return normalized.replace(/\n/g, '\r\n');
}