/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandContext, SlashCommand, MessageActionReturn, SwitchSessionActionReturn, CommandKind } from './types.js';
import { SessionManager } from 'deepv-code-core';
import { HistoryItemWithoutId } from '../types.js';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import { t } from '../utils/i18n.js';

interface SessionOption {
  sessionId: string;
  title: string;
  createdAt: string;
  lastActiveAt: string;
  messageCount: number;
  totalTokens: number;
  model?: string;
  hasCheckpoint: boolean;
  firstUserMessage?: string;
  lastAssistantMessage?: string;
}

const listSessionsCommand: SlashCommand = {
  name: 'list',
  description: t('command.session.list.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const { config } = context.services;

    try {
      const sessionManager = new SessionManager(config?.getProjectRoot() || process.cwd());
      const sessions = await sessionManager.listSessions();

      if (sessions.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: '📝 没有找到可用的会话记录。\n\n💡 提示：您可以通过以下方式创建新会话：\n   • 开始与AI对话\n   • 使用命令：/session new',
        };
      }

      // 按最后活跃时间排序（最新的在前）
      const sortedSessions = sessions.sort((a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
      );

      let message = '📋 可用的会话记录：\n\n';

      sortedSessions.forEach((session, index) => {
        const createdAt = new Date(session.createdAt).toLocaleString();
        const lastActiveAt = new Date(session.lastActiveAt).toLocaleString();
        const checkpointIcon = session.hasCheckpoint ? ' [📍]' : '';

        const createdAtDate = new Date(session.createdAt);
        const formattedDate = `${createdAtDate.getFullYear()}-${(createdAtDate.getMonth() + 1).toString().padStart(2, '0')}-${createdAtDate.getDate().toString().padStart(2, '0')} ${createdAtDate.getHours().toString().padStart(2, '0')}:${createdAtDate.getMinutes().toString().padStart(2, '0')}`;

        message += `\u001b[36m${index + 1}. ${session.title}\u001b[0m \u001b[90m(${formattedDate})${checkpointIcon}\u001b[0m\n`;

        if (session.firstUserMessage) {
          const preview = session.firstUserMessage.length > 50
            ? session.firstUserMessage.substring(0, 50) + '...'
            : session.firstUserMessage;
          message += `   💭 ${preview}\n`;
        }

        if (session.lastAssistantMessage) {
          const preview = session.lastAssistantMessage.length > 50
            ? session.lastAssistantMessage.substring(0, 50) + '...'
            : session.lastAssistantMessage;
          message += `   🤖 ${preview}\n`;
        }
        message += `\n`;
      });

      message += `\u001b[90m💡 提示：\u001b[0m\n`;
      message += `   • 选择会话: /session select <编号或session-id>\n`;
      message += `   • 创建新会话: /session new\n`;
      message += `   • 查看帮助: /session help\n`;

      return {
        type: 'message',
        messageType: 'info',
        content: message,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ 获取会话列表失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
};

const selectSessionCommand: SlashCommand = {
  name: 'select',
  description: t('command.session.select.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<any> => {
    const { config } = context.services;
    const sessionArg = args.trim();

    if (!sessionArg) {
      // 没有参数时，显示可选择的session列表
      try {
        const sessionManager = new SessionManager(config?.getProjectRoot() || process.cwd());
        const sessions = await sessionManager.listSessions();

        if (sessions.length === 0) {
          return {
            type: 'message',
            messageType: 'error',
            content: '❌ 没有找到可用的会话记录。请先创建或选择一个会话。',
          };
        }

        // 按最后活跃时间排序（最新的在前）
        const sortedSessions = sessions.sort((a, b) =>
          new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
        );

        let message = '📋 可选择的会话:\n\n';

        sortedSessions.forEach((session, index) => {
          const checkpointIcon = session.hasCheckpoint ? ' [📍]' : '';

          // 获取用户首条消息作为描述
          let description = '';
          if (session.firstUserMessage) {
            const preview = session.firstUserMessage.substring(0, 50);
            const ellipsis = session.firstUserMessage.length > 50 ? '...' : '';
            description = ` - 💭 "${preview}${ellipsis}"`;
          } else {
            description = ' - 无用户消息';
          }

          message += `${index + 1}. \u001b[36m${session.title}${checkpointIcon}\u001b[0m${description}\n`;
        });

        message += `\n💡 使用 /session select <编号> 来选择会话`;

        return {
          type: 'message',
          messageType: 'info',
          content: message,
        };
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `❌ 获取会话列表失败: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    try {
      const sessionManager = new SessionManager(config?.getProjectRoot() || process.cwd());
      const sessions = await sessionManager.listSessions();

      if (sessions.length === 0) {
        return {
          type: 'message',
          messageType: 'error',
          content: '❌ 没有找到可用的会话记录。请先创建或选择一个会话。',
        };
      }

      // 按最后活跃时间排序（最新的在前）
      const sortedSessions = sessions.sort((a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
      );

      let targetSession = null;

      // 尝试按编号查找
      const sessionNumber = parseInt(sessionArg);
      if (!isNaN(sessionNumber) && sessionNumber >= 1 && sessionNumber <= sortedSessions.length) {
        targetSession = sortedSessions[sessionNumber - 1];
      } else {
        // 按session ID查找
        targetSession = sessions.find(session => session.sessionId === sessionArg);
      }

      if (!targetSession) {
        return {
          type: 'message',
          messageType: 'error',
          content: `❌ 找不到指定的会话: "${sessionArg}"\n\n💡 请使用 /session list 查看可用的会话编号或ID`,
        };
      }

      // 加载会话数据
      const sessionData = await sessionManager.loadSession(targetSession.sessionId);

      if (!sessionData) {
        return {
          type: 'message',
          messageType: 'error',
          content: `❌ 加载会话失败: ${targetSession.sessionId}`,
        };
      }

      // 转换历史记录格式 - 保持完整的历史记录结构
      const uiHistory: HistoryItemWithoutId[] = [];

      if (sessionData.history && Array.isArray(sessionData.history)) {
        for (const item of sessionData.history) {
          // 创建基础历史项，去除id字段但保留所有其他属性
          const { id, ...historyItemWithoutId } = item;
          uiHistory.push(historyItemWithoutId as HistoryItemWithoutId);
        }
      }

      return {
        type: 'switch_session',
        sessionId: targetSession.sessionId,
        history: uiHistory,
        clientHistory: sessionData.clientHistory || [],
      };

    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ 选择会话失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
  completion: async (context, partialArg): Promise<Suggestion[]> => {
    const { config } = context.services;

    try {
      const sessionManager = new SessionManager(config?.getProjectRoot() || process.cwd());
      const sessions = await sessionManager.listSessions();

      const sortedSessions = sessions.sort((a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
      );

      const completions: Suggestion[] = [];

      // 添加编号补全 - 带有助手回复作为描述
      if (partialArg === '' || /^\d+$/.test(partialArg)) {
        const maxNumber = Math.min(sortedSessions.length, 10); // 限制补全数量
        for (let i = 1; i <= maxNumber; i++) {
          const session = sortedSessions[i - 1];
          if (session) {
            const checkpointIcon = session.hasCheckpoint ? ' [📍]' : '';
            const description = session.firstUserMessage
              ? `${session.firstUserMessage.substring(0, 50)}${session.firstUserMessage.length > 50 ? '...' : ''}`
              : '无用户消息';

            completions.push({
              label: `${i}`,
              value: `${i}`,
              description: `${session.title}${checkpointIcon} - 💭 "${description}"`
            });
          }
        }
      }

      // 添加session ID补全（如果输入看起来像UUID）
      if (partialArg.includes('-') || partialArg.length >= 8) {
        const matchingIds = sortedSessions
          .filter(session => session.sessionId.startsWith(partialArg))
          .slice(0, 5); // 限制补全数量

        matchingIds.forEach(session => {
          const checkpointIcon = session.hasCheckpoint ? ' [📍]' : '';
          const description = session.firstUserMessage
            ? `${session.firstUserMessage.substring(0, 50)}${session.firstUserMessage.length > 50 ? '...' : ''}`
            : '无用户消息';

          completions.push({
            label: session.sessionId,
            value: session.sessionId,
            description: `${session.title}${checkpointIcon} - 💭 "${description}"`
          });
        });
      }

      return completions;
    } catch (error) {
      console.warn('[SessionCommand] Completion failed:', error);
      return [];
    }
  },
};

const newSessionCommand: SlashCommand = {
  name: 'new',
  description: t('command.session.create.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<SwitchSessionActionReturn> => {
    const { config } = context.services;

    try {
      const sessionManager = new SessionManager(config?.getProjectRoot() || process.cwd());

      // 创建新会话
      const newSession = await sessionManager.createNewSession();

      // 创建成功消息作为历史记录的一部分
      const successMessage = {
        type: 'info' as const,
        text: `✅ ${t('session.new.success')}\n\n📝 Session ID: \u001b[36m${newSession.sessionId}\u001b[0m\n📅 ${t('session.new.createdAt')}: ${new Date(newSession.metadata.createdAt).toLocaleString()}\n\n💡 ${t('session.new.canStartChat')}`,
      };

      // 返回切换会话的结果，将成功消息包含在history中
      return {
        type: 'switch_session',
        sessionId: newSession.sessionId,
        history: [successMessage], // 将成功消息作为新会话的第一条记录
        clientHistory: [], // 新会话客户端历史为空
      };
    } catch (error) {
      // 显示错误消息
      context.ui.addItem({
        type: 'error',
        text: `❌ 创建新会话失败: ${error instanceof Error ? error.message : '未知错误'}`,
      }, Date.now());

      // 抛出错误以阻止进一步处理
      throw error;
    }
  },
};

const rebuildCommand: SlashCommand = {
  name: 'rebuild',
  description: t('command.session.rebuild.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const { config } = context.services;

    try {
      const sessionManager = new SessionManager(config?.getProjectRoot() || process.cwd());

      await sessionManager.rebuildIndex();

      const sessions = await sessionManager.listSessions();

      return {
        type: 'message',
        messageType: 'info',
        content: `✅ 会话索引重建完成！\n\n📝 找到 ${sessions.length} 个会话记录\n\n💡 您现在可以使用 /session list 查看所有恢复的会话`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ 重建会话索引失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
};

const helpCommand: SlashCommand = {
  name: 'help',
  description: t('command.session.help.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const helpMessage = `📖 会话管理帮助\n\n` +
      `🔍 \u001b[36m/session list\u001b[0m - 列出所有可用的会话记录\n` +
      `   显示会话的详细信息，包括创建时间、消息数量、Token消耗等\n\n` +
      `🎯 \u001b[36m/session select <编号或ID>\u001b[0m - 选择并加载指定的会话\n` +
      `   示例：\n` +
      `   • /session select 1        (选择第一个会话)\n` +
      `   • /session select abc123   (按Session ID选择)\n\n` +
      `🆕 \u001b[36m/session new\u001b[0m - 创建新的会话记录\n` +
      `   开始一个全新的对话会话\n\n` +
      `🔧 \u001b[36m/session rebuild\u001b[0m - 重建会话索引\n` +
      `   修复会话列表显示问题，重新扫描并索引所有会话\n\n` +
      `📋 \u001b[36m/session help\u001b[0m - 显示此帮助信息\n\n` +
      `💡 提示：\n` +
      `• 您也可以使用命令行参数启动时加载会话：\n` +
      `  dvcode --session <session-id>\n` +
      `  dvcode --continue  (继续最后一个会话)\n` +
      `• 会话记录保存在项目的临时目录中\n` +
      `• 如果会话列表显示不完整，请尝试 /session rebuild`;

    return {
      type: 'message',
      messageType: 'info',
      content: helpMessage,
    };
  },
};

export const sessionCommand: SlashCommand = {
  name: 'session',
  description: t('command.session.description'),
  kind: CommandKind.BUILT_IN,
  subCommands: [listSessionsCommand, selectSessionCommand, newSessionCommand, rebuildCommand, helpCommand],
};
