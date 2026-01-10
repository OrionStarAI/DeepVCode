/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { CommandContext, SlashCommand, MessageActionReturn, CommandKind } from './types.js';
import { t, tp } from '../utils/i18n.js';
import { exportSessionToMarkdown } from '../../utils/sessionExport.js';

export const exportCommand: SlashCommand = {
  name: 'export',
  description: t('command.export.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('export.no_config'),
      };
    }

    const sessionId = config.getSessionId();
    const projectRoot = config.getProjectRoot() || process.cwd();

    try {
      const exportPath = await exportSessionToMarkdown(sessionId, projectRoot);

      return {
        type: 'message',
        messageType: 'info',
        content: tp('export.success', { path: exportPath }),
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: tp('export.failed', { error: error instanceof Error ? error.message : String(error) }),
      };
    }
  },
};