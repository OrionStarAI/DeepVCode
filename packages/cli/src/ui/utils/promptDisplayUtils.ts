/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { INIT_COMMAND_PROMPT } from '../commands/prompts/initPrompt.js';

// 需要在显示时替换的长提示词映射
const PROMPT_DISPLAY_REPLACEMENTS: Record<string, string> = {
  // /init 命令的长提示词
  [INIT_COMMAND_PROMPT]: 'Analyzing project and generating DEEPV.md...',
};

/**
 * 获取用户消息的显示文本，如果是长提示词则返回友好的简化消息
 * @param originalText 原始文本
 * @returns 显示文本（如果需要替换则返回简化消息，否则返回原文）
 */
export function getUserMessageDisplayText(originalText: string): string {
  // 查找是否有匹配的长提示词需要替换
  const replacement = PROMPT_DISPLAY_REPLACEMENTS[originalText];
  return replacement || originalText;
}