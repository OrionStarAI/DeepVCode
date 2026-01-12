/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { CommandKind, SlashCommand, SlashCommandActionReturn, CommandContext } from './types.js';
import { t, tp } from '../utils/i18n.js';
import { MESSAGE_ROLES } from 'deepv-code-core';

/**
 * Plan模式命令 - 用于切换需求讨论模式
 *
 * 功能：
 * - /plan 或 /plan on: 启用Plan模式，专注需求讨论，禁用工具执行
 * - /plan off: 退出Plan模式，恢复正常工具执行
 * - /plan status: 查看当前Plan模式状态
 */
export const planCommand: SlashCommand = {
  name: 'plan',
  description: t('command.plan.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<SlashCommandActionReturn> => {
    const subCommand = args.trim().toLowerCase();
    const config = context.services.config;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('plan.error.config.unavailable')
      };
    }

    switch (subCommand) {
      case 'on':
      case '':
        // 启用Plan模式
        config.setPlanModeActive(true);
        return {
          type: 'message',
          messageType: 'info',
          content: t('plan.mode.enabled.message')
        };

      case 'off':
        // 退出Plan模式
        config.setPlanModeActive(false);

        // 1. 静默添加退出记录到历史上下文
        // 这样AI在下一次对话时就能知道Plan模式已退出，而不需要立即触发请求
        const client = config.getGeminiClient();
        if (client) {
          await client.addHistory({
            role: MESSAGE_ROLES.USER,
            parts: [{ text: '[PLAN MODE EXITED] The user has exited Plan mode. You can now use all tools including modification tools (write_file, replace, run_shell_command, lint_fix, etc.). Normal operation mode is now active.' }]
          });
        }

        // 2. 仅在UI显示退出成功的提示
        return {
          type: 'message',
          messageType: 'info',
          content: t('plan.mode.disabled.message')
        };

      case 'status':
        // 查看Plan模式状态
        const isActive = config.getPlanModeActive();
        return {
          type: 'message',
          messageType: 'info',
          content: tp('plan.mode.status.message', { status: isActive ? t('plan.mode.status.on') : t('plan.mode.status.off') })
        };

      default:
        return {
          type: 'message',
          messageType: 'error',
          content: t('plan.usage.error')
        };
    }
  },

  completion: async (context, partialArg) => {
    const commands = ['on', 'off', 'status'];
    return commands.filter(cmd =>
      cmd.startsWith(partialArg.toLowerCase())
    );
  }
};