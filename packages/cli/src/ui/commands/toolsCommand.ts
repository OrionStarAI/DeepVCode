/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';
import { getLocalizedToolName, t } from '../utils/i18n.js';

// 工具的中文描述映射
const TOOL_DESCRIPTIONS_CN: Record<string, string> = {
  'Edit': '编辑文件内容，替换指定的文本片段。支持精确匹配和多次替换',
  'FindFiles': '按文件名模式搜索文件，支持通配符匹配和递归搜索',
  'WebSearch': '使用Web搜索引擎在网络上查找相关信息和资料',
  'ReadFile': '读取并显示文件内容，支持分页浏览大文件',
  'ReadFolder': '读取目录结构和内容，显示文件夹中的文件列表',
  'ReadManyFiles': '批量读取多个文件的内容，高效处理文件组操作',
  'Save Memory': '保存重要信息到AI的长期记忆中，用于跨会话记忆',
  'SearchText': '在文件中搜索指定的文本内容，支持正则表达式',
  'Shell': '执行系统命令和Shell脚本，与操作系统交互',
  'Task': '管理和执行任务，支持任务调度和状态跟踪',
  'TodoRead': '读取待办事项列表，查看当前的任务状态',
  'TodoWrite': '创建和管理待办事项，记录任务和进度',
  'WebFetch': '获取网页内容，下载网络资源和数据',
  'WriteFile': '创建或覆盖文件内容，将数据写入到指定文件',
};

export const toolsCommand: SlashCommand = {
  name: 'tools',
  description: t('command.tools.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const subCommand = args?.trim();

    // Default to showing descriptions. The user can opt out with nodesc argument.
    let useShowDescriptions = true;
    if (subCommand === 'nodesc' || subCommand === 'nodescriptions') {
      useShowDescriptions = false;
    }

    const toolRegistry = await context.services.config?.getToolRegistry();
    if (!toolRegistry) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: '无法检索工具注册表。',
        },
        Date.now(),
      );
      return;
    }

    const tools = toolRegistry.getAllTools();
    // Filter out MCP tools by checking for the absence of a serverName property
    const geminiTools = tools.filter((tool) => !('serverName' in tool));

    let message = '🔧可用的工具:\n\n';

    if (geminiTools.length > 0) {
      geminiTools.forEach((tool) => {
        if (useShowDescriptions) {
          const localizedName = getLocalizedToolName(tool.displayName);
          message += `  - \u001b[36m${localizedName}\u001b[0m\n`;

          const grayColor = '\u001b[90m';
          const resetColor = '\u001b[0m';

          // 优先使用中文描述，如果没有则使用英文原始描述
          let briefDesc = TOOL_DESCRIPTIONS_CN[tool.displayName];

          if (!briefDesc && tool.description) {
            // 如果没有中文描述，从英文描述中提取第一句话或前150字符
            const firstSentence = tool.description.split(/[.!?](?:\s|$)/)[0];
            briefDesc = firstSentence.length > 150
              ? tool.description.substring(0, 150) + '...'
              : firstSentence;
            // 清理多余的空白符和换行符
            briefDesc = briefDesc.replace(/\s+/g, ' ').trim();
          }

          if (briefDesc) {
            message += `    ${grayColor}${briefDesc}${resetColor}\n\n`;
          }
        } else {
          const localizedName = getLocalizedToolName(tool.displayName);
          message += `  - \u001b[36m${localizedName}\u001b[0m\n`;
        }
      });
    } else {
      message += '  No tools available\n';
    }
    message += '\n';

    message += '\u001b[0m';

    context.ui.addItem({ type: MessageType.INFO, text: message }, Date.now());
  },
};
