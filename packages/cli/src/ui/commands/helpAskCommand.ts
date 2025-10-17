/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, MessageActionReturn, SlashCommand } from './types.js';
import { HelpSubagent } from '../../services/HelpSubagent.js';
import { t } from '../utils/i18n.js';

export const helpAskCommand: SlashCommand = {
  name: 'help-ask',
  altNames: [],
  description: t('command.help-ask.description'),
  kind: CommandKind.BUILT_IN,
  action: async (_context, args): Promise<MessageActionReturn> => {
    // 检查是否有参数，如果有则提示错误用法
    if (args && args.trim().length > 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('command.help-ask.no-args'),
      };
    }

    // 返回欢迎消息，实际的模式切换在 App.tsx 中处理
    const welcomeMessage = HelpSubagent.getWelcomeMessage();

    return {
      type: 'message',
      messageType: 'info',
      content: welcomeMessage,
    };
  },
};
