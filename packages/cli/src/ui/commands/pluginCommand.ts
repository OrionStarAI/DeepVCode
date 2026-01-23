/**
 * DeepV Code Plugin Command
 *
 * This is an alias/wrapper for the /skill command system,
 * providing a plugin-centric view compatible with ClaudeCode.
 */

import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { t } from '../utils/i18n.js';
import { skillCommand } from './skillCommand.js';

// Find the marketplace and plugin sub-commands from skillCommand
const marketplaceSubCommand = skillCommand.subCommands?.find(c => c.name === 'marketplace');
const pluginSubCommands = skillCommand.subCommands?.find(c => c.name === 'plugin')?.subCommands || [];

export const pluginCommand: SlashCommand = {
  name: 'plugin',
  description: t('plugin.command.description'),
  kind: CommandKind.BUILT_IN,

  action: async (context: CommandContext) => {
    // Show help information
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: t('plugin.help.text'),
      },
      Date.now(),
    );
  },

  subCommands: [
    // Include /plugin marketplace ...
    ...(marketplaceSubCommand ? [marketplaceSubCommand] : []),
    // Include /plugin list, /plugin install, etc. directly
    ...pluginSubCommands,
  ],
};
