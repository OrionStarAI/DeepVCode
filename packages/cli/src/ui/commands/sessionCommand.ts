/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Session command module - handles session management operations
 * Provides commands for listing, selecting, creating, and rebuilding sessions
 */

import { CommandContext, SlashCommand, MessageActionReturn, SwitchSessionActionReturn, CommandKind, SelectSessionActionReturn, SessionOption } from './types.js';
import { SessionManager } from 'deepv-code-core';
import { HistoryItemWithoutId } from '../types.js';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import { t } from '../utils/i18n.js';

// Command for listing all available sessions
const listSessionsCommand: SlashCommand = {
  name: 'list',
  description: t('command.session.list.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const { config } = context.services;

    try {
      const sessionManager = new SessionManager(config?.getProjectRoot() || process.cwd());
      const sessions = await sessionManager.listSessionsByWorkdir(process.cwd());

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

      let message = `${t('session.list.title')}\n\n`;

      sortedSessions.forEach((session, index) => {
        const createdAtDate = new Date(session.createdAt);
        const formattedDate = `${createdAtDate.getFullYear()}-${(createdAtDate.getMonth() + 1).toString().padStart(2, '0')}-${createdAtDate.getDate().toString().padStart(2, '0')} ${createdAtDate.getHours().toString().padStart(2, '0')}:${createdAtDate.getMinutes().toString().padStart(2, '0')}`;
        const checkpointStatus = session.hasCheckpoint ? t('session.list.checkpoint.yes') : t('session.list.checkpoint.no');

        message += `\u001b[36m${index + 1}. ${session.title}\u001b[0m \u001b[90m(${formattedDate} | ${t('session.list.checkpoint')}: ${checkpointStatus})\u001b[0m\n`;

        if (session.firstUserMessage) {
          const preview = session.firstUserMessage.length > 50
            ? session.firstUserMessage.substring(0, 50) + '...'
            : session.firstUserMessage;
          message += `   \u001b[90m${t('session.list.firstQuestion')}: ${preview}\u001b[0m\n`;
        }

        if (session.lastAssistantMessage) {
          const preview = session.lastAssistantMessage.length > 50
            ? session.lastAssistantMessage.substring(0, 50) + '...'
            : session.lastAssistantMessage;
          message += `   \u001b[90m${t('session.list.lastQuestion')}: ${preview}\u001b[0m\n`;
        }
        message += `\n`;
      });

      message += `\u001b[90m${t('session.list.tips')}\u001b[0m\n`;
      message += `   • ${t('session.list.selectSession')}\n`;
      message += `   • ${t('session.list.createSession')}\n`;
      message += `   • ${t('session.list.helpInfo')}\n`;

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
      // 没有参数时，进入交互式选择模式
      try {
        const sessionManager = new SessionManager(config?.getProjectRoot() || process.cwd());
        const sessions = await sessionManager.listSessionsByWorkdir(process.cwd());

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

        // 返回交互式选择 Action
        return {
          type: 'select_session',
          sessions: sortedSessions,
        } as SelectSessionActionReturn;
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
      const sessions = await sessionManager.listSessionsByWorkdir(process.cwd());

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
        // 按session ID查找（仅在当前workdir的session中查找）
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
      // 使用 listSessionsByWorkdir 确保只列出当前目录的会话
      const sessions = await sessionManager.listSessionsByWorkdir(process.cwd());

      const sortedSessions = sessions.sort((a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
      );

      const completions: Suggestion[] = [];

      // 无论用户输入什么，总是提供前10个会话作为建议
      // 如果 partialArg 是空的，或者匹配数字，或者匹配ID，都展示这些建议
      const maxNumber = Math.min(sortedSessions.length, 10); // 限制补全数量
      for (let i = 1; i <= maxNumber; i++) {
        const session = sortedSessions[i - 1];
        if (session) {
          const checkpointIcon = session.hasCheckpoint ? ' [📍]' : '';
          const description = session.firstUserMessage
            ? `${session.firstUserMessage.substring(0, 50)}${session.firstUserMessage.length > 50 ? '...' : ''}`
            : '无用户消息';

          // 仅当建议匹配输入时才添加 (模糊匹配)
          // 这里的匹配逻辑：
          // 1. 如果没有输入，全部匹配
          // 2. 如果输入数字，匹配序号
          // 3. 如果输入文本，匹配 Session ID 或 标题 或 描述
          const indexStr = `${i}`;
          const shouldAdd =
            partialArg === '' ||
            indexStr.startsWith(partialArg) ||
            session.sessionId.toLowerCase().startsWith(partialArg.toLowerCase()) ||
            session.title.toLowerCase().includes(partialArg.toLowerCase());

          if (shouldAdd) {
            completions.push({
              label: `${i}`,
              value: `${i}`, // 补全值仍然是序号，方便用户快速选择
              description: `${session.title}${checkpointIcon} - 💭 "${description}" (ID: ${session.sessionId.substring(0, 8)}...)`,
              willAutoExecute: true // 🚀 启用自动执行：选中后回车直接执行命令
            });
          }
        }
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

      // 创建新会话，传入当前工作目录
      const newSession = await sessionManager.createNewSession(undefined, process.cwd());

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
