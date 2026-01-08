/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fsPromises from 'fs/promises';
import {
  CommandContext,
  SlashCommand,
  MessageActionReturn,
  CommandKind,
} from './types.js';
import path from 'path';
import { HistoryItemWithoutId, MessageType, ToolCallStatus, IndividualToolCallDisplay } from '../types.js';
import { t } from '../utils/i18n.js';

interface ChatDetail {
  name: string;
  mtime: Date;
}

const getSavedChatTags = async (
  context: CommandContext,
  mtSortDesc: boolean,
): Promise<ChatDetail[]> => {
  const deepvDir = context.services.config?.getProjectTempDir();
  if (!deepvDir) {
    return [];
  }
  try {
    const file_head = 'checkpoint-';
    const file_tail = '.json';
    const files = await fsPromises.readdir(deepvDir);
    const chatDetails: Array<{ name: string; mtime: Date }> = [];

    for (const file of files) {
      if (file.startsWith(file_head) && file.endsWith(file_tail)) {
        const filePath = path.join(deepvDir, file);
        const stats = await fsPromises.stat(filePath);
        chatDetails.push({
          name: file.slice(file_head.length, -file_tail.length),
          mtime: stats.mtime,
        });
      }
    }

    chatDetails.sort((a, b) =>
      mtSortDesc
        ? b.mtime.getTime() - a.mtime.getTime()
        : a.mtime.getTime() - b.mtime.getTime(),
    );

    return chatDetails;
  } catch (_err) {
    return [];
  }
};

const listCommand: SlashCommand = {
  name: 'list',
  description: t('command.chat.list.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const chatDetails = await getSavedChatTags(context, false);
    if (chatDetails.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: '未找到已保存的对话检查点。',
      };
    }

    const maxNameLength = Math.max(
      ...chatDetails.map((chat) => chat.name.length),
    );

    let message = '已保存的对话列表：\n\n';
    for (const chat of chatDetails) {
      const paddedName = chat.name.padEnd(maxNameLength, ' ');
      const isoString = chat.mtime.toISOString();
      const match = isoString.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
      const formattedDate = match ? `${match[1]} ${match[2]}` : '无效日期';
      message += `  - \u001b[36m${paddedName}\u001b[0m  \u001b[90m(保存于 ${formattedDate})\u001b[0m\n`;
    }
    message += `\n\u001b[90m注意：最新的在最后，最旧的在最前\u001b[0m`;
    return {
      type: 'message',
      messageType: 'info',
      content: message,
    };
  },
};

const saveCommand: SlashCommand = {
  name: 'save',
  description:
    '将当前对话保存为检查点。用法：/chat save <标签>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: '缺少标签。用法：/chat save <标签>',
      };
    }

    const { logger, config } = context.services;
    await logger.initialize();
    const chat = await config?.getGeminiClient()?.getChat();
    if (!chat) {
      return {
        type: 'message',
        messageType: 'error',
        content: '没有可用的聊天客户端来保存对话。',
      };
    }

    const history = chat.getHistory();
    if (history.length > 0) {
      await logger.saveCheckpoint(history, tag);
      return {
        type: 'message',
        messageType: 'info',
        content: `对话检查点已保存，标签：${tag}。`,
      };
    } else {
      return {
        type: 'message',
        messageType: 'info',
        content: '未找到要保存的对话。',
      };
    }
  },
};

