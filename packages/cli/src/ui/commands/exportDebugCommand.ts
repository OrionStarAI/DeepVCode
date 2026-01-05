import { CommandContext, SlashCommand, MessageActionReturn, CommandKind } from './types.js';
import { t, tp } from '../utils/i18n.js';
import { exportDebugToMarkdown } from '../../utils/debugExport.js';

export const exportDebugCommand: SlashCommand = {
  name: 'export-debug',
  description: t('command.export_debug.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const { config } = context.services;
    const { debugMessages } = context.ui;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('export.no_config'),
      };
    }

    if (!debugMessages || debugMessages.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: t('export_debug.no_messages'),
      };
    }

    const sessionId = config.getSessionId();
    const projectRoot = config.getProjectRoot() || process.cwd();

    try {
      const exportPath = await exportDebugToMarkdown(debugMessages, projectRoot, sessionId);

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
