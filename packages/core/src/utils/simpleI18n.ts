/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple i18n utility for core package
 * Avoids circular dependencies by implementing basic translation functionality
 */

// 简单的翻译字典
const translations = {
  en: {
    'task.timeout.warning': '⚠️ Task execution timeout: Completed {turns} conversation turns but task remains unfinished',
    'task.timeout.credits.notice': 'Continuing may consume additional credits. Please review carefully.',
    'task.execution.failed': 'Execution failed: {error}',
    'shell.output.truncated': '... (showing last {maxLines} lines, {totalLines} lines total)',
    'websearch.results.returned': 'Search results for "{query}" returned.{truncated}',
    'websearch.results.truncated': ' (Content truncated)',
    'websearch.error.performing': 'Error performing web search.',
  },
  zh: {
    'task.timeout.warning': '⚠️ 任务执行超时：已执行{turns}轮对话但任务仍未完成',
    'task.timeout.credits.notice': '继续执行可能消耗更多 Credits，请谨慎审视。',
    'task.execution.failed': '执行失败: {error}',
    'shell.output.truncated': '... (显示最新 {maxLines} 行，共 {totalLines} 行)',
    'websearch.results.returned': '"{query}"的搜索结果已返回。{truncated}',
    'websearch.results.truncated': '（内容已截断）',
    'websearch.error.performing': '执行网络搜索时出错。',
  }
} as const;

/**
 * 检测是否为中文环境
 */
function isChineseEnvironment(): boolean {
  try {
    const env = process.env;
    const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || '';
    return locale.toLowerCase().includes('zh') || locale.toLowerCase().includes('chinese');
  } catch {
    return false;
  }
}

/**
 * 获取当前语言
 */
function getCurrentLocale(): 'en' | 'zh' {
  return isChineseEnvironment() ? 'zh' : 'en';
}

/**
 * 翻译函数，支持参数替换
 * @param key 翻译键
 * @param params 参数对象
 * @returns 翻译后的文本
 */
export function t(key: keyof typeof translations.en, params?: Record<string, string | number>): string {
  const locale = getCurrentLocale();
  let text: string = translations[locale][key] || translations.en[key] || key;

  // 参数替换
  if (params) {
    Object.entries(params).forEach(([paramName, value]) => {
      text = text.replace(new RegExp(`\\{${paramName}\\}`, 'g'), String(value));
    });
  }

  return text;
}