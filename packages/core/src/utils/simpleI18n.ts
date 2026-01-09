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
    'shell.error.dangerous_node_kill_windows': 'This command attempts to kill all node.exe processes, which would terminate the CLI itself. Please use specific PIDs instead: taskkill /PID <process_id> /F',
    'shell.error.dangerous_node_kill_unix': 'This command attempts to kill all node processes, which would terminate the CLI itself. Please use specific PIDs instead: kill -9 <process_id>',
    'websearch.results.returned': 'Search results for "{query}" returned.{truncated}',
    'websearch.results.truncated': ' (Content truncated)',
    'websearch.error.performing': 'Error performing web search.',
    'tool.ppt_generate': 'PPT Generate',
    'tool.ppt_generate.description': 'Submit PPT outline and start generation task.\n\nThis tool will perform the following operations:\n1. Submit the current outline to the server\n2. Start the PPT generation task\n3. Automatically open browser to the PPT editing preview page\n4. Exit PPT editing mode\n\nMake sure to set the outline content (topic, page count, outline text) via ppt_outline tool before calling.',
    'ppt_generate.param.confirm': 'Confirm submission (default true)',
  },
  zh: {
    'task.timeout.warning': '⚠️ 任务执行超时：已执行{turns}轮对话但任务仍未完成',
    'task.timeout.credits.notice': '继续执行可能消耗更多 Credits，请谨慎审视。',
    'task.execution.failed': '执行失败: {error}',
    'shell.output.truncated': '... (显示最新 {maxLines} 行，共 {totalLines} 行)',
    'shell.error.dangerous_node_kill_windows': '该命令会批量结束所有 node.exe 进程，这将导致CLI自身被终止。请使用精准的PID方式：taskkill /PID <进程ID> /F',
    'shell.error.dangerous_node_kill_unix': '该命令会批量结束所有 node 进程，这将导致CLI自身被终止。请使用精准的PID方式：kill -9 <进程ID>',
    'websearch.results.returned': '"{query}"的搜索结果已返回。{truncated}',
    'websearch.results.truncated': '（内容已截断）',
    'websearch.error.performing': '执行网络搜索时出错。',
    'tool.ppt_generate': 'PPT生成',
    'tool.ppt_generate.description': '提交PPT大纲并启动生成任务。\n\n此工具会执行以下操作：\n1. 将当前大纲提交到服务端\n2. 启动PPT生成任务\n3. 自动打开浏览器跳转到PPT编辑预览页面\n4. 退出PPT编辑模式\n\n调用前请确保已通过 ppt_outline 工具设置好大纲内容（主题、页数、大纲文本）。',
    'ppt_generate.param.confirm': '确认提交（默认true）',
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