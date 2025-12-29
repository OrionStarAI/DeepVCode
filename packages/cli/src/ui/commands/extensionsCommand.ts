/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';
import { t } from '../utils/i18n.js';

// List active extensions
const listCommand: SlashCommand = {
  name: 'list',
  description: 'List all active extensions',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext): Promise<void> => {
    const activeExtensions = context.services.config
      ?.getExtensions()
      .filter((ext) => ext.isActive);
    if (!activeExtensions || activeExtensions.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No active extensions.',
        },
        Date.now(),
      );
      return;
    }

    const extensionLines = activeExtensions.map(
      (ext) => `  - \u001b[36m${ext.name} (v${ext.version})\u001b[0m`,
    );
    const message = `Active extensions:\n\n${extensionLines.join('\n')}\n`;

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: message,
      },
      Date.now(),
    );
  },
};

// Show help/info about extensions
const infoCommand: SlashCommand = {
  name: 'info',
  description: 'Show information about extensions system',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext): Promise<void> => {
    const title = t('command.extensions.info.title');
    const intro = t('command.extensions.info.intro');
    const installLabel = t('command.extensions.info.install');
    const listLabel = t('command.extensions.info.list');
    const validateLabel = t('command.extensions.info.validate');
    const uninstallLabel = t('command.extensions.info.uninstall');
    const exampleLabel = t('command.extensions.info.example');
    const learnmoreLabel = t('command.extensions.info.learnmore');
    const url = t('command.extensions.info.url');

    const message = `\u001b[1m${title}\u001b[0m

${intro}

  \u001b[36mdvcode extensions install <url>\u001b[0m   - ${installLabel}
  \u001b[36mdvcode extensions list\u001b[0m           - ${listLabel}
  \u001b[36mdvcode extensions validate <path>\u001b[0m  - ${validateLabel}
  \u001b[36mdvcode extensions uninstall <name>\u001b[0m - ${uninstallLabel}

${exampleLabel}
  \u001b[36mdvcode extensions install https://github.com/ChromeDevTools/chrome-devtools-ls-mcp\u001b[0m

${learnmoreLabel} ${url}
`;

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: message,
      },
      Date.now(),
    );
  },
};

export const extensionsCommand: SlashCommand = {
  name: 'extensions',
  description: t('command.extensions.description'),
  kind: CommandKind.BUILT_IN,
  subCommands: [listCommand, infoCommand],
  action: async (context: CommandContext): Promise<void> => {
    // Default action: show list of active extensions
    const activeExtensions = context.services.config
      ?.getExtensions()
      .filter((ext) => ext.isActive);
    if (!activeExtensions || activeExtensions.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No active extensions.',
        },
        Date.now(),
      );
      return;
    }

    const extensionLines = activeExtensions.map(
      (ext) => `  - \u001b[36m${ext.name} (v${ext.version})\u001b[0m`,
    );
    const message = `Active extensions:\n\n${extensionLines.join('\n')}\n`;

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: message,
      },
      Date.now(),
    );
  },
};
