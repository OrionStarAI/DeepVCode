/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import type { CommandModule } from 'yargs';
import { cleanCommand } from './checkpoint/clean.js';
import { t } from '../ui/utils/i18n.js';

export const checkpointCommand: CommandModule = {
  command: 'checkpoint',
  aliases: ['cp'],
  describe: t('checkpoint.command.description'),
  builder: (yargs) =>
    yargs
      .command(cleanCommand)
      .demandCommand(1, t('checkpoint.command.require.subcommand'))
      .version(false)
      .help(),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
