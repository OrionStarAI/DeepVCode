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
    const message = `\u001b[1mExtension System\u001b[0m

DVCode supports Gemini CLI extensions. To manage extensions, use:

  \u001b[36mnpm run dev extensions install <url>\u001b[0m   - Install extension
  \u001b[36mnpm run dev extensions list\u001b[0m           - List extensions
  \u001b[36mnpm run dev extensions validate <path>\u001b[0m  - Validate config
  \u001b[36mnpm run dev extensions uninstall <name>\u001b[0m - Remove extension

Example:
  \u001b[36mnpm run dev extensions install https://github.com/gemini-cli-extensions/nanobanana\u001b[0m

For more information, see EXTENSION_GEMINI_COMPAT.md
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
