/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { CommandKind, SlashCommand } from './types.js';
import { t, tp } from '../utils/i18n.js';

export const queueCommand: SlashCommand = {
  name: 'queue',
  description: t('command.queue.description'),
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'clear',
      description: t('command.queue.clear.description'),
      kind: CommandKind.BUILT_IN,
      action: async (context, _args) => {
        // 这个逻辑会被 App.tsx 的特殊处理拦截
        // 但我们仍然提供一个标准实现以保持一致性
        // 返回 void 表示命令已处理，无需进一步操作
      },
    },
  ],
};