const resumeCommand: SlashCommand = {
  name: 'resume',
  altNames: ['load'],
  description:
    '从检查点恢复对话。用法：/chat resume <标签>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: '缺少标签。用法：/chat resume <标签>',
      };
    }

    const { logger } = context.services;
    await logger.initialize();
    const conversation = await logger.loadCheckpoint(tag);

    if (conversation.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: `未找到标签为 ${tag} 的已保存检查点。`,
      };
    }

    const rolemap: { [key: string]: string } = {
      user: 'user',
      model: 'gemini',
    };

    const uiHistory: HistoryItemWithoutId[] = [];
    let hasSystemPrompt = false;
    let i = 0;

    for (const item of conversation) {
      i += 1;

      const text =
        item.parts
          ?.filter((m) => !!m.text)
          .map((m) => m.text)
          .join('') || '';

      const functionCalls = item.parts?.filter((m) => !!m.functionCall) || [];
      const functionResponses = item.parts?.filter((m) => !!m.functionResponse) || [];
      const hasToolCalls = functionCalls.length > 0 || functionResponses.length > 0;

      if (!text && !hasToolCalls) {
        continue;
      }

      if (i === 1 && text.match(/context for our chat/)) {
        hasSystemPrompt = true;
      }

      if (i <= 2 && hasSystemPrompt) {
        continue;
      }

      if (text) {
        uiHistory.push({
          type: (item.role && rolemap[item.role]) || 'gemini',
          text,
        } as HistoryItemWithoutId);
      }

      if (hasToolCalls && item.role === 'model') {
        const tools: IndividualToolCallDisplay[] = [];

        for (const funcCall of functionCalls) {
          const funcResponse = functionResponses.find(
            resp => resp.functionResponse?.id === funcCall.functionCall?.id
          );

          if (funcCall.functionCall) {
            const toolCall: IndividualToolCallDisplay = {
              callId: funcCall.functionCall.id || 'unknown',
              name: funcCall.functionCall.name || 'unknown_tool',
              description: JSON.stringify(funcCall.functionCall.args || {}),
              status: funcResponse?.functionResponse?.response?.error
                ? ToolCallStatus.Error
                : ToolCallStatus.Success,
              resultDisplay: (funcResponse?.functionResponse?.response?.output as string) ||
                            (funcResponse?.functionResponse?.response?.error as string) ||
                            '(工具调用已完成)',
              confirmationDetails: undefined,
              renderOutputAsMarkdown: false,
              forceMarkdown: false,
            };
            tools.push(toolCall);
          }
        }

        if (tools.length > 0) {
          uiHistory.push({
            type: 'tool_group',
            tools,
          } as HistoryItemWithoutId);
        }
      }
    }
    return {
      type: 'load_history',
      history: uiHistory,
      clientHistory: conversation,
    };
  },
  completion: async (context, partialArg) => {
    const chatDetails = await getSavedChatTags(context, true);
    return chatDetails
      .map((chat) => chat.name)
      .filter((name) => name.startsWith(partialArg));
  },
};

const deleteCommand: SlashCommand = {
  name: 'delete',
  altNames: ['remove', 'rm'],
  description: t('command.chat.delete.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const trimmedArgs = args.trim();

    if (!trimmedArgs) {
      return {
        type: 'message',
        messageType: 'error',
        content: '缺少标签或 --all 选项。用法：/chat delete <标签> 或 /chat delete --all',
      };
    }

    const { config } = context.services;
    const deepvDir = config?.getProjectTempDir();

    if (!deepvDir) {
      return {
        type: 'message',
        messageType: 'error',
        content: '项目临时目录不可用。',
      };
    }

    try {
      // 处理批量删除
      if (trimmedArgs === '--all') {
        const chatDetails = await getSavedChatTags(context, false);

        if (chatDetails.length === 0) {
          return {
            type: 'message',
            messageType: 'info',
            content: '未找到要删除的已保存对话检查点。',
          };
        }

        // 删除所有检查点文件
        let deletedCount = 0;
        let failedCount = 0;

        for (const chat of chatDetails) {
          try {
            const filePath = path.join(deepvDir, `checkpoint-${chat.name}.json`);
            await fsPromises.unlink(filePath);
            deletedCount++;
          } catch (error) {
            failedCount++;
            console.warn(`删除检查点 ${chat.name} 失败:`, error);
          }
        }

        let message = `已删除 ${deletedCount} 个对话检查点。`;
        if (failedCount > 0) {
          message += ` 删除 ${failedCount} 个检查点失败。`;
        }

        return {
          type: 'message',
          messageType: deletedCount > 0 ? 'info' : 'error',
          content: message,
        };
      }

      // 处理单个删除
      const tag = trimmedArgs;

      // 检查文件是否存在
      const filePath = path.join(deepvDir, `checkpoint-${tag}.json`);

      try {
        await fsPromises.access(filePath);
      } catch {
        return {
          type: 'message',
          messageType: 'error',
          content: `未找到标签为 ${tag} 的已保存检查点`,
        };
      }

      // 删除文件
      await fsPromises.unlink(filePath);

      return {
        type: 'message',
        messageType: 'info',
        content: `对话检查点 "${tag}" 已被删除。`,
      };

    } catch (error) {
      console.error('删除操作期间出错:', error);
      return {
        type: 'message',
        messageType: 'error',
        content: `删除检查点失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
  completion: async (context, partialArg) => {
    // 如果用户输入了 --，提供 --all 选项
    if (partialArg.startsWith('-')) {
      return ['--all'].filter(option => option.startsWith(partialArg));
    }

    // 否则提供现有的标签名用于补全
    const chatDetails = await getSavedChatTags(context, true);
    return chatDetails
      .map((chat) => chat.name)
      .filter((name) => name.startsWith(partialArg));
  },
};

export const chatCommand: SlashCommand = {
  name: 'chat',
  description: t('command.chat.description'),
  kind: CommandKind.BUILT_IN,
  subCommands: [listCommand, saveCommand, resumeCommand, deleteCommand],
};
