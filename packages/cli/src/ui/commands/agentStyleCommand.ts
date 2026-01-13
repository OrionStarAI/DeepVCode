/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { CommandKind, CommandContext, SlashCommand, SlashCommandActionReturn } from './types.js';
import { t, tp } from '../utils/i18n.js';
import { getCoreSystemPrompt, ApprovalMode } from 'deepv-code-core';
import type { AgentStyle } from 'deepv-code-core';

/**
 * Agent 风格切换命令
 *
 * 功能：
 * - /agent-style: 显示当前风格及帮助
 * - /agent-style default: 切换到 Claude-style（默认，强调计划、解释）
 * - /agent-style codex: 切换到 Codex-style（快速确认后静默执行）
 * - /agent-style status: 查看当前风格状态
 *
 * 切换后会：
 * 1. 持久化到 projectSettings.json（重启后保持）
 * 2. 即时刷新 system prompt（当前会话立即生效）
 */
export const agentStyleCommand: SlashCommand = {
  name: 'agent-style',
  description: t('command.agentStyle.description'),
  kind: CommandKind.BUILT_IN,
  hidden: true,
  action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
    const { config } = context.services;
    const trimmedArgs = args.trim().toLowerCase();

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('agentStyle.error.config.unavailable'),
      };
    }

    const currentStyle = config.getAgentStyle();

    // 无参数或 status: 显示当前状态和帮助
    if (!trimmedArgs || trimmedArgs === 'status') {
      const styleIcon = currentStyle === 'codex' ? '⚡' : '🧠';
      const styleLabel = currentStyle === 'codex'
        ? t('agentStyle.style.codex.label')
        : t('agentStyle.style.default.label');
      const styleDesc = currentStyle === 'codex'
        ? t('agentStyle.style.codex.description')
        : t('agentStyle.style.default.description');

      return {
        type: 'message',
        messageType: 'info',
        content: `${styleIcon} ${tp('agentStyle.status.current', { style: styleLabel })}

` +
          `${styleDesc}

` +
          `${t('agentStyle.usage.title')}
` +
          `  /agent-style default  - ${t('agentStyle.usage.default')}
` +
          `  /agent-style codex    - ${t('agentStyle.usage.codex')}
` +
          `  /agent-style status   - ${t('agentStyle.usage.status')}`,
      };
    }

    /**
     * 切换 Agent 风格并刷新 system prompt
     * Codex 模式自动启用 YOLO，default 模式恢复普通确认
     */
    const switchStyle = async (newStyle: AgentStyle): Promise<SlashCommandActionReturn> => {
      try {
        // 1. 持久化 agent style
        config.setAgentStyle(newStyle);

        // 2. Codex 模式自动启用 YOLO（类似 OpenAI Codex CLI 的 full-auto 模式）
        if (newStyle === 'codex') {
          config.setApprovalModeWithProjectSync(ApprovalMode.YOLO, true);
        } else {
          // 切回 default 时恢复普通确认模式
          config.setApprovalModeWithProjectSync(ApprovalMode.DEFAULT, true);
        }

        // 3. 刷新当前会话的 system prompt
        const geminiClient = await config.getGeminiClient();
        if (geminiClient) {
          const chat = geminiClient.getChat();
          if (chat) {
            const isVSCode = config.getVsCodePluginMode();
            const userMemory = config.getUserMemory();
            const updatedSystemPrompt = getCoreSystemPrompt(userMemory, isVSCode, undefined, newStyle);
            chat.setSystemInstruction(updatedSystemPrompt);
          }
        }

        const icon = newStyle === 'codex' ? '⚡' : '🧠';
        const label = newStyle === 'codex'
          ? t('agentStyle.style.codex.label')
          : t('agentStyle.style.default.label');
        const yoloNote = newStyle === 'codex'
          ? `\n${t('agentStyle.codex.yolo.enabled')}`
          : '';

        return {
          type: 'message',
          messageType: 'info',
          content: `${icon} ${tp('agentStyle.switched.success', { style: label })}${yoloNote}`,
        };
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `❌ ${t('agentStyle.error.switch.failed')}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    };

    // 切换到 default
    if (trimmedArgs === 'default' || trimmedArgs === 'claude') {
      if (currentStyle === 'default') {
        return {
          type: 'message',
          messageType: 'info',
          content: `🧠 ${t('agentStyle.already.default')}`,
        };
      }
      return switchStyle('default');
    }

    // 切换到 codex
    if (trimmedArgs === 'codex' || trimmedArgs === 'fast') {
      if (currentStyle === 'codex') {
        return {
          type: 'message',
          messageType: 'info',
          content: `⚡ ${t('agentStyle.already.codex')}`,
        };
      }
      return switchStyle('codex');
    }

    // 未知参数
    return {
      type: 'message',
      messageType: 'error',
      content: t('agentStyle.usage.error'),
    };
  },

  completion: async (_context, partialArg) => {
    const commands = ['default', 'codex', 'status'];
    return commands.filter((cmd) => cmd.startsWith(partialArg.toLowerCase()));
  },
};
