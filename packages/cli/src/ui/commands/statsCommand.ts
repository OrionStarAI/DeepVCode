/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType, HistoryItemStats } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { uiTelemetryService } from 'deepv-code-core';
import { t, tp } from '../utils/i18n.js';

export const statsCommand: SlashCommand = {
  name: 'stats',
  altNames: ['usage'],
  description: t('command.stats.description'),
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext) => {
    const now = new Date();
    const { sessionStartTime } = context.session.stats;
    if (!sessionStartTime) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: t('command.stats.error.noSessionStartTime'),
        },
        Date.now(),
      );
      return;
    }
    const wallDuration = now.getTime() - sessionStartTime.getTime();

    const statsItem: HistoryItemStats = {
      type: MessageType.STATS,
      duration: formatDuration(wallDuration),
    };

    context.ui.addItem(statsItem, Date.now());
  },
  subCommands: [
    {
      name: 'model',
      description: t('command.stats.model.description'),
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext, args?: string) => {
        const modelName = args?.trim();

        if (modelName) {
          // 显示特定模型的统计
          const metrics = uiTelemetryService.getMetrics();
          if (metrics.models[modelName]) {
            context.ui.addItem(
              {
                type: MessageType.MODEL_STATS,
              },
              Date.now(),
            );
          } else {
            context.ui.addItem(
              {
                type: MessageType.ERROR,
                text: tp('command.stats.error.modelNotFound', { modelName }),
              },
              Date.now(),
            );
          }
        } else {
          // 显示所有模型的统计
          context.ui.addItem(
            {
              type: MessageType.MODEL_STATS,
            },
            Date.now(),
          );
        }
      },
      completion: async (context: CommandContext, partialArg: string) => {
        // 获取当前会话中已使用的模型列表
        const metrics = uiTelemetryService.getMetrics();
        const availableModels = Object.keys(metrics.models);

        // 根据用户输入过滤模型列表
        return availableModels.filter(model =>
          model.toLowerCase().includes(partialArg.toLowerCase())
        );
      },
    },
    {
      name: 'tools',
      description: t('command.stats.tools.description'),
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext) => {
        context.ui.addItem(
          {
            type: MessageType.TOOL_STATS,
          },
          Date.now(),
        );
      },
    },
  ],
};
