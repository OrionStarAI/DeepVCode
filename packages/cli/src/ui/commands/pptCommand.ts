/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, SlashCommandActionReturn, CommandContext } from './types.js';
import { MessageType } from '../types.js';
import { t } from '../utils/i18n.js';

/**
 * PPT命令实现 - 触发PPT大纲对话模式
 *
 * 使用方式:
 * /ppt                    - 询问用户想要创建的PPT主题
 * /ppt "主题"             - 直接开始创建PPT，主题为指定内容
 * /ppt "主题" --pages 10  - 指定主题和预期页数
 */
export const pptCommand: SlashCommand = {
  name: 'ppt',
  description: t('command.ppt.description'),
  kind: CommandKind.BUILT_IN,

  action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
    const trimmedArgs = args.trim();

    // 解析参数
    let topic = '';
    let pageCount: number | undefined;

    if (trimmedArgs) {
      // 提取 --pages 参数
      const pagesMatch = trimmedArgs.match(/--pages\s+(\d+)/i);
      if (pagesMatch) {
        pageCount = parseInt(pagesMatch[1], 10);
        // 移除 --pages 参数后的部分作为主题
        topic = trimmedArgs.replace(/\s*--pages\s+\d+/i, '').trim();
      } else {
        topic = trimmedArgs;
      }

      // 移除首尾引号
      if ((topic.startsWith('"') && topic.endsWith('"')) ||
          (topic.startsWith("'") && topic.endsWith("'"))) {
        topic = topic.slice(1, -1);
      }
    }

    // 如果没有主题，询问用户
    if (!topic) {
      return {
        type: 'message',
        messageType: 'info',
        content: `请告诉我你想创建的PPT主题是什么？\n\n示例:\n  /ppt "AI在教育中的应用"\n  /ppt "2025年度总结" --pages 15`,
      };
    }

    // 构建初始化提示词，提交给AI处理PPT大纲
    const pageCountHint = pageCount ? `\n\n预期页数: ${pageCount}页` : '';
    const initPrompt = `我想创建一个PPT演示文稿。

**主题**: ${topic}${pageCountHint}

请帮我规划这个PPT的详细大纲。包括:
1. 演示的整体结构和逻辑
2. 建议的页数和每一页的内容概要
3. 关键要点和建议的呈现方式

你可以使用 ppt_outline 工具来:
- action=init: 初始化PPT编辑模式
- action=update: 更新大纲内容
- action=view: 查看当前大纲

我会逐步与你讨论并优化大纲内容，直到满意后再生成PPT。`;

    // 返回特殊的提示词提交类型，让AI处理PPT相关任务
    return {
      type: 'submit_prompt',
      content: initPrompt,
    };
  },

  completion: async (context: CommandContext, partialArg: string) => {
    // 提供基本的补全建议
    const suggestions: string[] = [];

    if (partialArg.startsWith('--')) {
      return ['--pages '];
    }

    // 如果没有参数，建议示例
    if (!partialArg) {
      return ['"年度总结"', '"产品介绍"', '"技术分享"'];
    }

    return suggestions;
  },
};
